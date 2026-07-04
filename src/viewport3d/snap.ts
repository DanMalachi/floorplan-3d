// Plan-space snapping shared by 3D drag gestures (and, later, the 2D editor).
// Priority: align with an existing node (returns a visible guide) > grid.
// Holding Shift disables snapping entirely (caller's responsibility).

import type { Node } from "@/schema/scene";
import type { SnapGuide } from "@/store/useSceneStore";

export const GRID = 0.1; // meters
export const ALIGN_TOL = 0.15; // meters — generous, Sims-style magnetic feel

export interface SnappedPoint {
  x: number;
  y: number;
  guides: SnapGuide[];
}

const roundTo = (v: number, step: number) => Math.round(v / step) * step;

/**
 * Snap a plan point: each axis independently prefers alignment with another
 * node's coordinate (emitting a guide line), else falls back to the grid.
 */
export function snapPlanPoint(
  x: number,
  y: number,
  nodes: Node[],
  excludeIds: ReadonlySet<string>,
): SnappedPoint {
  const guides: SnapGuide[] = [];
  let bx: { v: number; d: number } | null = null;
  let by: { v: number; d: number } | null = null;
  for (const n of nodes) {
    if (excludeIds.has(n.id)) continue;
    const dxv = Math.abs(n.x - x);
    if (dxv <= ALIGN_TOL && (!bx || dxv < bx.d)) bx = { v: n.x, d: dxv };
    const dyv = Math.abs(n.y - y);
    if (dyv <= ALIGN_TOL && (!by || dyv < by.d)) by = { v: n.y, d: dyv };
  }
  const sx = bx ? bx.v : roundTo(x, GRID);
  const sy = by ? by.v : roundTo(y, GRID);
  if (bx) guides.push({ axis: "x", value: bx.v });
  if (by) guides.push({ axis: "y", value: by.v });
  return { x: sx, y: sy, guides };
}

/** Snap a scalar drag distance (wall-normal translation) to the grid. */
export function snapDelta(d: number): number {
  return roundTo(d, GRID);
}
