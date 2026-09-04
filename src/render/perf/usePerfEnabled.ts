"use client";

import { useSyncExternalStore } from "react";

/**
 * The `?perf=1` gate for the Phase 0 HUD (`docs/PERFORMANCE.md` §3, Phase 0).
 *
 * The whole instrument is opt-in per page load and there is no persisted
 * setting, deliberately: Phase 0 exists to measure the app, and a measuring
 * apparatus that can be left switched on becomes part of what later phases
 * measure. A query parameter also survives being pasted into a message, which
 * is the actual workflow here — the numbers are being read on someone else's
 * MacBook against the live `done.design` deployment, not on a dev machine.
 *
 * DELIBERATELY NOT behind `devToolsEnabled` (2026-09-04, Dan's ruling), unlike
 * `?hero=1`/`?gt=`/`?ao=`. Measuring the live site IS the workflow this exists
 * for — the M2 numbers in docs/PERFORMANCE.md were taken that way — and a HUD
 * that needs an env var and a redeploy before it will report is not an
 * instrument. It reads nothing and writes nothing, so the exposure is a HUD a
 * stranger would have to know the parameter to summon. `?dpr=` stays open for
 * the same reason.
 */
export const PERF_PARAM = "perf";

/**
 * Second, narrower gate: `?perf=1&loop=always`.
 *
 * Phase 2 put every non-walkthrough mode on `frameloop="demand"`, so an idle
 * editor renders no frames at all — correct for the product, and fatal for
 * measurement. A harness that supplies synthetic input to provoke frames ends up
 * measuring its own input cadence rather than the renderer (a 30 ms "frame time"
 * that is really the interval between two dispatched mouse moves), which is a
 * confidently wrong number rather than a missing one.
 *
 * With this set, `PerfContinuousLoop` re-invalidates every frame so the mode
 * renders continuously and frame timing means something again. Deliberately a
 * SEPARATE flag from `?perf=1`: the HUD must stay usable for observing the app
 * as it actually behaves, demand-mode idling included.
 */
export const PERF_LOOP_PARAM = "loop";

/**
 * Non-reactive read, for code that is already inside an effect or a frame
 * callback. Returns false during SSR, where there is no location to read.
 */
export function perfEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get(PERF_PARAM) === "1";
}

/** `?loop=always`, and only meaningful alongside `?perf=1`. */
export function perfLoopAlways(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get(PERF_LOOP_PARAM) === "always";
}

/** Never fires: `?perf=1` cannot change without a page load, so there is nothing
 *  to subscribe to. Module-level so the reference is stable across renders. */
const subscribe = () => () => {};
/** Server snapshot. The shell is server-rendered and there is no location there,
 *  so the HUD is always absent from the initial HTML and mounts on hydration. */
const serverSnapshot = () => false;

/**
 * Reactive form, for use as a MOUNT boundary (see `PerfRig.tsx` for why the
 * boundary has to be a mount rather than a branch inside the sampler).
 *
 * `useSyncExternalStore` rather than a `useState` + `useEffect` pair: this is
 * exactly the case it exists for — reading a value that lives outside React and
 * has a different answer on the server than the client. Reading
 * `window.location.search` during render would produce different markup on each
 * side, which React 19 treats as a hydration error rather than a warning; the
 * effect-then-setState version avoids that but schedules a second render pass to
 * do it, which is what `react-hooks/set-state-in-effect` objects to.
 *
 * `useSearchParams` would work too, but it opts the whole subtree into a
 * Suspense boundary under the App Router and would drag the protected
 * `Viewport.tsx` into that contract for a dev tool. `location.search` read once
 * is what the rest of this repo does (`src/collab/CollabRoom.tsx`,
 * `src/lib/auth/useSession.ts`).
 */
export function usePerfEnabled(): boolean {
  return useSyncExternalStore(subscribe, perfEnabled, serverSnapshot);
}

/** Reactive form of `perfLoopAlways`, used as the same kind of mount boundary. */
export function usePerfLoopAlways(): boolean {
  return useSyncExternalStore(subscribe, perfLoopAlways, serverSnapshot);
}
