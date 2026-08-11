"use client";

// Attachment ghosts for parametric items that don't live on the open floor.
//
// 1. COUNTER items (sink/cooktop/future appliances): the ghost rides the
//    nearest kitchenBase run's countertop — grid-snapped along it, at the
//    run's own counter height and rotation — and a click bonds the item there
//    (FurnitureItem.attach). Off-counter the ghost turns red and clicks are
//    rejected: a sink cannot exist without a counter.
// 2. WALL items (mirrors, towel rails): the ghost reads the WALL grid via
//    wallRay — pointing at a wall face gives position, facing and height in
//    one hit. Off-wall it turns red, for the same reason.
//
// Both live in this one file, and it keeps the `CounterItemGhost` export name,
// because Viewport.tsx already mounts that component and Viewport.tsx is a
// protected file (docs/PROTECTED_PATHS.md) — adding a sibling ghost would mean
// editing it.

import { useEffect, useState } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { useSceneStore } from "@/store/useSceneStore";
import { pdToast } from "@/ui/planDock/toast";
import { attachedPose, findHostRun } from "./kitchenAttach";
import { ParametricModel } from "./ParametricModel";
import { rayToWall, roomFacingSide } from "./wallRay";
import { GRID } from "@/viewport3d/snap";
import type { Scene } from "@/schema/scene";

const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const yawOf = (rotation: number) => -rotation;

function rayToPlan(e: ThreeEvent<PointerEvent | MouseEvent>, offset: { cx: number; cz: number }) {
  const hit = new THREE.Vector3();
  if (!e.ray.intersectPlane(FLOOR_PLANE, hit)) return null;
  return { x: hit.x + offset.cx, y: hit.z + offset.cz };
}

/** Wall pose from a wall-face hit: the item's back sits flat on the face, it
 *  faces the room, and its height is wherever on the wall you pointed.
 *  `rayToWall` already returns the hit ON the face, so only half the item's
 *  depth is added — the same convention `snapRunToWall` uses. */
function wallPose(
  hit: { wallId: string; side: "a" | "b"; x: number; y: number; height: number },
  scene: Scene,
  depth: number,
  itemH: number,
): { x: number; y: number; rotation: number; elevation: number } | null {
  const wall = scene.walls.find((w) => w.id === hit.wallId);
  if (!wall) return null;
  const a = scene.nodes.find((n) => n.id === wall.a);
  const b = scene.nodes.find((n) => n.id === wall.b);
  if (!a || !b) return null;

  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1e-6) return null;
  const ux = (b.x - a.x) / L;
  const uy = (b.y - a.y) / L;

  // Prefer the face a ROOM is on: from outside the building the visible face
  // is the exterior one, and a mirror never hangs there.
  const side = roomFacingSide(scene, hit.wallId, hit.x, hit.y, hit.side);
  const sign = side === "a" ? 1 : -1;
  const nx = -uy * sign;
  const ny = ux * sign;

  const snap = (v: number) => Math.round(v / GRID) * GRID;
  return {
    x: hit.x + nx * (depth / 2),
    y: hit.y + ny * (depth / 2),
    rotation: Math.atan2(-nx, ny),
    // Keep the whole item on the wall: its own height is measured up from the
    // mount point, so a tall mirror can't be hung with its top through the
    // ceiling or its base below the floor.
    elevation: Math.min(Math.max(snap(hit.height), 0.1), Math.max(2.6 - itemH, 0.1)),
  };
}

function WallItemGhost({ offset }: { offset: { cx: number; cz: number } }) {
  const placingWall = useSceneStore((s) => s.placingWall);
  const scene = useSceneStore((s) => s.scene);
  const [pose, setPose] = useState<{ x: number; y: number; rotation: number; elevation: number } | null>(null);
  const [miss, setMiss] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!placingWall) {
      setPose(null);
      setMiss(null);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") useSceneStore.getState().setPlacingWall(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [placingWall]);

  if (!placingWall) return null;
  const spec = placingWall.spec;

  const resolve = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const s = useSceneStore.getState().scene;
    const hit = rayToWall(e.ray, s, offset, true);
    return hit ? wallPose(hit, s, spec.dims.d, spec.dims.h) : null;
  };

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const p = resolve(e);
    setPose(p);
    if (!p) {
      const floor = rayToPlan(e, offset);
      setMiss(floor);
    } else setMiss(null);
  };

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const p = resolve(e);
    if (!p) {
      pdToast("Point at a wall to hang it");
      return;
    }
    useSceneStore.getState().placeWallItem(p);
  };

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[offset.cx, 0.001, offset.cz]} onPointerMove={onMove} onClick={onClick}>
        <planeGeometry args={[600, 600]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {pose && (
        <group position={[pose.x, pose.elevation, pose.y]} rotation={[0, yawOf(pose.rotation), 0]}>
          <ParametricModel spec={spec} opacity={0.55} />
        </group>
      )}
      {!pose && miss && (
        <group position={[miss.x, 1.2, miss.y]}>
          <ParametricModel spec={spec} opacity={0.4} tint="red" />
        </group>
      )}
    </>
  );
}

function CounterGhost({ offset }: { offset: { cx: number; cz: number } }) {
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

/** Mounted once by Viewport.tsx. Each inner ghost renders nothing unless its
 *  own placement mode is armed, and the store keeps the modes mutually
 *  exclusive, so at most one is ever live. */
export function CounterItemGhost({ offset }: { offset: { cx: number; cz: number } }) {
  return (
    <>
      <CounterGhost offset={offset} />
      <WallItemGhost offset={offset} />
    </>
  );
}
