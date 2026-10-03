"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AiError } from "@/lib/ai/client";
import { requireActiveMember } from "@/lib/auth/guards";
import { extractBottlenecks, type Bottleneck } from "@/lib/immersion/bottleneck-extraction";
import { generateAfterDiagram } from "@/lib/immersion/after-diagram";
import type { WorkflowDiagram } from "@/lib/immersion/diagram-schema";
import {
  generateOpportunityMapping,
  type OpportunityMapping,
} from "@/lib/immersion/opportunity-mapping";
import { DepartmentPdfDocument } from "@/lib/immersion/pdf/department-pdf";
import {
  ComprehensiveReportPdfDocument,
  type ReportDepartment,
} from "@/lib/immersion/pdf/comprehensive-report-pdf";
import { extractWorkflow, reviseWorkflow } from "@/lib/immersion/transcript-extraction";
import { createClient } from "@/lib/supabase/server";

export type DepartmentActionState =
  | { error: string }
  | { ok: string; diagram: WorkflowDiagram }
  | null;

export type OpportunityActionState =
  | { error: string }
  | {
      ok: string;
      bottlenecks: Bottleneck[];
      opportunityMapping: OpportunityMapping;
      afterDiagram: WorkflowDiagram;
    }
  | null;

export type PdfActionState = { error: string } | { ok: string; pdfPath: string } | null;

export type ReportActionState = { error: string } | { ok: string; reportPath: string } | null;

const MAX_TRANSCRIPT_CHARS = 60_000;

/**
 * Transcript in, "before" diagram out, saved to the department row.
 *
 * RLS enforces who may write here (the assigned consultant or an admin, see
 * migration 0007); nothing further is checked beyond requiring an active
 * account. A failed save after a successful extraction is reported rather
 * than silently discarded: the consultant is live onsite, and losing a
 * completed extraction to an unreported write failure is exactly the kind of
 * silent loss the autosave non-negotiable exists to prevent.
 */
export async function extractDepartmentWorkflow(
  _prev: DepartmentActionState,
  formData: FormData,
): Promise<DepartmentActionState> {
  await requireActiveMember();

  const departmentId = String(formData.get("departmentId") ?? "");
  const transcript = String(formData.get("transcript") ?? "").trim();

  if (!departmentId) return { error: "No department." };
  if (!transcript) return { error: "Paste the interview transcript first." };
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    return {
      error: `Transcripts are limited to ${MAX_TRANSCRIPT_CHARS.toLocaleString()} characters.`,
    };
  }

  let diagram: WorkflowDiagram;
  try {
    diagram = await extractWorkflow(transcript);
  } catch (error) {
    return {
      error:
        error instanceof AiError
          ? error.message
          : "Could not extract a workflow from that transcript.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("departments")
    .update({
      transcript,
      // Cast: departments.before_diagram is jsonb, typed loosely as
      // DepartmentJson (see lib/types/database.ts) until Days 6-8 give the
      // other jsonb columns their own real shapes too.
      before_diagram: diagram as unknown as Record<string, unknown>,
    })
    .eq("id", departmentId);

  if (error) {
    return { error: `Extracted, but could not save: ${error.message}` };
  }

  revalidatePath("/engagements", "layout");

  const stepCount = diagram.steps.length;
  const branchCount = diagram.branches.length;
  return {
    ok:
      stepCount > 0
        ? `Extracted ${stepCount} step${stepCount === 1 ? "" : "s"}` +
          (branchCount > 0
            ? ` with ${branchCount} decision point${branchCount === 1 ? "" : "s"}.`
            : ".")
        : "No workflow could be extracted from that transcript. Try adding more detail.",
    diagram,
  };
}

/**
 * Corrects an already-extracted "before" diagram against the consultant's
 * own correction, rather than re-extracting from the transcript alone. A
 * real dry run asked for this directly: extraction can mishear or miss
 * something a consultant who actually ran the interview knows is wrong, and
 * the only recourse before this was pasting a doctored transcript and
 * hoping. Loops as many times as needed: each correction's result becomes
 * the "currently extracted workflow" the next correction is applied against.
 *
 * Deliberately does not touch bottlenecks, opportunity_mapping or
 * after_diagram even if they already exist for this department. That is a
 * real tradeoff a consultant should make on purpose by re-running "Find
 * bottlenecks & opportunities" themselves, not something this silently
 * cascades into regenerating, since those stages are a second AI pass with
 * their own cost and their own grounding discipline to re-satisfy.
 */
export async function reviseDepartmentWorkflow(
  _prev: DepartmentActionState,
  formData: FormData,
): Promise<DepartmentActionState> {
  await requireActiveMember();

  const departmentId = String(formData.get("departmentId") ?? "");
  const correction = String(formData.get("correction") ?? "").trim();

  if (!departmentId) return { error: "No department." };
  if (!correction) return { error: "Write what should change first." };

  const supabase = await createClient();
  const { data: department } = await supabase
    .from("departments")
    .select("transcript, before_diagram")
    .eq("id", departmentId)
    .maybeSingle();

  if (!department) return { error: "That department no longer exists." };
  if (!department.transcript || !department.before_diagram) {
    return { error: "Extract a workflow first, then correct it." };
  }

  let diagram: WorkflowDiagram;
  try {
    diagram = await reviseWorkflow(
      department.transcript,
      department.before_diagram as unknown as WorkflowDiagram,
      correction,
    );
  } catch (error) {
    return {
      error: error instanceof AiError ? error.message : "Could not apply that correction.",
    };
  }

  const { error } = await supabase
    .from("departments")
    .update({ before_diagram: diagram as unknown as Record<string, unknown> })
    .eq("id", departmentId);

  if (error) {
    return { error: `Corrected, but could not save: ${error.message}` };
  }

  revalidatePath("/engagements", "layout");

  const stepCount = diagram.steps.length;
  return {
    ok: `Updated: ${stepCount} step${stepCount === 1 ? "" : "s"} now.`,
    diagram,
  };
}

/**
 * Bottlenecks, then Opportunity Mapping, then the "after" diagram, run in
 * one action rather than three separate ones: each stage's output is the
 * next stage's input, and there is no useful intermediate state to let a
 * consultant stop at. Requires the "before" diagram to already be saved.
 *
 * Autosaved as one write at the end, same reasoning as the transcript step:
 * a completed analysis lost to an unreported failure, live onsite, is the
 * exact scenario the autosave non-negotiable exists to prevent.
 */
export async function generateDepartmentOpportunities(
  _prev: OpportunityActionState,
  formData: FormData,
): Promise<OpportunityActionState> {
  await requireActiveMember();

  const departmentId = String(formData.get("departmentId") ?? "");
  if (!departmentId) return { error: "No department." };

  const supabase = await createClient();
  const { data: department } = await supabase
    .from("departments")
    .select("transcript, before_diagram")
    .eq("id", departmentId)
    .maybeSingle();

  if (!department) return { error: "That department no longer exists." };
  if (!department.transcript || !department.before_diagram) {
    return { error: "Extract the workflow from a transcript first." };
  }

  const diagram = department.before_diagram as unknown as WorkflowDiagram;

  try {
    const bottlenecks = await extractBottlenecks({
      supabase,
      transcript: department.transcript,
      diagram,
    });

    const opportunityMapping = await generateOpportunityMapping({
      supabase,
      transcript: department.transcript,
      diagram,
      bottlenecks,
    });

    const afterDiagram = await generateAfterDiagram({
      before: diagram,
      solutions: opportunityMapping.solutions,
    });

    const { error } = await supabase
      .from("departments")
      .update({
        bottlenecks: bottlenecks as unknown as Record<string, unknown>,
        opportunity_mapping: opportunityMapping as unknown as Record<string, unknown>,
        after_diagram: afterDiagram as unknown as Record<string, unknown>,
      })
      .eq("id", departmentId);

    if (error) {
      return { error: `Analysis complete, but could not save: ${error.message}` };
    }

    revalidatePath("/engagements", "layout");

    const ungroundedNote = !opportunityMapping.categoryMaterialAvailable
      ? " No Refactrd tools, stack, constraints, or engineering-docs material has been ingested yet, so solutions are grounded in the transcript only."
      : "";

    return {
      ok:
        bottlenecks.length > 0
          ? `Found ${bottlenecks.length} bottleneck${bottlenecks.length === 1 ? "" : "s"} and ${opportunityMapping.solutions.length} grounded solution${opportunityMapping.solutions.length === 1 ? "" : "s"}.${ungroundedNote}`
          : "No bottlenecks could be grounded from this transcript. Try adding more detail about what is slow, manual, or a problem today.",
      bottlenecks,
      opportunityMapping,
      afterDiagram,
    };
  } catch (error) {
    return {
      error: error instanceof AiError ? error.message : "Could not complete the analysis.",
    };
  }
}

/**
 * Renders and stores the branded department PDF. Requires bottlenecks,
 * Opportunity Mapping, and the "after" diagram to already exist, since a
 * client-facing document built from a partial analysis is worse than no
 * document at all.
 *
 * Uploaded through the RLS-scoped client, not the admin client, the same
 * reasoning as every write in this file: the storage policy on
 * compass-reports (migration 0008) is the real gate, matching whoever may
 * write the department itself.
 */
export async function generateDepartmentPdf(
  _prev: PdfActionState,
  formData: FormData,
): Promise<PdfActionState> {
  await requireActiveMember();

  const departmentId = String(formData.get("departmentId") ?? "");
  if (!departmentId) return { error: "No department." };

  const supabase = await createClient();
  const { data: department } = await supabase
    .from("departments")
    .select(
      "id, name, before_diagram, bottlenecks, opportunity_mapping, after_diagram, engagement_id, pdf_storage_path, engagements(client_id, clients(name))",
    )
    .eq("id", departmentId)
    .maybeSingle();

  if (!department) return { error: "That department no longer exists." };
  if (
    !department.before_diagram ||
    !department.bottlenecks ||
    !department.opportunity_mapping ||
    !department.after_diagram
  ) {
    return { error: "Run the bottleneck and opportunity analysis first." };
  }

  // Nested PostgREST embed: Relationships is declared empty in the
  // hand-maintained Database type (lib/types/database.ts), so this shape is
  // asserted rather than inferred, the same as every other jsonb read here.
  type EngagementEmbed = { clients: { name: string } | null } | null;
  const engagement = (department as unknown as { engagements: EngagementEmbed }).engagements;
  const clientName: string = engagement?.clients?.name ?? "Client";

  const { renderToBuffer } = await import("@react-pdf/renderer");
  const buffer = await renderToBuffer(
    DepartmentPdfDocument({
      clientName,
      departmentName: department.name,
      date: new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      beforeDiagram: department.before_diagram as unknown as WorkflowDiagram,
      bottlenecks: department.bottlenecks as unknown as Bottleneck[],
      opportunityMapping: department.opportunity_mapping as unknown as OpportunityMapping,
      afterDiagram: department.after_diagram as unknown as WorkflowDiagram,
    }),
  );

  // A fresh key per generation, not a fixed path with upsert: true. An
  // overwrite of the same key was observed serving stale bytes back on the
  // very next read, both through this app's own download route and through
  // a completely separate direct client, which only makes sense as
  // eventual-consistency on the storage side for a same-key overwrite.
  // Regenerating a PDF is not a frequent action, so leaving the previous
  // object behind under its own timestamped key costs nothing real.
  const previousPath = department.pdf_storage_path;
  const pdfPath = `${department.engagement_id}/${department.id}/department-${Date.now()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("compass-reports")
    .upload(pdfPath, buffer, { contentType: "application/pdf" });

  if (uploadError) {
    return { error: `Generated, but could not store the PDF: ${uploadError.message}` };
  }

  const { error: saveError } = await supabase
    .from("departments")
    .update({ pdf_storage_path: pdfPath })
    .eq("id", departmentId);

  if (saveError) {
    return { error: `PDF stored, but could not save its location: ${saveError.message}` };
  }

  if (previousPath) {
    await supabase.storage.from("compass-reports").remove([previousPath]);
  }

  revalidatePath("/engagements", "layout");
  return { ok: "PDF generated.", pdfPath };
}

export type NavActionState = { error: string } | null;

/**
 * Starts an Engagement (one immersion day at one Client) and its first
 * Department, then goes straight to that department's workspace. Creating
 * both in one step matches how the day actually starts: a consultant does
 * not open an empty Engagement and separately decide to add a department,
 * the first department is the reason the Engagement exists yet.
 */
export async function createEngagement(
  _prev: NavActionState,
  formData: FormData,
): Promise<NavActionState> {
  const profile = await requireActiveMember();

  const existingClientId = String(formData.get("clientId") ?? "");
  const newClientName = String(formData.get("newClientName") ?? "").trim();
  const departmentName = String(formData.get("departmentName") ?? "").trim();

  if (!existingClientId && !newClientName) {
    return { error: "Choose an existing client or name a new one." };
  }
  if (!departmentName) {
    return { error: "Name the first department." };
  }

  const supabase = await createClient();

  let clientId = existingClientId;
  if (!clientId) {
    const { data: client, error } = await supabase
      .from("clients")
      .insert({ name: newClientName, created_by: profile.id })
      .select("id")
      .single();
    if (error || !client) {
      return { error: error?.message ?? "Could not create that client." };
    }
    clientId = client.id;
  }

  const { data: engagement, error: engagementError } = await supabase
    .from("engagements")
    .insert({ client_id: clientId, consultant_id: profile.id })
    .select("id")
    .single();
  if (engagementError || !engagement) {
    return { error: engagementError?.message ?? "Could not start the engagement." };
  }

  const { data: department, error: departmentError } = await supabase
    .from("departments")
    .insert({ engagement_id: engagement.id, name: departmentName })
    .select("id")
    .single();
  if (departmentError || !department) {
    return { error: departmentError?.message ?? "Could not create the first department." };
  }

  revalidatePath("/engagements", "layout");
  redirect(`/engagements/${engagement.id}/departments/${department.id}`);
}

/** Adds another department to an existing Engagement. */
export async function addDepartment(
  _prev: NavActionState,
  formData: FormData,
): Promise<NavActionState> {
  await requireActiveMember();

  const engagementId = String(formData.get("engagementId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!engagementId) return { error: "No engagement." };
  if (!name) return { error: "Name the department." };

  const supabase = await createClient();
  const { data: department, error } = await supabase
    .from("departments")
    .insert({ engagement_id: engagementId, name })
    .select("id")
    .single();
  if (error || !department) {
    return { error: error?.message ?? "Could not create that department." };
  }

  revalidatePath("/engagements", "layout");
  redirect(`/engagements/${engagementId}/departments/${department.id}`);
}

/**
 * Marks the current department done and returns to the Engagement overview,
 * where "Add department" starts the next one. This is the autosave point
 * CLAUDE.md's Phase 2 non-negotiable calls for: a department's full pipeline
 * (transcript, both diagrams, bottlenecks, Opportunity Mapping, the PDF) is
 * already saved incrementally as each stage completes, so marking it
 * "complete" here is a status flip, not a place real work could still be
 * lost to a crash.
 */
export async function completeDepartmentAndContinue(
  _prev: NavActionState,
  formData: FormData,
): Promise<NavActionState> {
  await requireActiveMember();

  const engagementId = String(formData.get("engagementId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  if (!engagementId || !departmentId) return { error: "Missing engagement or department." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("departments")
    .update({ status: "complete" })
    .eq("id", departmentId);
  if (error) return { error: error.message };

  revalidatePath("/engagements", "layout");
  redirect(`/engagements/${engagementId}`);
}

/** Marks the current department done and the whole Engagement complete. */
export async function finishEngagement(
  _prev: NavActionState,
  formData: FormData,
): Promise<NavActionState> {
  await requireActiveMember();

  const engagementId = String(formData.get("engagementId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  if (!engagementId) return { error: "No engagement." };

  const supabase = await createClient();

  if (departmentId) {
    const { error } = await supabase
      .from("departments")
      .update({ status: "complete" })
      .eq("id", departmentId);
    if (error) return { error: error.message };
  }

  const { error } = await supabase
    .from("engagements")
    .update({ status: "complete" })
    .eq("id", engagementId);
  if (error) return { error: error.message };

  revalidatePath("/engagements", "layout");
  redirect(`/engagements/${engagementId}`);
}

/**
 * Aggregates every Department in a finished Engagement into one Comprehensive
 * Report PDF. CLAUDE.md: this becomes available "once every Department is
 * marked done", so it requires engagement.status === 'complete' rather than
 * checking each department individually, the same completeness signal the
 * overview page already shows.
 */
export async function generateComprehensiveReport(
  _prev: ReportActionState,
  formData: FormData,
): Promise<ReportActionState> {
  await requireActiveMember();

  const engagementId = String(formData.get("engagementId") ?? "");
  if (!engagementId) return { error: "No engagement." };

  const supabase = await createClient();
  const { data: engagement } = await supabase
    .from("engagements")
    .select("id, status, report_storage_path, clients(name)")
    .eq("id", engagementId)
    .maybeSingle();

  if (!engagement) return { error: "That engagement no longer exists." };
  if (engagement.status !== "complete") {
    return { error: "Finish every department before generating the report." };
  }

  const { data: departments } = await supabase
    .from("departments")
    .select("name, before_diagram, after_diagram, opportunity_mapping, bottlenecks")
    .eq("engagement_id", engagementId)
    .order("created_at", { ascending: true });

  const rows = departments ?? [];
  if (rows.length === 0) return { error: "This engagement has no departments." };

  const incomplete = rows.filter(
    (d) => !d.before_diagram || !d.after_diagram || !d.opportunity_mapping,
  );
  if (incomplete.length > 0) {
    return {
      error: `${incomplete.length} department${incomplete.length === 1 ? " has" : "s have"} not finished its analysis yet.`,
    };
  }

  // Nested PostgREST embed, same reasoning as the department PDF action.
  const client = (engagement as unknown as { clients: { name: string } | null }).clients;
  const clientName = client?.name ?? "Client";

  const reportDepartments: ReportDepartment[] = rows.map((department) => ({
    name: department.name,
    beforeDiagram: department.before_diagram as unknown as WorkflowDiagram,
    afterDiagram: department.after_diagram as unknown as WorkflowDiagram,
    solutions: (department.opportunity_mapping as unknown as OpportunityMapping).solutions,
    bottleneckCount: ((department.bottlenecks as unknown as Bottleneck[] | null) ?? []).length,
  }));

  const { renderToBuffer } = await import("@react-pdf/renderer");
  const buffer = await renderToBuffer(
    ComprehensiveReportPdfDocument({
      clientName,
      date: new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      departments: reportDepartments,
    }),
  );

  // Fresh key per generation, not upsert on a fixed path, same lesson as the
  // department PDF: an overwrite of the same storage key was observed
  // serving stale bytes back on the very next read.
  const previousPath = engagement.report_storage_path;
  const reportPath = `${engagementId}/comprehensive-report-${Date.now()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("compass-reports")
    .upload(reportPath, buffer, { contentType: "application/pdf" });

  if (uploadError) {
    return { error: `Generated, but could not store the report: ${uploadError.message}` };
  }

  const { error: saveError } = await supabase
    .from("engagements")
    .update({ report_storage_path: reportPath })
    .eq("id", engagementId);

  if (saveError) {
    return { error: `Report stored, but could not save its location: ${saveError.message}` };
  }

  if (previousPath) {
    await supabase.storage.from("compass-reports").remove([previousPath]);
  }

  revalidatePath("/engagements", "layout");
  return { ok: "Comprehensive Report generated.", reportPath };
}

export type DraftActionState = { error: string } | { ok: true } | null;

const MAX_DRAFT_CHARS = 60_000;

/**
 * Saves the transcript textarea's current value without running extraction.
 * A plain write, no AI call, called on a debounce while a consultant is
 * still typing or has just pasted.
 *
 * This exists because everything past a completed stage was already safe
 * (each stage writes to the row the moment it finishes), but the raw
 * transcript itself, before "Extract workflow" is ever clicked, lived only
 * in browser state. A refresh, or the tab closing, mid-paste would have lost
 * a whole live interview transcript, the one genuinely irreplaceable input
 * in this pipeline, which is a real instance of exactly the risk the
 * autosave-per-department non-negotiable exists to prevent, not just the
 * completed-stage case it was originally written for.
 */
export async function saveTranscriptDraft(
  _prev: DraftActionState,
  formData: FormData,
): Promise<DraftActionState> {
  await requireActiveMember();

  const departmentId = String(formData.get("departmentId") ?? "");
  const transcript = String(formData.get("transcript") ?? "");
  if (!departmentId) return { error: "No department." };
  if (transcript.length > MAX_DRAFT_CHARS) return { error: "Transcript too long to save." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("departments")
    .update({ transcript })
    .eq("id", departmentId);

  if (error) return { error: error.message };
  return { ok: true };
}
