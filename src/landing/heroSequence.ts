"use client";

// -----------------------------------------------------------------------------
// Which stage of the hero's opening sequence is on screen.
//
// A module-level store rather than a prop, for exactly the reason
// `viewport3d/autoOrbitPlayback.ts` is one: the two things that need it sit on
// opposite sides of a boundary that must not be crossed. The button lives in
// `sections/Hero.tsx`, the animation lives in `TraceOverlay.tsx` inside the
// demo — and the demo reaches Hero as an opaque `ReactNode` slot injected by
// `(marketing)/page.tsx`, so there is no prop path between them at all.
//
// Lifting the state into Hero and threading it down would mean Hero importing
// the demo, which is the one thing the code-split forbids: anything Hero
// imports that reaches `useSceneStore` puts three.js back into the marketing
// page's first load, with no error to tell you (see DemoStage.tsx's header).
// This file imports nothing, so both sides can hold it safely.
//
// It is safe as a singleton for the same reason the orbit's is: it describes a
// single on-screen object, and exactly one hero exists at a time. If a second
// ever mounts, this becomes per-instance state and moves into a context.
//
// ── The one rule that keeps it a singleton ──────────────────────────────────
// EVERY importer of this file must live in the page's main chunk. Hero.tsx and
// DemoRoom.tsx do. DemoStage.tsx MUST NOT — it is reached only through
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

/**
 * What the hero's secondary button does.
 *
 * One button drives the whole sequence, so it has to mean something at every
 * stage rather than going dead once the animation is running:
 *   - at rest it starts the sequence,
 *   - while the sequence runs it SKIPS to the finished room, which is the
 *     escape hatch a 13-second animation owes anyone who has seen it once,
 *   - once the room is built it replays from the blank plan.
 */
export function advanceHeroStage(): void {
  setHeroStage(stage === "idle" ? "tracing" : stage === "done" ? "tracing" : "done");
}

/** Reset on mount, so a client-side navigation back to the homepage doesn't
 *  inherit a finished sequence and open on a room with no story. */
export function resetHeroStage(): void {
  setHeroStage("idle");
}
