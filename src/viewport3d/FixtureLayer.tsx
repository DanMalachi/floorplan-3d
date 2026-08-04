"use client";

import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { FixtureItem, FixtureMount, Scene } from "@/schema/scene";
import { isSolidWall } from "@/schema/scene";
import { WALL_HEIGHT } from "@/schema/constants";
import { useSceneStore } from "@/store/useSceneStore";
import { shadowProps } from "@/render/materialClass";
import { ROOM_LIGHT } from "@/render/contract";
import { DEFAULT_FIXTURE_COLOR_K, kelvinToColor } from "@/render/lightPresets";
import { eligibleLitRooms, resolveFixtureWorldXY, type EligibleRoom } from "@/render/roomLighting";
import { pointInPolygon } from "@/lib/rooms/roomArea";
import { FIXTURE_CATALOG_BY_ID, WALL_FIXTURE_SILL_M, type FixtureShape } from "@/fixtures/catalog";
import { GRID } from "./snap";
import { ACCENT } from "./WallMesh";

// Structurally a duplicate of FurnitureLayer.tsx's FLOOR_PLANE/rayToPlan/snap
// (~10 stable lines, a physical constant + a raycast) — accepted rather than
// extracted into a shared module, since a shared module would need
// FurnitureLayer.tsx (protected) to be edited to consume it. See
// docs/render-contract.md §0.2 on not dodging protected-file edits sideways.
const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function rayToPlan(
  e: ThreeEvent<PointerEvent> | ThreeEvent<MouseEvent>,
  offset: { cx: number; cz: number },
): { x: number; y: number } | null {
  const hit = new THREE.Vector3();
  if (!e.ray.intersectPlane(FLOOR_PLANE, hit)) return null;
  return { x: hit.x + offset.cx, y: hit.z + offset.cz };
}

const snap = (v: number) => Math.round(v / GRID) * GRID;

/** Plan rotation θ → three.js yaw (plan y is world z, so the sense flips). */
const yawOf = (rotation: number) => -rotation;

/** Which eligible room's ceiling a plan point sits under, for display height
 *  only — never stored. Falls back to the default wall height when the point
 *  isn't inside any room (e.g. a fixture dragged into a wall's thickness). */
function ceilingYAt(x: number, y: number, rooms: EligibleRoom[]): number {
  const hit = rooms.find((er) => pointInPolygon(x, y, er.loop));
  const height = hit?.ceilingHeight ?? WALL_HEIGHT;
  return height - ROOM_LIGHT.dropBelowCeilingM;
}

/**
 * The nearest solid wall to a plan point, as a wall `FixtureMount` — always
 * returns the closest wall regardless of distance (a wall light placed
 * anywhere in a room should snap to *some* wall, the way furniture's own
 * `wallSnap` is magnetic rather than range-gated-to-nothing). Rails/portals
 * never qualify (`isSolidWall`) — nothing to mount a sconce on.
 */
function nearestWallMount(x: number, y: number, scene: Scene, sill: number): FixtureMount | null {
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
    const side = (x - px) * -uy + (y - py) * ux;
    if (!best || dist < best.dist) {
      best = { dist, wallId: w.id, offset: t, side: side >= 0 ? "a" : "b" };
    }
  }
  if (!best) return null;
  return { kind: "wall", wallId: best.wallId, offset: best.offset, side: best.side, sill };
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

/** A shape's procedural body, local origin at the light source (matches
 *  `RoomLight.position`). MVP visuals: plain primitives, not GLBs — "basic
 *  lights that can later be changed." `colorHex` mirrors the fixture's own
 *  authored color temperature, so the glow you place is the color you get. */
function FixtureBody({ shape, colorHex, tint, opacity }: {
  shape: FixtureShape;
  colorHex: string;
  tint?: "red" | null;
  opacity?: number;
}) {
  const shadow = shadowProps(opacity !== undefined ? "transient" : "opaqueArchitecture");
  const bodyColor = tint === "red" ? "#ff3b30" : "#e8e2d5";
  const emissive = tint === "red" ? "#000000" : colorHex;
  const emissiveIntensity = tint === "red" ? 0 : 0.6;
  const matProps = {
    color: bodyColor,
    emissive,
    emissiveIntensity,
    roughness: 0.6,
    transparent: opacity !== undefined,
    opacity: opacity ?? 1,
    depthWrite: opacity === undefined,
  };

  if (shape === "pendant") {
    return (
      <group>
        <mesh position={[0, ROOM_LIGHT.dropBelowCeilingM / 2, 0]} {...shadow}>
          <cylinderGeometry args={[0.008, 0.008, ROOM_LIGHT.dropBelowCeilingM, 8]} />
          <meshStandardMaterial color="#3a3a3a" roughness={0.5} />
        </mesh>
        <mesh position={[0, -0.06, 0]} {...shadow}>
          <coneGeometry args={[0.14, 0.16, 16, 1, true]} />
          <meshStandardMaterial {...matProps} side={THREE.DoubleSide} />
        </mesh>
      </group>
    );
  }

  if (shape === "sconce") {
    // Local origin is the resolved wall-face point (already pushed out past
    // the wall's thickness) — the plate sits just beyond it, front (+Z per
    // FurnitureItem's own "front faces local +Z" convention) toward the room.
    return (
      <mesh position={[0, 0, 0.03]} {...shadow}>
        <boxGeometry args={[0.16, 0.22, 0.06]} />
        <meshStandardMaterial {...matProps} />
      </mesh>
    );
  }

  // flushDisc — a squat puck, its top embedded into the ceiling above.
  return (
    <mesh position={[0, 0.02, 0]} {...shadow}>
      <cylinderGeometry args={[0.18, 0.18, 0.05, 24]} />
      <meshStandardMaterial {...matProps} />
    </mesh>
  );
}

interface FixtureDrag {
  pointerId: number;
  base: Scene;
  grab: { dx: number; dy: number }; // ceiling only: grab point relative to item center
}

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
    const wasSelected = s.sel3d?.kind === "fixture" && s.sel3d.id === item.id;
    s.setSel3d({ kind: "fixture", id: item.id });
    // First click only selects (see FurnitureLayer's onPointerDown for why).
    if (!wasSelected) return;
    const p = rayToPlan(e, offset);
    if (!p) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const grab =
      item.mount.kind === "ceiling"
        ? { dx: p.x - item.mount.x, dy: p.y - item.mount.y }
        : { dx: 0, dy: 0 }; // wall items snap directly under the cursor — no relative grab
    drag.current = { pointerId: e.pointerId, base: s.scene, grab };
    s.beginGesture();
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    e.stopPropagation();
    const p = rayToPlan(e, offset);
    if (!p) return;

    let mount: FixtureMount;
    if (item.mount.kind === "ceiling") {
      const x = e.shiftKey ? p.x - d.grab.dx : snap(p.x - d.grab.dx);
      const y = e.shiftKey ? p.y - d.grab.dy : snap(p.y - d.grab.dy);
      mount = { kind: "ceiling", x, y };
    } else {
      const snapped = nearestWallMount(p.x, p.y, d.base, item.mount.sill);
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
    useSceneStore.getState().endGesture("Move fixture");
  };

  const scene = useSceneStore((s) => s.scene);
  const world = resolveFixtureWorldXY(item, scene);
  if (!world) return null; // wall mount pointing at a wall that no longer exists

  const y = item.mount.kind === "ceiling" ? ceilingYAt(item.mount.x, item.mount.y, rooms) : item.mount.sill;
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
      <FixtureBody shape={shape} colorHex={colorHex} />
      {(selected || hovered) && <SelectionRing radius={0.24} dim={!selected} />}
    </group>
  );
}

/** Ghost + click-to-place. Rendered only while a fixture catalog item is
 *  active (guarded against FurnitureLayer's own ghost by the shared `placing`
 *  field's catalog-membership check there). Ceiling assets follow the cursor
 *  freely over the floor plane; wall assets (`category: "Wall"`) snap to the
 *  nearest solid wall, mirroring furniture's own magnetic `wallSnap` feel. */
function PlacementGhost({ offset, rooms }: { offset: { cx: number; cz: number }; rooms: EligibleRoom[] }) {
  const placing = useSceneStore((s) => s.placing);
  const scene = useSceneStore((s) => s.scene);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [wallMount, setWallMount] = useState<FixtureMount | null>(null);
  if (!placing || !FIXTURE_CATALOG_BY_ID.has(placing.assetId)) return null;
  const spec = FIXTURE_CATALOG_BY_ID.get(placing.assetId)!;
  const onWall = spec.category === "Wall";

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const p = rayToPlan(e, offset);
    if (!p) return;
    if (onWall) {
      setWallMount(nearestWallMount(p.x, p.y, scene, WALL_FIXTURE_SILL_M));
    } else {
      setPos(e.shiftKey ? p : { x: snap(p.x), y: snap(p.y) });
    }
  };

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const rotation = useSceneStore.getState().placing?.rotation ?? 0;
    if (onWall) {
      if (!wallMount) return;
      useSceneStore.getState().placeFixture(wallMount, rotation);
    } else {
      if (!pos) return;
      useSceneStore.getState().placeFixture({ kind: "ceiling", x: pos.x, y: pos.y }, rotation);
    }
  };

  const previewItem: FixtureItem | null = onWall
    ? wallMount && { id: "__ghost__", assetId: placing.assetId, rotation: placing.rotation, mount: wallMount }
    : pos && { id: "__ghost__", assetId: placing.assetId, rotation: placing.rotation, mount: { kind: "ceiling", x: pos.x, y: pos.y } };
  const world = previewItem && resolveFixtureWorldXY(previewItem, scene);
  const previewY = previewItem
    ? previewItem.mount.kind === "ceiling"
      ? ceilingYAt(previewItem.mount.x, previewItem.mount.y, rooms)
      : previewItem.mount.sill
    : 0;
  const previewRotation =
    previewItem?.mount.kind === "wall"
      ? wallFacingRotation(previewItem.mount.wallId, previewItem.mount.side, scene) + previewItem.rotation
      : (previewItem?.rotation ?? 0);

  return (
    <>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[offset.cx, 0.001, offset.cz]}
        onPointerMove={onMove}
        onClick={onClick}
      >
        <planeGeometry args={[600, 600]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {world && (
        <group position={[world.x, previewY, world.y]} rotation={[0, yawOf(previewRotation), 0]}>
          <FixtureBody shape={spec.shape} colorHex={kelvinToColor(DEFAULT_FIXTURE_COLOR_K)} opacity={0.55} />
        </group>
      )}
    </>
  );
}

export function FixtureLayer({ scene, offset }: {
  scene: Scene;
  offset: { cx: number; cz: number };
}) {
  const rooms = useMemo(() => eligibleLitRooms(scene), [scene]);
  return (
    <group>
      {(scene.fixtures ?? []).map((item) => (
        <FixtureItemView key={item.id} item={item} offset={offset} rooms={rooms} />
      ))}
      <PlacementGhost offset={offset} rooms={rooms} />
    </group>
  );
}
