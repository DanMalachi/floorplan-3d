"use client";

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
  const v = new URLSearchParams(window.location.search).get(AO_PARAM);
  return v === "transparent" || v === "off" ? v : "default";
}
