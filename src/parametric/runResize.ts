// Resize math for a kitchen run's end handles. Pure: baseline pose + cursor in,
// patch out. No THREE, no React, no store.
//
// It lives outside the component because of the bug it was extracted to fix.
// RunHandles used to compute each frame from the item as it stood in the
// CURRENT scene — that is, after the previous frame's `applyKitchenGesture`
// had already re-snapped it to its wall. So the end that is supposed to stay
// planted was re-derived from a pose that had just moved, and it drifted a
// little every frame. Held for a second at 60fps that is dozens of accumulated
// steps, and because a run always belongs to SOME wall, once it had walked far
// enough it re-homed onto a wall in another room.
//
// The cure is the discipline FurnitureLayer already follows: snapshot the
// scene and the item at pointer-down, and make every frame a pure function of
// (baseline, cursor). Then holding still changes nothing, and dragging out and
// back returns exactly where it started. Taking the math out of the component
// is what makes that property testable rather than merely intended.

import type { FurnitureItem, ParametricSpec } from "@/schema/scene";
import { pathLegs, runLocalToWorld } from "./runPath";

export interface RunResize {
  /** Present when this end's movement also moves the item's origin. */
  x?: number;
  y?: number;
  parametric: ParametricSpec;
  /** The resulting leg width, for the drag label. */
  width: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A leg's travel direction in plan-world terms, for the item's own pose. */
export function legWorldDir(
  item: Pick<FurnitureItem, "rotation">,
  leg: { dx: number; dz: number },
): { x: number; y: number } {
  const c = Math.cos(item.rotation);
  const s = Math.sin(item.rotation);
  return { x: leg.dx * c - leg.dz * s, y: leg.dx * s + leg.dz * c };
}

/**
 * Where the run ends up when the handle at `end` is dragged to `cursor`.
 *
 * `item` MUST be the baseline captured at pointer-down, never the live one —
 * see the note at the top of this file.
 *
 *   end = -1  the path's start: leg 0 grows backwards, its far end planted
 *   end = +1  the path's end: the last leg grows forwards, its start planted
 *
 * `step` is the along-wall quantisation (the kitchen's 10cm grid).
 */
export function resizeRunEnd(
  item: FurnitureItem,
  end: 1 | -1,
  cursor: { x: number; y: number },
  limits: readonly [number, number],
  step = 0.1,
): RunResize {
  const spec = item.parametric!;
  const legs = pathLegs(spec);
  const isLast = end === 1 && legs.length > 1;
  const leg = end === -1 ? legs[0] : legs[legs.length - 1];
  const dir = legWorldDir(item, leg);
  const [lo, hi] = limits;
  const snap = (v: number) => Math.round(v / step) * step;

  if (isLast) {
    // Grow/shrink the LAST leg from its corner; nothing else moves, so there
    // is no x/y in the patch at all.
    const corner = runLocalToWorld(item, { x: leg.sx, z: leg.sz });
    const u = (cursor.x - corner.x) * dir.x + (cursor.y - corner.y) * dir.y;
    const w = clamp(snap(u - spec.dims.d), 0.1, hi);
    const extras = spec.extraLegs!.map((l, i) =>
      i === spec.extraLegs!.length - 1 ? { ...l, w } : l,
    );
    return { parametric: { ...spec, extraLegs: extras }, width: w };
  }

  // Leg 0 changes width, so the item's origin (leg 0's centre) moves with it.
  // The planted point is whichever END of leg 0 this handle is not.
  const plantedLocal =
    end === -1
      ? { x: legs[0].sx + legs[0].dx * legs[0].len, z: legs[0].sz + legs[0].dz * legs[0].len }
      : { x: legs[0].sx, z: legs[0].sz };
  const planted = runLocalToWorld(item, plantedLocal);
  const sign = end === -1 ? -1 : 1;
  const raw = sign * ((cursor.x - planted.x) * dir.x + (cursor.y - planted.y) * dir.y);
  const w = clamp(snap(raw), lo, hi);
  return {
    x: planted.x + sign * dir.x * (w / 2),
    y: planted.y + sign * dir.y * (w / 2),
    parametric: { ...spec, dims: { ...spec.dims, w } },
    width: w,
  };
}
