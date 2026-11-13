import "server-only";

import { AiError, extractStructured } from "@/lib/ai/client";
import type { StressScenario } from "@/lib/immersion/bottleneck-extraction";
import {
  AFTER_WORKFLOW_SCHEMA,
  cleanWorkflowText,
  normalizeWorkflow,
  stagesOf,
  type RawWorkflowDiagram,
  type ScenarioResult,
  type StressOutcome,
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
 *
 * The transformed workflow is meant to withstand shocks: machines take the
 * repetitive side, people keep the critical decisions. So each stage names
 * the builds that power it and its human checkpoint, and the same call
 * re-runs the "What we found" stress test against the new design, which is
 * what the "after" scale readiness score is computed from.
 */

const SYSTEM = `
You are given a company's current workflow, already extracted as an ordered
list of steps with any decision branches, and a set of grounded solutions
chosen to address specific bottlenecks in it. Produce the transformed
workflow: how this department operates once those solutions are in place.

The point of this diagram is to show a genuinely better way of operating, not
the same process with a few steps relabelled. It sits next to the "before"
diagram in a document a prospective client reads, and the difference between
the two should be visible at a glance: fewer steps, fewer handoffs, less
manual re-entry and chasing, with AI, automation, or a purpose-built system
doing the work people currently do by hand. Redesign the flow around what the
solutions make possible, rather than editing the old flow one step at a time.

Every changed stage should read as one of four moves away from manual
handoffs and repetitive work: an AI step that reads, writes, qualifies,
transcribes, translates or answers; an automation that records, routes or
sends without anyone carrying it; a centralised system the whole team works
from instead of phones, inboxes and spreadsheets; or a simpler process with
the handoff or wait removed. Each solution is tagged with which of these it
is.

How to transform:

Collapse steps a solution makes redundant. When one system, integration, or
AI capability now does what several manual steps did, for example receive a
request by email, copy it into a spreadsheet, email a manager for approval,
wait for the reply, update the spreadsheet, replace those steps with the
smaller number the new way of working actually needs, such as "request
submitted through intake system" and "manager approves in the system". Do
not keep a step just because it existed before.

Remove handoffs, re-keying, status chasing, and manual checks that a solution
absorbs. Data entered once should flow on automatically; a check the system
performs should not also appear as a person doing it.

Make the new operating model explicit in each changed step. Say what does the
work now (an AI step that drafts, classifies, extracts, or summarises; an
automation that routes, syncs, or notifies; a custom-built system or portal
that replaces a spreadsheet or inbox) and what the person still does, which
should be the judgement, approval, or relationship work, not the clerical
work around it.

actor: when a solution takes over a step a person used to do by hand, set
actor to what performs it now, for example "AI assistant", "Automated
workflow", or the name of the system the solution describes. Keep the
original person as actor where they still do the step, now with less effort,
and say in the description what changed for them.

Branches: simplify decision logic the same way. A decision the system now
makes, or one that only existed to catch errors the solution eliminates, can
be removed or folded into an automated step. Keep a branch where a real
human decision remains.

What must not change:

Every transformation must come from a listed solution. Use the "targets
steps" information and each solution's rationale to see which part of the
flow it reshapes. Steps no solution touches stay as they were, same label,
actor, and description, in the same relative order, so the diagram stays
honest about what is and is not being changed.

Never invent a tool, product, capability, or outcome the solutions do not
describe. If a solution says a custom intake system, write "intake system",
not a named product it never mentions. Do not put time-saved figures,
percentages, or other numbers in the diagram. This diagram is exactly as
grounded as the solutions it reflects, and adding anything of your own breaks
that, however much better the result would look.

Keep the workflow complete. The transformed flow still has to get from the
same starting trigger to the same end result as the original; consolidating
steps must not silently drop something the department actually needs done.

Stages. The current workflow is grouped into stages, and the transformed one
must be too: this is what the client actually reads, one card per stage, so
the stages alone should tell the story of the new way of working. Name each
stage for what happens now, for example "Qualify and route", "Understand
every message", "Hand-off and quote", not for the old manual task. Usually
the same number of stages as today or fewer. Each stage is a consecutive run
of the steps you return, every step belongs to exactly one stage, and you
give the 1-based position of its first and last step.

mode: "automated" when an assistant, automation or system does the work of
the stage; "people" when the client's team still does it, now with better
information or less effort; "unchanged" when no solution touches it.

tag: one or two words naming who does the stage now, for example
"Assistant", "Automation", "Central system", "Your agents", "Finance team".
A stage where a system does the work but a person approves or handles
exceptions is still "automated", with its humanCheckpoint set. The tag must
agree with the mode: an "automated" stage is tagged with the assistant,
automation or system doing the work, never "Your team" or a role; a
"people" stage is tagged with the people doing it. Use "Unchanged" for an
unchanged stage.

summary: two or three plain sentences describing how the stage works once
the solutions are in place, written to the client, for example "The
assistant greets each new lead, asks the qualifying questions, scores warm
against cold, saves the contact, and answers overnight." For an unchanged
stage, say it carries on exactly as it does today.

replaces: one short sentence naming the manual work from today's workflow
this stage removes, for example "The manual filter, the referral to another
number, and the wait until 9am." For an unchanged stage, "Nothing for your
team to change here." A "people" stage still names what it replaces, such as
"Starting every conversation from nothing."

solutionIndexes: the 1-based positions, in the solutions list, of every
build that powers this stage. The client should be able to read each stage
and see which proposed build makes it work. Empty for an unchanged stage.

Human in the loop. The transformed workflow is built to withstand shocks:
AI, automation and systems handle the repetitive, high-volume side, and
people stay in charge of the moments that matter. Wherever a stage involves
judgement, money, a commitment to a customer, an exception the system cannot
resolve, or a relationship, keep a person there and say what they own.
humanCheckpoint is one short sentence naming that decision, for example
"An agent approves every quote before it is sent" or "The founder reviews
any shipment the tracker cannot match to a customer." Null where the stage
genuinely needs no person. Never automate away a decision the transcript
shows a person making for a good reason.

stressTests: the stress scenarios from today's workflow are listed below.
For each, judge how the transformed workflow fares: "breaks", "strains" or
"holds", and in how, one sentence naming the build or human checkpoint that
absorbs the shock, for example "The assistant answers and qualifies every
enquiry at any volume, so agents only see qualified leads." Be honest: a
scenario only improves if one of the listed solutions actually addresses
it. If none does, return the same outcome as today and say so in how.
scenarioIndex is the scenario's 1-based position in the list.

Branches follow the same rule as steps: only added, removed or changed where
a solution actually changes the decision logic itself, referenced by
position (1-based) in the workflow you return, exactly as in the original
schema. condition is the bare condition only, phrased so it reads naturally
after the word "If" and before ", skip to step N": do not include the word
"if" yourself and do not include "skip to step" or the destination yourself,
both are added when this is displayed. For example return "the lead is
qualified", never "If the lead is qualified" and never "the lead is
qualified, skip to step 4".

Every step label stays one short sentence, under roughly 12 words, same
constraint as the original diagram. Move any extra detail from a changed step
into its description instead of lengthening the label.

Write every label, actor, description, and stage field without em dashes or
en dashes. Use commas or full stops instead. Ordinary hyphens in compound words are fine.
`.trim();

export async function generateAfterDiagram({
  before,
  solutions,
  scenarios = [],
}: {
  before: WorkflowDiagram;
  solutions: Solution[];
  scenarios?: StressScenario[];
}): Promise<WorkflowDiagram> {
  if (before.steps.length === 0) {
    return { steps: [], branches: [] };
  }
  if (solutions.length === 0) {
    // Nothing grounded to apply. The "after" state is identical to "before"
    // rather than a diagram the model invents from nothing.
    return before;
  }

  const stageByFirstStep = new Map(stagesOf(before).map((stage) => [stage.stepIds[0], stage]));
  const beforeBlock = before.steps
    .map((step, index) => {
      const parts = [step.label];
      if (step.actor) parts.push(`actor: ${step.actor}`);
      if (step.description) parts.push(step.description);
      const stage = stageByFirstStep.get(step.id);
      const header = stage
        ? `Stage: ${stage.title}${stage.summary ? `. ${stage.summary}` : ""}\n`
        : "";
      return `${header}${index + 1}. ${parts.join(". ")}`;
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

  const stepNumberById = new Map(before.steps.map((step, index) => [step.id, index + 1]));
  const solutionsBlock = solutions
    .map((solution, index) => {
      // Which original steps each solution reshapes, so consolidation is
      // anchored to the solution's own bottlenecks rather than guessed.
      const targets = solution.addressesBottleneckStepIds
        .map((id) => stepNumberById.get(id))
        .filter((n): n is number => n !== undefined);
      const targetsNote = targets.length ? ` (targets steps ${targets.join(", ")})` : "";
      const what = solution.summary ? ` ${solution.summary}` : "";
      const replaces = solution.replaces ? ` Replaces: ${solution.replaces}.` : "";
      const kind = solution.kind ? ` (${solution.kind})` : "";
      return `${index + 1}. [${solution.tier}] ${solution.title}${kind}${targetsNote}:${what} ${solution.rationale}${replaces}`;
    })
    .join("\n");

  const scenariosBlock = scenarios.length
    ? scenarios
        .map((scenario, index) => `${index + 1}. ${scenario.title} (${scenario.outcome} today): ${scenario.impact}`)
        .join("\n")
    : "None.";

  const raw = await extractStructured({
    system: SYSTEM,
    schema: AFTER_WORKFLOW_SCHEMA,
    maxTokens: 8000,
    prompt: `Current workflow:\n${beforeBlock}\n\nCurrent branches:\n${branchesBlock}\n\nGrounded solutions to apply:\n${solutionsBlock}\n\nStress scenarios, as today's workflow fares:\n${scenariosBlock}`,
  });

  let parsed: RawWorkflowDiagram & {
    stressTests?: { scenarioIndex: number; outcome: string; how: string | null }[];
  };
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("[immersion/after-diagram] unparsable response", error, raw);
    throw new AiError("Generating the after diagram returned something unreadable. Try again.");
  }

  // Builds are cited by index into the solution list, which only this
  // function holds, so they are resolved to titles before normalisation.
  if (Array.isArray(parsed.stages)) {
    parsed.stages = parsed.stages.map((stage) => {
      const indexes = (stage as { solutionIndexes?: unknown }).solutionIndexes;
      const builds = (Array.isArray(indexes) ? indexes : [])
        .map((index) => (typeof index === "number" ? solutions[index - 1]?.title : undefined))
        .filter((title): title is string => !!title);
      return { ...stage, builds: [...new Set(builds)] };
    });
  }

  const resilience: ScenarioResult[] = (Array.isArray(parsed.stressTests) ? parsed.stressTests : [])
    .map((test): ScenarioResult | null => {
      const scenario =
        typeof test?.scenarioIndex === "number" ? scenarios[test.scenarioIndex - 1] : undefined;
      const outcome = (["breaks", "strains", "holds"] as StressOutcome[]).includes(
        test?.outcome as StressOutcome,
      )
        ? (test.outcome as StressOutcome)
        : null;
      if (!scenario || !outcome) return null;
      return { scenarioId: scenario.id, outcome, how: cleanWorkflowText(test.how, 260) };
    })
    .filter((result): result is ScenarioResult => result !== null)
    .filter((result, i, all) => all.findIndex((r) => r.scenarioId === result.scenarioId) === i);

  const diagram = normalizeWorkflow(parsed);
  return resilience.length > 0 ? { ...diagram, resilience } : diagram;
}
