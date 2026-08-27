"use client";

import { useLayoutEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { readGpuInfo } from "./gpuInfo";
import { usePerfEnabled, usePerfLoopAlways } from "./usePerfEnabled";
import { usePerfSampler } from "./usePerfSampler";

/**
 * The in-Canvas half of the Phase 0 HUD. Mount as a child of `<Canvas>`; mount
 * `<PerfHud />` as a DOM sibling OUTSIDE it.
 *
 * Renders nothing. Everything it collects reaches the HUD through the module
 * store in `perfStore.ts`, never through React state — see that file for why
 * per-frame state would invalidate its own measurement.
 */
function PerfSampler() {
  const gl = useThree((s) => s.gl);
  usePerfSampler();

  // Identify the device from the app's OWN GL context, once, and cache it at
  // module level so the HUD can read it without opening a second context. A
  // layout effect rather than an ordinary one so the cache is warm before the
  // first published sample can reach the HUD's paint.
  useLayoutEffect(() => {
    readGpuInfo(gl);
  }, [gl]);

  return null;
}

/**
 * `?perf=1` gate.
 *
 * The gate is a MOUNT boundary, not a branch inside the sampler, and it has to
 * be: `useFrame` cannot be called conditionally, so the only way to leave R3F's
 * subscriber list genuinely untouched when the HUD is off is for the component
 * holding the hook not to exist.
 *
 * That matters beyond tidiness. Phase 2 puts `frameloop` on `demand`. An idle
 * subscriber does not by itself schedule frames there — R3F's loop advances a
 * root only on `frameloop === "always" || internal.frames > 0` — but it does run
 * on every frame that IS scheduled, and `usePerfSampler` takes ownership of
 * `gl.info.autoReset` for as long as it lives. Neither belongs in the hot path
 * of a user who never asked for the HUD.
 *
 * Disabled, this is one component returning null: no frame subscription, no
 * renderer mutation, no GL queries, no store writes.
 */
/**
 * Measurement-only continuous render loop — see `perfLoopAlways` for why.
 *
 * `invalidate()` called from inside a frame schedules the next one, so in
 * `frameloop="demand"` this is self-sustaining: one continuous loop for as long
 * as the component is mounted. In `frameloop="always"` (walkthrough) it is a
 * no-op, because the loop is already running and `invalidate` only bumps a
 * counter that mode ignores.
 *
 * Priority stays 0. A positive priority would tell R3F that this subscriber has
 * taken rendering into its own hands and the frame would never be drawn — the
 * trap documented at length in `usePerfSampler.ts`.
 */
function PerfContinuousLoop() {
  const invalidate = useThree((s) => s.invalidate);
  useFrame(() => invalidate());
  return null;
}

export function PerfRig() {
  const enabled = usePerfEnabled();
  const loopAlways = usePerfLoopAlways();

  if (!enabled) return null;

  return (
    <>
      <PerfSampler />
      {loopAlways ? <PerfContinuousLoop /> : null}
    </>
  );
}
