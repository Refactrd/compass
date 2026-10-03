import "server-only";

import { AiError, extractStructured } from "@/lib/ai/client";
import {
  WORKFLOW_EXTRACTION_SCHEMA,
  normalizeWorkflow,
  type RawWorkflowDiagram,
  type WorkflowDiagram,
} from "@/lib/immersion/diagram-schema";

const MAX_CORRECTION_CHARS = 2000;

/**
 * Transcript in, "before" workflow diagram out. Phase 2 days 3-5, the
 * riskiest new capability in this phase (CLAUDE.md) — everything downstream
 * (bottlenecks, Opportunity Mapping, the "after" diagram, both PDFs) reads
 * the structure this produces.
 *
 * Unlike lib/ai/extraction.ts's client-context pass, this is not a silent
 * side effect of something else: pasting a transcript and clicking extract is
 * the thing the consultant is deliberately doing, so a failure here has to
 * surface as a real, visible error rather than the panel quietly staying
 * empty. Errors are thrown, not swallowed; the caller (a server action) is
 * expected to catch and show them.
 */

const EXTRACTION_SYSTEM = `
You read a department interview transcript from a Refactrd immersion day and
extract the workflow exactly as it happens today, not an improved or idealized
version. This produces the "before" diagram a consultant reviews on screen and
a client later sees in a PDF, so accuracy to what was actually said matters
more than a tidy result.

Rules:

Only include a step if the transcript actually describes it happening. Never
invent a plausible-sounding step to fill a gap, smooth a transition, or make
the sequence look more complete. A shorter, accurate diagram is correct; a
longer, padded one is a defect. If the transcript is too thin to produce a
real workflow, return as few steps as the material actually supports, even
zero.

Order steps the way the work actually flows, which is not always the order
they were mentioned in the interview. A transcript often circles back or
clarifies an earlier point later; sequence by the real workflow, not the
transcript's own order.

label: short and imperative, naming the action, e.g. "Sales rep logs the lead
in the CRM". Not a sentence about the step, the step itself.

actor: who performs it, in the transcript's own words (a role, a title, a
team name). Null if the transcript never says who does this specific step.

description: one or two sentences of real extra detail from the transcript,
such as a tool named, a typical duration, or a frequency. Null if the label
already says everything the transcript supports. Never pad this with
generic-sounding detail the transcript did not actually provide.

branches: only for a genuine decision point the transcript describes, where
the work actually forks depending on a condition, not for every place a
step could theoretically vary. Reference steps by their position (1-based,
matching the order you return them in), never by inventing a name or id.
condition is the bare condition itself, phrased so it reads naturally after
the word "If", e.g. "the client already has a signed PO", not "If the client
already has a signed PO". Do not include the word "if" yourself, it is added
when this is displayed. Most departments described in an interview are close
to linear; an empty branches array is a normal, common, correct result, not a
failure to try harder.

Write every label, actor, and description without em dashes or en dashes. Use
commas or full stops instead. Ordinary hyphens in compound words are fine.
`.trim();

export async function extractWorkflow(transcript: string): Promise<WorkflowDiagram> {
  const trimmed = transcript.trim();
  if (!trimmed) {
    throw new AiError("There is no transcript to extract a workflow from.");
  }

  const raw = await extractStructured({
    system: EXTRACTION_SYSTEM,
    schema: WORKFLOW_EXTRACTION_SCHEMA,
    maxTokens: 4000,
    prompt: `Transcript:\n\n${trimmed}`,
  });

  return parseWorkflowResponse(raw);
}

const REVISION_SYSTEM = `
${EXTRACTION_SYSTEM}

You are revising a workflow you (or an earlier pass) already extracted from
this transcript, not starting fresh. The consultant who ran the actual
interview is telling you something in it is wrong, such as a step that
never really happens that way, or something real that got left out.

Apply exactly what the consultant's correction says. Keep every other step,
actor, description and branch from the current workflow unchanged, in the
same order, unless the correction itself implies a reordering. Do not use
this as a chance to rewrite or polish steps the correction did not mention.
The transcript is still the source of truth for everything the correction
does not touch; the correction is the source of truth for what it does
touch, even where it adds something the transcript alone would not have
supported, since the consultant was there and the transcript is only a
record of what got said out loud.
`.trim();

/** A plain numbered list, not the raw JSON: this is read by the same model
 * that produced it, not parsed by code, and a short human-readable summary
 * keeps the revision prompt legible instead of asking it to diff JSON
 * against prose. */
function describeDiagram(diagram: WorkflowDiagram): string {
  if (diagram.steps.length === 0) return "(no steps)";

  const branchesByFromStep = new Map<string, typeof diagram.branches>();
  for (const branch of diagram.branches) {
    const list = branchesByFromStep.get(branch.fromStepId) ?? [];
    list.push(branch);
    branchesByFromStep.set(branch.fromStepId, list);
  }
  const indexById = new Map(diagram.steps.map((step, i) => [step.id, i + 1]));

  return diagram.steps
    .map((step, i) => {
      const lines = [
        `${i + 1}. ${step.label}${step.actor ? ` (${step.actor})` : ""}`,
      ];
      if (step.description) lines.push(`   ${step.description}`);
      for (const branch of branchesByFromStep.get(step.id) ?? []) {
        const target = indexById.get(branch.toStepId) ?? "?";
        lines.push(`   If ${branch.condition}, skip to step ${target}.`);
      }
      return lines.join("\n");
    })
    .join("\n");
}

export async function reviseWorkflow(
  transcript: string,
  currentDiagram: WorkflowDiagram,
  correction: string,
): Promise<WorkflowDiagram> {
  const trimmedCorrection = correction.trim();
  if (!trimmedCorrection) {
    throw new AiError("Write what should change before regenerating.");
  }
  if (trimmedCorrection.length > MAX_CORRECTION_CHARS) {
    throw new AiError(`Keep the correction under ${MAX_CORRECTION_CHARS} characters.`);
  }

  const raw = await extractStructured({
    system: REVISION_SYSTEM,
    schema: WORKFLOW_EXTRACTION_SCHEMA,
    maxTokens: 4000,
    prompt: `Original transcript:\n\n${transcript.trim()}\n\nCurrently extracted workflow:\n\n${describeDiagram(currentDiagram)}\n\nConsultant's correction:\n\n${trimmedCorrection}`,
  });

  return parseWorkflowResponse(raw);
}

function parseWorkflowResponse(raw: string): WorkflowDiagram {
  let parsed: RawWorkflowDiagram;
  try {
    parsed = JSON.parse(raw) as RawWorkflowDiagram;
  } catch (error) {
    console.error("[immersion/transcript-extraction] unparsable response", error, raw);
    throw new AiError("The workflow extraction returned something unreadable. Try again.");
  }

  return normalizeWorkflow(parsed);
}
