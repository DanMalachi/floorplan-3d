"use client";

import { useSyncExternalStore } from "react";

/**
 * The one-way channel between the in-Canvas sampler and the DOM HUD.
 *
 * Why this exists at all, rather than `useState` in the rig: the sampler runs in
 * `useFrame`, so putting its output in React state would re-render on every
 * frame. That is not merely wasteful — it CORRUPTS THE MEASUREMENT. A React
 * commit per frame adds reconciliation and DOM writes to the very frame budget
 * the HUD is reporting, so the instrument would be reading its own cost and the
 * numbers would get worse the more of them you display. The rig writes into this
 * module at full frame rate and publishes a snapshot at `PUBLISH_HZ`; only the
 * publish notifies React.
 *
 * `useSyncExternalStore` rather than zustand (which the app does depend on) —
 * this store has one writer, no actions, no middleware, and no need to be
 * readable from anywhere but the HUD. React's own primitive is the whole
 * feature, and it keeps the perf tooling from adding a dependency edge into app
 * state that a future reader would have to trace.
 */

/** One published reading. Every field is a plain number so the HUD never has to
 *  format an object it did not produce. */
export interface PerfSample {
  /** Monotonic publish counter — also the HUD's cheap "is it alive" signal. */
  seq: number;

  // ---- timing -----------------------------------------------------------
  /** rAF-to-rAF period, p50 over the rolling window (ms). */
  frameMsP50: number;
  /** rAF-to-rAF period, p95 (ms). This is the number `docs/PERFORMANCE.md` §5
   *  states the interactive exit bar against (< 16.7 ms). */
  frameMsP95: number;
  /** Frames per second implied by `frameMsP50`. */
  fps: number;
  /** Main-thread work inside the R3F frame, p50 (ms) — see `usePerfSampler.ts`
   *  for exactly what interval this covers and what it excludes. */
  jsMsP50: number;
  /** Same, p95 (ms). */
  jsMsP95: number;

  // ---- renderer counters, for the frame that just finished ---------------
  /** `WebGLRenderer.render()` invocations per displayed frame. Not a synonym
   *  for "post passes" — see §2.1/§2.2 of the perf doc, which is what this
   *  number was added to test. */
  rendersPerFrame: number;
  drawCalls: number;
  triangles: number;
  points: number;
  lines: number;

  // ---- resident resources (NOT reset per frame) --------------------------
  geometries: number;
  textures: number;
  /** `gl.info.programs.length` — compiled shader programs. */
  programs: number;

  // ---- device / target --------------------------------------------------
  /** Resolved device pixel ratio (`gl.getPixelRatio()`), after the DPR clamp. */
  dpr: number;
  drawingBufferWidth: number;
  drawingBufferHeight: number;
  /** `gl.shadowMap.autoUpdate` — false once Phase 1 #1 lands, and worth seeing
   *  on the HUD because it is otherwise invisible from the image. */
  shadowAutoUpdate: boolean;

  // ---- memory -----------------------------------------------------------
  /** `performance.memory.usedJSHeapSize` in MB, or null off Chromium. */
  heapMb: number | null;
  /** Estimated scene texture bytes in MB, or null before the first walk.
   *  An ESTIMATE — see `estimateSceneTextureBytes` in `usePerfSampler.ts`. */
  textureMb: number | null;
}

/** One point on the resource-trend sparkline. */
export interface PerfTrendPoint {
  textures: number;
  geometries: number;
  programs: number;
  textureMb: number | null;
}

/**
 * Trend depth. 120 points at the 4 Hz publish rate is a 30-second window — long
 * enough to drag a sofa back and forth a few times and see whether the line
 * came back down, short enough that a rise is still visible at 136 px wide.
 */
export const TREND_LEN = 120;

interface PerfState {
  sample: PerfSample;
  /** Oldest-first, at most `TREND_LEN` long. Rebuilt per publish (4/s), so the
   *  HUD can treat it as immutable and render it directly. */
  trend: readonly PerfTrendPoint[];
}

let state: PerfState | null = null;
const trendRing: PerfTrendPoint[] = [];
const listeners = new Set<() => void>();

/**
 * Called by the sampler at `PUBLISH_HZ`, never per frame.
 *
 * Appends to the trend ring and swaps in a new immutable state object.
 * `useSyncExternalStore` requires `getSnapshot` to return a value that is
 * reference-stable between notifications — mutating `state` in place instead of
 * replacing it would make React skip the update entirely, and the HUD would
 * freeze on its first reading with no error anywhere.
 */
export function publishPerfSample(sample: PerfSample): void {
  trendRing.push({
    textures: sample.textures,
    geometries: sample.geometries,
    programs: sample.programs,
    textureMb: sample.textureMb,
  });
  if (trendRing.length > TREND_LEN) trendRing.splice(0, trendRing.length - TREND_LEN);
  state = { sample, trend: trendRing.slice() };
  for (const listener of listeners) listener();
}

/** Rig unmount. Clears the reading so a stale panel cannot outlive its source
 *  and be mistaken for a live one. */
export function resetPerfStore(): void {
  trendRing.length = 0;
  state = null;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): PerfState | null {
  return state;
}

/** Stable server snapshot — there is no sampler during SSR, and returning a
 *  fresh object here would loop React's hydration check. */
function getServerSnapshot(): PerfState | null {
  return null;
}

/** Subscribe the HUD to published readings. Null until the first publish. */
export function usePerfState(): PerfState | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
