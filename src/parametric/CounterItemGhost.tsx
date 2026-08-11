"use client";

// Kitchen v2 placement for counter items (sink/cooktop/future appliances):
// the ghost rides the nearest kitchenBase run's countertop — grid-snapped
// along it, at the run's own counter height and rotation — and a click bonds
// the item there (FurnitureItem.attach). Off-counter the ghost turns red and
// clicks are rejected: a sink cannot exist without a counter.

import { useEffect, useState } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { useSceneStore } from "@/store/useSceneStore";
import { pdToast } from "@/ui/planDock/toast";
import { attachedPose, findHostRun } from "./kitchenAttach";
import { ParametricModel } from "./ParametricModel";

const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const yawOf = (rotation: number) => -rotation;

function rayToPlan(e: ThreeEvent<PointerEvent | MouseEvent>, offset: { cx: number; cz: number }) {
  const hit = new THREE.Vector3();
  if (!e.ray.intersectPlane(FLOOR_PLANE, hit)) return null;
  return { x: hit.x + offset.cx, y: hit.z + offset.cz };
}

export function CounterItemGhost({ offset }: { offset: { cx: number; cz: number } }) {
  const placingCounter = useSceneStore((s) => s.placingCounter);
  const scene = useSceneStore((s) => s.scene);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!placingCounter) {
      setCursor(null);
      return;
    }
    // Capture-phase Esc, same reasoning as RunDrawGhost.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") useSceneStore.getState().setPlacingCounter(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [placingCounter]);

  if (!placingCounter) return null;
  const spec = placingCounter.spec;
  const found = cursor ? findHostRun(cursor.x, cursor.y, scene, spec.dims.w) : null;

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const p = rayToPlan(e, offset);
    if (p) setCursor(p);
  };

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const p = rayToPlan(e, offset);
    if (!p) return;
    const hit = findHostRun(p.x, p.y, useSceneStore.getState().scene, spec.dims.w);
    if (!hit) {
      pdToast("Place it on a kitchen counter");
      return;
    }
    useSceneStore.getState().placeCounterItem(hit.host.id, hit.along);
  };

  const pose = found ? attachedPose(found.host, found.along) : null;

  return (
    <>
      {/* Catch-all ground plane: drives the ghost and takes the place click. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[offset.cx, 0.001, offset.cz]}
        onPointerMove={onMove}
        onClick={onClick}
      >
        <planeGeometry args={[600, 600]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {pose && (
        <group position={[pose.x, pose.elevation, pose.y]} rotation={[0, yawOf(pose.rotation), 0]}>
          <ParametricModel spec={spec} opacity={0.55} />
        </group>
      )}
      {!pose && cursor && (
        // No counter under the cursor: red floor-level ghost says "not here".
        <group position={[cursor.x, 0, cursor.y]}>
          <ParametricModel spec={spec} opacity={0.4} tint="red" />
        </group>
      )}
    </>
  );
}
