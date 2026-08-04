"use client";

// Camera focus-on-room-click (Plan Dock P8): glides the camera to a plan
// point when NavigatorPanel's room-icon click resolves to a matching
// scene.rooms entry (BottomDock.tsx's focusRoomForTag). New, additive Canvas
// child — reads the new `focusTarget` store field and drives the existing
// drei CameraControls instance (`makeDefault` in Viewport.tsx) via its own
// imperative setLookAt, the same API FitCamera already uses for the initial
// framing shot.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import type { CameraControls } from "@react-three/drei";
import { useSceneStore } from "@/store/useSceneStore";

export function CameraFocusRig({ offset }: { offset: { cx: number; cz: number } }) {
  const controls = useThree((s) => s.controls) as CameraControls | null;
  const focusTarget = useSceneStore((s) => s.focusTarget);
  // Dedup by VALUE (not a boolean flag): re-clicking the same room mints a
  // fresh {x,y} object each time (see the store field's own comment), so a
  // reference/shallow-equality check here would wrongly skip repeat clicks.
  const consumed = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!controls || !focusTarget) return;
    if (consumed.current && consumed.current.x === focusTarget.x && consumed.current.y === focusTarget.y) return;
    consumed.current = focusTarget;

    const tx = focusTarget.x - offset.cx;
    const tz = focusTarget.y - offset.cz;

    // Keep the camera's current distance/angle "feel" — re-aim at the new
    // target along the same offset it already has from its CURRENT look-at
    // point, so this reads as "glide over there" rather than a jarring
    // zoom reset to some fixed distance.
    const curPos = new THREE.Vector3();
    const curTarget = new THREE.Vector3();
    controls.getPosition(curPos);
    controls.getTarget(curTarget);
    const rig = curPos.clone().sub(curTarget);
    const nextPos = new THREE.Vector3(tx, 0, tz).add(rig);

    controls.setLookAt(nextPos.x, nextPos.y, nextPos.z, tx, 0.6, tz, true);
  }, [focusTarget, controls, offset]);

  return null;
}
