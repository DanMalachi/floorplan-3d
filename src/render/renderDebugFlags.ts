"use client";

import { useSyncExternalStore } from "react";

import { DPR } from "./contract";
import { devToolsEnabled } from "@/lib/featureFlags";

/**
 * Per-page-load debug hatches for A/B-ing a render decision against someone's
 * eye, rather than against an argument about the pipeline.
 *
 * This exists because of a specific gap. `docs/PERFORMANCE-HANDOFF.md` names two
 * suspects for the "outlines look aliased / spikey" report, and says of the first
 * that the GPU audit itself called for "an A/B screenshot before shipping" and
 * **that A/B was never done**. The reason it was never done is that both suspects
 * are compile-time constants: comparing them meant editing source, rebuilding,
 * and holding the previous image in memory. That is a bad way to judge an image,
 * and an impossible way to judge one on a machine that is not the build machine.
 *
 * The rules are `usePerfEnabled.ts`'s, for its reasons: opt-in per page load, no
 * persisted setting, and a query parameter because the actual workflow is a URL
 * pasted into a message and opened on someone else's MacBook. A switch that can
 * be left on would eventually become part of what the next phase measures.
 *
 * These change the IMAGE, not just the instrumentation, so nothing here may
 * become a product setting without going through `docs/render-contract.md` — a
 * look knob that lives in a URL parameter is a look knob nobody has signed off.
 */

/**
 * `?ao=` — the ambient-occlusion pass.
 *
 * - `default` — as shipped: transparency awareness off (Phase 1's change).
 * - `transparent` — restores `transparencyAware`, the prime suspect for the
 *   aliased-outline report. It is worth ~15% of frame time and triples the
 *   shadow cost, so this is a diagnostic, never a fix: if it turns out to be the
 *   cause, the handoff asks for a middle path rather than a straight revert.
 * - `off` — disables the pass entirely. Separates "AO is drawing this artifact"
 *   from "AO's transparency mode is drawing this artifact", which the two-way
 *   comparison alone cannot do. Also the cheapest test of the handoff's
 *   walkthrough lead 4, that AO could be dropped in motion.
 */
export type AoDebugMode = "default" | "transparent" | "off";

export const AO_PARAM = "ao";

/**
 * Read once per call, not cached: this is only reached from a mount-time layout
 * effect, and a module-level constant evaluated during SSR would read `default`
 * on the server and disagree with the client.
 */
export function aoDebugMode(): AoDebugMode {
  if (typeof window === "undefined") return "default";
  if (!devToolsEnabled) return "default";
  const v = new URLSearchParams(window.location.search).get(AO_PARAM);
  return v === "transparent" || v === "off" ? v : "default";
}

/**
 * `?dpr=` — force the canvas device-pixel-ratio for one page load.
 *
 * The M2 readings ended on a question the instrument could not answer. Settled
 * p95 sits 1 ms from p50 at 36 fps, so nothing stutters — the frame is simply
 * capped, and `js` is 6-11% of it, so the cap is not the CPU. The obvious next
 * cut is fragment count, and the only lever on it is DPR: 2 -> 1 is 4.44 MP ->
 * 1.11 MP, a 4x cut in every full-res pass. If the ceiling moves, Phase 5's
 * quality tiers are worth building (DPR is the largest and most linear row in
 * that table); if it does not, the cap is elsewhere and the tiers are wasted
 * work.
 *
 * That reading had no way to be taken. Safari cannot force a lower backing
 * store, and DPR is a `<Canvas>` prop compiled in from `contract.ts` — so the
 * comparison meant editing source and rebuilding on a machine that is not the
 * measuring machine. Exactly the gap the `?ao=` hatch above exists to close,
 * for exactly the same reason.
 *
 * Pair it with the HUD: `?perf=1&dpr=1` against `?perf=1`. The HUD already
 * reports `gl.getPixelRatio()` (`perfStore.ts`), so a reading taken through
 * this hatch records the DPR it was taken at and cannot be misfiled later.
 *
 * Clamped to the contract's own `DPR` bounds, so this cannot become a route
 * around render-contract §1.1's "forbids `dpr` unbounded or above 2 without a
 * recorded amendment" — a value above 2 is not reachable from here at all, and
 * values inside the recorded range need no amendment. It also stays a
 * DIAGNOSTIC under this file's opening rule: per page load, never persisted,
 * and it may not become a product setting without going through the contract.
 * Deliberately NOT wired into `src/app/calibration/page.tsx`: baseline cells
 * are captured at the contract DPR, and a hatch that could silently change the
 * resolution a baseline was captured at would poison the comparison it exists
 * to serve.
 */
export const DPR_PARAM = "dpr";

/**
 * The parse, split out from `location` so it is testable as a pure function —
 * the read below is the only part that needs a browser.
 *
 * Absent, empty and unparseable all read as "no override" rather than as 0.
 * `Number("")` is 0, which would clamp to the lower bound and make a bare
 * `?dpr=` silently force DPR 1 — a measurement that looks deliberate and is
 * not.
 */
export function parseDprParam(search: string | null | undefined): number | null {
  if (!search) return null;
  const raw = new URLSearchParams(search).get(DPR_PARAM);
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(n, DPR[0]), DPR[1]);
}

/** Non-reactive read, matching `aoDebugMode` above. Null during SSR.
 *
 *  NOT behind `devToolsEnabled`, unlike `?ao=` above (2026-09-04, Dan's ruling):
 *  `?dpr=` is half of the production measuring kit with `?perf=1`, and the
 *  question it settles — what the M2 costs at each DPR — can only be asked of
 *  the real deployment. `?ao=` is gated because it is an A/B for judging a
 *  render change, which is a dev-machine job. */
export function dprOverride(): number | null {
  if (typeof window === "undefined") return null;
  return parseDprParam(window.location.search);
}

/** Never fires — a query parameter cannot change without a page load. */
const subscribeNever = () => () => {};
/** Server snapshot: no location, so no override, so the contract value stands. */
const noDprOverride = () => null;

/**
 * Reactive form, for `<Canvas dpr>` — see `usePerfEnabled.ts` for why reading
 * `location.search` during render is a React 19 hydration error and why
 * `useSyncExternalStore` rather than an effect-then-setState pair is the fix.
 *
 * Returns a NUMBER or null, never a tuple. `useSyncExternalStore` compares
 * snapshots with `Object.is`, so a getter that built `[1, 2]` fresh per call
 * would re-render forever; the caller substitutes the contract's tuple when
 * this reads null.
 */
export function useDprOverride(): number | null {
  return useSyncExternalStore(subscribeNever, dprOverride, noDprOverride);
}
