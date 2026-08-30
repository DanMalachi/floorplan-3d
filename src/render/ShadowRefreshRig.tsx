"use client";

import { useCallback, useEffect, useRef } from "react";
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

  // A drag gesture (wall/opening/furniture move, etc.) moves a caster
  // continuously WHILE the user is looking straight at the thing they're
  // dragging — the old always-on behaviour is genuinely correct for its
  // duration, so it is untouched here.
  const dragActive = gestureBase !== null;
  useFrame(() => {
    // Already inside a rendering frame, so only the flag is needed here — but
    // the frame after this one still has to happen, and calling invalidate from
    // within useFrame is exactly how R3F is told to schedule it.
    if (dragActive) refresh();
  });

  // A walkthrough door swing is a different animal from a drag: it is a SIDE
  // EFFECT of walking near a door, not something being actively steered, it
  // runs a fixed ~1-2s regardless of whether anyone is even looking at it,
  // and it moves exactly one small caster (a door leaf) — yet refreshing it
  // the same way as a drag pays the SAME full bill (the 2048^2 sun map plus
  // all six faces of every casting point-light cube, ~10.5M shadow texels,
  // see the class doc) on every one of its ~60-120 frames. That reinstates
  // precisely the per-frame shadow cost Phase 1 removed, for a single leaf
  // most of the time nobody is looking at.
  //
  // Shadows are already PCF-blurred (`SHADOW.radius`/`ROOM_LIGHT.shadow.radius`
  // in contract.ts) and the leaf itself is moving, both of which hide a few
  // frames of lag, so the steady state throttles to DOOR_SWING_REFRESH_HZ
  // instead of every frame. The two edges do NOT throttle: the instant the
  // swing starts nothing has ever refreshed the moving leaf, so the first
  // frame can't sit out a throttle window without a visibly stale shadow the
  // moment the door starts moving; the instant it stops, the resting frame
  // must land exactly rather than still be catching up. (The scene-identity
  // `useEffect` above also fires once the swing's `endGesture` commits, so
  // the stop edge is belt-and-braces, not the only thing landing it.)
  const DOOR_SWING_REFRESH_HZ = 10; // vs. 60 fps steady-state — ~83% fewer shadow passes while a door is swinging
  const doorSwingWasActive = useRef(false);
  const doorSwingElapsedS = useRef(0);
  useFrame((_state, delta) => {
    if (!doorGestureActive) {
      doorSwingWasActive.current = false;
      return;
    }
    if (!doorSwingWasActive.current) {
      doorSwingWasActive.current = true;
      doorSwingElapsedS.current = 0;
      refresh(); // rising edge — refresh immediately, don't wait out the throttle
      return;
    }
    doorSwingElapsedS.current += delta;
    if (doorSwingElapsedS.current < 1 / DOOR_SWING_REFRESH_HZ) return;
    doorSwingElapsedS.current = 0;
    refresh();
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
