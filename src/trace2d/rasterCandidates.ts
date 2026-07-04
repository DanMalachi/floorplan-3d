import type { Candidate, CandidateSet } from "./candidates";

// ---------------------------------------------------------------------------
// Phase 3 raster path: turn the rough centerlines proposed from an image
// (scripts/propose_raster.py) into the same Candidate objects the vector
// pipeline emits, so /api/classify, the suggested layer, and the eval harness
// run unchanged. Regularization is deterministic: ortho snap, collinear
// merge, gap-door detection. Semantics stay with the VLM.
// ---------------------------------------------------------------------------

export interface RasterCenterline {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  thicknessPx: number;
}

export interface RasterQuality {
  width: number;
  height: number;
  scale: number;
  inkRatio: number;
  strokeMedianPx: number;
  wallThicknessPx: number;
  maskBranch: "filled" | "thin-strokes";
  verdict: "good" | "marginal" | "poor";
  notes: string[];
}

// A small thick-cored blob the proposer's letter filter dropped: not a letter
// (letters are thin-stroked) but a short wall stub — typically the pier
// between two adjacent doorways. Used to split oversized door gaps.
export interface RasterIsland {
  x: number;
  y: number;
  thicknessPx: number;
  longPx: number; // long side of the blob's bbox
}

export interface RasterProposal {
  quality: RasterQuality;
  centerlines: RasterCenterline[];
  islands?: RasterIsland[];
}

export interface RasterParams {
  orthoSnapDeg: number; // snap segments this close to 0/90 exactly
  mergeAngleDeg: number; // collinear-merge angle tolerance
  mergePerpFrac: number; // perp offset ≤ thickness × this (min 3px)
  mergeGapPx: number; // endpoint gap bridged by the merge
  minWallMeters: number; // kept-wall length floor (px fallback below)
  minWallPx: number;
  doorMinMeters: number; // gap-door width band
  doorMaxMeters: number;
  doorMinPx: number;
  doorMaxPx: number;
  arcThinMaxPx: number; // leaf/arc strokes are drawing-weight, not wall-weight
  arcJoinPx: number; // endpoint gap that still chains leaf/arc pieces
  arcTurnMinDeg: number; // total sweep of an arc chain (quarter swing ≈ 60–90°)
  arcTurnMaxDeg: number;
  maxCandidates: number; // cap — drop shortest rejects first
}

export const DEFAULT_RASTER: RasterParams = {
  orthoSnapDeg: 6,
  mergeAngleDeg: 4,
  mergePerpFrac: 0.4,
  mergeGapPx: 6,
  minWallMeters: 0.35,
  minWallPx: 25,
  doorMinMeters: 0.45,
  doorMaxMeters: 3.5, // wide sliders/garage doors; matches vector candidate mode
  doorMinPx: 18,
  doorMaxPx: 220,
  arcThinMaxPx: 5.5,
  arcJoinPx: 7,
  arcTurnMinDeg: 45,
  arcTurnMaxDeg: 120,
  maxCandidates: 600,
};

interface Line {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  th: number;
  len: number;
  angle: number; // 0..180
}

const angleOf = (x0: number, y0: number, x1: number, y1: number) => {
  let a = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
  if (a < 0) a += 180;
  if (a >= 180) a -= 180;
  return a;
};

const angleDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % 180;
  return Math.min(d, 180 - d);
};

/** Rotate a segment about its midpoint onto exact 0°/90° when close. */
function orthoSnap(c: RasterCenterline, tolDeg: number): Line {
  let { x0, y0, x1, y1 } = c;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const a = angleOf(x0, y0, x1, y1);
  const target = angleDiff(a, 0) <= tolDeg ? 0 : angleDiff(a, 90) <= tolDeg ? 90 : null;
  if (target !== null && len > 0) {
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    if (target === 0) {
      x0 = mx - len / 2; x1 = mx + len / 2; y0 = my; y1 = my;
    } else {
      y0 = my - len / 2; y1 = my + len / 2; x0 = mx; x1 = mx;
    }
  }
  return { x0, y0, x1, y1, th: c.thicknessPx, len, angle: target ?? a };
}

/** Union-find collinear merge: same angle, tiny perp offset, small gap. */
function mergeCollinear(lines: Line[], p: RasterParams, gapPx: number): Line[] {
  const n = lines.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (i: number, j: number) => { parent[find(i)] = find(j); };

  const span = (l: Line, dx: number, dy: number, ox: number, oy: number): [number, number] => {
    const s0 = (l.x0 - ox) * dx + (l.y0 - oy) * dy;
    const s1 = (l.x1 - ox) * dx + (l.y1 - oy) * dy;
    return [Math.min(s0, s1), Math.max(s0, s1)];
  };

  for (let i = 0; i < n; i++) {
    const a = lines[i];
    const dx = (a.x1 - a.x0) / a.len;
    const dy = (a.y1 - a.y0) / a.len;
    for (let j = i + 1; j < n; j++) {
      const b = lines[j];
      if (angleDiff(a.angle, b.angle) > p.mergeAngleDeg) continue;
      const perpTol = Math.max(3, Math.max(a.th, b.th) * p.mergePerpFrac);
      const bmx = (b.x0 + b.x1) / 2;
      const bmy = (b.y0 + b.y1) / 2;
      const perp = Math.abs((bmx - a.x0) * -dy + (bmy - a.y0) * dx);
      if (perp > perpTol) continue;
      const [a0, a1] = span(a, dx, dy, a.x0, a.y0);
      const [b0, b1] = span(b, dx, dy, a.x0, a.y0);
      const gap = Math.max(a0, b0) - Math.min(a1, b1); // negative = overlap
      if (gap <= gapPx) union(i, j);
    }
  }

  const groups = new Map<number, Line[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    (groups.get(r) ?? groups.set(r, []).get(r)!).push(lines[i]);
  }

  const out: Line[] = [];
  for (const members of groups.values()) {
    if (members.length === 1) {
      out.push(members[0]);
      continue;
    }
    const lead = members.reduce((m, l) => (l.len > m.len ? l : m));
    const dx = (lead.x1 - lead.x0) / lead.len;
    const dy = (lead.y1 - lead.y0) / lead.len;
    let smin = Infinity;
    let smax = -Infinity;
    let perpSum = 0;
    let thSum = 0;
    let wSum = 0;
    for (const l of members) {
      for (const [px, py] of [[l.x0, l.y0], [l.x1, l.y1]] as const) {
        const s = (px - lead.x0) * dx + (py - lead.y0) * dy;
        if (s < smin) smin = s;
        if (s > smax) smax = s;
      }
      const perp = ((l.x0 + l.x1) / 2 - lead.x0) * -dy + ((l.y0 + l.y1) / 2 - lead.y0) * dx;
      perpSum += perp * l.len;
      thSum += l.th * l.len;
      wSum += l.len;
    }
    const off = perpSum / wSum;
    const ox = lead.x0 + -dy * off;
    const oy = lead.y0 + dx * off;
    const x0 = ox + dx * smin;
    const y0 = oy + dy * smin;
    const x1 = ox + dx * smax;
    const y1 = oy + dy * smax;
    out.push({
      x0, y0, x1, y1,
      th: thSum / wSum,
      len: Math.hypot(x1 - x0, y1 - y0),
      angle: angleOf(x0, y0, x1, y1),
    });
  }
  return out;
}

interface GapCandidate {
  line: Line;
  flags: string[];
}

interface GapResult {
  doors: GapCandidate[];
  // Wall runs continue THROUGH a doorway (the opening is carved from the
  // wall), but the skeleton stops at each jamb. These candidates span each
  // detected gap so the accepted wall graph is continuous across its doors —
  // mirroring the vector pipeline, which bridges door gaps into one wall.
  bridges: Line[];
}

/**
 * Gap-door candidates: wall runs separated by a door-width gap. Three cases:
 * - collinear runs (classic doorway in a straight wall);
 * - collinear runs with wall-stub ISLANDS between them (two adjacent
 *   doorways share flanks — split the oversized gap at each island);
 * - a run end facing a PERPENDICULAR wall (corner doorway — the far jamb is
 *   the crossing wall itself, so no collinear partner ever exists).
 * Skeleton endpoints retract ~thickness/2 from the true ink end, so gap
 * bounds are trimmed by th/2 on each side to land on the real jamb faces.
 * Emitted with guess "door"; the VLM may relabel window or reject.
 */
function gapOpenings(
  lines: Line[],
  islands: RasterIsland[],
  p: RasterParams,
  mpp: number | null,
): GapResult {
  const doorMin = mpp ? p.doorMinMeters / mpp : p.doorMinPx;
  const doorMax = mpp ? p.doorMaxMeters / mpp : p.doorMaxPx;
  const out: GapCandidate[] = [];
  const bridges: Line[] = [];
  // Run ends already explained by a collinear gap — the corner pass skips
  // them so one doorway doesn't get both a collinear and a corner candidate.
  const usedEnds = new Set<string>();

  const emit = (a: Line, dx: number, dy: number, g0: number, g1: number, th: number, flags: string[]) => {
    out.push({
      line: {
        x0: a.x0 + dx * g0, y0: a.y0 + dy * g0,
        x1: a.x0 + dx * g1, y1: a.y0 + dy * g1,
        th,
        len: g1 - g0,
        angle: a.angle,
      },
      flags,
    });
  };

  // -- collinear pass (with island splitting) ------------------------------
  for (let i = 0; i < lines.length; i++) {
    const a = lines[i];
    const dx = (a.x1 - a.x0) / a.len;
    const dy = (a.y1 - a.y0) / a.len;
    for (let j = i + 1; j < lines.length; j++) {
      const b = lines[j];
      if (angleDiff(a.angle, b.angle) > 3) continue;
      const bmx = (b.x0 + b.x1) / 2;
      const bmy = (b.y0 + b.y1) / 2;
      const perp = Math.abs((bmx - a.x0) * -dy + (bmy - a.y0) * dx);
      if (perp > Math.max(4, Math.max(a.th, b.th) * 0.5)) continue;
      const sa = [(a.x0 - a.x0) * dx + (a.y0 - a.y0) * dy, (a.x1 - a.x0) * dx + (a.y1 - a.y0) * dy].sort((u, v) => u - v);
      const sb = [(b.x0 - a.x0) * dx + (b.y0 - a.y0) * dy, (b.x1 - a.x0) * dx + (b.y1 - a.y0) * dy].sort((u, v) => u - v);
      const rawGap = Math.max(sa[0], sb[0]) - Math.min(sa[1], sb[1]);
      // Up to ~2 doorways + a stub can share one flank pair.
      if (rawGap < doorMin || rawGap > doorMax * 2.5) continue;
      // Both flanks must be substantial — noise stubs don't frame doorways.
      if (a.len < Math.min(rawGap, doorMax) * 0.5 || b.len < Math.min(rawGap, doorMax) * 0.5) continue;

      const aFirst = sa[1] <= sb[1]; // a's run ends where the gap starts
      const thLo = aFirst ? a.th : b.th;
      const thHi = aFirst ? b.th : a.th;
      const g0 = Math.min(sa[1], sb[1]) + thLo / 2; // jamb-face trim
      const g1 = Math.max(sa[0], sb[0]) - thHi / 2;
      if (g1 <= g0) continue;

      // Two kinds of pier split a shared gap into separate doorways:
      // isolated wall-stub islands, and PERPENDICULAR walls whose end meets
      // the door line inside the gap (a T-ing room divider — its last stub
      // is fused into that wall's component, so it never becomes an island).
      const thAvg = (a.th + b.th) / 2;
      const cuts = islands
        .map((isl) => ({
          s: (isl.x - a.x0) * dx + (isl.y - a.y0) * dy,
          perp: Math.abs((isl.x - a.x0) * -dy + (isl.y - a.y0) * dx),
          half: Math.max(isl.longPx, isl.thicknessPx) / 2,
        }))
        .filter((c) => c.perp <= Math.max(4, thAvg * 0.6) && c.s > g0 + 1 && c.s < g1 - 1);
      for (let k = 0; k < lines.length; k++) {
        if (k === i || k === j) continue;
        const c = lines[k];
        if (angleDiff(Math.abs(a.angle - c.angle), 90) > 15) continue;
        const cdx = (c.x1 - c.x0) / c.len;
        const cdy = (c.y1 - c.y0) / c.len;
        const denom = dx * cdy - dy * cdx;
        if (Math.abs(denom) < 1e-6) continue;
        // Intersection of c's line with a's line: a.x0 + s·(dx,dy) = c.x0 + t·(cdx,cdy).
        const wx = c.x0 - a.x0;
        const wy = c.y0 - a.y0;
        const s = (wx * cdy - wy * cdx) / denom;
        const t = (wx * dy - wy * dx) / denom;
        if (s <= g0 + 1 || s >= g1 - 1) continue;
        if (t < -(c.th / 2 + 2) || t > c.len + c.th / 2 + 2) continue; // doesn't reach the door line
        cuts.push({ s, perp: 0, half: c.th / 2 });
      }
      cuts.sort((u, v) => u.s - v.s);

      const bounds: [number, number][] = [];
      let prev = g0;
      for (const c of cuts) {
        bounds.push([prev, c.s - c.half]);
        prev = c.s + c.half;
      }
      bounds.push([prev, g1]);

      let emitted = false;
      for (const [s0, s1] of bounds) {
        const w = s1 - s0;
        if (w < doorMin || w > doorMax) continue;
        emit(a, dx, dy, s0, s1, thAvg, cuts.length ? ["gap", "split"] : ["gap"]);
        emitted = true;
      }
      if (emitted) {
        usedEnds.add(`${i}:${aFirst ? "+" : "-"}`);
        usedEnds.add(`${j}:${aFirst ? "-" : "+"}`);
        const r0 = Math.min(sa[1], sb[1]); // raw skeleton ends — bridge meets both flanks
        const r1 = Math.max(sa[0], sb[0]);
        bridges.push({
          x0: a.x0 + dx * r0, y0: a.y0 + dy * r0,
          x1: a.x0 + dx * r1, y1: a.y0 + dy * r1,
          th: thAvg,
          len: r1 - r0,
          angle: a.angle,
        });
      }
    }
  }

  // -- corner pass ----------------------------------------------------------
  for (let i = 0; i < lines.length; i++) {
    const a = lines[i];
    const dx = (a.x1 - a.x0) / a.len;
    const dy = (a.y1 - a.y0) / a.len;
    for (const sign of [1, -1] as const) {
      if (usedEnds.has(`${i}:${sign > 0 ? "+" : "-"}`)) continue;
      const ex = sign > 0 ? a.x1 : a.x0;
      const ey = sign > 0 ? a.y1 : a.y0;
      const ux = dx * sign; // outward direction past this run end
      const uy = dy * sign;

      // Nearest perpendicular wall crossing the extended run = the far jamb.
      let best: { d: number; th: number } | null = null;
      for (let j = 0; j < lines.length; j++) {
        if (j === i) continue;
        const b = lines[j];
        if (angleDiff(Math.abs(a.angle - b.angle), 90) > 15) continue;
        const bdx = (b.x1 - b.x0) / b.len;
        const bdy = (b.y1 - b.y0) / b.len;
        const denom = ux * bdy - uy * bdx;
        if (Math.abs(denom) < 1e-6) continue;
        // Solve E + d·u = b0 + t·bdir for (d, t).
        const wx = b.x0 - ex;
        const wy = b.y0 - ey;
        const d = (wx * bdy - wy * bdx) / denom;
        const t = (wx * uy - wy * ux) / denom;
        if (d <= 0) continue;
        if (t < -(b.th / 2 + 2) || t > b.len + b.th / 2 + 2) continue; // misses b's body
        if (!best || d < best.d) best = { d, th: b.th };
      }
      if (!best) continue;
      const g0 = a.th / 2; // from the true jamb face of a's end…
      const g1 = best.d - best.th / 2; // …to the near face of the crossing wall
      const w = g1 - g0;
      if (w < doorMin || w > doorMax) continue;
      if (a.len < w * 0.5) continue; // flank must be substantial
      const s0 = (sign > 0 ? a.len : 0) + g0 * sign;
      const s1 = (sign > 0 ? a.len : 0) + g1 * sign;
      emit(a, dx, dy, Math.min(s0, s1), Math.max(s0, s1), a.th, ["gap", "corner"]);
      const sEnd = sign > 0 ? a.len : 0; // bridge: run end → crossing wall's line
      const sCross = sEnd + best.d * sign;
      bridges.push({
        x0: a.x0 + dx * Math.min(sEnd, sCross), y0: a.y0 + dy * Math.min(sEnd, sCross),
        x1: a.x0 + dx * Math.max(sEnd, sCross), y1: a.y0 + dy * Math.max(sEnd, sCross),
        th: a.th,
        len: best.d,
        angle: a.angle,
      });
    }
  }

  return { doors: out, bridges };
}

/**
 * Leaf+arc doors. On drawn plans a doorway carries a door LEAF (straight
 * thin stroke ~door-width long, anchored at the hinge jamb) plus a SWING ARC
 * curving ~90° from the leaf's free tip to the opposite jamb. The skeleton
 * keeps both as thin polyline chains, so hinge and far jamb fall out of
 * connectivity alone — no dependence on a gap in the wall run. This is the
 * only signal for doorways whose gap is bridged by thin header ink
 * (thin-stroke plans) or whose flanking wall stubs are junction-eaten.
 *
 * The ARC CHAIN is detected first (≥3 short segments turning 4–55° per joint
 * with one sign, total sweep in the turn band): headers that close the
 * leaf+arc circuit into a loop and furniture clutter fused onto the hinge
 * don't matter, because only the chain itself plus one leaf segment are
 * needed. Checks that pin it down as a door swing: leaf length ≈ jamb
 * distance (both are the radius) and chord/jamb-distance ≈ √2 (quarter arc).
 * Runs on RAW centerlines: ortho snap would flatten arc pieces.
 */
function arcPathDoors(
  raw: RasterCenterline[],
  p: RasterParams,
  mpp: number | null,
): GapResult {
  const doorMin = mpp ? p.doorMinMeters / mpp : p.doorMinPx;
  const doorMax = mpp ? p.doorMaxMeters / mpp : p.doorMaxPx;

  // Thin, shortish strokes only — wall-grade centerlines can't be leaf/arc ink.
  const segs = raw.filter((c) => {
    if (c.thicknessPx > p.arcThinMaxPx) return false;
    const len = Math.hypot(c.x1 - c.x0, c.y1 - c.y0);
    return len >= 2 && len <= doorMax * 1.2;
  });
  const n = segs.length;

  // Cluster endpoints within arcJoinPx into graph nodes (junction centroids
  // re-attach branches only approximately, so exact-match keying is not
  // enough). Grid buckets keep the pairing near-linear.
  const px = new Float64Array(2 * n);
  const py = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    px[2 * i] = segs[i].x0; py[2 * i] = segs[i].y0;
    px[2 * i + 1] = segs[i].x1; py[2 * i + 1] = segs[i].y1;
  }
  const eParent = Array.from({ length: 2 * n }, (_, i) => i);
  const eFind = (i: number): number => (eParent[i] === i ? i : (eParent[i] = eFind(eParent[i])));
  const cell = Math.max(1, p.arcJoinPx);
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < 2 * n; i++) {
    const k = `${Math.floor(px[i] / cell)}:${Math.floor(py[i] / cell)}`;
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(i);
  }
  for (let i = 0; i < 2 * n; i++) {
    const cx = Math.floor(px[i] / cell);
    const cy = Math.floor(py[i] / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const j of buckets.get(`${cx + dx}:${cy + dy}`) ?? []) {
          if (j <= i) continue;
          if (Math.hypot(px[i] - px[j], py[i] - py[j]) <= p.arcJoinPx && eFind(i) !== eFind(j)) {
            eParent[eFind(i)] = eFind(j);
          }
        }
      }
    }
  }
  const nodeOf = (endIdx: number) => eFind(endIdx);
  // adjacency: node -> incident (segment, its two node ids)
  const adj = new Map<number, { seg: number; a: number; b: number }[]>();
  for (let i = 0; i < n; i++) {
    const a = nodeOf(2 * i);
    const b = nodeOf(2 * i + 1);
    if (a === b) continue; // degenerate/looped tiny piece
    const e = { seg: i, a, b };
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(e);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(e);
  }
  const nodePt = (node: number): [number, number] => {
    // representative coordinate: any member endpoint (cluster radius ≤ joinPx)
    return [px[node], py[node]];
  };
  const segLen = (i: number) => Math.hypot(segs[i].x1 - segs[i].x0, segs[i].y1 - segs[i].y0);

  const turnAt = (
    from: [number, number],
    mid: [number, number],
    to: [number, number],
  ): { deg: number; sign: number } => {
    const ux = mid[0] - from[0];
    const uy = mid[1] - from[1];
    const vx = to[0] - mid[0];
    const vy = to[1] - mid[1];
    const cross = ux * vy - uy * vx;
    const dot = ux * vx + uy * vy;
    return { deg: (Math.atan2(Math.abs(cross), dot) * 180) / Math.PI, sign: Math.sign(cross) };
  };

  interface Chain {
    nodes: number[]; // ordered node ids
  }

  // Grow an arc chain from a seed edge: extend while the next edge turns
  // 4–55° with the majority sign. Greedy smallest-turn choice at each node.
  const growChain = (seed: { seg: number; a: number; b: number }, startAt: number): Chain => {
    const nodes = [startAt, seed.a === startAt ? seed.b : seed.a];
    const usedSegs = new Set<number>([seed.seg]);
    let sign = 0;
    for (;;) {
      const cur = nodes[nodes.length - 1];
      const prev = nodes[nodes.length - 2];
      let best: { edge: { seg: number; a: number; b: number }; next: number; deg: number; sign: number } | null = null;
      for (const e of adj.get(cur) ?? []) {
        if (usedSegs.has(e.seg)) continue;
        const next = e.a === cur ? e.b : e.a;
        if (next === prev) continue;
        const t = turnAt(nodePt(prev), nodePt(cur), nodePt(next));
        if (t.deg < 4 || t.deg > 55) continue;
        if (sign !== 0 && t.sign !== 0 && t.sign !== sign) continue;
        if (!best || t.deg < best.deg) best = { edge: e, next, deg: t.deg, sign: t.sign };
      }
      if (!best) return { nodes };
      if (sign === 0) sign = best.sign;
      usedSegs.add(best.edge.seg);
      nodes.push(best.next);
    }
  };

  // A straight leaf hanging off a chain end: one thin segment (optionally
  // extended through near-collinear continuations) whose far end is the hinge.
  // The leaf is a swing RADIUS, so it must depart the arc at a real angle —
  // a smooth straight continuation of the curve is not a leaf.
  const findLeaf = (
    endNode: number,
    intoChainNode: number,
    avoid: Set<number>,
  ): { hinge: [number, number]; len: number } | null => {
    let best: { hinge: [number, number]; len: number } | null = null;
    for (const e of adj.get(endNode) ?? []) {
      if (avoid.has(e.seg)) continue;
      if (segLen(e.seg) < doorMin * 0.4) continue; // leaf is door-scale, not a stub
      const first = e.a === endNode ? e.b : e.a;
      if (turnAt(nodePt(intoChainNode), nodePt(endNode), nodePt(first)).deg < 30) continue;
      let prev = endNode;
      let cur = e.a === endNode ? e.b : e.a;
      let len = segLen(e.seg);
      const seen = new Set<number>([e.seg]);
      for (let hops = 0; hops < 2; hops++) {
        let ext: { next: number; seg: number } | null = null;
        for (const f of adj.get(cur) ?? []) {
          if (seen.has(f.seg) || avoid.has(f.seg)) continue;
          const next = f.a === cur ? f.b : f.a;
          if (next === prev) continue;
          if (turnAt(nodePt(prev), nodePt(cur), nodePt(next)).deg > 18) continue;
          ext = { next, seg: f.seg };
          break;
        }
        if (!ext) break;
        seen.add(ext.seg);
        len += segLen(ext.seg);
        prev = cur;
        cur = ext.next;
      }
      if (!best || len > best.len) best = { hinge: nodePt(cur), len };
    }
    return best;
  };

  const doors: GapCandidate[] = [];
  const bridges: Line[] = [];
  for (const [node, edges] of adj) {
    for (const seed of edges) {
      if (seed.a !== node) continue; // visit each edge once, grow both ways
      for (const startAt of [seed.a, seed.b]) {
        const chain = growChain(seed, startAt);
        if (chain.nodes.length < 4) continue; // ≥3 segments = a real curve
        // Total sweep between first and last segment directions.
        let sweep = 0;
        for (let i = 0; i + 2 < chain.nodes.length; i++) {
          sweep += turnAt(nodePt(chain.nodes[i]), nodePt(chain.nodes[i + 1]), nodePt(chain.nodes[i + 2])).deg;
        }
        if (sweep < p.arcTurnMinDeg || sweep > p.arcTurnMaxDeg) continue;
        const tip = nodePt(chain.nodes[0]);
        const far = nodePt(chain.nodes[chain.nodes.length - 1]);
        const chord = Math.hypot(far[0] - tip[0], far[1] - tip[1]);
        if (chord < doorMin || chord > doorMax * 1.5) continue;

        // Collect the chain's own segments so the leaf search skips them.
        const avoid = new Set<number>();
        for (let i = 0; i + 1 < chain.nodes.length; i++) {
          for (const e of adj.get(chain.nodes[i]) ?? []) {
            const o = e.a === chain.nodes[i] ? e.b : e.a;
            if (o === chain.nodes[i + 1]) avoid.add(e.seg);
          }
        }
        // The leaf hangs off the OPEN TIP (chain start); hinge = its far end.
        const leaf = findLeaf(chain.nodes[0], chain.nodes[1], avoid);
        if (!leaf) continue;
        const span = Math.hypot(far[0] - leaf.hinge[0], far[1] - leaf.hinge[1]);
        if (span < doorMin || span > doorMax) continue;
        // Leaf and jamb distance are both the swing radius; chord ≈ R√2.
        if (Math.abs(span - leaf.len) > 0.35 * Math.max(span, leaf.len)) continue;
        const chordRatio = chord / span;
        if (chordRatio < 1.05 || chordRatio > 1.9) continue;

        // Hinge/jamb come from endpoint clusters (±joinPx noise), which can
        // tilt a square doorway several degrees — snap near-ortho spans flat.
        // Genuinely diagonal doors (45° corner pantries) stay untouched.
        const line = orthoSnap(
          {
            x0: leaf.hinge[0], y0: leaf.hinge[1], x1: far[0], y1: far[1],
            thicknessPx: segs[seed.seg].thicknessPx,
          },
          12,
        );
        // Dedupe repeats of the same swing found from different seeds.
        const mx = (line.x0 + line.x1) / 2;
        const my = (line.y0 + line.y1) / 2;
        const dup = doors.some((d) => {
          const dmx = (d.line.x0 + d.line.x1) / 2;
          const dmy = (d.line.y0 + d.line.y1) / 2;
          return Math.hypot(dmx - mx, dmy - my) < (d.line.len + line.len) * 0.375;
        });
        if (dup) continue;
        doors.push({ line, flags: ["arcpath"] });
        // Host-wall continuity across the doorway, as with gap doors.
        bridges.push({ ...line });
      }
    }
  }
  return { doors, bridges };
}

export function rasterToCandidates(
  proposal: RasterProposal,
  metersPerPixel: number | null,
  opts?: Partial<RasterParams>,
): CandidateSet {
  const p = { ...DEFAULT_RASTER, ...opts };
  const rawTotal = proposal.centerlines.length;

  const snapped = proposal.centerlines
    .filter((c) => Math.hypot(c.x1 - c.x0, c.y1 - c.y0) >= 2)
    .map((c) => orthoSnap(c, p.orthoSnapDeg));
  const merged = mergeCollinear(snapped, p, p.mergeGapPx);
  const gap = gapOpenings(merged, proposal.islands ?? [], p, metersPerPixel);
  const arc = arcPathDoors(proposal.centerlines, p, metersPerPixel);

  // A doorway with a swing symbol may also read as a gap/corner door; the
  // arc-path span is jamb-exact, so it wins and the gap duplicate is dropped.
  const dupOfArc = (g: GapCandidate) => {
    const gmx = (g.line.x0 + g.line.x1) / 2;
    const gmy = (g.line.y0 + g.line.y1) / 2;
    return arc.doors.some((a) => {
      if (angleDiff(a.line.angle, g.line.angle) > 25) return false;
      const amx = (a.line.x0 + a.line.x1) / 2;
      const amy = (a.line.y0 + a.line.y1) / 2;
      return Math.hypot(amx - gmx, amy - gmy) < (a.line.len + g.line.len) * 0.375;
    });
  };
  const doors = [...arc.doors, ...gap.doors.filter((g) => !dupOfArc(g))];
  const bridges = [...gap.bridges, ...arc.bridges];

  const minWall = metersPerPixel ? p.minWallMeters / metersPerPixel : p.minWallPx;
  const mk = (l: Line, kind: "wall" | "opening", guess: Candidate["guess"], kept: boolean, flags: string[]): Candidate => ({
    id: 0,
    kind,
    guess,
    keptByHeuristic: kept,
    px: [Math.round(l.x0), Math.round(l.y0), Math.round(l.x1), Math.round(l.y1)],
    lengthPx: Math.round(l.len * 10) / 10,
    thicknessPx: Math.round(l.th * 10) / 10,
    angleDeg: Math.round(l.angle * 10) / 10,
    ...(metersPerPixel
      ? { meters: { length: Math.round(l.len * metersPerPixel * 100) / 100, thickness: Math.round(l.th * metersPerPixel * 100) / 100 } }
      : {}),
    flags,
  });

  let candidates: Candidate[] = [
    ...merged.map((l) => {
      const kept = l.len >= minWall && l.th >= 3;
      return mk(l, "wall", kept ? "wall" : "reject", kept, ["raster"]);
    }),
    ...bridges.map((l) => mk(l, "wall", "wall", true, ["raster", "bridge"])),
    ...doors.map((d) => mk(d.line, "opening", "door", true, ["raster", ...d.flags])),
  ];

  // Cap for VLM cost: shortest non-kept wall candidates go first.
  if (candidates.length > p.maxCandidates) {
    const keep = candidates.filter((c) => c.keptByHeuristic || c.kind === "opening");
    const rest = candidates
      .filter((c) => !c.keptByHeuristic && c.kind !== "opening")
      .sort((a, b) => b.lengthPx - a.lengthPx)
      .slice(0, Math.max(0, p.maxCandidates - keep.length));
    candidates = [...keep, ...rest];
  }

  candidates.forEach((c, i) => { c.id = i + 1; });

  const byGuess: Record<string, number> = {};
  for (const c of candidates) byGuess[c.guess] = (byGuess[c.guess] ?? 0) + 1;
  return {
    candidates,
    stats: {
      total: candidates.length,
      rawTotal,
      keptByHeuristic: candidates.filter((c) => c.keptByHeuristic).length,
      byGuess,
    },
  };
}
