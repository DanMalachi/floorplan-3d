"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { assertRenderContract } from "./contract";

/**
 * Runs the startup contract assertion (§1.3) once the scene is live.
 *
 * Mounted as the LAST child of the Canvas, after <EffectComposer>. That order
 * matters: the composer sets `gl.toneMapping = NoToneMapping` in its own mount
 * effect, and the contract asserts that value. Checking in the Canvas
 * `onCreated` would run before any child mounted and would fail on a renderer
 * that is about to be configured correctly.
 *
 * Asserts from the SECOND `useFrame` call, not a post-mount rAF. R3F runs every
 * subscribed `useFrame` callback before that frame's `gl.render`, so the first
 * call still precedes the scene's first render. `WebGLShadowMap.render` can
 * rewrite `gl.shadowMap.type` during that first shadow pass (it coerces the
 * deprecated `PCFSoftShadowMap` alias back to `PCFShadowMap` — three's own
 * `WebGLShadowMap.js`, the render method), so a check that runs before any
 * render has happened cannot see a value the renderer overwrites in it. By the
 * second `useFrame` call the first frame's render has already completed.
 */
export function RenderContractCheck() {
  const gl = useThree((s) => s.gl);
  const frame = useRef(0);
  const checked = useRef(false);
  useFrame(() => {
    if (checked.current) return;
    if (frame.current < 1) {
      frame.current++;
      return;
    }
    checked.current = true;
    assertRenderContract(gl);
  });
  return null;
}
