"use client";

import { useCallback, useEffect } from "react";
import { useFrame, useStore } from "@react-three/fiber";
import { useSceneStore } from "@/store/useSceneStore";

/**
 * Shadow maps refresh when something that casts or lights changes — not on
 * every frame.
 *
 * three's `WebGLShadowMap.autoUpdate` defaults to true, which means every
 * `gl.render` re-renders the sun's 2048² ortho map AND all six faces of the
 * room-light cube map: ~10.5M shadow texels, seven render-target binds and
 * seven caster submissions per frame, for a scene that is static almost all of
 * the time.
 *
 * The waste is easiest to see in the app's single most common interaction.
 * Orbiting the camera changes NEITHER map — the sun's frustum is anchored to
 * the model (`SHADOW.frustumHalfExtent`, not the camera) and the cube maps are
 * anchored to fixture positions — so every orbit frame pays the full shadow
 * bill to produce two byte-identical maps.
 *
 * `needsUpdate` self-clears at the end of `WebGLShadowMap.render`, so each
 * trigger below buys exactly one refreshed frame.
 *
 * This does not change the image. If a shadow is ever visibly stale, the bug is
 * a missing trigger in this file, not the mechanism — add it here rather than
 * reaching for `autoUpdate = true`, which silently restores the whole cost.
 */
export function ShadowRefreshRig() {
  // The store rather than `useThree(s => s.gl)`: everything this component does
  // is mutate the renderer, and reaching it through `getState()` keeps that out
  // of the React Compiler's "don't modify a hook's return value" path — a rule
  // that models React state, not a retained-mode graphics API.
  const store = useStore();

  // Marking the shadow map dirty does NOT schedule a frame, and under
  // `frameloop="demand"` (Phase 2) no frame means the flag just sits there. Most
  // triggers below are store changes that re-render the scene and make R3F
  // invalidate anyway, so this is belt-and-braces for those — but the
  // asset-arrival poll at the bottom has no React change behind it at all and
  // would otherwise never repaint. Pair the two everywhere rather than reasoning
  // per-trigger about which one happens to be covered.
  const refresh = useCallback(() => {
    const { gl, invalidate } = store.getState();
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [store]);

  // Every store field whose change moves a caster, a light, or the set of
  // objects that are casters at all.
  const scene = useSceneStore((s) => s.scene); // any geometry edit: walls, openings, furniture, fixtures, stairs
  const timeOfDay = useSceneStore((s) => s.timeOfDay); // sun direction
  const envPreset = useSceneStore((s) => s.envPreset); // whole light rig swaps; Suburb/City geometry mounts
  const weather = useSceneStore((s) => s.weather); // Rain mounts/unmounts; sun intensity
  const wallMode = useSceneStore((s) => s.wallMode); // cutaway changes which walls exist as casters
  const showCeilings = useSceneStore((s) => s.showCeilings); // the ceiling slab is a caster (contract §3.4)
  const gestureBase = useSceneStore((s) => s.gestureBase); // non-null while a drag is in flight
  const doorGestureActive = useSceneStore((s) => s.doorGestureActive);

  useEffect(() => {
    const { gl } = store.getState();
    gl.shadowMap.autoUpdate = false;
    // Whatever is on screen when this mounts has never had a shadow pass under
    // manual control, so take one immediately rather than waiting for the first
    // trigger.
    refresh();
    return () => {
      // Leave the renderer as we found it. Nothing else in the app owns this
      // flag today, but a renderer handed back in a non-default state is the
      // kind of thing that costs an afternoon later.
      gl.shadowMap.autoUpdate = true;
    };
  }, [store, refresh]);

  useEffect(() => {
    refresh();
  }, [refresh, scene, timeOfDay, envPreset, weather, wallMode, showCeilings]);

  // A gesture moves a caster continuously, so for its duration the shadow maps
  // genuinely do need to refresh every frame — this is the one state where the
  // old always-on behaviour was the correct behaviour. Door swings in
  // walkthrough are the same case: the leaf is a caster and it animates over
  // ~1-2s without the scene identity changing per frame.
  const animating = gestureBase !== null || doorGestureActive;
  useFrame(() => {
    // Already inside a rendering frame, so only the flag is needed here — but
    // the frame after this one still has to happen, and calling invalidate from
    // within useFrame is exactly how R3F is told to schedule it.
    if (animating) refresh();
  });

  // The one trigger with no store event: a GLB that finishes loading adds a
  // caster with no state change to observe. `useGLTF` resolves through Suspense,
  // so the mount it causes is not something this component can subscribe to.
  //
  // The cheap, honest fix is a poll that is not a per-frame cost: compare the
  // renderer's own texture/geometry counts, which move when an asset lands, and
  // refresh once when they do. Four times a second is well inside the window
  // where a briefly-unshadowed newly-loaded sofa is invisible to a person.
  useEffect(() => {
    let last = -1;
    const id = window.setInterval(() => {
      const { gl } = store.getState();
      const n = gl.info.memory.geometries + gl.info.memory.textures;
      if (n !== last) {
        last = n;
        refresh();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [store, refresh]);

  return null;
}
