/**
 * Phase 2.5 eval harness — scoring core (M4).
 *
 * Tolerant geometric matching between classified candidates and a hand-traced
 * ground truth, scored as a full confusion matrix. Never exact-equality:
 * walls match by angle + perpendicular offset + length overlap; openings by
 * axis + midpoint proximity.
 */
import type { Candidate, CandidateClass } from "../../src/trace2d/candidates";
import type { GroundTruth } from "../../src/trace2d/exportGroundTruth";
import type { VlmResult, VlmMissed } from "../../src/lib/vlmClassify";

export type TruthClass = "wall" | "door" | "window" | "reject";
export const PRED_CLASSES: CandidateClass[] = [
  "wall",
  "door",
  "window",
  "dimension",
  "furniture",
  "stairs",
  "reject",
];

// Matching tolerances (image px).
const ANGLE_TOL_DEG = 8;
const WALL_PERP_TOL = 14; // ~= weldTol
const WALL_MIN_OVERLAP_FRAC = 0.5; // of the candidate's own length
const OPEN_PERP_TOL = 16;
const OPEN_MID_TOL_FRAC = 0.75; // of the GT opening's width (min 20px)
const OPEN_SIZE_RATIO = 1.6; // candidate at most this × GT width to count as the opening

interface Line {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const len = (l: Line) => Math.hypot(l.x1 - l.x0, l.y1 - l.y0);
const angleDeg = (l: Line) =>
  ((Math.atan2(l.y1 - l.y0, l.x1 - l.x0) * 180) / Math.PI + 180) % 180;

function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 180;
  return Math.min(d, 180 - d);
}

/** Overlap of candidate `c` projected onto GT line `g`, in px. */
export function overlapAlong(g: Line, c: Line): { overlap: number; perp: number } {
  const gl = len(g) || 1;
  const ux = (g.x1 - g.x0) / gl;
  const uy = (g.y1 - g.y0) / gl;
  const s = (x: number, y: number) => (x - g.x0) * ux + (y - g.y0) * uy;
  const p = (x: number, y: number) => Math.abs((x - g.x0) * -uy + (y - g.y0) * ux);
  let a = s(c.x0, c.y0);
  let b = s(c.x1, c.y1);
  if (a > b) [a, b] = [b, a];
  const overlap = Math.min(b, gl) - Math.max(a, 0);
  const perp = (p(c.x0, c.y0) + p(c.x1, c.y1)) / 2;
  return { overlap, perp };
}

/**
 * Length of `target` covered by the union of `covers` projected onto it
 * (same angle/perp tolerances as wall matching). Granularity-independent:
 * one long line covering three short ones (or vice versa) scores the same.
 */
export function coveredLength(target: Line, covers: Line[]): number {
  const tl = len(target);
  if (tl < 1) return 0;
  const ux = (target.x1 - target.x0) / tl;
  const uy = (target.y1 - target.y0) / tl;
  const ivs: [number, number][] = [];
  for (const c of covers) {
    if (angleDiff(angleDeg(target), angleDeg(c)) > ANGLE_TOL_DEG) continue;
    const perp =
      (Math.abs((c.x0 - target.x0) * -uy + (c.y0 - target.y0) * ux) +
        Math.abs((c.x1 - target.x0) * -uy + (c.y1 - target.y0) * ux)) /
      2;
    if (perp > WALL_PERP_TOL) continue;
    let a = (c.x0 - target.x0) * ux + (c.y0 - target.y0) * uy;
    let b = (c.x1 - target.x0) * ux + (c.y1 - target.y0) * uy;
    if (a > b) [a, b] = [b, a];
    a = Math.max(0, a);
    b = Math.min(tl, b);
    if (b > a) ivs.push([a, b]);
  }
  ivs.sort((p, q) => p[0] - q[0]);
  let covered = 0;
  let end = -1;
  for (const [a, b] of ivs) {
    if (a > end) {
      covered += b - a;
      end = b;
    } else if (b > end) {
      covered += b - end;
      end = b;
    }
  }
  return covered;
}

export interface MatchResult {
  truth: TruthClass;
  gtIndex: number; // index into gt.walls or gt.resolvedOpenings; -1 for reject
}

/** Ground-truth class of one candidate: opening first (if opening-sized), then wall. */
export function matchCandidate(c: Candidate, gt: GroundTruth): MatchResult {
  const cl: Line = { x0: c.px[0], y0: c.px[1], x1: c.px[2], y1: c.px[3] };
  const cAng = angleDeg(cl);
  const cLen = len(cl);
  const cmx = (cl.x0 + cl.x1) / 2;
  const cmy = (cl.y0 + cl.y1) / 2;

  // Openings first — an opening sits ON a wall, so an opening-sized candidate
  // over a traced opening is that opening, not the wall.
  let best: MatchResult | null = null;
  let bestScore = -Infinity;
  gt.resolvedOpenings.forEach((o, i) => {
    const ol: Line = o;
    const w = len(ol);
    if (w < 1) return;
    if (angleDiff(cAng, angleDeg(ol)) > ANGLE_TOL_DEG) return;
    if (cLen > w * OPEN_SIZE_RATIO) return; // wall-sized, not opening-sized
    const omx = (ol.x0 + ol.x1) / 2;
    const omy = (ol.y0 + ol.y1) / 2;
    const midDist = Math.hypot(cmx - omx, cmy - omy);
    const { perp } = overlapAlong(ol, cl);
    if (perp > OPEN_PERP_TOL) return;
    if (midDist > Math.max(w * OPEN_MID_TOL_FRAC, 20)) return;
    const score = 1000 - midDist; // openings outrank walls
    if (score > bestScore) {
      bestScore = score;
      best = { truth: o.type, gtIndex: i };
    }
  });
  if (best) return best;

  gt.walls.forEach((wl, i) => {
    if (angleDiff(cAng, angleDeg(wl)) > ANGLE_TOL_DEG) return;
    const { overlap, perp } = overlapAlong(wl, cl);
    if (perp > WALL_PERP_TOL) return;
    if (overlap < cLen * WALL_MIN_OVERLAP_FRAC) return;
    const score = overlap - perp;
    if (score > bestScore) {
      bestScore = score;
      best = { truth: "wall", gtIndex: i };
    }
  });
  return best ?? { truth: "reject", gtIndex: -1 };
}

export interface PlanScore {
  matrix: Record<string, Record<TruthClass, number>>; // [predicted][truth]
  perClass: Record<
    string,
    { tp: number; fp: number; fn: number; precision: number; recall: number; f1: number }
  >;
  wallCoverage: number; // fraction of total GT wall LENGTH covered by predicted walls
  // Length-based wall P/R/F1 — the honest wall metric. The element-based
  // perClass.wall under-reports raster candidates: one long unbroken skeleton
  // centerline legitimately covers several short GT wall pieces but fails the
  // candidate-centric overlap rule (counted FP + the pieces counted FN).
  wallLength: { precision: number; recall: number; f1: number };
  gtCounts: { walls: number; doors: number; windows: number };
  missedCredit?: { flagged: number; total: number }; // unmatched GT elements the VLM pointed at
}

/**
 * Score a set of predictions (candidate id → class) against ground truth.
 */
export function scorePlan(
  candidates: Candidate[],
  predicted: Map<number, CandidateClass>,
  gt: GroundTruth,
  vlmMissed?: VlmMissed[],
): PlanScore {
  const matrix: Record<string, Record<TruthClass, number>> = {};
  for (const p of PRED_CLASSES) matrix[p] = { wall: 0, door: 0, window: 0, reject: 0 };

  // Candidate-side: predicted vs matched truth.
  const matches = candidates.map((c) => matchCandidate(c, gt));
  const wallHitByPredWall = new Set<number>();
  const openingHitByPred = new Map<number, CandidateClass>();
  candidates.forEach((c, i) => {
    const pred = predicted.get(c.id) ?? "reject";
    const m = matches[i];
    matrix[pred][m.truth]++;
    if (m.truth === "wall" && pred === "wall") wallHitByPredWall.add(m.gtIndex);
    if ((m.truth === "door" || m.truth === "window") && pred === m.truth) {
      openingHitByPred.set(m.gtIndex, pred);
    }
  });

  // GT-side recall. Walls by covered LENGTH (several candidates may each cover
  // a piece); openings binary. Precision mirrors it: how much predicted-wall
  // length actually lies on GT wall lines.
  const predWallLines: Line[] = candidates
    .filter((c) => (predicted.get(c.id) ?? "reject") === "wall")
    .map((c) => ({ x0: c.px[0], y0: c.px[1], x1: c.px[2], y1: c.px[3] }));
  const gtWallLines: Line[] = gt.walls.map((w) => ({ x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1 }));

  let gtWallLen = 0;
  let coveredLen = 0;
  for (const wl of gtWallLines) {
    gtWallLen += len(wl);
    coveredLen += coveredLength(wl, predWallLines);
  }
  let predWallLen = 0;
  let predOnGtLen = 0;
  for (const pl of predWallLines) {
    predWallLen += len(pl);
    predOnGtLen += coveredLength(pl, gtWallLines);
  }
  const wallLenP = predWallLen > 0 ? predOnGtLen / predWallLen : 0;
  const wallLenR = gtWallLen > 0 ? coveredLen / gtWallLen : 1;
  const wallLenF1 = wallLenP + wallLenR > 0 ? (2 * wallLenP * wallLenR) / (wallLenP + wallLenR) : 0;

  // Per-class precision/recall.
  const perClass: PlanScore["perClass"] = {};
  const truthTotals: Record<TruthClass, number> = {
    wall: gt.walls.length,
    door: gt.resolvedOpenings.filter((o) => o.type === "door").length,
    window: gt.resolvedOpenings.filter((o) => o.type === "window").length,
    reject: 0,
  };
  for (const cls of ["wall", "door", "window"] as const) {
    const tp = matrix[cls][cls];
    const fp = (Object.keys(matrix[cls]) as TruthClass[])
      .filter((t) => t !== cls)
      .reduce((s, t) => s + matrix[cls][t], 0);
    // Element recall (per GT element, not per candidate).
    let hit = 0;
    if (cls === "wall") {
      hit = wallHitByPredWall.size;
    } else {
      gt.resolvedOpenings.forEach((o, i) => {
        if (o.type === cls && openingHitByPred.get(i) === cls) hit++;
      });
    }
    const total = truthTotals[cls];
    const fn = total - hit;
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = total > 0 ? hit / total : 1;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    perClass[cls] = { tp, fp, fn, precision, recall, f1 };
  }

  // Credit for VLM "missed" flags pointing at genuinely-unmatched GT elements.
  let missedCredit: PlanScore["missedCredit"];
  if (vlmMissed) {
    const unmatchedOpenings = gt.resolvedOpenings.filter((_, i) => !openingHitByPred.has(i));
    const unmatchedWalls = gt.walls.filter((_, i) => !wallHitByPredWall.has(i));
    const unmatched: Line[] = [...unmatchedOpenings, ...unmatchedWalls];
    let flagged = 0;
    for (const u of unmatched) {
      const umx = (u.x0 + u.x1) / 2;
      const umy = (u.y0 + u.y1) / 2;
      const hit = vlmMissed.some((mb) => {
        const [x0, y0, x1, y1] = mb.px;
        const margin = 30;
        return (
          umx >= Math.min(x0, x1) - margin &&
          umx <= Math.max(x0, x1) + margin &&
          umy >= Math.min(y0, y1) - margin &&
          umy <= Math.max(y0, y1) + margin
        );
      });
      if (hit) flagged++;
    }
    missedCredit = { flagged, total: unmatched.length };
  }

  return {
    matrix,
    perClass,
    wallCoverage: wallLenR,
    wallLength: { precision: wallLenP, recall: wallLenR, f1: wallLenF1 },
    gtCounts: {
      walls: gt.walls.length,
      doors: truthTotals.door,
      windows: truthTotals.window,
    },
    missedCredit,
  };
}

/** Heuristic-only prediction: what today's strict pipeline surfaces. */
export function heuristicPredictions(candidates: Candidate[]): Map<number, CandidateClass> {
  const m = new Map<number, CandidateClass>();
  for (const c of candidates) {
    m.set(c.id, c.keptByHeuristic ? c.guess : "reject");
  }
  return m;
}

/** VLM predictions from a saved vlm-labels.json. */
export function vlmPredictions(result: Pick<VlmResult, "labels">): Map<number, CandidateClass> {
  return new Map(result.labels.map((l) => [l.id, l.label]));
}

export const mean = (xs: number[]): number =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;

export interface CoverageMiss {
  type: "wall" | "door" | "window";
  x: number; // midpoint
  y: number;
  len: number;
}

export interface CoveragePlan {
  walls: { hit: number; total: number };
  doors: { hit: number; total: number };
  windows: { hit: number; total: number };
  missed: CoverageMiss[];
}

/**
 * Free generator-coverage of one plan (no VLM): for each GT element, does ANY
 * candidate cover it, regardless of what the heuristic guessed? This is the
 * recall CEILING of the whole pipeline — classification can never recover an
 * element no candidate covers. Walls are matched GT-centric (candidates on a
 * GT wall's line must cover ≥50% of ITS length — one long raster centerline
 * legitimately spans several short GT pieces); openings via matchCandidate.
 *
 * This is the shared core behind `coverage.ts` and `bench.ts` so the two never
 * drift. It mirrors the tolerances in `coveredLength` / `matchCandidate`.
 */
export function coveragePlan(candidates: Candidate[], gt: GroundTruth): CoveragePlan {
  const missed: CoverageMiss[] = [];
  const mid = (l: { x0: number; y0: number; x1: number; y1: number }) => ({
    x: Math.round((l.x0 + l.x1) / 2),
    y: Math.round((l.y0 + l.y1) / 2),
    len: Math.round(len(l)),
  });

  // Openings: any candidate that matchCandidate resolves to this GT opening.
  const openHit = new Set<number>();
  for (const c of candidates) {
    const m = matchCandidate(c, gt);
    if (m.gtIndex >= 0 && m.truth !== "wall") openHit.add(m.gtIndex);
  }
  let doors = 0;
  let windows = 0;
  let doorHit = 0;
  let windowHit = 0;
  gt.resolvedOpenings.forEach((o, i) => {
    const isDoor = o.type === "door";
    if (isDoor) doors++;
    else windows++;
    if (openHit.has(i)) {
      if (isDoor) doorHit++;
      else windowHit++;
    } else {
      missed.push({ type: o.type, ...mid(o) });
    }
  });

  // Walls: GT-centric length-union coverage ≥50% by wall-kind candidates.
  const wallLines: Line[] = candidates
    .filter((c) => c.kind === "wall")
    .map((c) => ({ x0: c.px[0], y0: c.px[1], x1: c.px[2], y1: c.px[3] }));
  let wallHit = 0;
  for (const w of gt.walls) {
    const wl = len(w);
    if (wl < 1) continue; // degenerate — counts against total, can't be hit
    if (coveredLength(w, wallLines) / wl >= 0.5) wallHit++;
    else missed.push({ type: "wall", ...mid(w) });
  }

  return {
    walls: { hit: wallHit, total: gt.walls.length },
    doors: { hit: doorHit, total: doors },
    windows: { hit: windowHit, total: windows },
    missed,
  };
}

export function formatScore(title: string, s: PlanScore): string {
  const lines: string[] = [];
  lines.push(`── ${title} ──`);
  lines.push(
    `GT: ${s.gtCounts.walls} walls, ${s.gtCounts.doors} doors, ${s.gtCounts.windows} windows`,
  );
  const header = "pred\\truth".padEnd(11) + ["wall", "door", "window", "reject"].map((t) => t.padStart(7)).join("");
  lines.push(header);
  for (const p of PRED_CLASSES) {
    const row = s.matrix[p];
    if (row.wall + row.door + row.window + row.reject === 0) continue;
    lines.push(
      p.padEnd(11) +
        [row.wall, row.door, row.window, row.reject].map((n) => String(n).padStart(7)).join(""),
    );
  }
  for (const cls of ["wall", "door", "window"]) {
    const pc = s.perClass[cls];
    lines.push(
      `${cls.padEnd(7)} P=${(pc.precision * 100).toFixed(0).padStart(3)}%  R=${(pc.recall * 100).toFixed(0).padStart(3)}%  F1=${(pc.f1 * 100).toFixed(0).padStart(3)}%`,
    );
  }
  const wlen = s.wallLength;
  lines.push(
    `wall by LENGTH: P=${(wlen.precision * 100).toFixed(0).padStart(3)}%  R=${(wlen.recall * 100).toFixed(0).padStart(3)}%  F1=${(wlen.f1 * 100).toFixed(0).padStart(3)}%  (honest wall metric; element rows above under-report long centerlines)`,
  );
  if (s.missedCredit && s.missedCredit.total > 0) {
    lines.push(
      `VLM flagged ${s.missedCredit.flagged}/${s.missedCredit.total} elements no candidate matched`,
    );
  }
  return lines.join("\n");
}
