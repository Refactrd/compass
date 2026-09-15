/**
 * Time-of-day greetings and showcase copy.
 *
 * House style for everything in this file: no em dashes, no en dashes. Use a
 * comma, a full stop, or a rewrite instead.
 *
 * The greetings are warm but not chatty. This is a tool consultants open
 * several times a day, and a joke that lands once becomes wallpaper by the
 * fourth reading, so they stay short and stay out of the way.
 */

export type Greeting = { headline: string; note: string };

type Band = { from: number; until: number; greetings: Greeting[] };

const BANDS: Band[] = [
  {
    from: 5,
    until: 8,
    greetings: [
      { headline: "Early start", note: "The quiet hours are the useful ones." },
      { headline: "Up before the inbox", note: "Best time to think clearly." },
      { headline: "First light", note: "Nothing has gone wrong yet." },
    ],
  },
  {
    from: 8,
    until: 11,
    greetings: [
      { headline: "Coffee time with Compass", note: "Let us start with what you know." },
      { headline: "Good morning", note: "Where is the real bottleneck today?" },
      { headline: "Morning", note: "Bring the messy version of the problem." },
    ],
  },
  {
    from: 11,
    until: 14,
    greetings: [
      { headline: "Midday check in", note: "A good time to test an assumption." },
      { headline: "Half the day left", note: "Pick up where the thinking stopped." },
      { headline: "Lunchtime thinking", note: "The best ideas arrive off the clock." },
    ],
  },
  {
    from: 14,
    until: 17,
    greetings: [
      { headline: "Good afternoon", note: "Time to turn findings into a recommendation." },
      { headline: "Afternoon stretch", note: "What does the evidence actually support?" },
      { headline: "Back at it", note: "Smallest sufficient intervention wins." },
    ],
  },
  {
    from: 17,
    until: 21,
    greetings: [
      { headline: "Good evening", note: "Wrap the thread while it is still warm." },
      { headline: "Winding down", note: "Leave tomorrow a clear next question." },
      { headline: "Evening session", note: "One more link in the chain." },
    ],
  },
  {
    from: 21,
    until: 5,
    greetings: [
      { headline: "Burning the late oil", note: "Be kind to tomorrow you." },
      { headline: "Late shift", note: "The work will keep until morning." },
      { headline: "Still here", note: "Quiet is good for hard problems." },
    ],
  },
];

/** Picks the band for an hour, handling the band that wraps past midnight. */
export function greetingFor(date: Date): Greeting {
  const hour = date.getHours();

  const band =
    BANDS.find(({ from, until }) =>
      from < until ? hour >= from && hour < until : hour >= from || hour < until,
    ) ?? BANDS[1];

  // Rotates by day so the same person does not read the same line every
  // morning, while staying stable for the whole of any given session.
  const dayIndex = Math.floor(date.getTime() / 86_400_000);
  return band.greetings[dayIndex % band.greetings.length];
}

export type Slide = {
  src: string;
  alt: string;
  quote: string;
  caption: string;
};

/**
 * Showcase slides.
 *
 * Only three of the seven supplied images are used. CLAUDE.md rules out
 * "chatbot/robot visual clichés", which excludes the four that lead with a
 * humanoid robot or floating robot eyes. Adding one back is a matter of pasting
 * another entry into this array.
 *
 * All three are treated with a heavy desaturation and a brass wash at render
 * time, so the stock neon does not fight the ink and brass palette.
 */
export const SLIDES: Slide[] = [
  {
    src: "/images/startup-tech.jpg",
    alt: "Consultants working together in an open plan office",
    quote: "A good question beats a confident answer.",
    caption: "Diagnosis before prescription",
  },
  {
    src: "/images/futuristic-ai-chip-circuit-board.jpg",
    alt: "Close view of a circuit board with a central processor",
    quote: "Method is what makes judgement repeatable.",
    caption: "The reasoning chain, enforced",
  },
  {
    src: "/images/ai-bot.jpg",
    alt: "Portrait lit in soft white light",
    quote: "The smallest intervention that moves the bottleneck.",
    caption: "Maturity ladder, lowest rung first",
  },
];
