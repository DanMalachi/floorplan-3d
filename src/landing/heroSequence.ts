"use client";

// -----------------------------------------------------------------------------
// Which stage of the hero's opening sequence is on screen.
//
// A module-level store rather than a prop, for exactly the reason
// `viewport3d/autoOrbitPlayback.ts` is one: the two things that need it sit on
// opposite sides of a boundary that must not be crossed. The autoplay trigger
// and the live region live in `DemoRoom.tsx` (the light side), the animation
// lives in `TraceOverlay.tsx` inside the lazily loaded `DemoStage`.
// (Until 2026-09-19 the trigger was a button in `sections/Hero.tsx`.)
//
// Holding it in React state and threading it down would mean the light side
// importing the demo, which is the one thing the code-split forbids: anything it
// imports that reaches `useSceneStore` puts three.js back into the marketing
// page's first load, with no error to tell you (see DemoStage.tsx's header).
// This file imports nothing, so both sides can hold it safely.
//
// It is safe as a singleton for the same reason the orbit's is: it describes a
// single on-screen object, and exactly one hero exists at a time. If a second
// ever mounts, this becomes per-instance state and moves into a context.
//
// ── The one rule that keeps it a singleton ──────────────────────────────────
// EVERY importer of this file must live in the page's main chunk. DemoRoom.tsx
// does. DemoStage.tsx MUST NOT — it is reached only through
// `dynamic(() => import("./DemoStage"))`, so it lands in its own chunk, and a
// module imported by two chunks is instantiated once per chunk. That is not a
// theoretical risk: this file was imported on both sides first, `stage` was
// silently two variables, and the hero's button changed its own label while
// the animation it was supposed to start never moved. Nothing throws.
//
// So DemoRoom — the last component on the light side — subscribes here and
// hands `stage` and the setter across the boundary as props. A type-only
// `import type { HeroStage }` on the far side is fine; types erase.
// -----------------------------------------------------------------------------

/**
 *  idle      the flat plan, at rest, waiting to be traced
 *  tracing   the hand is drawing walls, placing openings, reaching for Generate
 *  building  Generate has been pressed; the 3D room is standing up
 *  done      the room is built and orbiting; the closing call to action is up
 */
export type HeroStage = "idle" | "tracing" | "building" | "done";

let stage: HeroStage = "idle";
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function subscribeHeroStage(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getHeroStage(): HeroStage {
  return stage;
}

/** `useSyncExternalStore` needs a stable server snapshot, and nothing has been
 *  traced during SSR. Always the resting state. */
export function getHeroStageServer(): HeroStage {
  return "idle";
}

export function setHeroStage(next: HeroStage): void {
  if (stage === next) return;
  stage = next;
  emit();
}

/** Reset on mount, so a client-side navigation back to the homepage doesn't
 *  inherit a finished sequence and open on a room with no story. */
export function resetHeroStage(): void {
  setHeroStage("idle");
}
