"use client";

// -----------------------------------------------------------------------------
// Whether the presentation orbit is currently turning.
//
// A module-level store rather than a prop, deliberately. The two things that
// need it sit on opposite sides of the Canvas boundary: the play/pause control
// is page DOM (src/landing/DemoStage.tsx) and the thing it drives is inside the
// R3F tree (AutoOrbitRig), mounted by `Viewport`. Threading it between them
// would mean another prop on a PROTECTED file for what is one boolean owned
// entirely by the marketing hero.
//
// It is safe as a singleton because it describes a single on-screen object and
// exactly one auto-orbiting viewport can exist at a time — the hero. If a second
// one ever mounts, this becomes per-instance state and moves into a context.
// -----------------------------------------------------------------------------

let playing = true;
const listeners = new Set<() => void>();

export function subscribeOrbitPlaying(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getOrbitPlaying(): boolean {
  return playing;
}

/** `useSyncExternalStore` requires a stable snapshot on the server. The orbit
 *  never runs during SSR, and reporting `true` there would render a pause icon
 *  that flips on hydration. */
export function getOrbitPlayingServer(): boolean {
  return false;
}

export function setOrbitPlaying(next: boolean): void {
  if (playing === next) return;
  playing = next;
  for (const fn of listeners) fn();
}

/** Reset to the default on mount, so a remount of the hero (a client-side
 *  navigation back to the homepage) doesn't inherit a paused orbit from the
 *  visitor's last visit to it. */
export function resetOrbitPlaying(): void {
  setOrbitPlaying(true);
}
