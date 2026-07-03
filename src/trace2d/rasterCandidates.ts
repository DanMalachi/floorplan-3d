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
  const { doors, bridges } = gapOpenings(merged, proposal.islands ?? [], p, metersPerPixel);

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
