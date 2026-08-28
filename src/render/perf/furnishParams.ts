"use client";

import { useSyncExternalStore } from "react";
import { perfEnabled } from "./usePerfEnabled";

/**
 * The `?furnish=N` gate for the synthetic furnished benchmark scene
 * (`docs/PERFORMANCE.md` §5 exit bar, Phase 3 sizing).
 *
 * ---------------------------------------------------------------------------
 * Why this exists
 * ---------------------------------------------------------------------------
 * `docs/PERFORMANCE-HANDOFF.md` states, in bold, that every measured number in
 * this workstream came off an UNFURNISHED scene — "a floor, not a worst case".
 * The §5 exit bar is stated against a furnished 3-bed, and Phase 3 is sized
 * against ~700 MB of texture memory that nobody has ever seen, because no
 * furnished project exists to open: the two live rooms hold zero catalog items
 * between them. A number that cannot be produced cannot gate anything.
 *
 * So the harness makes its own furnished scene, from the real shipping catalog,
 * on demand, per page load.
 *
 * ---------------------------------------------------------------------------
 * A THIRD gate, not a widening of the first two
 * ---------------------------------------------------------------------------
 * This follows `usePerfEnabled.ts` exactly — same reasoning, one step stronger.
 * `?perf=1` mounts an observer; `?loop=always` changes when frames are drawn;
 * this one changes WHAT IS IN THE SCENE, which is the most invasive thing any
 * perf-only code in this repo does. It is therefore:
 *
 *  - off unless `?perf=1` is ALSO set (`furnishOptions` returns count 0 and
 *    `PerfRig` never mounts the rig), so a stray `?furnish=40` on a shared link
 *    does nothing at all;
 *  - a per-load query parameter with no persisted setting, so it cannot be left
 *    switched on and become part of what a later phase measures;
 *  - a MOUNT boundary in `PerfRig`, so with the flag absent there is no store
 *    subscription, no GLB fetch, and no scene-graph mutation whatsoever.
 *
 * ---------------------------------------------------------------------------
 * What it is NOT
 * ---------------------------------------------------------------------------
 * It is not furniture. Nothing here reaches `useSceneStore`, the project's
 * `Scene`, IndexedDB or the Liveblocks doc — see the ownership note at the top
 * of `PerfFurnishRig.tsx`. It is real catalog geometry and real catalog
 * textures hung directly on the three.js scene graph, which is precisely the
 * cost Phase 3 is about, and nothing else.
 */
export const FURNISH_PARAM = "furnish";
export const FURNISH_MIX_PARAM = "furnishMix";
export const FURNISH_SEED_PARAM = "furnishSeed";

/**
 * Which catalog the items are drawn from.
 *
 * The two sources have very different cost profiles and the difference is the
 * whole subject of Phase 3: IKEA models are Draco-compressed geometry carrying
 * UNCAPPED albedo textures (measured up to 3118px, ~39 MB each as RGBA8 with
 * mips), while BlenderKit's are pre-optimised to 1024px WebP. Measuring only
 * one of them answers half the question, so `mix` is the default and the other
 * two exist to attribute a delta to a source.
 */
export type FurnishMix = "mix" | "ikea" | "blenderkit";

export interface FurnishOptions {
  /** How many items to place. 0 = off. */
  count: number;
  mix: FurnishMix;
  /** Seeds the only randomness in the placement (rotation jitter). Same seed +
   *  same count + same scene = the same scene graph, every run — otherwise runs
   *  are not comparable against `scripts/perf/baselines/`. */
  seed: number;
}

export const FURNISH_OFF: FurnishOptions = { count: 0, mix: "mix", seed: 1 };

/**
 * Hard ceiling on the count. A furnished 3-bed is ~40-120 items; 400 is far
 * past any real project and is here so a typo (`?furnish=40000`) cannot spend
 * ten minutes fetching models before anyone notices.
 */
export const MAX_FURNISH = 400;

const isMix = (v: string | null): v is FurnishMix =>
  v === "mix" || v === "ikea" || v === "blenderkit";

/** Cache keyed on the raw query string, so the object identity below is stable
 *  for as long as the URL is — see `useFurnishOptions`. */
let cachedSearch: string | null = null;
let cachedOptions: FurnishOptions = FURNISH_OFF;

/**
 * Non-reactive read. Returns `FURNISH_OFF` during SSR and whenever `?perf=1` is
 * absent — the furnished scene is never reachable without the perf gate.
 */
export function furnishOptions(): FurnishOptions {
  if (typeof window === "undefined") return FURNISH_OFF;

  const search = window.location.search;
  if (search === cachedSearch) return cachedOptions;
  cachedSearch = search;

  if (!perfEnabled()) {
    cachedOptions = FURNISH_OFF;
    return cachedOptions;
  }

  const params = new URLSearchParams(search);
  const raw = Number(params.get(FURNISH_PARAM) ?? 0);
  const count = Number.isFinite(raw) ? Math.max(0, Math.min(MAX_FURNISH, Math.floor(raw))) : 0;
  if (count === 0) {
    cachedOptions = FURNISH_OFF;
    return cachedOptions;
  }

  const mixParam = params.get(FURNISH_MIX_PARAM);
  const seedRaw = Number(params.get(FURNISH_SEED_PARAM) ?? 1);

  cachedOptions = {
    count,
    mix: isMix(mixParam) ? mixParam : "mix",
    seed: Number.isFinite(seedRaw) ? Math.floor(seedRaw) : 1,
  };
  return cachedOptions;
}

/** Never fires — the query string cannot change without a page load. Module
 *  level so the reference is stable across renders. */
const subscribe = () => () => {};
const serverSnapshot = () => FURNISH_OFF;

/**
 * Reactive form, used as the MOUNT boundary in `PerfRig` for the same reason
 * `usePerfEnabled` is: the rig subscribes to the scene store and loads GLBs, and
 * the only way for a normal page load to pay none of that is for the component
 * holding those hooks not to exist.
 *
 * The snapshot MUST be reference-stable between notifications or
 * `useSyncExternalStore` re-renders forever; that is what the module-level cache
 * above is for, not micro-optimisation.
 */
export function useFurnishOptions(): FurnishOptions {
  return useSyncExternalStore(subscribe, furnishOptions, serverSnapshot);
}
