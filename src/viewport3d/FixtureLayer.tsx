"use client";

import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { FixtureItem, FixtureMount, Scene } from "@/schema/scene";
import { isSolidWall } from "@/schema/scene";
import { WALL_HEIGHT } from "@/schema/constants";
import { useSceneStore } from "@/store/useSceneStore";
import { DEFAULT_FIXTURE_COLOR_K, kelvinToColor } from "@/render/lightPresets";
import { eligibleLitRooms, resolveFixtureWorldXY, type EligibleRoom } from "@/render/roomLighting";
import { pointInPolygon } from "@/lib/rooms/roomArea";
import { FIXTURE_CATALOG_BY_ID, WALL_FIXTURE_SILL_M } from "@/fixtures/catalog";
import { GRID } from "./snap";
import { ACCENT } from "./WallMesh";
import { sampleFixture } from "@/decorate/eyedropper";
import { FixtureBody } from "./FixtureBody";
import { LinearLightGhost } from "./LinearLightGhost";
import { CeilingFixtureGhost } from "./CeilingFixtureGhost";
import { StripSelection } from "./StripSelection";
import { fixtureDropM, lightPath } from "@/fixtures/linear";
import { WallSurfaceGrid } from "./SnapGridViz";
import { rayToWall } from "@/parametric/wallRay";
import { grabHeight, rayToPlanAt } from "./dragPlane";

/** Wall-mount from a WALL-FACE raycast (Kitchen v2.1): pointing at a wall
 *  gives wall, face, along AND height directly — the wall grid is the whole
 *  interaction, the floor plays no part. Falls back to the floor-projection
 *  `nearestWallMount` only when the pointer isn't on any wall. */
function wallMountFromRay(
  e: ThreeEvent<PointerEvent> | ThreeEvent<MouseEvent>,
  scene: Scene,
  offset: { cx: number; cz: number },
  fallbackSill: number,
): FixtureMount | null {
  const hit = rayToWall(e.ray, scene, offset);
  if (hit) {
    return {
      kind: "wall",
      wallId: hit.wallId,
      side: hit.side,
      offset: Math.min(Math.max(snap(hit.along), 0), hit.L),
      sill: Math.min(Math.max(snap(hit.height), 0.3), 2.6),
    };
  }
  const p = rayToPlan(e, offset);
  return p ? nearestWallMount(p.x, p.y, scene, fallbackSill, eyeOf(e, offset)) : null;
}

// Structurally a duplicate of FurnitureLayer.tsx's FLOOR_PLANE/rayToPlan/snap
// (~10 stable lines, a physical constant + a raycast) — accepted rather than
// extracted into a shared module, since a shared module would need
// FurnitureLayer.tsx (protected) to be edited to consume it. See
// docs/render-contract.md §0.2 on not dodging protected-file edits sideways.
const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function rayToPlan(
  e: ThreeEvent<PointerEvent> | ThreeEvent<MouseEvent>,
  offset: { cx: number; cz: number },
  /** World height the gesture runs at. A ceiling fixture lives 2.4m up, so
   *  dragging it against the FLOOR plane moved it faster than the cursor —
   *  the largest instance of the problem dragPlane.ts describes. */
  height = 0,
): { x: number; y: number } | null {
  if (height !== 0) return rayToPlanAt(e.ray, height, offset);
  const hit = new THREE.Vector3();
  if (!e.ray.intersectPlane(FLOOR_PLANE, hit)) return null;
  return { x: hit.x + offset.cx, y: hit.z + offset.cz };
}

const snap = (v: number) => Math.round(v / GRID) * GRID;

// Shared with FurnitureLayer/RunHandles — see viewport3d/dragPlane.ts for why
// a drag must not run on the floor plane.


/** Plan rotation θ → three.js yaw (plan y is world z, so the sense flips). */
const yawOf = (rotation: number) => -rotation;

/** Which eligible room's ceiling a plan point sits under, for display height
 *  only — never stored. Falls back to the default wall height when the point
 *  isn't inside any room (e.g. a fixture dragged into a wall's thickness). */
function ceilingYAt(x: number, y: number, rooms: EligibleRoom[], assetId: string): number {
  const hit = rooms.find((er) => pointInPolygon(x, y, er.loop));
  const height = hit?.ceilingHeight ?? WALL_HEIGHT;
  return height - fixtureDropM(assetId);
}

/**
 * The nearest solid wall to a plan point, as a wall `FixtureMount` — always
 * returns the closest wall regardless of distance (a wall light placed
 * anywhere in a room should snap to *some* wall, the way furniture's own
 * `wallSnap` is magnetic rather than range-gated-to-nothing). Rails/portals
 * never qualify (`isSolidWall`) — nothing to mount a sconce on.
 *
 * `offset` locks to the wall grid (multiples of GRID from node a — the same
 * lattice `WallSurfaceGrid` draws). `side` is the face toward `eye` (the
 * camera, in plan coords) — NOT toward the cursor: the cursor ray is
 * intersected with the floor plane, so aiming at an interior wall face puts
 * the plan point BEHIND the wall and a cursor-side pick chose the exterior
 * face the user wasn't even looking at.
 */
function nearestWallMount(
  x: number, y: number, scene: Scene, sill: number, eye: { x: number; y: number },
): FixtureMount | null {
  let best: { dist: number; wallId: string; offset: number; side: "a" | "b" } | null = null;
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  for (const w of scene.walls) {
    if (!isSolidWall(w)) continue;
    const a = nodes.get(w.a);
    const b = nodes.get(w.b);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy);
    if (L < 1e-6) continue;
    const ux = dx / L;
    const uy = dy / L;
    const t = Math.min(Math.max((x - a.x) * ux + (y - a.y) * uy, 0), L);
    const px = a.x + ux * t;
    const py = a.y + uy * t;
    const dist = Math.hypot(x - px, y - py);
    const camSide = (eye.x - px) * -uy + (eye.y - py) * ux;
    if (!best || dist < best.dist) {
      best = {
        dist,
        wallId: w.id,
        offset: Math.min(Math.max(snap(t), 0), L),
        side: camSide >= 0 ? "a" : "b",
      };
    }
  }
  if (!best) return null;
  return { kind: "wall", wallId: best.wallId, offset: best.offset, side: best.side, sill };
}

/** The event camera's plan-space position (undoes the recentring offset the
 *  same way `rayToPlan` does for the cursor). */
function eyeOf(
  e: ThreeEvent<PointerEvent> | ThreeEvent<MouseEvent>,
  offset: { cx: number; cz: number },
): { x: number; y: number } {
  return { x: e.camera.position.x + offset.cx, y: e.camera.position.z + offset.cz };
}

/** Plan-space rotation (same convention as `FixtureItem.rotation`/
 *  `FurnitureItem.rotation` — a three.js yaw needs `yawOf` on top of this)
 *  that faces a wall fixture outward, into the room its `side` picks. Same
 *  trig `collision.ts`'s `snapToWall` uses for wall-snapped furniture: front
 *  (local +Z) set to the wall's outward normal. */
function wallFacingRotation(wallId: string, side: "a" | "b", scene: Scene): number {
  const wall = scene.walls.find((w) => w.id === wallId);
  const a = wall && scene.nodes.find((n) => n.id === wall.a);
  const b = wall && scene.nodes.find((n) => n.id === wall.b);
  if (!wall || !a || !b) return 0;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  const sign = side === "a" ? 1 : -1;
  const nx = -uy * sign;
  const ny = ux * sign;
  return Math.atan2(-nx, ny);
}

function SelectionRing({ radius, dim }: { radius: number; dim?: boolean }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
      <ringGeometry args={[radius * 0.9, radius, 40]} />
      <meshBasicMaterial color={ACCENT} transparent opacity={dim ? 0.35 : 0.85} side={THREE.DoubleSide} />
    </mesh>
  );
}

interface FixtureDrag {
  pointerId: number;
  base: Scene;
  grab: { dx: number; dy: number }; // ceiling only: grab point relative to item center
  start: { x: number; y: number }; // plan point at pointer-down (dead-zone check)
  planeY: number; // world height the gesture runs at (where the ray met the fixture)
  began: boolean; // gesture opened — only after the dead zone is crossed
}

/** Plan-space dead zone before a press becomes a drag: a plain click (select)
 *  must never nudge the item, but select-and-drag works in ONE motion — no
 *  click-to-select-then-click-again-to-drag two-step. */
const DRAG_DEAD_ZONE_M = 0.035;

function FixtureItemView({ item, offset, rooms }: {
  item: FixtureItem;
  offset: { cx: number; cz: number };
  rooms: EligibleRoom[];
}) {
  const hovered = useSceneStore(
    (s) => s.hover3d?.kind === "fixture" && s.hover3d.id === item.id,
  );
  const selected = useSceneStore(
    (s) => s.sel3d?.kind === "fixture" && s.sel3d.id === item.id,
  );
  const drag = useRef<FixtureDrag | null>(null);
  const spec = FIXTURE_CATALOG_BY_ID.get(item.assetId);
  const shape = spec?.shape ?? "flushDisc";
  const colorHex = kelvinToColor(item.colorK ?? DEFAULT_FIXTURE_COLOR_K);

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    const s = useSceneStore.getState();
    if (s.appMode !== "furnish" || s.placing) return; // fixture edits in Furnish only, same as furniture
    e.stopPropagation();
    if (sampleFixture(item)) return; // eyedropper (Plan Dock P7): sample instead of select
    s.setSel3d({ kind: "fixture", id: item.id });
    // Select AND arm the drag in one press. The gesture itself only opens
    // once the pointer leaves the dead zone, so a plain click never nudges.
    const planeY = grabHeight(e.point, 0);
    const p = rayToPlan(e, offset, planeY);
    if (!p) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const grab =
      item.mount.kind === "ceiling"
        ? { dx: p.x - item.mount.x, dy: p.y - item.mount.y }
        : { dx: 0, dy: 0 }; // wall items snap directly under the cursor — no relative grab
    drag.current = { pointerId: e.pointerId, base: s.scene, grab, start: p, planeY, began: false };
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    e.stopPropagation();
    const p = rayToPlan(e, offset, d.planeY);
    if (!p) return;
    if (!d.began) {
      if (Math.hypot(p.x - d.start.x, p.y - d.start.y) < DRAG_DEAD_ZONE_M) return;
      d.began = true;
      useSceneStore.getState().beginGesture();
    }

    let mount: FixtureMount;
    if (item.mount.kind === "ceiling") {
      const x = e.shiftKey ? p.x - d.grab.dx : snap(p.x - d.grab.dx);
      const y = e.shiftKey ? p.y - d.grab.dy : snap(p.y - d.grab.dy);
      mount = { kind: "ceiling", x, y };
    } else {
      const snapped = wallMountFromRay(e, d.base, offset, item.mount.sill);
      if (!snapped) return;
      mount = snapped;
    }

    const candidate: FixtureItem = { ...item, mount };
    const next: Scene = {
      ...d.base,
      fixtures: (d.base.fixtures ?? []).map((f) => (f.id === item.id ? candidate : f)),
    };
    useSceneStore.getState().updateGesture(next, { guides: [], labels: [] });
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    e.stopPropagation();
    (e.target as Element).releasePointerCapture(e.pointerId);
    drag.current = null;
    // A click inside the dead zone never opened a gesture — nothing to commit.
    if (d.began) useSceneStore.getState().endGesture("Move fixture");
  };

  const scene = useSceneStore((s) => s.scene);
  const world = resolveFixtureWorldXY(item, scene);
  if (!world) return null; // wall mount pointing at a wall that no longer exists

  const y = item.mount.kind === "ceiling" ? ceilingYAt(item.mount.x, item.mount.y, rooms, item.assetId) : item.mount.sill;
  const baseRotation =
    item.mount.kind === "wall" ? wallFacingRotation(item.mount.wallId, item.mount.side, scene) : 0;

  return (
    <group
      position={[world.x, y, world.y]}
      rotation={[0, yawOf(baseRotation + item.rotation), 0]}
      userData={{ pick: { kind: "fixture", id: item.id } }}
      onPointerOver={(e) => {
        const s = useSceneStore.getState();
        if (s.appMode !== "furnish" || s.placing) return;
        e.stopPropagation();
        s.setHover3d({ kind: "fixture", id: item.id });
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        const cur = useSceneStore.getState().hover3d;
        if (cur?.kind === "fixture" && cur.id === item.id) useSceneStore.getState().setHover3d(null);
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <FixtureBody shape={shape} colorHex={colorHex} path={shape === "linear" ? lightPath(item) : undefined} />
      {(selected || hovered) && (shape === "linear"
        ? <StripSelection path={lightPath(item)} dim={!selected} />
        : <SelectionRing radius={0.24} dim={!selected} />)}
    </group>
  );
}

/** Catalog ghosts share fixture bodies; each mount uses its own ray plane. */
function PlacementGhost({ offset, rooms }: { offset: { cx: number; cz: number }; rooms: EligibleRoom[] }) {
  const placing = useSceneStore((s) => s.placing);
  const scene = useSceneStore((s) => s.scene);
  const [wallMount, setWallMount] = useState<FixtureMount | null>(null);
  if (!placing) return null;
  const spec = FIXTURE_CATALOG_BY_ID.get(placing.assetId);
  if (!spec || spec.shape === "linear") return null;
  if (spec.category === "Ceiling") return <CeilingFixtureGhost key={placing.assetId} assetId={placing.assetId} offset={offset} rooms={rooms} />;
  const onMove = (e: ThreeEvent<PointerEvent>) => setWallMount(wallMountFromRay(e, scene, offset, WALL_FIXTURE_SILL_M));
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const mount = wallMountFromRay(e, scene, offset, WALL_FIXTURE_SILL_M);
    if (mount) useSceneStore.getState().placeFixture(mount, useSceneStore.getState().placing?.rotation ?? 0);
  };
  const preview: FixtureItem | null = wallMount && { id: "__ghost__", assetId: placing.assetId, rotation: placing.rotation, mount: wallMount };
  const world = preview && resolveFixtureWorldXY(preview, scene);
  return <>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[offset.cx, 0.001, offset.cz]} onPointerMove={onMove} onClick={onClick}>
      <planeGeometry args={[600, 600]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
    {world && wallMount?.kind === "wall" && <>
      <group position={[world.x, wallMount.sill, world.y]} rotation={[0, yawOf(wallFacingRotation(wallMount.wallId, wallMount.side, scene) + placing.rotation), 0]}>
        <FixtureBody shape={spec.shape} colorHex={kelvinToColor(DEFAULT_FIXTURE_COLOR_K)} opacity={0.55} />
      </group>
      <WallSurfaceGrid scene={scene} wallId={wallMount.wallId} side={wallMount.side} />
    </>}
  </>;
}

/** Wall grid while DRAGGING an existing wall fixture (the placement ghost
 *  above renders its own). The dragged item's live mount is already in the
 *  store scene (gesture updates write through), so this just mirrors it. */
function DraggedWallFixtureGrid({ scene }: { scene: Scene }) {
  const dragging = useSceneStore((s) => s.gestureBase !== null);
  const sel3d = useSceneStore((s) => s.sel3d);
  if (!dragging || sel3d?.kind !== "fixture") return null;
  const item = (scene.fixtures ?? []).find((f) => f.id === sel3d.id);
  if (!item || item.mount.kind !== "wall") return null;
  return <WallSurfaceGrid scene={scene} wallId={item.mount.wallId} side={item.mount.side} />;
}

export function FixtureLayer({ scene, offset }: {
  scene: Scene;
  offset: { cx: number; cz: number };
}) {
  // rooms/walls/nodes only — never openings, so a walkthrough door swing
  // (new Scene object every frame) doesn't force this to recompute.
  const rooms = useMemo(() => eligibleLitRooms(scene), [scene.rooms, scene.walls, scene.nodes]);
  return (
    <group>
      {(scene.fixtures ?? []).map((item) => (
        <FixtureItemView key={item.id} item={item} offset={offset} rooms={rooms} />
      ))}
      <PlacementGhost offset={offset} rooms={rooms} />
      <LinearPlacement offset={offset} rooms={rooms} />
      <DraggedWallFixtureGrid scene={scene} />
    </group>
  );
}

function LinearPlacement({ offset, rooms }: { offset: { cx: number; cz: number }; rooms: EligibleRoom[] }) {
  const placing = useSceneStore((s) => s.placing);
  return placing?.assetId === "fx:linear" ? <LinearLightGhost offset={offset} rooms={rooms} /> : null;
}
