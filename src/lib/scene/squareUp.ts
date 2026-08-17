// Square-up: remove TRACING SLOP from a generated plan without touching walls
// that are deliberately angled.
//
// Why this exists. The tracer's ortho lock only applies on its free-point
// branch (legacy/src/trace2d/TraceCanvas.tsx `resolveTarget`) — snapping to an
// existing vertex, onto an existing wall, or onto an imported PDF centreline
// all return before it. So a plan that looks square comes out with a long tail
// of near-square walls. Measured over the 15 hand-traced plans in
// legacy/data/floorplan-gt (650 walls): 64% are exactly on-axis, 36% are off,
// and the error distribution is cleanly bimodal —
//
//     0.02°–3°   224 walls   tracing slop
//     3°–10°       2 walls   (the gap)
//     10°–45°     10 walls   real diagonals: bays, angled wings
//
// Everything downstream that runs ALONG a wall pays for the slop, and the
// kitchen pays most: an L-run's legs turn exactly ±90° (runPath.ts `pathLegs`)
// and its worktop is mitred "exact for right angles" (kitchenBase.ts), so an
// 88° corner buries ~3.5cm of cabinet in the wall per metre of leg. 23% of the
// corpus's corners are inside the run tool's 85–95° turn window but more than
// 0.5° off square — they turn, and build wrong.
//
// What this does NOT do: invent a global grid. Node coordinates are not
// rounded to anything. A wall is only ever made exactly parallel to the plan's
// own dominant frame, and only when it is already within `toleranceDeg` of it.
// The 43° bay wall in the corpus is untouched by construction.

import type { Node, Opening, Scene, Wall } from "@/schema/scene";
import { isSolidWall } from "@/schema/scene";

/** Degrees of off-axis error treated as tracing slop rather than intent.
 *  4° sits in the empty band the corpus shows between 3° and 10°: it
 *  straightens every slop wall measured and no real diagonal. */
export const DEFAULT_TOLERANCE_DEG = 4;

/** Slack on the displacement tripwire below, to absorb chains of constrained
 *  walls whose component mean sits further out than any single wall explains. */
const SHIFT_BOUND_SLACK = 2;

export interface SquareUpReport {
  /** Walls whose direction actually changed. */
  straightened: number;
  /** Walls left alone because they are genuinely angled. */
  diagonals: number;
  /** The frame the plan was squared to, radians in [-π/4, π/4]. ~0 for a
   *  building drawn upright; non-zero for one traced at an angle. */
  frameAngle: number;
  /** Largest distance any node moved, metres. */
  maxShift: number;
  /** Set when the pass declined to change anything, with the reason. */
  bailed?: "no-walls" | "no-frame" | "shift-too-large";
}

export interface SquareUpResult {
  scene: Scene;
  report: SquareUpReport;
}

const QUARTER = Math.PI / 2;

/** An angle folded into [0, π/2) — the only part that matters when the four
 *  axis directions are interchangeable. */
function foldQuarter(a: number): number {
  const t = a % QUARTER;
  return t < 0 ? t + QUARTER : t;
}

/** Signed offset from `a` to the nearest multiple of π/2, in (-π/4, π/4]. */
function toNearestAxis(a: number): number {
  const f = foldQuarter(a);
  return f <= Math.PI / 4 ? -f : QUARTER - f;
}

interface WallDir {
  wall: Wall;
  ux: number;
  uy: number;
  len: number;
  /** Direction folded into [0, π/2). */
  theta: number;
}

function wallDirs(scene: Scene, nodes: ReadonlyMap<string, Node>): WallDir[] {
  const out: WallDir[] = [];
  for (const wall of scene.walls) {
    const a = nodes.get(wall.a);
    const b = nodes.get(wall.b);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    out.push({ wall, ux: dx / len, uy: dy / len, len, theta: foldQuarter(Math.atan2(dy, dx)) });
  }
  return out;
}

/** Two directions within this are the same direction: the tracer emits bit-
 *  identical angles for walls drawn under the ortho lock, so an "already
 *  agreed" cluster is exact, not approximate. */
const EXACT_EPS = (0.01 * Math.PI) / 180;
/** Share of inlier length that must already agree exactly before the frame is
 *  pinned to that agreement instead of averaged. */
const CLUSTER_SHARE = 0.25;

/**
 * The plan's dominant orthogonal frame: the orientation that the most WALL
 * LENGTH lies square to.
 *
 * Two failure modes to avoid, both measured on the corpus:
 *
 * A plain circular mean lets one real diagonal rotate the whole building — a
 * single 43° bay wall is enough — and rotating a correct wall is far worse
 * than leaving a bent one bent. So the candidates are the wall directions
 * themselves, scored by the total length within tolerance (an exact maximum
 * over the only orientations that can be optimal).
 *
 * But refining that winner to the mean of its inliers is wrong too. In 13 of
 * the 15 corpus plans the winner sits at exactly 0.0000° with 53–90% of wall
 * length already exactly on it; averaging in the slop tail then tilts the
 * frame by up to 0.32°, which rotates that already-correct majority and moves
 * nodes tens of centimetres to fix millimetres. When a dominant exact cluster
 * exists it IS the answer, so the mean is only used for a trace rough enough
 * to have no such cluster (the Matterport sample: 1% exact).
 */
function dominantFrame(dirs: WallDir[], tol: number): number | null {
  if (dirs.length === 0) return null;
  let bestScore = -1;
  let bestExact = -1;
  let bestTheta = 0;
  for (const cand of dirs) {
    let score = 0;
    let exact = 0;
    for (const d of dirs) {
      const err = Math.abs(toNearestAxis(d.theta - cand.theta));
      if (err > tol) continue;
      score += d.len;
      if (err <= EXACT_EPS) exact += d.len;
    }
    // Ties are the norm, not the exception — every wall of a square building
    // is a candidate scoring identically. Broken on exact agreement so the
    // winner is a direction other walls are already ON, never whichever
    // slightly-bent wall happens to come first in the array.
    if (score > bestScore + 1e-9 || (score > bestScore - 1e-9 && exact > bestExact)) {
      bestScore = score;
      bestExact = exact;
      bestTheta = cand.theta;
    }
  }
  if (bestScore <= 0) return null;
  // The winner's own orientation, folded into (-π/4, π/4].
  const candidate = -toNearestAxis(bestTheta);
  if (bestExact / bestScore >= CLUSTER_SHARE) return candidate;

  // No dominant agreement (a rough trace): fall back to the length-weighted
  // circular mean of the inliers. Angles are folded to a quarter turn, so the
  // mean is taken on 4θ — the standard trick for π/2-periodic data — and
  // unfolded afterwards.
  let sx = 0;
  let sy = 0;
  for (const d of dirs) {
    if (Math.abs(toNearestAxis(d.theta - bestTheta)) > tol) continue;
    sx += d.len * Math.cos(4 * d.theta);
    sy += d.len * Math.sin(4 * d.theta);
  }
  return sx === 0 && sy === 0 ? candidate : Math.atan2(sy, sx) / 4;
}

/** Union-find over node ids. */
class Sets {
  private parent = new Map<string, string>();
  find(id: string): string {
    let root = this.parent.get(id) ?? id;
    if (root === id) {
      this.parent.set(id, id);
      return id;
    }
    root = this.find(root);
    this.parent.set(id, root);
    return root;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/**
 * Straighten every near-square wall in `scene`, keeping the wall graph intact.
 *
 * The naive fix — rotate each bent wall onto its axis — tears the graph apart:
 * two walls meeting at a corner would each rotate about their own midpoint and
 * their shared node would have to be in two places. So the constraint is
 * expressed on NODES instead. In the plan's frame, a near-horizontal wall means
 * "my two nodes share a y", a near-vertical one means "they share an x". Those
 * are equivalence relations, so each axis gets a union-find pass and every
 * resulting component collapses to one coordinate — the length-weighted mean of
 * its members, so a 6m wall holds the line and a 30cm jog gives way. Corners
 * stay welded because a node in both an x-component and a y-component simply
 * takes both answers.
 */
export function squareUpScene(
  scene: Scene,
  toleranceDeg: number = DEFAULT_TOLERANCE_DEG,
): SquareUpResult {
  const tol = (toleranceDeg * Math.PI) / 180;
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  const dirs = wallDirs(scene, nodes);
  const none = (bailed: SquareUpReport["bailed"]): SquareUpResult => ({
    scene,
    report: { straightened: 0, diagonals: 0, frameAngle: 0, maxShift: 0, bailed },
  });
  if (dirs.length === 0) return none("no-walls");

  const frame = dominantFrame(dirs, tol);
  if (frame === null) return none("no-frame");

  // Work in frame space: rotate by -frame, solve on the axes, rotate back.
  const c = Math.cos(-frame);
  const s = Math.sin(-frame);
  const local = new Map<string, { x: number; y: number }>();
  for (const n of scene.nodes) local.set(n.id, { x: n.x * c - n.y * s, y: n.x * s + n.y * c });

  const xSets = new Sets(); // components that must share an x (vertical walls)
  const ySets = new Sets(); // components that must share a y (horizontal walls)
  const xWeight = new Map<string, number>(); // node id -> constrained length
  const yWeight = new Map<string, number>();
  const addWeight = (m: Map<string, number>, id: string, w: number) =>
    m.set(id, (m.get(id) ?? 0) + w);

  let diagonals = 0;
  let longestConstrained = 0;
  for (const d of dirs) {
    // A rail or portal bounds a room but builds nothing you can stand a
    // cabinet against; it still takes part, because it shares nodes with real
    // walls and leaving it out would fight their constraints at the corner.
    const err = toNearestAxis(d.theta - frame);
    if (Math.abs(err) > tol) {
      diagonals++;
      continue;
    }
    // Which axis is it near, in frame space?
    const localAngle = Math.atan2(d.uy, d.ux) - frame;
    const horizontal = Math.abs(Math.cos(localAngle)) >= Math.abs(Math.sin(localAngle));
    const sets = horizontal ? ySets : xSets;
    const weights = horizontal ? yWeight : xWeight;
    sets.union(d.wall.a, d.wall.b);
    addWeight(weights, d.wall.a, d.len);
    addWeight(weights, d.wall.b, d.len);
    longestConstrained = Math.max(longestConstrained, d.len);
  }

  // Collapse each component to its length-weighted mean coordinate.
  const solve = (
    sets: Sets,
    weights: Map<string, number>,
    pick: (p: { x: number; y: number }) => number,
  ): Map<string, number> => {
    const acc = new Map<string, { sum: number; w: number }>();
    for (const id of weights.keys()) {
      const p = local.get(id);
      if (!p) continue;
      const root = sets.find(id);
      const w = weights.get(id) ?? 0;
      const cur = acc.get(root) ?? { sum: 0, w: 0 };
      cur.sum += pick(p) * w;
      cur.w += w;
      acc.set(root, cur);
    }
    const out = new Map<string, number>();
    for (const id of weights.keys()) {
      const cur = acc.get(sets.find(id));
      if (cur && cur.w > 0) out.set(id, cur.sum / cur.w);
    }
    return out;
  };
  const solvedX = solve(xSets, xWeight, (p) => p.x);
  const solvedY = solve(ySets, yWeight, (p) => p.y);

  // Back to world space, and measure how far anything actually moved.
  const ic = Math.cos(frame);
  const is = Math.sin(frame);
  let maxShift = 0;
  const moved = new Map<string, Node>();
  for (const n of scene.nodes) {
    const p = local.get(n.id)!;
    const lx = solvedX.get(n.id) ?? p.x;
    const ly = solvedY.get(n.id) ?? p.y;
    if (lx === p.x && ly === p.y) continue;
    const x = lx * ic - ly * is;
    const y = lx * is + ly * ic;
    maxShift = Math.max(maxShift, Math.hypot(x - n.x, y - n.y));
    moved.set(n.id, { ...n, x, y });
  }
  // Tripwire, not a correctness argument: straightening a wall of length L that
  // was at most `tol` off can move its ends by at most L·tan(tol), so a shift
  // beyond that (with slack for chained components) means the frame estimate
  // was wrong — and doing nothing beats wrecking the plan. It scales with the
  // building instead of being a constant, so a large plan's legitimate large
  // correction is not mistaken for a failure: the corpus's worst case is a
  // 17.6m wall traced 2.79° off, whose 43cm fix is exactly right.
  if (maxShift > Math.tan(tol) * longestConstrained * SHIFT_BOUND_SLACK)
    return none("shift-too-large");
  if (moved.size === 0) {
    return { scene, report: { straightened: 0, diagonals, frameAngle: frame, maxShift: 0 } };
  }

  const nextNodes = scene.nodes.map((n) => moved.get(n.id) ?? n);
  const nextById = new Map(nextNodes.map((n) => [n.id, n]));

  // An opening's offset is metres from node a, so it has to be rescaled when
  // its wall's length changes — otherwise a door near the far end of a wall
  // that shortened by a centimetre now hangs off it.
  const lengthOf = (w: Wall, map: ReadonlyMap<string, Node>): number => {
    const a = map.get(w.a);
    const b = map.get(w.b);
    return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
  };
  const ratio = new Map<string, number>();
  for (const w of scene.walls) {
    const before = lengthOf(w, nodes);
    const after = lengthOf(w, nextById);
    if (before > 1e-6 && after > 1e-6 && before !== after) ratio.set(w.id, after / before);
  }
  const openings: Opening[] =
    ratio.size === 0
      ? scene.openings
      : scene.openings.map((o) => {
          const k = ratio.get(o.wallId);
          return k === undefined ? o : { ...o, offset: o.offset * k };
        });

  // Count what changed: a wall is "straightened" if its direction moved.
  let straightened = 0;
  for (const d of dirs) {
    const a = nextById.get(d.wall.a)!;
    const b = nextById.get(d.wall.b)!;
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    if (Math.hypot(ux, uy) < 1e-9) continue;
    if (Math.abs(Math.atan2(uy, ux) - Math.atan2(d.uy, d.ux)) > 1e-9) straightened++;
  }

  return {
    scene: { ...scene, nodes: nextNodes, openings },
    report: { straightened, diagonals, frameAngle: frame, maxShift },
  };
}

/** How far off square a scene's SOLID walls are — the measurement the pass is
 *  judged by. Exported for the test and for reporting, not used by the solve. */
export function offAxisStats(scene: Scene): { walls: number; offAxis: number; worstDeg: number } {
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  const dirs = wallDirs(scene, nodes).filter((d) => isSolidWall(d.wall));
  const frame = dominantFrame(dirs, (DEFAULT_TOLERANCE_DEG * Math.PI) / 180) ?? 0;
  let offAxis = 0;
  let worst = 0;
  for (const d of dirs) {
    const err = Math.abs(toNearestAxis(d.theta - frame));
    if (err > 1e-9) offAxis++;
    if (err < (DEFAULT_TOLERANCE_DEG * Math.PI) / 180) worst = Math.max(worst, err);
  }
  return { walls: dirs.length, offAxis, worstDeg: (worst * 180) / Math.PI };
}
