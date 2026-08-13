"use client";

// Double-click an item or floor to frame it (P2 T2). One native `dblclick`
// listener on the canvas rather than a handler added to every layer:
// FurnitureLayer, FixtureLayer, FloorMesh, WallMesh and StairMesh already tag
// their pickable root with `userData.pick` (pickObject3D.ts's `pickOf` walks
// up to it), so a single raycast off the DOM event resolves any of them
// without touching five protected files.
//
// A native listener rather than R3F's synthetic onDoubleClick: none of the
// layers register a double-click handler of their own (only onClick/
// onPointerDown, for selection and dragging), and R3F only dispatches an
// event to nodes that listen for it — there is nothing for a synthetic
// onDoubleClick to bubble through. Reading the DOM event and raycasting
// ourselves is the one-handler option the layers' existing userData.pick
// tagging was built to support.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import type { CameraControls } from "@react-three/drei";
import { CAMERA } from "./CameraRig";
import { pickOf } from "./pickObject3D";

const FRAME_PADDING = {
  paddingLeft: CAMERA.framePaddingM,
  paddingRight: CAMERA.framePaddingM,
  paddingTop: CAMERA.framePaddingM,
  paddingBottom: CAMERA.framePaddingM,
};

export function CameraDoubleClickRig() {
  const controls = useThree((s) => s.controls) as CameraControls | null;
  const camera = useThree((s) => s.camera);
  const rootScene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  // Scratch objects reused across every double-click instead of allocating
  // one per event — same pattern WalkthroughMode uses for its per-frame math.
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  const ndcRef = useRef<THREE.Vector2 | null>(null);
  if (!raycasterRef.current) raycasterRef.current = new THREE.Raycaster();
  if (!ndcRef.current) ndcRef.current = new THREE.Vector2();

  useEffect(() => {
    if (!controls) return;
    const raycaster = raycasterRef.current!;
    const ndc = ndcRef.current!;

    const onDblClick = (e: MouseEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      ndc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(rootScene.children, true)[0];
      if (!hit) return; // double-click on empty sky/grid — nothing to frame
      const resolved = pickOf(hit.object);
      if (!resolved) return; // hit a non-pickable helper (grid, ghost, …)
      controls.fitToBox(resolved.object, true, FRAME_PADDING);
    };

    gl.domElement.addEventListener("dblclick", onDblClick);
    return () => gl.domElement.removeEventListener("dblclick", onDblClick);
  }, [controls, camera, rootScene, gl]);

  return null;
}
