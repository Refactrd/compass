import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { AiError, extractStructured } from "@/lib/ai/client";
import { retrieve } from "@/lib/ai/retrieval";
import {
  cleanWorkflowText,
  stagesOf,
  toWorkflowStepId,
  type StressOutcome,
} from "@/lib/immersion/diagram-schema";
import type { WorkflowDiagram } from "@/lib/immersion/diagram-schema";
import type { Database } from "@/lib/types/database";

/**
 * Workflow in, bottlenecks out. Phase 2 days 6-8, stage 2 of the pipeline
 * (CLAUDE.md, "AI pipeline, per department"): "Bottleneck identification
 * against that structure, grounded in retrieval the same way the main chat
 * is." That phrase is doing real work: unlike Opportunity Mapping a few
 * lines down in CLAUDE.md, this stage is NOT restricted to the
 * tools/stack/constraints/engineering-docs categories. It draws on the whole
 * active knowledge base, the same call the main chat uses, because
 * identifying a bottleneck is methodology (how Refactrd recognises one), not
 * a tooling recommendation.
 */

/** The kind of change that would remove a bottleneck: the lens Refactrd
 * reads every workflow through. Not a product, just the shape of the fix. */
export type FixType = "ai" | "automation" | "system" | "process";

export type Bottleneck = {
  stepId: string;
  description: string;
  /** What in the transcript actually supports calling this a bottleneck, not
   * a generic justification. A bottleneck with no real evidence is a
   * fabrication, exactly the failure mode CLAUDE.md's grounding discipline
   * exists to prevent, even though that discipline is written specifically
   * about the next stage. Holding this stage to the same bar is a deliberate
   * choice, not something CLAUDE.md required in so many words. */
  evidence: string;
  /** Optional only because bottlenecks saved before this existed lack it. */
  fixType?: FixType | null;
};

/** A headline number the interviewee actually stated, e.g. "150 to 450",
 * "WhatsApp enquiries a day from ads". */
export type KeyFigure = { value: string; label: string };

/** One of the few problems that keep coming back across the bottlenecks. */
export type FindingTheme = { title: string; description: string; stepIds: string[] };

/** What kind of shock a stress scenario puts the workflow through. */
export type StressKind = "people" | "volume" | "records" | "dependency";

/**
 * A stress test of a real weakness the interview described: what happens to
 * today's workflow if a key person leaves or is away, if demand surges, if
 * records are lost, or if an outside dependency fails. The shock is
 * hypothetical; the weakness it exposes must be in the transcript, which is
 * what `evidence` holds. These scenarios are what the scale readiness score
 * is computed from (lib/immersion/workflow-score.ts).
 */
export type StressScenario = {
  /** "scenario-1", ... assigned by normalisation. */
  id: string;
  kind: StressKind;
  /** "If the central agent is off sick". */
  title: string;
  /** What actually happens to the work, concretely. */
  impact: string;
  evidence: string;
  outcome: StressOutcome;
  stepIds: string[];
};

/** The "What we found" page: key figures, recurring problems, the one
 * pattern behind them (modelled on the approved SA Logistics report), and
 * the stress test that scores how the workflow copes at scale. */
export type Findings = {
  keyFigures: KeyFigure[];
  themes: FindingTheme[];
  pattern: string | null;
  /** Optional for findings saved before the stress test existed. */
  scenarios?: StressScenario[];
};

export type BottleneckAnalysis = { bottlenecks: Bottleneck[]; findings: Findings };

const FIX_TYPES: FixType[] = ["ai", "automation", "system", "process"];
const STRESS_KINDS: StressKind[] = ["people", "volume", "records", "dependency"];
const OUTCOMES: StressOutcome[] = ["breaks", "strains", "holds"];

const SCHEMA = {
  type: "object",
  properties: {
    bottlenecks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          stepIndex: { type: "integer" },
          description: { type: "string" },
          evidence: { type: "string" },
          fixType: { type: "string", enum: FIX_TYPES },
        },
        required: ["stepIndex", "description", "evidence", "fixType"],
        additionalProperties: false,
      },
    },
    keyFigures: {
      type: "array",
      items: {
        type: "object",
        properties: { value: { type: "string" }, label: { type: "string" } },
        required: ["value", "label"],
        additionalProperties: false,
      },
    },
    themes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          bottleneckIndexes: { type: "array", items: { type: "integer" } },
        },
        required: ["title", "description", "bottleneckIndexes"],
        additionalProperties: false,
      },
    },
    pattern: { type: ["string", "null"] },
    scenarios: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["people", "volume", "records", "dependency"] },
          title: { type: "string" },
          impact: { type: "string" },
          evidence: { type: "string" },
          outcome: { type: "string", enum: ["breaks", "strains", "holds"] },
          stepIndexes: { type: "array", items: { type: "integer" } },
        },
        required: ["kind", "title", "impact", "evidence", "outcome", "stepIndexes"],
        additionalProperties: false,
      },
    },
  },
  required: ["bottlenecks", "keyFigures", "themes", "pattern", "scenarios"],
  additionalProperties: false,
} as const;

const SYSTEM = `
You read a workflow extracted from a Refactrd immersion day interview, plus
the transcript it came from, and identify which steps are genuine bottlenecks:
places where the work is slow, manual, error prone, or a real source of
friction, as actually described by the person being interviewed.

What Refactrd looks for. Every immersion day is looking for work that can
move from manual handoffs and repetitive effort to a smarter way of
operating. Read the workflow for exactly that:

  manual handoffs: information passed by hand from person to person, phone
  to phone, or chat to chat before anyone can act on it.

  repetitive work: the same message typed again for each customer, the same
  data copied into a spreadsheet, the same question answered all day.

  scattered information: records living on handsets, in inboxes, group chats
  or personal spreadsheets, with no single place the business works from.

  waiting on a person: work that sits overnight, until 9am, or until someone
  is free, only because a human has to be the one to pick it up.

  decisions by hand: sorting, filtering or routing that follows a rule a
  person applies one item at a time.

Each of these is something an AI assistant, an automation, a centralised
system, or a simpler process can remove. Focus the bottlenecks on them. Do
not flag a problem that none of these could address.

Rules:

Only flag a step if the transcript itself gives you a real reason to: a stated
delay, a described manual effort, a mentioned error or rework, a workaround,
or something the interviewee characterised as a problem. Never flag a step
just because it sounds like it could theoretically be slow for a company of
this kind. That is a guess dressed up as an observation, and it is exactly the
kind of thing that must not appear in a document a real prospective client
will read.

evidence must point to the actual thing in the transcript that justifies the
flag, close to how the interviewee said it. If you cannot point to something
real, do not include the bottleneck at all. Returning fewer bottlenecks, even
zero, is correct when the transcript does not clearly support more.

The workflow is grouped into stages. Flag at most one bottleneck per stage:
if several things go wrong inside the same stage, write them as one
bottleneck. Point stepIndex at the step inside that stage where the problem
bites hardest. A stage with nothing real to flag gets none.

description: one or two short sentences, written for the client's own team
to read on a findings page, naming what actually goes wrong. Be concrete:
carry over the specific figures, volumes, times and names the interviewee
actually gave, for example "One agent filters by hand and gives each
non-China customer another number to message. Nothing moves before 9am." or
"Ad enquiries land on three office phones with no filter in front of them. A
heavy day brings up to 450 messages." Never add a figure the transcript does
not contain. Not a recommendation, not a solution, just the problem.

fixType: the kind of change that would remove it. "ai" when the work is
reading, writing, qualifying, transcribing, translating, summarising or
answering; "automation" when data or messages just need to move, be recorded,
routed or sent without a person carrying them; "system" when there is no
single record and the business needs one central place the work runs from;
"process" when the steps themselves should change, a handoff removed or a
rule set once. The shape of the fix, never a product name.

Findings, for the "What we found" page the client reads first:

keyFigures: up to four headline numbers that show the scale of the problem,
for example value "150 to 450" with label "WhatsApp enquiries a day from
ads", or value "9am" with label "when agents start, so overnight enquiries
wait". value must be a figure the interviewee actually stated, written with
digits as they said it, never computed, rounded, totalled or estimated.
label is a short phrase saying what it counts. Fewer, or none, is correct
when the transcript gives fewer real figures.

themes: two to four problems that keep coming back across the bottlenecks in
different forms, the way a findings page groups them, for example title
"Information is carried by hand" with description "China updates are retyped
to each customer, tracking codes are copied into a spreadsheet, and Friday
broadcast numbers are saved one at a time." title is three to six words;
description is one or two concrete sentences from the transcript.
bottleneckIndexes are the 1-based positions, in the bottlenecks you return,
of the bottlenecks behind each theme.

pattern: one or two sentences naming the single pattern behind the themes,
for example "None of these tasks are hard. They exist because information
that is already in the business has to be carried by a person to the place it
is needed." Null if there is no honest common thread.

scenarios: the stress test. Simulate what happens to today's workflow under
pressure, so the client sees how it copes at scale, not just on a normal day.
Three to five scenarios, drawn from these kinds:

  "people": a key person leaves, is off sick, or is on leave. Use this where
  the transcript shows work that only one person does or knows how to do.

  "volume": orders, customers or requests double, or a campaign brings a
  spike. Use this where work is handled one item at a time by hand.

  "records": a phone is lost or wiped, a spreadsheet is overwritten, a chat
  is deleted. Use this where information lives in one fragile place.

  "dependency": an outside party, supplier, tool or channel stops or slows.
  Use this where the workflow leans on something it does not control.

The shock is hypothetical, but the weakness it exposes must be one the
transcript actually describes; evidence is the thing the interviewee said
that shows it. Never invent a weakness, and never put a number in a
scenario that the transcript did not give. title is the shock in a few
words, starting with "If", for example "If the central agent is away" or "If
enquiries double". impact is one or two concrete sentences on what happens
to the work, for example "Every enquiry still lands on three phones and waits
for someone to sort it, so overnight messages pile up and serious customers
wait behind casual ones." outcome is how today's workflow fares: "breaks"
when work stops or is lost, "strains" when it continues but slows, backs up
or relies on people working harder, "holds" when it copes. stepIndexes are
the 1-based positions of the steps that take the hit.

Reference steps by their position in the list you are given (1-based). Some
methodology material may be included below for how Refactrd thinks about
bottlenecks generally; use it to inform judgement, never as a source of
bottlenecks for organizations it was not written about.

Write every text field without em dashes or en dashes. Use
commas or full stops instead. Ordinary hyphens in compound words are fine.
`.trim();

export async function extractBottlenecks({
  supabase,
  transcript,
  diagram,
}: {
  supabase: SupabaseClient<Database, "compass">;
  transcript: string;
  diagram: WorkflowDiagram;
}): Promise<BottleneckAnalysis> {
  const empty: Findings = { keyFigures: [], themes: [], pattern: null, scenarios: [] };
  if (diagram.steps.length === 0) return { bottlenecks: [], findings: empty };

  const retrievalQuery = diagram.steps.map((step) => step.label).join(". ");
  const retrieval = await retrieve(supabase, retrievalQuery);

  const stageByFirstStep = new Map(stagesOf(diagram).map((stage) => [stage.stepIds[0], stage]));
  const stepsBlock = diagram.steps
    .map((step, index) => {
      const parts = [step.label];
      if (step.actor) parts.push(`actor: ${step.actor}`);
      if (step.description) parts.push(step.description);
      const stage = stageByFirstStep.get(step.id);
      const header = stage ? `Stage: ${stage.title}\n` : "";
      return `${header}${index + 1}. ${parts.join(". ")}`;
    })
    .join("\n");

  const knowledgeBlock =
    retrieval.chunks.length > 0
      ? retrieval.chunks
          .map((chunk) => `Source: ${chunk.documentTitle}\n${chunk.content}`)
          .join("\n\n")
      : "No Refactrd methodology material matched this workflow.";

  const raw = await extractStructured({
    system: SYSTEM,
    schema: SCHEMA,
    maxTokens: 8000,
    prompt: `Transcript:\n\n${transcript}\n\nExtracted workflow:\n${stepsBlock}\n\nRefactrd methodology material:\n${knowledgeBlock}`,
  });

  let parsed: {
    bottlenecks: { stepIndex: number; description: string; evidence: string; fixType?: string }[];
    keyFigures?: { value: string; label: string }[];
    themes?: { title: string; description: string; bottleneckIndexes: number[] }[];
    pattern?: string | null;
    scenarios?: {
      kind: string;
      title: string;
      impact: string;
      evidence: string;
      outcome: string;
      stepIndexes: number[];
    }[];
  };
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("[immersion/bottleneck-extraction] unparsable response", error, raw);
    throw new AiError("The bottleneck analysis returned something unreadable. Try again.");
  }

  const rawBottlenecks = Array.isArray(parsed.bottlenecks) ? parsed.bottlenecks : [];

  // Kept positionally aligned with the raw list (null where dropped) so a
  // theme's bottleneckIndexes still point at the right bottleneck.
  const aligned = rawBottlenecks.map((item): Bottleneck | null => {
    const stepId = toWorkflowStepId(item?.stepIndex, diagram.steps.length);
    const description = cleanWorkflowText(item?.description, 300);
    const evidence = cleanWorkflowText(item?.evidence, 400);
    if (!stepId || !description || !evidence) return null;
    const fixType = FIX_TYPES.includes(item?.fixType as FixType) ? (item.fixType as FixType) : null;
    return { stepId, description, evidence, fixType };
  });
  const bottlenecks = aligned.filter((item): item is Bottleneck => item !== null);

  const keyFigures = (Array.isArray(parsed.keyFigures) ? parsed.keyFigures : [])
    .map((figure): KeyFigure | null => {
      const value = cleanWorkflowText(figure?.value, 24);
      const label = cleanWorkflowText(figure?.label, 90);
      if (!value || !label || !figureIsInTranscript(value, transcript)) return null;
      return { value, label };
    })
    .filter((figure): figure is KeyFigure => figure !== null)
    .slice(0, 4);

  const scenarios = (Array.isArray(parsed.scenarios) ? parsed.scenarios : [])
    .map((scenario): Omit<StressScenario, "id"> | null => {
      const title = cleanWorkflowText(scenario?.title, 90);
      const impact = cleanWorkflowText(scenario?.impact, 300);
      const evidence = cleanWorkflowText(scenario?.evidence, 300);
      const kind = STRESS_KINDS.includes(scenario?.kind as StressKind)
        ? (scenario.kind as StressKind)
        : null;
      const outcome = OUTCOMES.includes(scenario?.outcome as StressOutcome)
        ? (scenario.outcome as StressOutcome)
        : null;
      const stepIds = (Array.isArray(scenario?.stepIndexes) ? scenario.stepIndexes : [])
        .map((index) => toWorkflowStepId(index, diagram.steps.length))
        .filter((id): id is string => id !== null);
      // No evidence means no real weakness behind the scenario: dropped.
      if (!title || !impact || !evidence || !kind || !outcome) return null;
      return { kind, title, impact, evidence, outcome, stepIds: [...new Set(stepIds)] };
    })
    .filter((scenario): scenario is Omit<StressScenario, "id"> => scenario !== null)
    .slice(0, 5)
    .map((scenario, i) => ({ id: `scenario-${i + 1}`, ...scenario }));

  const themes = (Array.isArray(parsed.themes) ? parsed.themes : [])
    .map((theme): FindingTheme | null => {
      const title = cleanWorkflowText(theme?.title, 80);
      const description = cleanWorkflowText(theme?.description, 320);
      const stepIds = (Array.isArray(theme?.bottleneckIndexes) ? theme.bottleneckIndexes : [])
        .map((index) => (typeof index === "number" ? aligned[index - 1] : null))
        .filter((b): b is Bottleneck => !!b)
        .map((b) => b.stepId);
      // A theme with no surviving bottleneck behind it has nothing grounding it.
      if (!title || !description || stepIds.length === 0) return null;
      return { title, description, stepIds: [...new Set(stepIds)] };
    })
    .filter((theme): theme is FindingTheme => theme !== null)
    .slice(0, 4);

  return {
    bottlenecks,
    findings: {
      keyFigures,
      themes,
      pattern: bottlenecks.length > 0 ? cleanWorkflowText(parsed.pattern, 320) : null,
      scenarios,
    },
  };
}

/**
 * The enforcement point for key figures, which go in large type on the first
 * page a client reads: every number in the value must literally appear in
 * the transcript, so a computed, rounded or invented figure is dropped
 * rather than shown. A value with no digits at all is not a figure.
 */
function figureIsInTranscript(value: string, transcript: string): boolean {
  const numbers = value.match(/\d+(?:[.,]\d+)*/g);
  if (!numbers) return false;
  const haystack = transcript.replace(/(\d),(?=\d{3})/g, "$1");
  return numbers.every((n) => haystack.includes(n.replace(/,(?=\d{3})/g, "")));
}
