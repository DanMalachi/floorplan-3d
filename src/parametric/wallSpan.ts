// The straight WALL SURFACE a run can slide along — which is not one `Wall`.
//
// A wall that looks like one unbroken 8m surface is usually several Wall
// records: the tracer mints a node wherever another wall tees in, wherever a
// thickness changes, and wherever the user happened to click. `snapRunToWall`
// clamped a run's centre to [w/2, L - w/2] of a SINGLE record, which produces
// two visible faults on a perfectly straight wall:
//
//   * a dead zone — a 2.4m run on a 4m segment can occupy only 1.6m of it, so
//     the drag stops moving while the cursor keeps going ("I keep hitting a
//     wall"), and
//   * a teleport — once the neighbouring segment finally out-ranks this one,
//     the run jumps the full width of the corner square to the far segment's
//     own clamp limit.
//
// The run should be able to sit anywhere on the straight surface, including
// straddling the joint between two collinear segments. So the clamp has to be
// taken over the maximal chain of connected, collinear, solid walls — and
// stop only where the surface really ends: an outside corner, a free end, or
// another wall turning in on the side the run is standing on.

import type { Node, Scene, Wall } from "@/schema/scene";
import { DEFAULT_THICKNESS } from "@/schema/constants";

/** Two walls are the same surface below this angle. Deliberately tight: after
 *  the Generate square-up a straight wall is collinear to floating-point
 *  exactness, and anything a person would call a corner is far outside it. */
const COLLINEAR_RAD = (3 * Math.PI) / 180;

export interface SpanEnd {
  /** Along-span coordinate of this end of the usable face, measured from
   *  (ax, ay) along (ux, uy). Can lie outside the seed wall entirely. */
  t: number;
  /** The node the surface runs out at, and the wall record that owns it —
   *  what a run needs in order to turn the corner there, which may belong to a
   *  collinear neighbour several segments away rather than the seed wall. */
  node: Node;
  wall: Wall;
}

export interface WallSpan {
  /** Span origin — node `a` of the seed wall, so callers can keep measuring in
   *  the frame they already have. */
  ax: number;
  ay: number;
  ux: number;
  uy: number;
  /** Along-span coordinate of the surface's two ends, measured from (ax, ay)
   *  in the (ux, uy) direction. `lo` is negative when the surface continues
   *  behind the seed wall's node a. */
  lo: number;
  hi: number;
  loEnd: SpanEnd;
  hiEnd: SpanEnd;
}

const isSolid = (w: Wall) => w.kind !== "rail" && w.kind !== "portal";

/**
 * How far the usable face reaches past `node`, continuing in (ux, uy).
 *
 * Returns the along-axis distance to add to the node's own position: 0 at a
 * plain free end, positive where the surface carries on around an outside
 * corner, negative where another wall turns IN on the run's side (its face
 * crosses ours half a thickness early — more at a slant). `null` means the
 * surface continues into a collinear neighbour, which the caller walks into.
 */
function endAt(
  scene: Scene,
  wall: Wall,
  node: Node,
  nodes: ReadonlyMap<string, Node>,
  ux: number,
  uy: number,
  nx: number,
  ny: number,
): { inset: number } | { next: Wall } {
  let continuation: Wall | null = null;
  let inward: number | null = null; // most restrictive wall turning in on our side
  let outward: number | null = null; // furthest the face wraps an outside corner
  for (const w of scene.walls) {
    if (w.id === wall.id || !isSolid(w)) continue;
    if (w.a !== node.id && w.b !== node.id) continue;
    const other = nodes.get(w.a === node.id ? w.b : w.a);
    if (!other) continue;
    const ex = other.x - node.x;
    const ey = other.y - node.y;
    const L = Math.hypot(ex, ey);
    if (L < 1e-6) continue;
    const along = (ex * ux + ey * uy) / L;
    const across = (ex * nx + ey * ny) / L;
    // Straight continuation in the direction we're travelling: same surface.
    if (along > 0 && Math.abs(Math.asin(Math.max(-1, Math.min(1, across)))) <= COLLINEAR_RAD) {
      continuation = w;
      continue;
    }
    // Doubling back along our own axis is neither a corner nor a continuation.
    if (Math.abs(along) > Math.cos(COLLINEAR_RAD)) continue;
    const th = w.thickness ?? DEFAULT_THICKNESS;
    // Faces cross here: half the crossing wall's thickness, opened out by the
    // angle when it meets us at a slant. Clamped so a near-parallel wall can't
    // produce an unbounded inset.
    const reach = th / 2 / Math.max(Math.abs(across), 0.25);
    if (across > 0) inward = Math.min(inward ?? Infinity, -reach);
    else outward = Math.max(outward ?? -Infinity, reach);
  }
  // A wall standing IN the room wins over everything: you cannot slide a
  // cabinet through it, so the surface ends at its face even when this wall
  // carries straight on past the junction. Checking the continuation first is
  // what let a run walk clean through an interior partition.
  if (inward !== null) return { inset: inward };
  if (continuation) return { next: continuation };
  return { inset: outward ?? 0 };
}

/**
 * The straight surface containing `wall`, on the side its outward normal
 * (nx, ny) points to. Walks collinear neighbours in both directions.
 *
 * `(nx, ny)` matters because "does this corner block me" is side-dependent: a
 * wall teeing in from the far side does not interrupt the face a run is
 * standing against, and stopping the run there is what made a long straight
 * kitchen wall behave like several short ones.
 */
export function collinearSpan(
  scene: Scene,
  wall: Wall,
  nx: number,
  ny: number,
): WallSpan {
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  const a = nodes.get(wall.a)!;
  const b = nodes.get(wall.b)!;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1e-6;
  const ux = dx / L;
  const uy = dy / L;

  /** Walk from the seed wall along `dir` (+1 = toward b) until the surface
   *  ends, collecting where it ends and which wall/node it ended at. */
  const walk = (dir: 1 | -1): SpanEnd => {
    let cur = wall;
    let node = dir > 0 ? b : a;
    // Along-axis position of `node`, measured from the seed wall's node a.
    let t = (node.x - a.x) * ux + (node.y - a.y) * uy;
    const seen = new Set<string>([wall.id]);
    for (let guard = 0; guard < 64; guard++) {
      const r = endAt(scene, cur, node, nodes, ux * dir, uy * dir, nx, ny);
      if ("inset" in r) return { t: t + dir * r.inset, node, wall: cur };
      if (seen.has(r.next.id)) return { t, node, wall: cur }; // closed loop
      seen.add(r.next.id);
      cur = r.next;
      const far = nodes.get(cur.a === node.id ? cur.b : cur.a);
      if (!far) return { t, node, wall: cur };
      node = far;
      t = (node.x - a.x) * ux + (node.y - a.y) * uy;
    }
    return { t, node, wall: cur };
  };

  const loEnd = walk(-1);
  const hiEnd = walk(1);
  return { ax: a.x, ay: a.y, ux, uy, lo: loEnd.t, hi: hiEnd.t, loEnd, hiEnd };
}
