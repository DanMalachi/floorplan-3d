"use client";

import { perfEnabled } from "./usePerfEnabled";

/**
 * Automation tap for the furnished benchmark scene — the sibling of
 * `perfBridge.ts`, and installed under the same `?perf=1` gate.
 *
 * ---------------------------------------------------------------------------
 * Why the harness cannot just trust `--furnish 40`
 * ---------------------------------------------------------------------------
 * Two failure modes would otherwise be invisible, and both produce a confident
 * wrong number rather than an error:
 *
 * 1. **Sampling before the models arrive.** Every IKEA GLB is fetched from
 *    Vercel Blob over the network and Draco-decoded on arrival. A run that
 *    starts sampling at a fixed settle delay measures a half-loaded scene, and
 *    reports it under a "40 items" label. `settled` is what the harness waits
 *    on instead of a stopwatch.
 *
 * 2. **Silent under-placement.** If the floor plan yields fewer slots than
 *    items requested, or a model 404s, the scene is quietly smaller than the
 *    label. `planned`/`placed`/`failed` are recorded in the results JSON so the
 *    gap is in the artefact, not in someone's memory of the run.
 *
 * Deliberately a separate global from `window.__PERF__`: that one is a
 * write-only ring of frame samples that the harness drains and clears between
 * scenarios, and this is a single live snapshot of scene composition that must
 * survive those drains.
 */

export interface FurnishBridge {
  /** `?furnish=N` as requested. */
  requested: number;
  mix: string;
  seed: number;
  /** Placements the floor plan could actually hold — `<= requested`. */
  planned: number;
  /** Candidate positions the plan generated in total. */
  slots: number;
  /** Distinct GLB urls in the plan. Drives texture memory; repeats share. */
  distinctAssets: number;
  /** Items whose model finished loading and is in the scene graph right now. */
  placed: number;
  /** Items whose model failed to load (404, decode error, network). */
  failed: number;
  /** `planned === placed + failed`. The harness waits on this before sampling. */
  settled: boolean;
}

declare global {
  interface Window {
    __PERF_FURNISH__?: FurnishBridge;
  }
}

interface PlanFacts {
  requested: number;
  mix: string;
  seed: number;
  planned: number;
  slots: number;
  distinctAssets: number;
}

let facts: PlanFacts = {
  requested: 0,
  mix: "mix",
  seed: 1,
  planned: 0,
  slots: 0,
  distinctAssets: 0,
};

/**
 * Sets, not counters.
 *
 * React's dev-mode double invocation mounts every effect twice, and a naive
 * `placed++` would report 80 items in a 40-item scene — the harness would then
 * wait forever for `settled`, or worse, believe it. Keying on the placement's
 * own stable key makes both transitions idempotent.
 */
const placed = new Set<string>();
const failed = new Set<string>();

function publish(): void {
  if (typeof window === "undefined" || !perfEnabled()) return;
  window.__PERF_FURNISH__ = {
    ...facts,
    placed: placed.size,
    failed: failed.size,
    settled: placed.size + failed.size >= facts.planned,
  };
}

/** Called by the rig whenever it re-plans (i.e. when the scene changes). */
export function notePlan(next: PlanFacts): void {
  facts = next;
  publish();
}

export function noteItemPlaced(key: string): void {
  failed.delete(key);
  placed.add(key);
  publish();
}

export function noteItemRemoved(key: string): void {
  placed.delete(key);
  publish();
}

export function noteItemFailed(key: string): void {
  placed.delete(key);
  failed.add(key);
  publish();
}

/** Unmount of the whole rig: drop the tap's contents but leave the global in
 *  place, so a harness reading it after a mode change sees zeros rather than
 *  `undefined` (which it cannot distinguish from "perf is off"). */
export function resetFurnishBridge(): void {
  placed.clear();
  failed.clear();
  facts = { requested: 0, mix: "mix", seed: 1, planned: 0, slots: 0, distinctAssets: 0 };
  publish();
}
