"use client";

// Run-draw placement for kitchenBase/kitchenWall (docs/parametric-furniture.md
// R3, reworked for Kitchen v2.1). Click-drag-click; the chain turns corners
// into an L or U and commits as ONE multi-leg item. While drawing, the ghost
// is a lightweight MASSING preview (boxes, no doors/handles) — the full
// cabinet model used to rebuild ~50 meshes per 10cm of drag and made the tool
// crawl. The ghost is built from the SAME spec the click will commit
// (legsToSpec → pathLegs), so what you see is what you get.
//
// Everything here works off wall FACES, never wall centerlines: the cursor is
// a wall-face raycast whenever the pointer is over a wall (pointing at a wall
// used to project through it onto the floor BEHIND it, which latched runs to
// the exterior side), latch ranges are measured from the face, and a leg that
// ends in a corner ends at the crossing wall's FACE — half a wall thickness
// matters on a 30cm wall.
//
// kitchenBase draws on the floor against walls; kitchenWall draws ON THE
// WALL — the anchor click fixes the mounting height from where you point,
// and the wall grid is shown. The floor plays no part in wall-cabinet
// placement.

import { useEffect, useState } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { Node, Scene, Wall } from "@/schema/scene";
import { DEFAULT_THICKNESS, WALL_HEIGHT } from "@/schema/constants";
import { useSceneStore } from "@/store/useSceneStore";
import { pdToast } from "@/ui/planDock/toast";
import { GENERATORS, elevationOf } from "@/parametric";
import type { ParametricSpec } from "@/schema/scene";
import { legsToSpec, pathLegs, type WorldLeg } from "./runPath";
import { rayToWall, roomFacingSide } from "./wallRay";
import { WallSurfaceGrid } from "@/viewport3d/SnapGridViz";
import { ACCENT } from "@/viewport3d/WallMesh";
import { PLINTH_H } from "./parts";

const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const START_RANGE = 0.45; // from the wall FACE
const CORNER_OVERSHOOT = 0.25;
// The path model encodes exact right angles (extraLegs turn ±90°), so only a
// square-enough corner may turn — a 10° error would commit a leg that misses
// its wall by 17cm per metre.
const CORNER_ANGLE_MIN = (85 * Math.PI) / 180;
const CORNER_ANGLE_MAX = (95 * Math.PI) / 180;
const CORNER_SLACK = 0.35; // how close to the corner the drag must get to turn
const DIR_DEADZONE = 0.08; // jitter that must not lock the drag direction
// How far behind its own start a tail may sit before it counts as a retreat.
const RETREAT_SLACK = 0.1;
const COLLINEAR_DOT = 0.94; // ~20°: a straight continuation, not a corner
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

/** A hit on a known side of a wall: `sign` +1 = the (-uy, ux) face ("a" in
 *  wallRay's convention), -1 = the other one. */
function wallHitOn(wall: Wall, a: Node, b: Node, sign: number, depth: number): WallHit {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1e-6;
  const ux = dx / L;
  const uy = dy / L;
  const th = wall.thickness ?? DEFAULT_THICKNESS;
  return { wall, a, b, ux, uy, nx: -uy * sign, ny: ux * sign, off: th / 2 + depth / 2 };
}

function wallHit(wall: Wall, a: Node, b: Node, refX: number, refY: number, depth: number): WallHit {
  const { side } = projectOnWall(refX, refY, a, b);
  return wallHitOn(wall, a, b, Math.sign(side) || 1, depth);
}

function alongWallNode(hit: WallHit, node: Node): number {
  return (node.x - hit.a.x) * hit.ux + (node.y - hit.a.y) * hit.uy;
}

const isSolid = (w: Wall) => w.kind !== "rail" && w.kind !== "portal";

/**
 * Where a wall's usable FACE ends at `node` — the real end of the surface a
 * run can sit against, which is NOT the node. `inset` is positive when
 * another wall turns INTO the run's side (its face crosses ours th/2 before
 * the node at a right angle, more at a slant) and negative when it turns away
 * (our face carries on around the outside corner). `blocked` is false at a
 * free end or a straight continuation, where a run may simply keep going.
 */
function faceSpanEnd(
  scene: Scene,
  wall: Wall,
  node: Node,
  ux: number,
  uy: number,
  nx: number,
  ny: number,
): { inset: number; blocked: boolean } {
  let inset = 0;
  let blocked = false;
  for (const w of scene.walls) {
    if (w.id === wall.id || !isSolid(w)) continue;
    if (w.a !== node.id && w.b !== node.id) continue;
    const other = scene.nodes.find((n) => n.id === (w.a === node.id ? w.b : w.a));
    if (!other) continue;
    const ex = other.x - node.x;
    const ey = other.y - node.y;
    const L = Math.hypot(ex, ey);
    if (L < 1e-6) continue;
    const along = (ex * ux + ey * uy) / L;
    if (Math.abs(along) > COLLINEAR_DOT) continue; // straight continuation
    const across = (ex * nx + ey * ny) / L; // sinθ, signed toward the run's side
    const th = w.thickness ?? DEFAULT_THICKNESS;
    const reach = th / 2 / Math.max(Math.abs(across), 0.25); // faces cross here
    const v = across > 0 ? reach : -reach;
    if (!blocked || v > inset) inset = v;
    blocked = true;
  }
  return { inset, blocked };
}

/** How far a leg anchored at `anchor` may grow before it runs out of wall
 *  face. Infinity at a free end or a straight continuation — a run has always
 *  been allowed to overrun those. */
function usableLen(hit: WallHit, anchor: number, dir: number, scene: Scene): number {
  const node = dir > 0 ? hit.b : hit.a;
  const { inset, blocked } = faceSpanEnd(scene, hit.wall, node, hit.ux, hit.uy, hit.nx, hit.ny);
  if (!blocked) return Infinity;
  return Math.abs(alongWallNode(hit, node) - anchor) - inset;
}

/** Where a click on the wall starts the run: grid-snapped along the wall and
 *  kept inside the face span, so a run started in a corner starts at the
 *  crossing wall's face rather than inside it. */
function anchorAlong(hit: WallHit, x: number, y: number, scene: Scene): number {
  const raw = (x - hit.a.x) * hit.ux + (y - hit.a.y) * hit.uy;
  const L = alongWallNode(hit, hit.b);
  const at = (node: Node) => faceSpanEnd(scene, hit.wall, node, hit.ux, hit.uy, hit.nx, hit.ny);
  const start = at(hit.a);
  const end = at(hit.b);
  const lo = start.blocked ? start.inset : 0;
  const hi = L - (end.blocked ? end.inset : 0);
  return THREE.MathUtils.clamp(roundTo(raw, LEN_STEP), Math.min(lo, hi), Math.max(lo, hi));
}

/** Which way a fresh anchor grows before the drag says otherwise: toward the
 *  end of the wall with more room. The pre-click preview and the first ghost
 *  after the click must agree on this, or the run appears to jump. */
function presumptiveDir(hit: WallHit, anchor: number): number {
  const toB = alongWallNode(hit, hit.b) - anchor;
  const toA = anchor - alongWallNode(hit, hit.a);
  return toB >= toA ? 1 : -1;
}

/** Nearest real wall whose FACE is within `range`, oriented so its normal
 *  points toward (refX, refY). `prefer` is the wall face the pointer ray
 *  actually landed on — no distance test can beat pointing straight at it. */
export function findNearestWall(
  x: number,
  y: number,
  scene: Scene,
  depth: number,
  range = START_RANGE,
  prefer?: { wallId: string; side: "a" | "b" } | null,
): WallHit | null {
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  if (prefer) {
    const w = scene.walls.find((s) => s.id === prefer.wallId);
    const a = w && nodes.get(w.a);
    const b = w && nodes.get(w.b);
    if (w && a && b) return wallHitOn(w, a, b, prefer.side === "a" ? 1 : -1, depth);
  }
  let best: { hit: WallHit; dist: number } | null = null;
  for (const w of scene.walls) {
    if (!isSolid(w)) continue;
    const a = nodes.get(w.a);
    const b = nodes.get(w.b);
    if (!a || !b) continue;
    const { t, L, side } = projectOnWall(x, y, a, b);
    if (t < 0 || t > L) continue;
    // From the FACE: a 30cm wall must not be 15cm harder to latch onto than a
    // 10cm one (and a point ON the face is a perfect hit, distance 0).
    const dist = Math.max(0, Math.abs(side) - (w.thickness ?? DEFAULT_THICKNESS) / 2);
    if (dist > range) continue;
    if (best && dist >= best.dist) continue;
    best = { hit: wallHit(w, a, b, x, y, depth), dist };
  }
  return best?.hit ?? null;
}

/** A wall sharing `nodeId` with the current one, continuing at a square
 *  corner. `refX/refY` must be a point inside the run's own space (not the
 *  cursor, which can be over the far side of the new wall at the moment the
 *  corner turns) so the new leg picks the same room side. */
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
    if (!isSolid(w)) continue;
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
 * cursor; passing its wall's far node onto a square adjacent wall turns the
 * corner and starts a new tail (straight → L → U in one drag). Pulling back
 * behind a corner un-turns it. Stateful on purpose — a U's final cursor
 * projects BACKWARD on the first wall, so the chain must remember corners it
 * passed rather than re-derive everything from the last cursor point. Returns
 * the same array reference when nothing changed.
 */
export function advanceChain(
  chain: ChainSeg[],
  cursor: { x: number; y: number },
  scene: Scene,
  depth: number,
  /** Recursion budget. Turning and un-turning are mutually recursive, so a
   *  geometry the two disagree about must cost a frame, never the stack. */
  steps = 8,
): ChainSeg[] {
  if (steps <= 0) return chain;
  const tail = chain[chain.length - 1];
  const { hit } = tail;
  const alongCursor = (cursor.x - hit.a.x) * hit.ux + (cursor.y - hit.a.y) * hit.uy;
  const delta = alongCursor - tail.anchor;
  // Deadzone: a pixel of jitter at the anchor must not lock the run's
  // direction — until the drag commits to one, the ghost shows the
  // presumptive one.
  const dir = tail.dir || (Math.abs(delta) > DIR_DEADZONE ? Math.sign(delta) : 0);
  if (dir === 0) return chain;
  const rawLen = delta * dir;

  // Retreat: cursor pulled back behind this segment's start — un-turn, and
  // hand the segment before it back to the cursor (dropping its fixed length,
  // or an un-turned U would leave its second leg frozen at full wall length).
  if (chain.length > 1 && rawLen < -RETREAT_SLACK) {
    const { len: _fixed, ...live } = chain[chain.length - 2];
    return advanceChain([...chain.slice(0, -2), live], cursor, scene, depth, steps - 1);
  }

  const node = dir > 0 ? hit.b : hit.a;
  const distToNode = Math.abs(alongWallNode(hit, node) - tail.anchor);
  const { inset } = faceSpanEnd(scene, hit.wall, node, hit.ux, hit.uy, hit.nx, hit.ny);
  const toFace = distToNode - inset; // this leg's length if it ends in the corner
  // Turn test: the drag has (nearly) reached this wall's far node AND has
  // made real progress along the adjacent wall. Progress is measured on the
  // NEXT wall, not as overshoot on the current one — a cursor following the
  // next wall stops advancing on the current wall's axis entirely.
  if (rawLen > toFace - CORNER_SLACK && chain.length < MAX_LEGS) {
    const incoming: [number, number] = [hit.ux * dir, hit.uy * dir];
    // Reference point: on the run itself, one depth back from the corner —
    // inside the room it is being drawn in, and clear of the next wall's
    // centerline (the corner point lies exactly ON it, which resolves to no
    // side at all).
    const refX = node.x + hit.nx * hit.off - hit.ux * dir * depth;
    const refY = node.y + hit.ny * hit.off - hit.uy * dir * depth;
    const adj = findAdjacentWall(node.id, hit.wall.id, scene, incoming, refX, refY, depth);
    if (adj) {
      const prog =
        (cursor.x - node.x) * adj.hit.ux * adj.dir + (cursor.y - node.y) * adj.hit.uy * adj.dir;
      const adjInsetPre = faceSpanEnd(
        scene, adj.hit.wall, node, adj.hit.ux, adj.hit.uy, adj.hit.nx, adj.hit.ny,
      ).inset;
      // The new leg's anchor lands `lead` past the corner, so a cursor short of
      // that is BEHIND its own anchor the instant it is created — which the
      // retreat rule below reads as "un-turn", which turns again, forever. That
      // mutual recursion overflowed the stack and took the whole canvas down
      // mid-drag. Turning only once the cursor has cleared the corner square
      // removes the contradiction instead of refereeing it; the range it now
      // declines to turn in is exactly the range that used to crash.
      const lead = adjInsetPre + depth;
      if (prog > Math.max(CORNER_OVERSHOOT, lead - RETREAT_SLACK)) {
        // NOT grid-rounded: this leg ends where the two wall faces cross, and
        // the committed item hangs its next leg off exactly that point — 5cm
        // of rounding here is 5cm of the next leg buried in the wall.
        const fixed: ChainSeg = { ...tail, dir, len: Math.max(toFace, 0.01) };
        const next: ChainSeg = {
          hit: adj.hit,
          // The new leg's cabinets start one depth past the face corner (the
          // corner square itself belongs to the turn), and the face corner is
          // half THIS wall's thickness along the new one — not the node.
          anchor: alongWallNode(adj.hit, node) + adj.dir * lead,
          dir: adj.dir,
        };
        return advanceChain([...chain.slice(0, -1), fixed, next], cursor, scene, depth, steps - 1);
      }
    }
  }
  if (dir !== tail.dir) return [...chain.slice(0, -1), { ...tail, dir }];
  return chain;
}

/**
 * Legs the chain currently spans: fixed segments at their stored length, the
 * tail growing toward the cursor in 10cm steps and stopping at the end of its
 * wall's face. Leg 0 is clamped to the generator's width limits HERE, before
 * its centre is derived — clamping the width afterwards would leave the box
 * half its own length away from the anchor.
 */
export function chainLegs(
  chain: ChainSeg[],
  cursor: { x: number; y: number },
  scene: Scene,
  limits: readonly [number, number],
): Leg[] {
  const legs: Leg[] = [];
  for (let i = 0; i < chain.length; i++) {
    const seg = chain[i];
    const lo = i === 0 ? limits[0] : 0.01; // later legs are DROPPED below the
    const hi = limits[1]; //                 minimum, not grown into it
    const clampLen = (v: number) => THREE.MathUtils.clamp(v, lo, hi);
    if (seg.len !== undefined) {
      legs.push(legAt(seg.hit, seg.anchor, clampLen(seg.len), seg.dir || 1));
      continue;
    }
    const { hit } = seg;
    const alongCursor = (cursor.x - hit.a.x) * hit.ux + (cursor.y - hit.a.y) * hit.uy;
    const dir = seg.dir || presumptiveDir(hit, seg.anchor);
    const rawLen = Math.max(0, (alongCursor - seg.anchor) * dir);
    const len = Math.min(roundTo(rawLen, LEN_STEP), usableLen(hit, seg.anchor, dir, scene));
    legs.push(legAt(hit, seg.anchor, clampLen(len), dir));
  }
  return legs;
}

/** The 0.6m stub the hover preview shows: exactly the chain a click at this
 *  anchor produces before the drag has moved, so nothing shifts on click. */
function seedLegs(hit: WallHit, anchor: number, scene: Scene, limits: readonly [number, number]): Leg[] {
  const at = { x: hit.a.x + hit.ux * anchor, y: hit.a.y + hit.uy * anchor };
  return chainLegs([{ hit, anchor, dir: 0 }], at, scene, limits);
}

/** What the click will actually build: the first leg always commits, later
 *  legs only once they reach the generator's minimum width. The ghost runs
 *  through this too, so it never shows a run the click won't make. */
export function commitLegs(raw: Leg[], limits: readonly [number, number]): Leg[] {
  return raw.filter((leg, i) => i === 0 || leg.w >= limits[0]);
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

  /** The drag point driving the chain. Whichever mode, a pointer over a wall
   *  reads that WALL FACE (wallRay.ts) — projecting the ray onto the floor
   *  instead lands BEHIND the wall you are pointing at and used to snap base
   *  runs to its exterior side. The floor answers only where no wall does.
   *  The face is then pulled to the side a ROOM is on: from a camera outside
   *  the building the visible face is the exterior one, and cabinets never
   *  belong there. */
  const dragPoint = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const scene0 = useSceneStore.getState().scene;
    const hit = rayToWall(e.ray, scene0, offset, true);
    const face = hit && {
      wallId: hit.wallId,
      side: roomFacingSide(scene0, hit.wallId, hit.x, hit.y, hit.side),
    };
    if (onTheWall) {
      if (!hit) return { p: null, height: null, face: null };
      setActiveWall((cur) =>
        cur?.wallId === hit.wallId && cur.side === hit.side ? cur : face,
      );
      return { p: { x: hit.x, y: hit.y }, height: hit.height, face };
    }
    const floor = rayToPlan(e, offset);
    // Distance to the floor plane along the ray: whichever surface is nearer
    // is the one being pointed at.
    const tFloor = e.ray.direction.y < -1e-6 ? -e.ray.origin.y / e.ray.direction.y : Infinity;
    const useFace = hit !== null && hit.t < tFloor;
    setActiveWall((cur) =>
      useFace
        ? cur?.wallId === hit!.wallId && cur.side === hit!.side ? cur : face
        : cur === null ? cur : null,
    );
    if (useFace) return { p: { x: hit!.x, y: hit!.y }, height: null, face };
    return { p: floor, height: null, face: null };
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
    const { p, height, face } = dragPoint(e);
    if (!p) {
      if (onTheWall) pdToast("Point at a wall");
      return;
    }
    const scene = useSceneStore.getState().scene;

    if (!chain) {
      const hit = findNearestWall(p.x, p.y, scene, depth, onTheWall ? 0.6 : START_RANGE, face);
      if (!hit) {
        pdToast(onTheWall ? "Point at a wall" : "Start against a wall");
        return;
      }
      // Same anchor the hover preview drew, so the run starts exactly where
      // the preview said it would.
      setChain([{ hit, anchor: anchorAlong(hit, p.x, p.y, scene), dir: 0 }]);
      if (onTheWall && height !== null) {
        // The anchor click fixes the mounting height: cabinets center on
        // where you pointed, snapped to the wall grid.
        const elev = roundTo(height - spec.dims.h / 2, LEN_STEP);
        setAnchorElev(THREE.MathUtils.clamp(elev, 0.3, WALL_HEIGHT - spec.dims.h - 0.05));
      }
      return;
    }

    const legs = commitLegs(
      chainLegs(advanceChain(chain, p, scene, depth), p, scene, wLimits),
      wLimits,
    );
    useSceneStore.getState().placeKitchenRun(legs, anchorElev ?? undefined);
    useSceneStore.getState().setPlacingRun(null);
  };

  const scene = useSceneStore.getState().scene;
  let raw: Leg[] = [];
  if (!chain) {
    if (cursor) {
      const hit = findNearestWall(
        cursor.x, cursor.y, scene, depth, onTheWall ? 0.6 : START_RANGE, activeWall,
      );
      // Hover: one minimum-width cabinet STARTING at the anchor the click will
      // use — not a box centered on the cursor, which then jumped half a metre
      // the moment you clicked.
      if (hit) raw = seedLegs(hit, anchorAlong(hit, cursor.x, cursor.y, scene), scene, wLimits);
    }
  } else if (cursor) {
    raw = chainLegs(chain, cursor, scene, wLimits);
  }
  const legs = commitLegs(raw, wLimits);
  const preview = legs.length > 0 ? legsToSpec(legs, spec) : null;
  const elev = anchorElev ?? elevationOf(spec) ?? 0;

  return (
    <>
      {/* Catch-all ground plane: drives the ghost and takes the place clicks.
          The RAY is what matters (dragPoint intersects wall faces first), so a
          floor-plane event surface still works fine in both modes. */}
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
      <RunMassingGhost preview={preview} base={!onTheWall} elevation={onTheWall ? elev : 0} />
    </>
  );
}

/** Fast placement preview: massing boxes instead of the full cabinet model
 *  (which rebuilt every mesh per 10cm of drag and lagged the tool). It is
 *  built from the committed SPEC, so the corner units and the leg the path
 *  model will actually produce are what you see. */
function RunMassingGhost({ preview, base, elevation }: {
  preview: { x: number; y: number; rotation: number; spec: ParametricSpec } | null;
  base: boolean; // kitchenBase: body to counter height + slab; wall cabs: one box at elevation
  elevation: number;
}) {
  if (!preview) return null;
  const { d, h } = preview.spec.dims;
  const legs = pathLegs(preview.spec);
  // Same spans kitchenBase.build() lays out: cabinet row per leg, corner
  // square per turn.
  const boxes: { x: number; z: number; len: number; yaw: number }[] = [];
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const yaw = Math.atan2(-leg.dz, leg.dx);
    const lead = i > 0 ? d : 0;
    const trail = i < legs.length - 1 ? d : 0;
    const span = leg.len - lead - trail;
    if (span > 0.02) {
      const at = lead + span / 2;
      boxes.push({
        x: leg.sx + leg.dx * at + leg.fx * (d / 2),
        z: leg.sz + leg.dz * at + leg.fz * (d / 2),
        len: span,
        yaw,
      });
    }
    if (i > 0) {
      boxes.push({
        x: leg.sx + leg.dx * (d / 2) + leg.fx * (d / 2),
        z: leg.sz + leg.dz * (d / 2) + leg.fz * (d / 2),
        len: d,
        yaw,
      });
    }
  }

  return (
    <group position={[preview.x, 0, preview.y]} rotation={[0, yawOf(preview.rotation), 0]}>
      {boxes.map((b, i) => (
        <group key={i} position={[b.x, 0, b.z]} rotation={[0, b.yaw, 0]}>
          {base ? (
            <>
              <mesh position={[0, (h - 0.04) / 2 + PLINTH_H / 2, 0]}>
                <boxGeometry args={[b.len, Math.max(h - 0.04 - PLINTH_H, 0.1), d]} />
                <meshStandardMaterial color="#cfd3d8" transparent opacity={0.4} depthWrite={false} />
              </mesh>
              <mesh position={[0, h - 0.02, 0.02]}>
                <boxGeometry args={[b.len, 0.04, d + 0.04]} />
                <meshStandardMaterial color={ACCENT} transparent opacity={0.55} depthWrite={false} />
              </mesh>
            </>
          ) : (
            <mesh position={[0, elevation + h / 2, 0]}>
              <boxGeometry args={[b.len, h, d]} />
              <meshStandardMaterial color={ACCENT} transparent opacity={0.45} depthWrite={false} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}
