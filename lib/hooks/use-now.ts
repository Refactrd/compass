"use client";

import { useSyncExternalStore } from "react";

const TICK_MS = 30_000;

function subscribe(onChange: () => void) {
  const timer = setInterval(onChange, TICK_MS);
  return () => clearInterval(timer);
}

// Rounded to the tick so repeated calls inside one render return an identical
// value. useSyncExternalStore requires a stable snapshot; returning Date.now()
// raw would change on every read and loop forever.
function getSnapshot() {
  return Math.floor(Date.now() / TICK_MS) * TICK_MS;
}

function getServerSnapshot(): null {
  return null;
}

/**
 * The current time, or null until the component has hydrated.
 *
 * The server cannot know the viewer's timezone, so rendering a real time during
 * SSR guarantees a hydration mismatch and briefly shows the wrong clock.
 * useSyncExternalStore handles this properly: it uses the server snapshot
 * through hydration, then switches to the live one, with no setState in an
 * effect and no suppressed warnings.
 *
 * Ticks every 30 seconds. A seconds display on an internal tool is motion for
 * its own sake, and it repaints sixty times more often.
 */
export function useNow(): Date | null {
  const timestamp = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return timestamp === null ? null : new Date(timestamp);
}
