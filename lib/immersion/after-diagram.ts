import "server-only";

import { AiError, extractStructured } from "@/lib/ai/client";
import {
  WORKFLOW_EXTRACTION_SCHEMA,
  normalizeWorkflow,
  type RawWorkflowDiagram,
  type WorkflowDiagram,
} from "@/lib/immersion/diagram-schema";
import type { Solution } from "@/lib/immersion/opportunity-mapping";

/**
 * Before diagram plus the solutions chosen for it, transformed "after"
 * diagram out. Same fixed template and schema as the "before" diagram
 * (lib/immersion/diagram-schema.ts), just a different direction: this
 * applies grounded solutions to a known-real workflow rather than reading
 * one out of a transcript. Grounding here means never inventing a solution
 * of its own; only reflecting the ones Opportunity Mapping already grounded
 * and produced.
 */

const SYSTEM = `
You are given a company's current workflow, already extracted as an ordered
list of steps with any decision branches, and a set of grounded solutions
chosen to address specific bottlenecks in it. Produce the same workflow
transformed as if those solutions, and only those solutions, were in place.

Rules:

Only change what a listed solution actually changes. A step untouched by any
solution stays exactly as it was, same label, same actor, same description,
same position relative to the others. Do not improve, tidy, or modernise
anything the solutions do not address themselves.

Where a solution removes manual effort from a step, reflect that in the
step's label and description, for example a step that was "manually copy
lead details into a spreadsheet" might become "lead details sync
automatically" if that is what the solution actually does. Where a solution
adds automation as a genuinely new step, such as an automated qualification
check that did not exist before, add it, in the right position.

Never invent a capability, tool, or outcome beyond what the solution's own
rationale actually describes. This diagram is exactly as grounded as the
solutions it reflects, and adding anything of your own breaks that.

If a step's actor changes because a solution takes over what a person used to
do by hand, update actor accordingly, for example from "Sarah, intake
coordinator" to "Automated intake" only if the solution genuinely replaces
that person's manual action; leave actor as the original person if they
still do the step, just faster or with better tooling.

Branches follow the same rule as steps: only added, removed or changed where
a solution actually changes the decision logic itself, referenced by
position (1-based) in the workflow you return, exactly as in the original
schema. condition is the bare condition only, phrased so it reads naturally
after the word "If" and before ", skip to step N": do not include the word
"if" yourself and do not include "skip to step" or the destination yourself,
both are added when this is displayed. For example return "the lead is
qualified", never "If the lead is qualified" and never "the lead is
qualified, skip to step 4".

Write every label, actor, and description without em dashes or en dashes. Use
commas or full stops instead. Ordinary hyphens in compound words are fine.
`.trim();

export async function generateAfterDiagram({
  before,
  solutions,
}: {
  before: WorkflowDiagram;
  solutions: Solution[];
}): Promise<WorkflowDiagram> {
  if (before.steps.length === 0) {
    return { steps: [], branches: [] };
  }
  if (solutions.length === 0) {
    // Nothing grounded to apply. The "after" state is identical to "before"
    // rather than a diagram the model invents from nothing.
    return before;
  }

  const beforeBlock = before.steps
    .map((step, index) => {
      const parts = [step.label];
      if (step.actor) parts.push(`actor: ${step.actor}`);
      if (step.description) parts.push(step.description);
      return `${index + 1}. ${parts.join(". ")}`;
    })
    .join("\n");

  const branchesBlock = before.branches.length
    ? before.branches
        .map((branch) => {
          const fromIndex = before.steps.findIndex((step) => step.id === branch.fromStepId) + 1;
          const toIndex = before.steps.findIndex((step) => step.id === branch.toStepId) + 1;
          return `After step ${fromIndex}: if ${branch.condition}, skip to step ${toIndex}.`;
        })
        .join("\n")
    : "No branches, fully linear.";

  const solutionsBlock = solutions
    .map(
      (solution, index) =>
        `${index + 1}. [${solution.tier}] ${solution.title}: ${solution.rationale}`,
    )
    .join("\n");

  const raw = await extractStructured({
    system: SYSTEM,
    schema: WORKFLOW_EXTRACTION_SCHEMA,
    maxTokens: 4000,
    prompt: `Current workflow:\n${beforeBlock}\n\nCurrent branches:\n${branchesBlock}\n\nGrounded solutions to apply:\n${solutionsBlock}`,
  });

  let parsed: RawWorkflowDiagram;
  try {
    parsed = JSON.parse(raw) as RawWorkflowDiagram;
  } catch (error) {
    console.error("[immersion/after-diagram] unparsable response", error, raw);
    throw new AiError("Generating the after diagram returned something unreadable. Try again.");
  }

  return normalizeWorkflow(parsed);
}
