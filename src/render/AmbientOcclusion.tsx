"use client";

import { useLayoutEffect, useRef } from "react";
import { N8AO } from "@react-three/postprocessing";

/**
 * The scene's ambient-occlusion pass, with the two behaviours `<N8AO>` does not
 * expose as props pinned from here.
 *
 * This wrapper exists for the reason `docs/render-contract.md` §0.1 gives for
 * every other file in this directory: the knobs below are real decisions about
 * the image and its cost, and a decision that lives only as a library default
 * is a decision made by that library's changelog. Both are recorded here rather
 * than discovered again the next time the app is profiled.
 *
 * Nothing here is a look knob. `aoRadius`/`intensity`/`halfRes` stay props on
 * the call site, where they were.
 */

/** The slice of `N8AOPostPass` we touch. The package ships no type declarations,
 *  so this is structural — deliberately narrow, so a shape change surfaces here
 *  rather than silently type-checking against `any`. */
type N8AOPass = {
  enabled: boolean;
  autoDetectTransparency: boolean;
  configuration: { transparencyAware: boolean };
};

export function AmbientOcclusion({
  enabled,
  aoRadius,
  intensity,
  distanceFalloff,
  halfRes,
}: {
  /** AO is dropped while dragging and in Top view — the pass stays mounted
   *  either way, see the note on `enabled` below. */
  enabled: boolean;
  aoRadius: number;
  intensity: number;
  distanceFalloff: number;
  halfRes: boolean;
}) {
  const ref = useRef<N8AOPass | null>(null);

  useLayoutEffect(() => {
    const pass = ref.current;
    if (!pass) return;

    // §1 — transparency awareness OFF.
    //
    // N8AO ships an auto-detector that traverses the whole scene every frame
    // looking for a transparent material, and latches `transparencyAware` on
    // the first one it finds. This scene guarantees a hit on frame one: wall
    // and rail glass, cutaway wall fades, the CAD grid, every placement ghost
    // and every pick plane are all `transparent: true`.
    //
    // Latched, the pass runs two extra `renderer.render()` calls per frame to
    // build transparency-aware depth. `WebGLRenderer.render` calls
    // `shadowMap.render` unconditionally, and N8AO only hides objects that have
    // a material — lights stay visible — so the shadow caster list is rebuilt
    // all three times. Every shadow map in the scene therefore rendered THREE
    // times per frame, and two of those three produced maps nothing sampled.
    // On a tile-based GPU it also writes `gl_FragDepth` in two full-screen
    // passes, which disables hidden-surface removal for them.
    //
    // The order below is load-bearing. The proxy setter on `configuration`
    // only clears `autoDetectTransparency` when the value actually CHANGES
    // (`propName === "transparencyAware" && oldProp !== value`), and the
    // default is already `false` — so assigning `false` to a pass that has not
    // yet latched is a no-op that leaves the detector armed to re-latch on the
    // next frame. Clearing the detector directly is the reliable half; the
    // assignment after it is what tears down the transparency render targets in
    // the case where the constructor's own `detectTransparency()` already
    // latched before React ever saw this ref.
    pass.autoDetectTransparency = false;
    pass.configuration.transparencyAware = false;
  }, []);

  // §2 — never unmount, only disable.
  //
  // Unmounting `<N8AO>` destroys the pass, and `EffectComposer.removePass` then
  // also frees the composer's depth texture and its separate depth render
  // target, because this pass is the only thing that declares
  // `needsDepthTexture`. All of it is reallocated on the way back — roughly a
  // quarter of a gigabyte of render targets churned at exactly the moment a
  // drag starts and again when it ends, which is the worst possible time for a
  // driver allocation stall.
  //
  // The composer already skips passes whose `enabled` is false (`if
  // (!pass.enabled) continue;`), so toggling costs nothing and keeps the
  // allocation steady.
  useLayoutEffect(() => {
    const pass = ref.current;
    if (pass) pass.enabled = enabled;
  }, [enabled]);

  return (
    <N8AO
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      aoRadius={aoRadius}
      intensity={intensity}
      distanceFalloff={distanceFalloff}
      halfRes={halfRes}
    />
  );
}
