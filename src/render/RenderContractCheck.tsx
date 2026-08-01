"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
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
 * The extra rAF hop makes the ordering explicit rather than relying on React's
 * sibling effect order staying what it is today — the check costs one frame,
 * once, and a false throw here would be worse than a late one.
 */
export function RenderContractCheck() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const id = requestAnimationFrame(() => assertRenderContract(gl));
    return () => cancelAnimationFrame(id);
  }, [gl]);
  return null;
}
