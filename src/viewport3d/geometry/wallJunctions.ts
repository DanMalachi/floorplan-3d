import type { Node, Wall } from "@/schema/scene";
import { isSolidWall } from "@/schema/scene";
import { DEFAULT_THICKNESS } from "@/schema/constants";

// How wall bodies MEET at a shared node. Without this every wall is a slab that
// stops dead at the node centre, which leaves an uncovered quadrant on the
// outside of a corner and a doubly-covered one on the inside (the z-fighting
// seam). Here we solve, per node, where each wall's four plan corners actually
// land so the bodies tile the junction exactly: no gap, no overlap.
//
// Resolution follows what CAD tools do, because the naive "mitre every pair"
// rule is wrong for T-junctions — it punches a hole through the middle of the
// joint AND splits the through-wall's painted face across the filler:
//
//   1 wall   -> square cap (a free end).
//   2 walls  -> MITRE: the shared corner is where their offset faces cross.
//   3+ walls -> THROUGH + BUTT: the most nearly collinear pair runs straight
//               through, everyone else butts into its face.
//
// Non-solid edges (rails; portals later) are dropped BEFORE the count, so a
// wall ending at one gets a clean square-capped jamb and two walls meeting
// across one still mitre normally.

/**
 * Local-x deltas for a wall's four plan corners, in wall-local space (x runs
 * along the wall from node a, +z is the wall's left / side-A face).
 * 0 = a square cap flush with the node; negative pulls the corner back toward
 * node a, positive pushes it past.
 */
export interface WallEnds {
  x0L: number; // start corner, left (+z) face — delta from x = 0
  x0R: number; // start corner, right (-z) face
  x1L: number; // end corner, left (+z) face — delta from x = L
  x1R: number; // end corner, right (-z) face
}

/** A plain, un-jointed box — the shape of a wall with no neighbours. */
export const SQUARE_ENDS: WallEnds = { x0L: 0, x0R: 0, x1L: 0, x1R: 0 };

// A mitre at a very acute corner runs away toward infinity, so a 2-degree
// join would grow a metre-long needle. Past this multiple of the half-thickness
// (~29 degrees between the walls) we abandon the mitre and let both walls keep
// their square caps, which leaves a small wedge open at the tip but no spike.
//
// It has to be all-or-nothing: a corner is pinned to its wall's own face line,
// so a partially pulled-back point would no longer sit on BOTH walls' faces and
// the joint would tear open. The test is made once per corner, on the shared
// node-to-crossing distance, so both walls always decide the same way.
const MITER_LIMIT = 4;

const EPS = 1e-9;

/** One wall leaving a node: the direction you'd walk to get away from it. */
interface Ray {
  wallId: string;
  atStart: boolean; // is this node the wall's node `a`?
  dx: number; // outgoing unit direction FROM the node
  dy: number;
  halfT: number;
  angle: number; // atan2 of the outgoing direction — the sort key
  ax: number; // the wall's node `a` (to convert plan points to wall-local x)
  ay: number;
  ux: number; // the wall's own direction, a -> b
  uy: number;
  L: number;
}

const perpLeft = (dx: number, dy: number): [number, number] => [-dy, dx];
const perpRight = (dx: number, dy: number): [number, number] => [dy, -dx];

/** Where line (p, dir d) crosses line (q, dir e). Null when parallel. */
function intersect(
  px: number, py: number, dx: number, dy: number,
  qx: number, qy: number, ex: number, ey: number,
): [number, number] | null {
  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < EPS) return null;
  const s = ((qx - px) * ey - (qy - py) * ex) / denom;
  return [px + dx * s, py + dy * s];
}

/** Is this crossing close enough to the node to be worth cutting? */
const withinLimit = (nx: number, ny: number, p: [number, number], limit: number) =>
  Math.hypot(p[0] - nx, p[1] - ny) <= limit;

/**
 * Record plan point (px, py) as the corner on one side of `r`.
 *
 * `rayLeft` is the side as seen walking OUT of the node along the ray, which
 * flips relative to the wall when the node is the wall's `b`: leaving via `b`
 * you walk along -u, so your left hand is over the wall's RIGHT face.
 */
function setCorner(
  r: Ray, rayLeft: boolean, px: number, py: number, ends: Map<string, WallEnds>,
): void {
  const e = ends.get(r.wallId);
  if (!e) return;
  const localX = (px - r.ax) * r.ux + (py - r.ay) * r.uy;
  if (r.atStart) {
    if (rayLeft) e.x0L = localX;
    else e.x0R = localX;
  } else {
    if (rayLeft) e.x1R = localX - r.L;
    else e.x1L = localX - r.L;
  }
}

/** The offset line running along one face of a ray: [point, direction]. */
function faceLine(r: Ray, nx: number, ny: number, left: boolean) {
  const [px, py] = left ? perpLeft(r.dx, r.dy) : perpRight(r.dx, r.dy);
  return { x: nx + px * r.halfT, y: ny + py * r.halfT, dx: r.dx, dy: r.dy };
}

/** Two walls meeting: their shared corner is where their facing offset lines
 *  cross. Collinear walls give parallel lines and keep their square caps —
 *  which is exactly right, they just run into each other flush. */
function solveMitre(
  nx: number, ny: number, rays: Ray[], ends: Map<string, WallEnds>,
): void {
  for (const [i, j] of [[0, 1], [1, 0]] as const) {
    const a = rays[i];
    const b = rays[j];
    const la = faceLine(a, nx, ny, true);
    const lb = faceLine(b, nx, ny, false);
    const hit = intersect(la.x, la.y, la.dx, la.dy, lb.x, lb.y, lb.dx, lb.dy);
    if (!hit) continue; // parallel — square caps already stand
    if (!withinLimit(nx, ny, hit, MITER_LIMIT * Math.max(a.halfT, b.halfT))) continue;
    setCorner(a, true, hit[0], hit[1], ends);
    setCorner(b, false, hit[0], hit[1], ends);
  }
}

/**
 * Three or more walls meeting. One pair runs straight THROUGH the junction and
 * keeps its square caps; every other wall BUTTS into whichever face of that
 * through-wall it approaches. This is what a builder does, and it means the
 * junction needs no filler: the through-wall's body already fills the middle.
 */
function solveThroughButt(
  nx: number, ny: number, rays: Ray[], ends: Map<string, WallEnds>,
): void {
  // The through-wall is the most nearly opposed pair — the smallest dot product.
  let p = 0;
  let q = 1;
  let best = Infinity;
  for (let i = 0; i < rays.length; i++) {
    for (let j = i + 1; j < rays.length; j++) {
      const dot = rays[i].dx * rays[j].dx + rays[i].dy * rays[j].dy;
      if (dot < best) {
        best = dot;
        p = i;
        q = j;
      }
    }
  }
  const thru = rays[p];
  // A step here if the two halves disagree on thickness; butt into the wider
  // face so the joining wall can never poke through into open air.
  const halfT = Math.max(thru.halfT, rays[q].halfT);
  const [lnx, lny] = perpLeft(thru.dx, thru.dy);

  for (let i = 0; i < rays.length; i++) {
    if (i === p || i === q) continue; // the through pair keeps its square caps
    const r = rays[i];
    // Which face does this wall approach from? The one its direction points at.
    const sign = r.dx * lnx + r.dy * lny;
    if (Math.abs(sign) < EPS) continue; // parallel to the through-wall — cap it
    const s = Math.sign(sign) * halfT;
    const fx = nx + lnx * s;
    const fy = ny + lny * s;
    const limit = MITER_LIMIT * Math.max(r.halfT, halfT);
    for (const left of [true, false]) {
      const rl = faceLine(r, nx, ny, left);
      const hit = intersect(rl.x, rl.y, rl.dx, rl.dy, fx, fy, thru.dx, thru.dy);
      // A grazing angle puts the crossing far up the wall; cap it instead.
      if (!hit || !withinLimit(nx, ny, hit, limit)) continue;
      setCorner(r, left, hit[0], hit[1], ends);
    }
  }
}

/**
 * Solve every wall's four plan corners so bodies meet cleanly at shared nodes.
 *
 * `inflate` widens each wall by that much per side before solving — baseboards
 * are a proud band around the same centrelines, so they re-solve with their own
 * half-thickness rather than inheriting the wall's corners.
 *
 * Walls absent from the result (rails, zero-length, dangling node refs) simply
 * have no joinery; callers fall back to SQUARE_ENDS.
 */
export function solveJunctions(
  walls: Wall[],
  nodes: Map<string, Node>,
  inflate = 0,
): Map<string, WallEnds> {
  const ends = new Map<string, WallEnds>();
  const byNode = new Map<string, Ray[]>();

  for (const w of walls) {
    if (!isSolidWall(w)) continue;
    const a = nodes.get(w.a);
    const b = nodes.get(w.b);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy);
    if (L < 1e-6) continue;

    ends.set(w.id, { ...SQUARE_ENDS });
    const ux = dx / L;
    const uy = dy / L;
    const halfT = (w.thickness ?? DEFAULT_THICKNESS) / 2 + inflate;
    const base = { wallId: w.id, halfT, ax: a.x, ay: a.y, ux, uy, L };
    const push = (nodeId: string, ray: Ray) => {
      const arr = byNode.get(nodeId);
      if (arr) arr.push(ray);
      else byNode.set(nodeId, [ray]);
    };
    // Leaving via `a` you walk backwards along the wall; leaving via `b`, forwards.
    push(w.a, { ...base, atStart: true, dx: ux, dy: uy, angle: Math.atan2(uy, ux) });
    push(w.b, { ...base, atStart: false, dx: -ux, dy: -uy, angle: Math.atan2(-uy, -ux) });
  }

  for (const [nodeId, rays] of byNode) {
    const n = nodes.get(nodeId);
    if (!n || rays.length < 2) continue; // a free end keeps its square cap
    rays.sort((p, q) => p.angle - q.angle);
    if (rays.length === 2) solveMitre(n.x, n.y, rays, ends);
    else solveThroughButt(n.x, n.y, rays, ends);
  }

  return ends;
}
