/**
 * Copy for the workspace home screen.
 *
 * House style, same as lib/copy/greetings.ts: no em dashes, no en dashes.
 *
 * The greeting rotates by day within its time band so the screen does not
 * become wallpaper, and the starting points are written as things a consultant
 * would actually be carrying into the tool rather than feature demonstrations.
 */

export type WorkspaceGreeting = { headline: string; sub: string };

type Band = { from: number; until: number; options: WorkspaceGreeting[] };

const BANDS: Band[] = [
  {
    from: 5,
    until: 12,
    options: [
      { headline: "Good morning", sub: "What are we working through today?" },
      { headline: "Morning", sub: "Which engagement is on your mind?" },
      { headline: "Coffee time with Compass", sub: "Where would you like to start?" },
    ],
  },
  {
    from: 12,
    until: 17,
    options: [
      { headline: "Good afternoon", sub: "What are we working on?" },
      { headline: "Afternoon", sub: "Where did the thinking stop?" },
      { headline: "Back at it", sub: "What needs untangling?" },
    ],
  },
  {
    from: 17,
    until: 22,
    options: [
      { headline: "Good evening", sub: "What are we finishing off?" },
      { headline: "Evening", sub: "Something to wrap before tomorrow?" },
      { headline: "Winding down", sub: "What is still open?" },
    ],
  },
  {
    from: 22,
    until: 5,
    options: [
      { headline: "Still here", sub: "Quiet hours are good for hard problems." },
      { headline: "Late one", sub: "What are we working through?" },
      { headline: "Burning the late oil", sub: "Where shall we start?" },
    ],
  },
];

/** Greets by name where there is one, falling back to the email local part. */
export function workspaceGreeting(date: Date, email: string): WorkspaceGreeting {
  const hour = date.getHours();
  const band =
    BANDS.find(({ from, until }) =>
      from < until ? hour >= from && hour < until : hour >= from || hour < until,
    ) ?? BANDS[1];

  const dayIndex = Math.floor(date.getTime() / 86_400_000);
  const chosen = band.options[dayIndex % band.options.length];

  const name = displayName(email);
  return {
    headline: name ? `${chosen.headline}, ${name}` : chosen.headline,
    sub: chosen.sub,
  };
}

function displayName(email: string): string | null {
  const local = email.split("@")[0];
  if (!local) return null;
  // Generic mailboxes read badly as a first name.
  if (["info", "admin", "hello", "team", "contact"].includes(local.toLowerCase())) {
    return null;
  }
  const first = local.split(/[._-]/)[0];
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export type StartingPoint = {
  label: string;
  prompt: string;
};

/**
 * Cold-start starting points.
 *
 * Each one is a real opening move in an engagement, phrased the way a
 * consultant would say it out loud, so clicking one produces a conversation
 * worth having rather than a demonstration.
 */
export const STARTING_POINTS: StartingPoint[] = [
  {
    label: "Diagnose a bottleneck",
    prompt:
      "A client says one of their teams is overwhelmed. Help me work out whether that is capacity or coordination, and what I should ask them first.",
  },
  {
    label: "Size an intervention",
    prompt:
      "I know where the delay is and roughly how many days it costs. Help me work out the smallest intervention that would actually move it.",
  },
  {
    label: "Pressure test a recommendation",
    prompt:
      "I am about to recommend something to a client. Push back on it: tell me which links in the reasoning chain I have not actually supported.",
  },
  {
    label: "Prepare for a discovery call",
    prompt:
      "I have a first discovery call with a new client tomorrow and very little context. What should I be trying to learn, in what order?",
  },
];

/**
 * Rotates so the strip is not the same three lines forever, but stays fixed
 * within a session so it does not shuffle under the reader.
 */
export const TIPS: string[] = [
  "Compass will not recommend an intervention until the reasoning chain supports one. If it asks a question instead, that is the discipline working.",
  "Ask for a table, an email or a decision memo and you will get that format. Ask for nothing in particular and you will get prose.",
  "Paste in what the client actually said, mess and all. Compass extracts the client details rather than asking you to fill in a form.",
  "Every answer ends with a plain sentence about how confident it is, and says so when nothing was retrieved from the knowledge base.",
  "The smallest sufficient rung usually wins. If you are being told to clarify rather than transform, that is a feature.",
  "Disagree with it. Pushing back on a recommendation is the fastest way to find the link in the chain that is not holding.",
];

export function tipForDay(date: Date): string {
  return TIPS[Math.floor(date.getTime() / 86_400_000) % TIPS.length];
}
