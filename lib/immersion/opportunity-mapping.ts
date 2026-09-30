import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { AiError, extractStructured } from "@/lib/ai/client";
import { retrieve } from "@/lib/ai/retrieval";
import type { Bottleneck } from "@/lib/immersion/bottleneck-extraction";
import { cleanWorkflowText } from "@/lib/immersion/diagram-schema";
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

export type Solution = {
  tier: "priority" | "recommended" | "nice-to-have";
  title: string;
  rationale: string;
  /** Null when the material available does not support a specific figure.
   * A null here is a correct, honest answer, not a missing one. */
  timeSavedEstimate: string | null;
  addressesBottleneckStepIds: string[];
  groundedIn: GroundingSource[];
};

export type OpportunityMapping = {
  solutions: Solution[];
  categoryMaterialAvailable: boolean;
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
          "rationale",
          "timeSavedEstimate",
          "addressesBottleneckIndexes",
          "groundedIn",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["solutions"],
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

tier: "priority" for the solution with the strongest, most direct grounding
and the clearest impact on a real bottleneck. "recommended" for solid,
grounded, but not the obvious first move. "nice-to-have" for a smaller,
grounded improvement. Prefer fewer, better grounded solutions at "priority"
over padding the tier with weaker ones. Prefer the smallest solution that
actually resolves the bottleneck over a more elaborate one, matching
Refactrd's own methodology of preferring the smallest sufficient
intervention.

addressesBottleneckIndexes: 1-based positions in the bottleneck list you are
given, which bottleneck(s) this solution resolves. A solution should address
at least one.

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
    return { solutions: [], categoryMaterialAvailable: false };
  }

  const stepById = new Map(diagram.steps.map((step) => [step.id, step]));
  const bottlenecksBlock = bottlenecks
    .map((bottleneck, index) => {
      const step = stepById.get(bottleneck.stepId);
      return `${index + 1}. Step "${step?.label ?? bottleneck.stepId}": ${bottleneck.description} (evidence: ${bottleneck.evidence})`;
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
    maxTokens: 8000,
    prompt: `Transcript:\n\n${transcript}\n\nBottlenecks:\n${bottlenecksBlock}\n\nRetrieved Refactrd tools/stack/constraints/engineering-docs material:\n${knowledgeBlock}`,
  });

  let parsed: {
    solutions: {
      tier: string;
      title: string;
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

      return { tier, title, rationale, timeSavedEstimate, addressesBottleneckStepIds, groundedIn };
    })
    .filter((item): item is Solution => item !== null);

  return { solutions, categoryMaterialAvailable: retrieval.chunks.length > 0 };
}
