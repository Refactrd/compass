import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { AiError, extractStructured } from "@/lib/ai/client";
import { retrieve } from "@/lib/ai/retrieval";
import { cleanWorkflowText, toWorkflowStepId } from "@/lib/immersion/diagram-schema";
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
};

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
        },
        required: ["stepIndex", "description", "evidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["bottlenecks"],
  additionalProperties: false,
} as const;

const SYSTEM = `
You read a workflow extracted from a Refactrd immersion day interview, plus
the transcript it came from, and identify which steps are genuine bottlenecks:
places where the work is slow, manual, error prone, or a real source of
friction, as actually described by the person being interviewed.

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

description: one sentence, plain, naming what is actually wrong with this
step. Not a recommendation, not a solution, just the problem.

Reference steps by their position in the list you are given (1-based). Some
methodology material may be included below for how Refactrd thinks about
bottlenecks generally; use it to inform judgement, never as a source of
bottlenecks for organizations it was not written about.

Write every description and evidence without em dashes or en dashes. Use
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
}): Promise<Bottleneck[]> {
  if (diagram.steps.length === 0) return [];

  const retrievalQuery = diagram.steps.map((step) => step.label).join(". ");
  const retrieval = await retrieve(supabase, retrievalQuery);

  const stepsBlock = diagram.steps
    .map((step, index) => {
      const parts = [step.label];
      if (step.actor) parts.push(`actor: ${step.actor}`);
      if (step.description) parts.push(step.description);
      return `${index + 1}. ${parts.join(". ")}`;
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
    maxTokens: 4000,
    prompt: `Transcript:\n\n${transcript}\n\nExtracted workflow:\n${stepsBlock}\n\nRefactrd methodology material:\n${knowledgeBlock}`,
  });

  let parsed: { bottlenecks: { stepIndex: number; description: string; evidence: string }[] };
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("[immersion/bottleneck-extraction] unparsable response", error, raw);
    throw new AiError("The bottleneck analysis returned something unreadable. Try again.");
  }

  const rawBottlenecks = Array.isArray(parsed.bottlenecks) ? parsed.bottlenecks : [];

  return rawBottlenecks
    .map((item): Bottleneck | null => {
      const stepId = toWorkflowStepId(item?.stepIndex, diagram.steps.length);
      const description = cleanWorkflowText(item?.description, 300);
      const evidence = cleanWorkflowText(item?.evidence, 400);
      if (!stepId || !description || !evidence) return null;
      return { stepId, description, evidence };
    })
    .filter((item): item is Bottleneck => item !== null);
}
