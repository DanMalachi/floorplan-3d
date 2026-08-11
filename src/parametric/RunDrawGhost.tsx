"use client";

// Run-draw placement for kitchenBase/kitchenWall (docs/parametric-furniture.md
// R3, reworked for Kitchen v2.1). Click-drag-click; the chain turns corners
// into an L or U and commits as ONE multi-leg item. While drawing, the ghost
// is a lightweight MASSING preview (2 boxes per leg) — the full cabinet model
// used to rebuild ~50 meshes per 10cm of drag and made the tool crawl.
//
// kitchenBase draws on the floor against walls; kitchenWall draws ON THE
// WALL — the cursor is a wall-face raycast (wallRay.ts), the anchor click
// fixes the mounting height from where you point, and the wall grid is shown.
// The floor plays no part in wall-cabinet placement.

import { useEffect, useState } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { Node, Scene, Wall } from "@/schema/scene";
import { DEFAULT_THICKNESS, WALL_HEIGHT } from "@/schema/constants";
import { useSceneStore } from "@/store/useSceneStore";
import { pdToast } from "@/ui/planDock/toast";
import { GENERATORS } from "@/parametric";
import type { ParametricSpec } from "@/schema/scene";
import { type WorldLeg } from "./runPath";
import { rayToWall } from "./wallRay";
import { WallSurfaceGrid } from "@/viewport3d/SnapGridViz";
import { ACCENT } from "@/viewport3d/WallMesh";
import { PLINTH_H } from "./parts";

const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const START_RANGE = 0.45;
const CORNER_OVERSHOOT = 0.25;
const CORNER_ANGLE_MIN = (80 * Math.PI) / 180;
const CORNER_ANGLE_MAX = (100 * Math.PI) / 180;
const LEN_STEP = 0.1;
const yawOf = (rotation: number) => -rotation;

function rayToPlan(e: ThreeEvent<PointerEvent | MouseEvent>, offset: { cx: number; cz: number }) {
  const hit = new THREE.Vector3();
  if (!e.ray.intersectPlane(FLOOR_PLANE, hit)) return null;
  return { x: hit.x + offset.cx, y: hit.z + offset.cz };
}

const roundTo = (v: number, step: number) => Math.round(v / step) * step;

interface WallHit {
  wall: Wall;
  a: Node;
  b: Node;
  ux: number;
  uy: number;
  nx: number;
  ny: number;
  off: number; // flush distance from the wall centerline, toward this hit's side
}

function projectOnWall(x: number, y: number, a: Node, b: Node) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1e-6;
  const ux = dx / L;
  const uy = dy / L;
  const t = (x - a.x) * ux + (y - a.y) * uy;
  const px = a.x + ux * t;
  const py = a.y + uy * t;
  const side = (x - px) * -uy + (y - py) * ux;
  return { ux, uy, t, L, side };
}

function wallHit(wall: Wall, a: Node, b: Node, refX: number, refY: number, depth: number): WallHit {
  const { ux, uy, side } = projectOnWall(refX, refY, a, b);
  const sign = Math.sign(side) || 1;
  const nx = -uy * sign;
  const ny = ux * sign;
  const th = wall.thickness ?? DEFAULT_THICKNESS;
  return { wall, a, b, ux, uy, nx, ny, off: th / 2 + depth / 2 };
}

function alongWallNode(hit: WallHit, node: Node): number {
  return (node.x - hit.a.x) * hit.ux + (node.y - hit.a.y) * hit.uy;
}

/** Nearest real wall within `range`, oriented so its normal points toward
 *  (refX, refY) — same math as collision.ts's snapToWall, plus the wall/node
 *  identity snapToWall doesn't expose (needed here for corner detection). */
export function findNearestWall(x: number, y: number, scene: Scene, depth: number, range = START_RANGE): WallHit | null {
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  let best: { hit: WallHit; dist: number } | null = null;
  for (const w of scene.walls) {
    if (w.kind === "rail" || w.kind === "portal") continue;
    const a = nodes.get(w.a);
    const b = nodes.get(w.b);
    if (!a || !b) continue;
    const { t, L, side } = projectOnWall(x, y, a, b);
    if (t < 0 || t > L) continue;
    const dist = Math.abs(side);
    if (dist > range) continue;
    if (best && dist >= best.dist) continue;
    best = { hit: wallHit(w, a, b, x, y, depth), dist };
  }
  return best?.hit ?? null;
}

/** A wall sharing `nodeId` with the current one, continuing within 80-100°
 *  of the incoming direction (i.e. roughly a right-angle corner). */
function findAdjacentWall(
  nodeId: string,
  excludeWallId: string,
  scene: Scene,
  incoming: [number, number],
  refX: number,
  refY: number,
  depth: number,
): { hit: WallHit; dir: number } | null {
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  const [idx, idy] = incoming;
  for (const w of scene.walls) {
    if (w.id === excludeWallId) continue;
    if (w.kind === "rail" || w.kind === "portal") continue;
    if (w.a !== nodeId && w.b !== nodeId) continue;
    const a = nodes.get(w.a);
    const b = nodes.get(w.b);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy);
    if (L < 1e-6) continue;
    const dir = w.a === nodeId ? 1 : -1; // outward from the shared node
    const ox = (dx / L) * dir;
    const oy = (dy / L) * dir;
    const angle = Math.acos(THREE.MathUtils.clamp(idx * ox + idy * oy, -1, 1));
    if (angle < CORNER_ANGLE_MIN || angle > CORNER_ANGLE_MAX) continue;
    return { hit: wallHit(w, a, b, refX, refY, depth), dir };
  }
  return null;
}

type Leg = WorldLeg;

/** `startAlong` and `len` are measured along hit.a→hit.b; `dir` is which way
 *  the leg grows from the anchor (+1 toward b, -1 toward a). */
function legAt(hit: WallHit, startAlong: number, len: number, dir: number): Leg {
  const flushX = hit.a.x + hit.ux * startAlong + hit.nx * hit.off;
  const flushY = hit.a.y + hit.uy * startAlong + hit.ny * hit.off;
  const rotation = Math.atan2(-hit.nx, hit.ny);
  // legsToSpec needs travel relative to the wall's own tangent (cosθ, sinθ),
  // which may be hit.u or its opposite depending on which side we snapped.
  const tx = Math.cos(rotation);
  const travel = (hit.ux * dir) * tx + (hit.uy * dir) * Math.sin(rotation);
  return {
    x: flushX + hit.ux * dir * (len / 2),
    y: flushY + hit.uy * dir * (len / 2),
    rotation,
    w: len,
    dir: travel >= 0 ? 1 : -1,
  };
}

const MAX_LEGS = 3; // straight, L, U

/** One wall the drag chain currently runs along. `len` is set once a segment
 *  has turned its corner and stopped being the live tail. */
export interface ChainSeg {
  hit: WallHit;
  anchor: number; // along hit.a→hit.b where this segment starts
  dir: number; // +1 toward b, -1 toward a; 0 = not resolved yet (fresh anchor)
  len?: number; // fixed length (non-tail segments only)
}

/**
 * Advance the drag chain with the cursor: the TAIL segment grows toward the
 * cursor; passing its wall's far node by CORNER_OVERSHOOT onto a ~right-angle
 * adjacent wall turns the corner and starts a new tail (straight → L → U in
 * one drag). Pulling back behind a corner un-turns it. Stateful on purpose —
 * a U's final cursor projects BACKWARD on the first wall, so the chain must
 * remember corners it passed rather than re-derive everything from the last
 * cursor point. Returns the same array reference when nothing changed.
 */
export function advanceChain(
  chain: ChainSeg[],
  cursor: { x: number; y: number },
  scene: Scene,
  depth: number,
): ChainSeg[] {
  const tail = chain[chain.length - 1];
  const { hit } = tail;
  const alongCursor = (cursor.x - hit.a.x) * hit.ux + (cursor.y - hit.a.y) * hit.uy;
  const dir = tail.dir || (Math.sign(alongCursor - tail.anchor) || 0);
  if (dir === 0) return chain;
  const rawLen = (alongCursor - tail.anchor) * dir;

  // Retreat: cursor pulled back behind this segment's start — un-turn.
  if (chain.length > 1 && rawLen < -0.1) {
    return advanceChain(chain.slice(0, -1), cursor, scene, depth);
  }

  const node = dir > 0 ? hit.b : hit.a;
  const distToNode = Math.abs(alongWallNode(hit, node) - tail.anchor);
  // Turn test: the drag has (nearly) reached this wall's far node AND has
  // made real progress along the adjacent wall. Progress is measured on the
  // NEXT wall, not as overshoot on the current one — a cursor following the
  // next wall stops advancing on the current wall's axis entirely.
  if (rawLen > distToNode - 0.35 && chain.length < MAX_LEGS) {
    const incoming: [number, number] = [hit.ux * dir, hit.uy * dir];
    const adj = findAdjacentWall(node.id, hit.wall.id, scene, incoming, cursor.x, cursor.y, depth);
    if (adj) {
      const prog =
        (cursor.x - node.x) * adj.hit.ux * adj.dir + (cursor.y - node.y) * adj.hit.uy * adj.dir;
      if (prog > CORNER_OVERSHOOT) {
        const fixed: ChainSeg = { ...tail, dir, len: Math.max(roundTo(distToNode, LEN_STEP), 0.01) };
        const next: ChainSeg = {
          hit: adj.hit,
          // New leg starts inset from the corner by the run's own depth
          // (carcass butt joint — footprints meet edge-to-edge, no mitre).
          anchor: alongWallNode(adj.hit, node) + adj.dir * depth,
          dir: adj.dir,
        };
        return advanceChain([...chain.slice(0, -1), fixed, next], cursor, scene, depth);
      }
    }
  }
  if (dir !== tail.dir) return [...chain.slice(0, -1), { ...tail, dir }];
  return chain;
}

/** Legs the chain currently spans: fixed segments at their stored length,
 *  the tail growing toward the cursor (clamped to its wall unless it is the
 *  chain's only hope of a straight overrun). Widths are NOT clamped to
 *  dimLimits here — the ghost shows the raw drag; clamping happens at
 *  commit. */
export function chainLegs(chain: ChainSeg[], cursor: { x: number; y: number }): Leg[] {
  const legs: Leg[] = [];
  for (let i = 0; i < chain.length; i++) {
    const seg = chain[i];
    if (seg.len !== undefined) {
      legs.push(legAt(seg.hit, seg.anchor, seg.len, seg.dir || 1));
      continue;
    }
    const { hit } = seg;
    const alongCursor = (cursor.x - hit.a.x) * hit.ux + (cursor.y - hit.a.y) * hit.uy;
    const dir = seg.dir || (Math.sign(alongCursor - seg.anchor) || 1);
    const rawLen = Math.max(0, (alongCursor - seg.anchor) * dir);
    const node = dir > 0 ? hit.b : hit.a;
    const distToNode = Math.abs(alongWallNode(hit, node) - seg.anchor);
    // The tail may run past its wall's end only while it's a single straight
    // run (no corner turned) — matches the pre-chain behavior.
    const len = chain.length > 1 ? Math.min(rawLen, distToNode) : rawLen;
    legs.push(legAt(hit, seg.anchor, Math.max(roundTo(len, LEN_STEP), 0.01), dir));
  }
  return legs;
}

export function RunDrawGhost({ offset }: { offset: { cx: number; cz: number } }) {
  const placingRun = useSceneStore((s) => s.placingRun);
  const [chain, setChain] = useState<ChainSeg[] | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [anchorElev, setAnchorElev] = useState<number | null>(null);
  const [activeWall, setActiveWall] = useState<{ wallId: string; side: "a" | "b" } | null>(null);

  useEffect(() => {
    if (!placingRun) {
      setChain(null);
      setCursor(null);
      setAnchorElev(null);
      setActiveWall(null);
      return;
    }
    // Capture-phase, same reasoning as WallTool: Viewport's own key handler
    // stops Escape from bubbling once it's handled something.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (chain) {
        setChain(null); // first Esc: drop the in-progress run, stay armed
        setAnchorElev(null);
      } else useSceneStore.getState().setPlacingRun(null); // second Esc: drop the tool
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [placingRun, chain]);

  if (!placingRun) return null;
  const { generator, spec } = placingRun;
  const depth = spec.dims.d;
  const onTheWall = generator === "kitchenWall";
  const wLimits = GENERATORS[generator].dimLimits.w;

  /** The drag point driving the chain: kitchenBase reads the floor plane;
   *  kitchenWall reads the WALL FACE the pointer is on — the floor has no
   *  say in wall-cabinet placement. The wall hit's plan point sits exactly
   *  on the face, so the same chain math serves both modes. */
  const dragPoint = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    if (!onTheWall) return { p: rayToPlan(e, offset), height: null as number | null };
    const hit = rayToWall(e.ray, useSceneStore.getState().scene, offset);
    if (!hit) return { p: null, height: null };
    setActiveWall((cur) =>
      cur?.wallId === hit.wallId && cur.side === hit.side ? cur : { wallId: hit.wallId, side: hit.side },
    );
    return { p: { x: hit.x, y: hit.y }, height: hit.height };
  };

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const { p } = dragPoint(e);
    if (!p) return;
    setCursor(p);
    if (chain) {
      // Corners are consumed/un-consumed as the cursor passes them — the
      // chain is drag STATE, not a pure function of the last point (a U's
      // endpoint projects backward on wall #1).
      const adv = advanceChain(chain, p, useSceneStore.getState().scene, depth);
      if (adv !== chain) setChain(adv);
    }
  };

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const { p, height } = dragPoint(e);
    if (!p) {
      if (onTheWall) pdToast("Point at a wall");
      return;
    }
    const scene = useSceneStore.getState().scene;

    if (!chain) {
      const hit = findNearestWall(p.x, p.y, scene, depth, onTheWall ? 0.6 : START_RANGE);
      if (!hit) {
        pdToast(onTheWall ? "Point at a wall" : "Start against a wall");
        return;
      }
      const along = (p.x - hit.a.x) * hit.ux + (p.y - hit.a.y) * hit.uy;
      setChain([{ hit, anchor: along, dir: 0 }]);
      if (onTheWall && height !== null) {
        // The anchor click fixes the mounting height: cabinets center on
        // where you pointed, snapped to the wall grid.
        const elev = roundTo(height - spec.dims.h / 2, LEN_STEP);
        setAnchorElev(THREE.MathUtils.clamp(elev, 0.3, WALL_HEIGHT - spec.dims.h - 0.05));
      }
      return;
    }

    const raw = chainLegs(advanceChain(chain, p, scene, depth), p);
    // First leg always commits (clamped up to min width); later legs only
    // if they actually reached a placeable width.
    const legs: Leg[] = raw
      .filter((leg, i) => i === 0 || leg.w >= wLimits[0])
      .map((leg) => ({ ...leg, w: THREE.MathUtils.clamp(leg.w, wLimits[0], wLimits[1]) }));
    useSceneStore.getState().placeKitchenRun(legs, anchorElev ?? undefined);
    useSceneStore.getState().setPlacingRun(null);
  };

  const scene = useSceneStore.getState().scene;
  let legs: Leg[] = [];
  if (!chain) {
    if (cursor) {
      const hit = findNearestWall(cursor.x, cursor.y, scene, depth, onTheWall ? 0.6 : START_RANGE);
      if (hit) {
        const along = (cursor.x - hit.a.x) * hit.ux + (cursor.y - hit.a.y) * hit.uy;
        legs = [legAt(hit, along - 0.5, 1, 1)];
      }
    }
  } else if (cursor) {
    legs = chainLegs(chain, cursor);
  }
  const elev = anchorElev ?? GENERATORS[generator].defaultElevation ?? 0;

  return (
    <>
      {/* Catch-all ground plane: drives the ghost and takes the place clicks.
          In wall mode the RAY is what matters (dragPoint intersects wall
          faces), so a floor-plane event surface still works fine. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[offset.cx, 0.001, offset.cz]}
        onPointerMove={onMove}
        onClick={onClick}
      >
        <planeGeometry args={[600, 600]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* The wall grid the wall-cabinet run is snapping to. */}
      {onTheWall && activeWall && (
        <WallSurfaceGrid scene={scene} wallId={activeWall.wallId} side={activeWall.side} />
      )}
      <RunMassingGhost legs={legs} spec={spec} base={!onTheWall} elevation={onTheWall ? elev : 0} />
    </>
  );
}

/** Fast placement preview: 2-3 boxes per leg instead of the full cabinet
 *  model (which rebuilt every mesh per 10cm of drag and lagged the tool).
 *  The real model appears on commit. */
function RunMassingGhost({ legs, spec, base, elevation }: {
  legs: Leg[];
  spec: ParametricSpec;
  base: boolean; // kitchenBase: body to counter height + slab; wall cabs: one box at elevation
  elevation: number;
}) {
  const { d, h } = spec.dims;
  return (
    <>
      {legs.map((leg, i) => (
        <group key={i} position={[leg.x, 0, leg.y]} rotation={[0, yawOf(leg.rotation), 0]}>
          {base ? (
            <>
              <mesh position={[0, (h - 0.04) / 2 + PLINTH_H / 2, 0]}>
                <boxGeometry args={[Math.max(leg.w, 0.05), Math.max(h - 0.04 - PLINTH_H, 0.1), d]} />
                <meshStandardMaterial color="#cfd3d8" transparent opacity={0.4} depthWrite={false} />
              </mesh>
              <mesh position={[0, h - 0.02, 0.02]}>
                <boxGeometry args={[Math.max(leg.w, 0.05), 0.04, d + 0.04]} />
                <meshStandardMaterial color={ACCENT} transparent opacity={0.55} depthWrite={false} />
              </mesh>
            </>
          ) : (
            <mesh position={[0, elevation + h / 2, 0]}>
              <boxGeometry args={[Math.max(leg.w, 0.05), h, d]} />
              <meshStandardMaterial color={ACCENT} transparent opacity={0.45} depthWrite={false} />
            </mesh>
          )}
        </group>
      ))}
    </>
  );
}
