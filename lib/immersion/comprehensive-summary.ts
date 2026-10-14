import "server-only";

import { AiError, extractStructured } from "@/lib/ai/client";
import type { Bottleneck } from "@/lib/immersion/bottleneck-extraction";
import type { Solution } from "@/lib/immersion/opportunity-mapping";

/**
 * The Comprehensive Report's closing Summary section (CLAUDE.md's Phase 2
 * non-negotiable on grounding applies here exactly as everywhere else in
 * this document): a few paragraphs of real prose synthesizing the whole
 * engagement, not a department-by-department restatement, since that is
 * already the rest of the report.
 *
 * One more AI call, unlike buildRoadmap's deliberately deterministic
 * sequencing: a synthesis that reads as genuinely written, not templated,
 * is the actual point of this section, which a mechanical pass over the
 * data cannot produce. Still bound to the same material every other
 * generation step in this phase is bound to: only what the bottlenecks and
 * solutions already on record actually support, nothing new claimed about
 * the client, no figure beyond what a solution's own timeSavedEstimate
 * already says.
 */

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
  },
  required: ["summary"],
  additionalProperties: false,
} as const;

const SYSTEM = `
You write the closing Summary section of a Refactrd Comprehensive Report, the
one collated document covering every department from one immersion day at a
client's organization. A prospective client reads this section last, after
already seeing every department's own before and after workflow and its
recommended solutions in detail.

Write two to four short paragraphs of plain prose. No bullet points, no
headings, no bold text, nothing that reads as a list dressed up as
paragraphs. This is a synthesis a consultant could read aloud in a closing
meeting, not a recap.

Cover, in your own words, not as a checklist: the pattern across departments
(what kind of bottleneck showed up more than once, where the organization's
real friction actually sits), and the overall shape of what Refactrd is
recommending (which kinds of solutions recur, what the organization gains by
acting on them). Name a department or a specific solution where it
genuinely helps the reader, not in every sentence.

Never state a bottleneck, a solution, or a time-saved figure that is not
actually in the material given to you below. Never invent an aggregate
number, such as a total hours saved across departments: if the material does
not support one, say the gains are meaningful without quantifying them
rather than inventing a sum. Write in the same voice as the rest of this
report: direct, specific, no hype.

Write without em dashes or en dashes. Use commas or full stops instead.
Ordinary hyphens in compound words are fine.
`.trim();

export async function generateComprehensiveSummary({
  clientName,
  departments,
}: {
  clientName: string;
  departments: {
    name: string;
    bottlenecks: Bottleneck[];
    solutions: Solution[];
  }[];
}): Promise<string> {
  const block = departments
    .map((department) => {
      const bottleneckLines = department.bottlenecks.length
        ? department.bottlenecks.map((b) => `  - ${b.description}`).join("\n")
        : "  - None identified.";
      const solutionLines = department.solutions.length
        ? department.solutions
            .map((s) => {
              const timeSaved = s.timeSavedEstimate ? `, estimated time saved: ${s.timeSavedEstimate}` : "";
              return `  - [${s.tier}] ${s.title}: ${s.rationale}${timeSaved}`;
            })
            .join("\n")
        : "  - None grounded.";
      return `${department.name}:\nBottlenecks:\n${bottleneckLines}\nSolutions:\n${solutionLines}`;
    })
    .join("\n\n");

  const raw = await extractStructured({
    system: SYSTEM,
    schema: SCHEMA,
    maxTokens: 1500,
    prompt: `Client: ${clientName}\n\n${block}`,
  });

  let parsed: { summary: string };
  try {
    parsed = JSON.parse(raw) as { summary: string };
  } catch (error) {
    console.error("[immersion/comprehensive-summary] unparsable response", error, raw);
    throw new AiError("Generating the report summary returned something unreadable. Try again.");
  }

  return parsed.summary.trim();
}
