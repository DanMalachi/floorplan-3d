// Plan-space collision for furniture: rotated-rectangle (OBB) intersection
// via the separating axis theorem. Everything is 2D — Sims-accurate and cheap.

import type { FurnitureItem, ParametricSpec, Scene } from "@/schema/scene";
import { DEFAULT_THICKNESS } from "@/schema/constants";
import { specOf } from "@/furniture/spec";

export interface OBB {
  cx: number;
  cy: number;
  w: number; // extent along local X
  d: number; // extent along local Y (plan)
  angle: number; // radians
}

/** The 4 corners of an OBB in plan space. */
function corners(o: OBB): [number, number][] {
  const c = Math.cos(o.angle);
  const s = Math.sin(o.angle);
  const hw = o.w / 2;
  const hd = o.d / 2;
  const pts: [number, number][] = [];
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    pts.push([o.cx + c * hw * sx - s * hd * sy, o.cy + s * hw * sx + c * hd * sy]);
  }
  return pts;
}

/**
 * Overlap, in metres, that two rectangles must share before they count as
 * colliding. Touching is not colliding: a cabinet snapped flush to a wall sits
 * with its back face exactly ON that wall's face, so the projections meet at a
 * single value and a strict `<` test found no separating axis — a correctly
 * placed run reported a collision and glowed red for as long as it existed.
 * A millimetre is far below any real overlap and far above float noise.
 */
const TOUCH_EPS = 1e-3;

/** Separating axis test between two rotated rectangles. */
export function obbIntersects(a: OBB, b: OBB): boolean {
  const pa = corners(a);
  const pb = corners(b);
  // Candidate axes: each rect's two edge normals.
  const axes: [number, number][] = [
    [Math.cos(a.angle), Math.sin(a.angle)],
    [-Math.sin(a.angle), Math.cos(a.angle)],
    [Math.cos(b.angle), Math.sin(b.angle)],
    [-Math.sin(b.angle), Math.cos(b.angle)],
  ];
  for (const [ax, ay] of axes) {
    let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
    for (const [x, y] of pa) {
      const p = x * ax + y * ay;
      aMin = Math.min(aMin, p);
      aMax = Math.max(aMax, p);
    }
    for (const [x, y] of pb) {
      const p = x * ax + y * ay;
      bMin = Math.min(bMin, p);
      bMax = Math.max(bMax, p);
    }
    // Found a separating axis (they touch, or are apart, on this one).
    if (aMax - bMin < TOUCH_EPS || bMax - aMin < TOUCH_EPS) return false;
  }
  return true;
}

/** This item's plan OBB, from its catalog footprint. */
export function furnitureOBB(item: Pick<FurnitureItem, "assetId" | "parametric" | "x" | "y" | "rotation">): OBB | null {
  const spec = specOf(item);
  if (!spec) return null;
  return { cx: item.x, cy: item.y, w: spec.footprint.w, d: spec.footprint.d, angle: item.rotation };
}

/** All walls of the scene as plan OBBs. */
export function wallOBBs(scene: Scene): OBB[] {
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  const out: OBB[] = [];
  for (const w of scene.walls) {
    const a = nodes.get(w.a);
    const b = nodes.get(w.b);
    if (!a || !b) continue;
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1e-6) continue;
    out.push({
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      w: L,
      d: w.thickness ?? DEFAULT_THICKNESS,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    });
  }
  return out;
}

/**
 * Does this placement collide with a wall or another furniture piece?
 * Rugs (`noCollide`) neither block nor get blocked.
 */
export function placementCollides(
  item: Pick<FurnitureItem, "id" | "assetId" | "parametric" | "x" | "y" | "rotation">,
  scene: Scene,
  walls?: OBB[], // pass precomputed OBBs during drags
): boolean {
  const spec = specOf(item);
  if (!spec || spec.noCollide) return false;
  const me = furnitureOBB(item);
  if (!me) return false;
  for (const w of walls ?? wallOBBs(scene)) {
    if (obbIntersects(me, w)) return true;
  }
  for (const other of scene.furniture) {
    if (other.id === item.id) continue;
    if (specOf(other)?.noCollide) continue;
    const ob = furnitureOBB(other);
    if (ob && obbIntersects(me, ob)) return true;
  }
  return false;
}

export interface WallSnapResult {
  x: number;
  y: number;
  rotation: number;
}

/**
 * Back-to-wall magnetism: if the item's BACK is within `range` of a wall's
 * face, align it (-Z side) flush against that face, facing into the room.
 * Returns null when no wall is near.
 *
 * The measure is back-to-face, not centre-to-centerline: measuring from the
 * centerline made the magnet weaker by half a wall thickness, so a 60cm-deep
 * cabinet could not stay stuck to a 30cm wall at all — its flush position was
 * already outside the old range.
 */
export function snapToWall(
  item: { assetId: string; parametric?: ParametricSpec; x: number; y: number },
  scene: Scene,
  range = 0.25,
): WallSnapResult | null {
  const spec = specOf(item);
  if (!spec?.wallSnap) return null;
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  let best: { dist: number; res: WallSnapResult } | null = null;
  for (const w of scene.walls) {
    const a = nodes.get(w.a);
    const b = nodes.get(w.b);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy);
    if (L < 1e-6) continue;
    const ux = dx / L;
    const uy = dy / L;
    // Project center onto the wall segment.
    const t = (item.x - a.x) * ux + (item.y - a.y) * uy;
    if (t < 0 || t > L) continue;
    const px = a.x + ux * t;
    const py = a.y + uy * t;
    // Signed side: normal (-uy, ux).
    const side = (item.x - px) * -uy + (item.y - py) * ux;
    if (Math.abs(side) < 1e-9) continue;
    const sign = Math.sign(side);
    const nx = -uy * sign; // wall normal pointing toward the item
    const ny = ux * sign;
    const th = w.thickness ?? DEFAULT_THICKNESS;
    const off = th / 2 + spec.footprint.d / 2;
    // Gap between the item's back and this wall's face (negative = the item
    // is overlapping the wall, which also snaps — it pops back out flush).
    const dist = Math.abs(Math.abs(side) - off);
    if (Math.abs(side) - off > range) continue;
    const res: WallSnapResult = {
      x: px + nx * off,
      y: py + ny * off,
      // Face into the room: plan front dir is (-sin θ, cos θ); set it to n.
      rotation: Math.atan2(-nx, ny),
    };
    if (!best || dist < best.dist) best = { dist, res };
  }
  return best?.res ?? null;
}
