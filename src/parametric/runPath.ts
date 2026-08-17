// Kitchen v2.1 path model: an L/U run is ONE item whose geometry unrolls
// from a leg path. Pure math shared by the builders (kitchenBase/kitchenWall),
// the attachment engine (kitchenAttach), the resize handles (RunHandles) and
// the ghost→item conversion (legsToSpec). No THREE, no React.
//
// Item-local frame: x = leg 0 tangent, z = leg 0 front (toward the room),
// origin at leg 0's CENTER (so a plain straight run is exactly the pre-path
// item). A leg's back line lies at the cabinets' wall side; leg i>0 starts AT
// the corner point and its `len` includes the corner square (depth d), with
// cabinets occupying [d, len]. Path distance `off + u` is what
// FurnitureItem.attach.along and ParametricSpec.cutouts[].along measure.

import type { FurnitureItem, ParametricSpec } from "@/schema/scene";

export interface RunLeg {
  sx: number; // back-line start, item-local x
  sz: number; // back-line start, item-local z
  dx: number; // unit travel direction
  dz: number;
  fx: number; // unit front normal (toward the room this leg faces)
  fz: number;
  len: number; // back-edge length (leg i>0 includes the leading corner depth)
  off: number; // cumulative path distance at this leg's start
}

export function pathLegs(spec: ParametricSpec): RunLeg[] {
  const { w, d } = spec.dims;
  const s0 = spec.legDir ?? 1;
  const legs: RunLeg[] = [
    { sx: -s0 * (w / 2), sz: -d / 2, dx: s0, dz: 0, fx: 0, fz: 1, len: w, off: 0 },
  ];
  for (const e of spec.extraLegs ?? []) {
    const p = legs[legs.length - 1];
    const t = e.turn;
    legs.push({
      sx: p.sx + p.dx * p.len,
      sz: p.sz + p.dz * p.len,
      dx: -t * p.dz,
      dz: t * p.dx,
      fx: -t * p.fz,
      fz: t * p.fx,
      len: d + e.w,
      off: p.off + p.len,
    });
  }
  return legs;
}

/**
 * Where to put a leg's cabinet row, and which way to turn it.
 *
 * A row is built with its length along local +x and its DEPTH along local +z,
 * so the yaw has to be the one that sends +z to the leg's front normal. Both
 * builders used to derive it from the leg's travel direction instead —
 * `atan2(-leg.dz, leg.dx)` — which is the same angle for every leg except one:
 * leg 0 of a run drawn BACKWARDS along its wall. `pathLegs` hard-codes leg 0's
 * front to (0, 1) whatever `legDir` says, so with legDir = -1 the (travel,
 * front) pair is left-handed, and no single yaw can satisfy both axes. Taking
 * the yaw from travel put the cabinets on the far side of the wall while the
 * countertop — built straight from `f` — stayed on the correct side.
 *
 * Fixing the depth axis flips which way local +x runs, so the row also has to
 * grow from the other end of its span. The result is identical for a
 * right-handed leg and mirrored (correctly) for the left-handed one.
 */
export function rowPlacement(
  leg: RunLeg,
  lead: number,
  trail: number,
): { x: number; z: number; yaw: number } {
  const yaw = Math.atan2(leg.fx, leg.fz); // local +z → (fx, fz)
  // …which sends local +x to (fz, -fx). Does that run along the leg or against it?
  const forward = leg.fz * leg.dx - leg.fx * leg.dz >= 0;
  const at = forward ? lead : leg.len - trail;
  return { x: leg.sx + leg.dx * at, z: leg.sz + leg.dz * at, yaw };
}

export function pathLength(spec: ParametricSpec): number {
  const legs = pathLegs(spec);
  const last = legs[legs.length - 1];
  return last.off + last.len;
}

/** Item-local point → plan world, using the item's pose. Matches the
 *  viewer's (x, y)→(x, 0, y) mapping and yawOf(-rotation) convention. */
export function runLocalToWorld(
  item: Pick<FurnitureItem, "x" | "y" | "rotation">,
  p: { x: number; z: number },
): { x: number; y: number } {
  const c = Math.cos(item.rotation);
  const s = Math.sin(item.rotation);
  return { x: item.x + p.x * c - p.z * s, y: item.y + p.x * s + p.z * c };
}

export function runWorldToLocal(
  item: Pick<FurnitureItem, "x" | "y" | "rotation">,
  p: { x: number; y: number },
): { x: number; z: number } {
  const c = Math.cos(item.rotation);
  const s = Math.sin(item.rotation);
  const dx = p.x - item.x;
  const dy = p.y - item.y;
  return { x: dx * c + dy * s, z: -dx * s + dy * c };
}

/** The leg a path distance falls on (clamped to the path). */
export function legAtAlong(legs: RunLeg[], along: number): { leg: RunLeg; u: number } {
  for (let i = legs.length - 1; i >= 0; i--) {
    if (along >= legs[i].off) {
      return { leg: legs[i], u: Math.min(Math.max(along - legs[i].off, 0), legs[i].len) };
    }
  }
  return { leg: legs[0], u: 0 };
}

/** Intervals of `along` where an item of width `itemW` may center: each
 *  leg's cabinet span shrunk by half the item, corners excluded. */
export function alongIntervals(spec: ParametricSpec, itemW: number): { lo: number; hi: number }[] {
  const d = spec.dims.d;
  const legs = pathLegs(spec);
  const out: { lo: number; hi: number }[] = [];
  for (let i = 0; i < legs.length; i++) {
    const lead = i > 0 ? d : 0; // corner square at this leg's start
    const trail = i < legs.length - 1 ? d : 0; // next corner eats this leg's end
    const lo = legs[i].off + lead + itemW / 2;
    const hi = legs[i].off + legs[i].len - trail - itemW / 2;
    if (hi >= lo) out.push({ lo, hi });
  }
  // A path too tight for the item: allow the center of leg 0's span anyway.
  if (out.length === 0) {
    const mid = legs[0].off + legs[0].len / 2;
    out.push({ lo: mid, hi: mid });
  }
  return out;
}

/** Clamp a path distance into the nearest valid interval. */
export function clampAlongToPath(spec: ParametricSpec, along: number, itemW: number): number {
  const ivs = alongIntervals(spec, itemW);
  let best = ivs[0].lo;
  let bestDist = Infinity;
  for (const iv of ivs) {
    const v = Math.min(Math.max(along, iv.lo), iv.hi);
    const dist = Math.abs(v - along);
    if (dist < bestDist) {
      bestDist = dist;
      best = v;
    }
  }
  return best;
}

/** One leg of a drawn ghost run, in plan world coordinates. */
export interface WorldLeg {
  x: number;
  y: number;
  rotation: number; // yaw encoding the wall normal (front toward the room)
  w: number; // cabinet span of this leg
  dir: number; // travel: +1 along the wall's a→b tangent, -1 against it
}

/**
 * Ghost legs → ONE multi-leg spec + pose. Leg 0 fixes the item's pose;
 * later legs become extraLegs with turns measured in the item's own frame
 * (so both room-winding directions come out right).
 */
export function legsToSpec(
  legs: WorldLeg[],
  base: ParametricSpec,
): { x: number; y: number; rotation: number; spec: ParametricSpec } {
  const first = legs[0];
  const spec: ParametricSpec = { ...base, dims: { ...base.dims, w: first.w } };
  delete spec.extraLegs;
  delete spec.legDir;
  if (legs.length > 1) {
    const c = Math.cos(first.rotation);
    const s = Math.sin(first.rotation);
    // World travel dir of leg i → item-local (x, z).
    const localDir = (leg: WorldLeg): { x: number; z: number } => {
      const wx = Math.cos(leg.rotation) * leg.dir;
      const wy = Math.sin(leg.rotation) * leg.dir;
      return { x: wx * c + wy * s, z: -wx * s + wy * c };
    };
    const extras: { turn: 1 | -1; w: number }[] = [];
    let prev = localDir(first);
    for (let i = 1; i < legs.length; i++) {
      const cur = localDir(legs[i]);
      const cross = prev.x * cur.z - prev.z * cur.x;
      extras.push({ turn: cross >= 0 ? 1 : -1, w: legs[i].w });
      prev = cur;
    }
    spec.extraLegs = extras;
    if (first.dir < 0) spec.legDir = -1;
  }
  return { x: first.x, y: first.y, rotation: first.rotation, spec };
}
