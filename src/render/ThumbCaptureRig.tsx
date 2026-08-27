"use client";

import { useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  grabCanvasThumb,
  registerThumbRig,
  takePendingThumbRequests,
} from "./viewportThumb";

/**
 * Answers `requestViewportThumb()` from inside the render loop, which is what
 * lets the context drop `preserveDrawingBuffer`.
 *
 * The timing is the whole trick, and it rests on two facts:
 *
 * 1. R3F runs `useFrame` subscribers in ASCENDING priority order, and
 *    `<EffectComposer>` occupies priority 1. A callback at priority 2 therefore
 *    runs after `composer.render()` has drawn this frame — but still inside the
 *    same rAF tick, before the browser composites and is free to discard the
 *    drawing buffer. In that window `drawImage` reads real pixels with no
 *    `preserveDrawingBuffer` anywhere.
 *
 * 2. Because a priority > 0 subscriber exists, R3F stops issuing its own render
 *    — which is already true here (the composer owns rendering) and is why
 *    adding this rig does not change what gets drawn.
 *
 * On non-capture frames this costs one array-length check.
 */
export function ThumbCaptureRig() {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    registerThumbRig(invalidate);
    return () => registerThumbRig(null);
  }, [invalidate]);

  useFrame(() => {
    const reqs = takePendingThumbRequests();
    if (!reqs.length) return;
    for (const r of reqs) r.settle(grabCanvasThumb(gl.domElement, r.maxW));
  }, 2);

  return null;
}
