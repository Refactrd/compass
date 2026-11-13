import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { AiError, extractStructured } from "@/lib/ai/client";
import { retrieve } from "@/lib/ai/retrieval";
import type { Bottleneck, Findings, FixType } from "@/lib/immersion/bottleneck-extraction";
import { cleanWorkflowText, stagesOf } from "@/lib/immersion/diagram-schema";
import type { WorkflowDiagram } from "@/lib/immersion/diagram-schema";
import type { Database } from "@/lib/types/database";

/**
 * Bottlenecks in, tiered solutions out. Phase 2 days 6-8, the highest-stakes
 * stage in this phase: CLAUDE.md's Phase 2 non-negotiables call the grounding
 * discipline here "absolute", not aspirational, because this output goes
 * into a PDF a real prospective client reads during an actual sales meeting.
 *
 * Retrieval is category-filtered to tools/stack/constraints/engineering-docs
 * (CLAUDE.md, "Data model additions"), deliberately separate from the whole
 * knowledge base bottleneck identification draws on: this stage recommends
 * Refactrd's actual tooling and constraints, not general methodology.
 *
 * `groundedIn` is not a nice-to-have field, it is the mechanism the grounding
 * rule is enforced through: every solution must cite either something the
 * transcript actually said or a specific piece of retrieved document
 * material. A solution the model cannot ground in either is dropped in
 * normalize(), never shipped un-labelled. See categoryMaterialAvailable on
 * the result: when it is false, no tools/stack/constraints/engineering-docs
 * material has been ingested at all, and any solutions returned can only be
 * transcript-grounded, never tool-specific. That is a real, current gap in
 * what has been ingested, not a hypothetical one, worth surfacing rather
 * than hiding behind a normal-looking result.
 */

export type GroundingSource =
  | { source: "transcript"; detail: string }
  | { source: "document"; detail: string };

export type Level = "high" | "medium" | "low";

export type Solution = {
  tier: "priority" | "recommended" | "nice-to-have";
  /** A short build name. "Lead qualification assistant". */
  title: string;
  /** What kind of build it is, the same lens bottlenecks are read through. */
  kind?: FixType | null;
  /** One plain sentence of what it does. Optional only because solutions
   * saved before this field existed do not have it. */
  summary?: string | null;
  /** The manual work it replaces today, in the client's own terms. */
  replaces?: string | null;
  /** Refactrd's qualitative estimate, labelled as one wherever it is shown. */
  impact?: Level | null;
  effort?: Level | null;
  rationale: string;
  /** Null when the material available does not support a specific figure.
   * A null here is a correct, honest answer, not a missing one. */
  timeSavedEstimate: string | null;
  addressesBottleneckStepIds: string[];
  groundedIn: GroundingSource[];
};

/** What changes at one bottleneck, the "Opportunity" card under its stage. */
export type StageOpportunity = { stepId: string; text: string };

export type OpportunityMapping = {
  /** In delivery order. */
  solutions: Solution[];
  /** Optional for mappings saved before this existed; the diagram then falls
   * back to the summaries of the solutions addressing each bottleneck. */
  opportunities?: StageOpportunity[];
  categoryMaterialAvailable: boolean;
  /** The "What we found" page, produced by bottleneck extraction and stored
   * here (the departments table already persists this JSON as one value),
   * rather than a new column for one more derived field. Optional for
   * mappings saved before it existed. */
  findings?: Findings;
};

const SCHEMA = {
  type: "object",
  properties: {
    solutions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tier: { type: "string", enum: ["priority", "recommended", "nice-to-have"] },
          title: { type: "string" },
          kind: { type: "string", enum: ["ai", "automation", "system", "process"] },
          summary: { type: "string" },
          replaces: { type: "string" },
          impact: { type: "string", enum: ["high", "medium", "low"] },
          effort: { type: "string", enum: ["high", "medium", "low"] },
          rationale: { type: "string" },
          timeSavedEstimate: { type: ["string", "null"] },
          addressesBottleneckIndexes: { type: "array", items: { type: "integer" } },
          groundedIn: {
            type: "array",
            items: {
              type: "object",
              properties: {
                source: { type: "string", enum: ["transcript", "document"] },
                detail: { type: "string" },
              },
              required: ["source", "detail"],
              additionalProperties: false,
            },
          },
        },
        required: [
          "tier",
          "title",
          "kind",
          "summary",
          "replaces",
          "impact",
          "effort",
          "rationale",
          "timeSavedEstimate",
          "addressesBottleneckIndexes",
          "groundedIn",
        ],
        additionalProperties: false,
      },
    },
    opportunities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          bottleneckIndex: { type: "integer" },
          text: { type: "string" },
        },
        required: ["bottleneckIndex", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["solutions", "opportunities"],
  additionalProperties: false,
} as const;

const SYSTEM = `
You read a set of bottlenecks found in a Refactrd immersion day interview,
the transcript itself, and whatever Refactrd tools, stack, engineering
constraints, and engineering documentation material was retrieved as
relevant, and propose solutions. This is the single most consequential piece
of a real Refactrd sales process: the result becomes part of a PDF a
prospective client reads during the meeting meant to convert them into a paying
engagement. A plausible sounding but unsupported claim here is a materially
worse failure than an ungrounded chat answer would be anywhere else in this
product.

The absolute rule: every solution must be grounded in either the transcript
or the retrieved document material, never in what a company like this
"probably" needs or what a tool "typically" does. groundedIn records exactly
that support, one entry per fact the solution rests on:

  source "transcript": the detail is the actual thing the interviewee said
  that this solution responds to, a described pain point, a mentioned
  current tool, a stated volume or frequency.

  source "document": the detail names what the retrieved material actually
  supports, close to its own words, not a generalisation from it.

If a solution has nothing real to cite in groundedIn, do not include it. A
shorter list of well-grounded solutions is correct; a longer list padded with
generic best-practice suggestions is a defect, no matter how reasonable each
one sounds in isolation.

timeSavedEstimate: only give a specific figure (a number, a percentage, a
concrete time amount) if the transcript or the retrieved material actually
supports computing or stating one, for example the transcript says a step
takes five minutes and happens twenty times a day. Otherwise return null. A
specific-sounding number with nothing behind it is exactly the failure this
whole stage exists to prevent. Null is a correct, common, expected answer,
not a gap to fill with a plausible guess.

If no tools, stack, constraints, or engineering-docs material was retrieved
at all, say so plainly in your own reasoning and only propose solutions the
transcript itself clearly supports (such as automating a manually described
step), never naming a specific tool or platform you have no material for.

How Refactrd approaches this. Do not fix bottlenecks one step at a time.
Look for the pattern behind them: usually information that already exists in
the business being carried by hand between people, phones, inboxes and
spreadsheets, and nothing in front of the team deciding what deserves their
attention first. A good solution is a build that removes that pattern across
several steps at once: an AI assistant that handles first contact,
qualifies, transcribes, translates or reads incoming messages; an automation
that records, routes, syncs or notifies so nobody retypes anything; or a
purpose-built system that becomes the single record the work runs on. Three
to six well-chosen builds usually transform a department; a long list of
small fixes does not. Each build should still be the smallest one that does
the job, matching Refactrd's methodology of preferring the smallest
sufficient intervention: no platform where a simple automation is enough. And
every build still has to be grounded exactly as above.

title: a short name for the build, two to five words, for example "Lead
qualification assistant", "Unique customer codes", "Invoice generator".

kind: "ai" for an assistant that reads, writes, qualifies, transcribes,
translates, summarises or answers; "automation" for something that records,
routes, syncs or sends without a person carrying it; "system" for a central
system of record or purpose-built tool the work runs from; "process" for a
change to the steps themselves with no new software. Each bottleneck comes
with the kind of fix it points to; use that as a strong hint.

summary: one plain sentence saying what it does, starting with a verb, for
example "Chats with every new lead, asks qualifying questions, scores them,
and hands over to a customer service agent."

replaces: a short phrase naming the manual work it replaces today, in the
client's own terms, for example "Agents answering every enquiry one by one,
and a manual filter for China vs other regions."

impact and effort: "high", "medium" or "low", Refactrd's own qualitative
estimate, shown to the client labelled as an estimate to be tightened during
scoping. Judge impact from how much of the described pain and volume the
build removes; judge effort from the retrieved stack and engineering material
where there is some, otherwise from how much new building it implies. Never
turn either into a number.

tier also sets the 90 day roadmap: "priority" is built in days 1 to 30,
"recommended" in days 31 to 60, "nice-to-have" in days 61 to 90. Put the
builds that fix the biggest, best-grounded bottleneck first, and put any
build another one depends on in the same or an earlier tier, for example
unique customer codes before a tracker that matches updates to those codes.
Return the solutions in the order they would be delivered.

addressesBottleneckIndexes: 1-based positions in the bottleneck list you are
given, which bottleneck(s) this solution resolves. A solution should address
at least one, and a good build often addresses several.

opportunities: one entry per bottleneck that at least one of your solutions
addresses. text is one short sentence saying what changes at that point once
the builds are in place, written for the client, for example "The assistant
scores warm against cold and routes each lead to the right agent or number
automatically." It describes only what your listed solutions do there.

Write every title, rationale, and grounding detail without em dashes or en
dashes. Use commas or full stops instead. Ordinary hyphens in compound words
are fine.
`.trim();

const CATEGORIES = ["tools", "stack", "constraints", "engineering-docs"] as const;

export async function generateOpportunityMapping({
  supabase,
  transcript,
  diagram,
  bottlenecks,
}: {
  supabase: SupabaseClient<Database, "compass">;
  transcript: string;
  diagram: WorkflowDiagram;
  bottlenecks: Bottleneck[];
}): Promise<OpportunityMapping> {
  if (bottlenecks.length === 0) {
    return { solutions: [], opportunities: [], categoryMaterialAvailable: false };
  }

  const stepById = new Map(diagram.steps.map((step) => [step.id, step]));
  const stages = stagesOf(diagram);
  const stageOfStep = new Map(
    stages.flatMap((stage) => stage.stepIds.map((id) => [id, stage] as const)),
  );
  const bottlenecksBlock = bottlenecks
    .map((bottleneck, index) => {
      const step = stepById.get(bottleneck.stepId);
      const stage = stageOfStep.get(bottleneck.stepId);
      const fix = bottleneck.fixType ? `, points to a ${bottleneck.fixType} fix` : "";
      return `${index + 1}. ${stage ? `Stage "${stage.title}", step` : "Step"} "${step?.label ?? bottleneck.stepId}": ${bottleneck.description} (evidence: ${bottleneck.evidence}${fix})`;
    })
    .join("\n");

  // The whole flow, not just the flagged steps: spotting one build that
  // removes manual work across several steps needs to see those steps.
  const workflowBlock = stages
    .map((stage) => {
      const steps = stage.stepIds
        .map((id) => stepById.get(id))
        .filter((step) => step !== undefined)
        .map((step) => `  - ${step.label}${step.actor ? ` (${step.actor})` : ""}`);
      return `${stage.title}\n${steps.join("\n")}`;
    })
    .join("\n");

  const retrievalQuery = bottlenecks.map((bottleneck) => bottleneck.description).join(". ");
  const retrieval = await retrieve(supabase, retrievalQuery, {
    categories: [...CATEGORIES],
    matchCount: 12,
  });

  const knowledgeBlock =
    retrieval.chunks.length > 0
      ? retrieval.chunks
          .map((chunk) => `Source: ${chunk.documentTitle}\n${chunk.content}`)
          .join("\n\n")
      : "No Refactrd tools, stack, constraints, or engineering-docs material matched. None of that material may exist yet.";

  const raw = await extractStructured({
    system: SYSTEM,
    schema: SCHEMA,
    // The richest of the four structured calls in this pipeline: several
    // solutions, each with a rationale and multiple grounding citations.
    // The default 2000 truncated a real four-solution response mid-string.
    maxTokens: 10000,
    prompt: `Transcript:\n\n${transcript}\n\nCurrent workflow by stage:\n${workflowBlock}\n\nBottlenecks:\n${bottlenecksBlock}\n\nRetrieved Refactrd tools/stack/constraints/engineering-docs material:\n${knowledgeBlock}`,
  });

  let parsed: {
    opportunities?: { bottleneckIndex: number; text: string }[];
    solutions: {
      tier: string;
      title: string;
      kind?: string;
      summary?: string;
      replaces?: string;
      impact?: string;
      effort?: string;
      rationale: string;
      timeSavedEstimate: string | null;
      addressesBottleneckIndexes: number[];
      groundedIn: { source: string; detail: string }[];
    }[];
  };
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("[immersion/opportunity-mapping] unparsable response", error, raw);
    throw new AiError("Opportunity mapping returned something unreadable. Try again.");
  }

  const rawSolutions = Array.isArray(parsed.solutions) ? parsed.solutions : [];

  const solutions: Solution[] = rawSolutions
    .map((item): Solution | null => {
      const title = cleanWorkflowText(item?.title, 150);
      const rationale = cleanWorkflowText(item?.rationale, 800);
      if (!title || !rationale) return null;

      const tier =
        item?.tier === "priority" || item?.tier === "recommended" || item?.tier === "nice-to-have"
          ? item.tier
          : null;
      if (!tier) return null;

      const groundedIn: GroundingSource[] = (
        Array.isArray(item?.groundedIn) ? item.groundedIn : []
      )
        .map((g): GroundingSource | null => {
          const detail = cleanWorkflowText(g?.detail, 300);
          if (!detail) return null;
          if (g?.source === "transcript") return { source: "transcript", detail };
          if (g?.source === "document") return { source: "document", detail };
          return null;
        })
        .filter((g): g is GroundingSource => g !== null);

      // The enforcement point: a solution with nothing real behind it is
      // dropped here, not merely warned about.
      if (groundedIn.length === 0) return null;

      const addressesBottleneckStepIds = (
        Array.isArray(item?.addressesBottleneckIndexes) ? item.addressesBottleneckIndexes : []
      )
        .map((index) => (typeof index === "number" ? bottlenecks[index - 1] : undefined))
        .filter((b): b is Bottleneck => !!b)
        .map((b) => b.stepId);

      const timeSavedEstimate = cleanWorkflowText(item?.timeSavedEstimate, 150);

      return {
        tier,
        title,
        kind:
          item?.kind === "ai" || item?.kind === "automation" || item?.kind === "system" || item?.kind === "process"
            ? item.kind
            : null,
        summary: cleanWorkflowText(item?.summary, 220),
        replaces: cleanWorkflowText(item?.replaces, 200),
        impact: toLevel(item?.impact),
        effort: toLevel(item?.effort),
        rationale,
        timeSavedEstimate,
        addressesBottleneckStepIds,
        groundedIn,
      };
    })
    .filter((item): item is Solution => item !== null)
    // Stable sort: delivery order as returned, but never a later tier ahead
    // of an earlier one, since tier is what places a build on the roadmap.
    .map((solution, index) => ({ solution, index }))
    .sort((a, b) => TIER_RANK[a.solution.tier] - TIER_RANK[b.solution.tier] || a.index - b.index)
    .map(({ solution }) => solution);

  // An opportunity line is only kept for a bottleneck some surviving
  // solution actually addresses, so a line can never describe a solution
  // that normalisation dropped for lack of grounding.
  const addressed = new Set(solutions.flatMap((solution) => solution.addressesBottleneckStepIds));
  const opportunities: StageOpportunity[] = (
    Array.isArray(parsed.opportunities) ? parsed.opportunities : []
  )
    .map((item): StageOpportunity | null => {
      const bottleneck =
        typeof item?.bottleneckIndex === "number" ? bottlenecks[item.bottleneckIndex - 1] : undefined;
      const text = cleanWorkflowText(item?.text, 220);
      if (!bottleneck || !text || !addressed.has(bottleneck.stepId)) return null;
      return { stepId: bottleneck.stepId, text };
    })
    .filter((item): item is StageOpportunity => item !== null);

  return { solutions, opportunities, categoryMaterialAvailable: retrieval.chunks.length > 0 };
}

const TIER_RANK: Record<Solution["tier"], number> = {
  priority: 0,
  recommended: 1,
  "nice-to-have": 2,
};

function toLevel(value: unknown): Level | null {
  return value === "high" || value === "medium" || value === "low" ? value : null;
}
