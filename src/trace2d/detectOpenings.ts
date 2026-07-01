import type { ImportSegment, ImportArc, TracePoint, TraceSegment } from "@/store/useSceneStore";
import type { Centerline } from "./extractWalls";
import { NOISE_LAYERS, measureThicknessAt } from "./extractWalls";

// ---------------------------------------------------------------------------
// Opening detection (Phase 2, hybrid). Doors and windows are read from the wall
// GEOMETRY itself instead of a CAD layer:
//
//   * a DOOR is a BREAK in the wall — a span where both wall faces are absent
//     (coverage drops to 0) bounded by real wall on both sides.
//   * a WINDOW is 3+ parallel lines cramped into the same wall run — a span
//     where coverage rises to >= 3 (the two faces plus glass/frame lines, or
//     the glass lines that fill a wall gap).
//
// We walk ALONG each wall run and build a 1-D "coverage count" profile of the
// band-parallel black lines, then classify sub-spans by that count. Doors also
// let us bridge the two wall pieces into ONE continuous wall with the opening
// carved across the gap (matches Phase 1's TraceOpening + segment-splitting),
// which cleans up wall tracking as a side effect.
// ---------------------------------------------------------------------------

export interface DetectParams {
  angleTolDeg: number; // parallel tolerance for band membership + grouping
  bandMargin: number; // extra perpendicular margin beyond thickness/2
  offsetTol: number; // cluster face fragments within this perpendicular offset
  mergeGap: number; // bridge collinear fragments along one face up to this gap
  groupOffsetTol: number; // group collinear centerlines into one wall run
  minDoorPx: number; // ignore breaks shorter than this (fragment noise)
  maxDoorPx: number; // fallback door-width cap when no scale is set
  maxDoorMeters: number; // real-world door-width cap (used with metersPerPixel)
  minMaterialPx: number; // min solid wall on each side of a door
  minWindowPx: number; // min window span
  maxWindowPx: number; // fallback window-width cap when no scale is set
  maxWindowMeters: number; // real-world window-width cap (used with metersPerPixel)
  minArcChordPx: number; // smaller arcs are rounded corners / text, not door swings
  maxArcChordPx: number; // sanity cap on swing size
  arcMaxWallDist: number; // a swing arc must be within this of a wall to place a door
}

export const DEFAULT_DETECT: DetectParams = {
  angleTolDeg: 4,
  bandMargin: 3,
  offsetTol: 2.5,
  mergeGap: 8,
  groupOffsetTol: 6,
  minDoorPx: 20,
  maxDoorPx: 130,
  maxDoorMeters: 1.2,
  minMaterialPx: 8,
  minWindowPx: 28,
  maxWindowPx: 220,
  maxWindowMeters: 2.0,
  minArcChordPx: 30,
  maxArcChordPx: 500,
  arcMaxWallDist: 45,
};

export interface SuggestedOpening {
  id: string;
  type: "door" | "window";
  x0: number; // opening endpoints along the wall centerline (image px)
  y0: number;
  x1: number;
  y1: number;
  width: number; // px along the wall
  thickness: number; // host wall thickness (px)
}

export interface OpeningDetection {
  openings: SuggestedOpening[];
  walls: Centerline[]; // opening-aware walls: door gaps bridged, wide gaps split
}

const isArch = (s: ImportSegment) =>
  s.color != null &&
  s.color[0] < 0.22 &&
  s.color[1] < 0.22 &&
  s.color[2] < 0.22 &&
  !NOISE_LAYERS.has(s.layer);

const fold = (a: number) => {
  let t = a % Math.PI;
  if (t < 0) t += Math.PI;
  if (t >= Math.PI - 1e-9) t -= Math.PI;
  return t;
};

interface Interval {
  a: number;
  b: number;
  count: number;
}

// Piecewise-constant coverage count over a set of [a,b] intervals (one per
// covering line). Returns maximal runs of constant count, ordered by position.
function coverageProfile(intervals: [number, number][]): Interval[] {
  if (intervals.length === 0) return [];
  const pts = new Set<number>();
  for (const [a, b] of intervals) {
    pts.add(a);
    pts.add(b);
  }
  const breaks = [...pts].sort((m, n) => m - n);
  const raw: Interval[] = [];
  for (let i = 0; i < breaks.length - 1; i++) {
    const a = breaks[i];
    const b = breaks[i + 1];
    if (b - a < 1e-6) continue;
    const mid = (a + b) / 2;
    let count = 0;
    for (const [ia, ib] of intervals) if (ia <= mid && mid < ib) count++;
    raw.push({ a, b, count });
  }
  // Coalesce adjacent runs of equal count.
  const out: Interval[] = [];
  for (const r of raw) {
    const last = out[out.length - 1];
    if (last && last.count === r.count && Math.abs(last.b - r.a) < 1e-6) last.b = r.b;
    else out.push({ ...r });
  }
  return out;
}

/**
 * Detect doors (breaks) and windows (3+ cramped lines) along the extracted wall
 * centerlines. `metersPerPixel` (if set) caps door width by real size.
 */
export function detectOpenings(
  segs: ImportSegment[],
  centerlines: Centerline[],
  arcs: ImportArc[],
  metersPerPixel: number | null,
  params: DetectParams = DEFAULT_DETECT,
): OpeningDetection {
  const angleTol = (params.angleTolDeg * Math.PI) / 180;
  const doorCap =
    metersPerPixel && metersPerPixel > 0
      ? params.maxDoorMeters / metersPerPixel
      : params.maxDoorPx;
  const windowCap =
    metersPerPixel && metersPerPixel > 0
      ? params.maxWindowMeters / metersPerPixel
      : params.maxWindowPx;

  // --- group collinear centerlines into wall runs (same angle + offset) ---
  interface Piece {
    cl: Centerline;
    s0: number;
    s1: number;
  }
  const groups = new Map<string, { theta: number; offset: number; pieces: Piece[] }>();
  for (const cl of centerlines) {
    const theta = fold(Math.atan2(cl.y1 - cl.y0, cl.x1 - cl.x0));
    const ux = Math.cos(theta);
    const uy = Math.sin(theta);
    const vx = -uy;
    const vy = ux;
    const offset = ((cl.x0 + cl.x1) / 2) * vx + ((cl.y0 + cl.y1) / 2) * vy;
    const s0 = cl.x0 * ux + cl.y0 * uy;
    const s1 = cl.x1 * ux + cl.y1 * uy;
    const key = `${Math.round(theta / angleTol)}:${Math.round(offset / params.groupOffsetTol)}`;
    let g = groups.get(key);
    if (!g) {
      g = { theta, offset, pieces: [] };
      groups.set(key, g);
    }
    g.pieces.push({ cl, s0: Math.min(s0, s1), s1: Math.max(s0, s1) });
  }

  const openings: SuggestedOpening[] = [];
  const walls: Centerline[] = [];
  let oid = 0;

  for (const g of groups.values()) {
    const ux = Math.cos(g.theta);
    const uy = Math.sin(g.theta);
    const pvx = -uy; // perpendicular (v)
    const pvy = ux;

    g.pieces.sort((a, b) => a.s0 - b.s0);
    const runStart = g.pieces[0].s0;
    const runEnd = g.pieces[g.pieces.length - 1].s1;
    const thickness =
      g.pieces.reduce((s, p) => s + p.cl.thickness, 0) / g.pieces.length;
    const halfBand = thickness / 2 + params.bandMargin;

    // Stairs: 4+ parallel lines in a REGULAR series (uniform spacing) across a
    // wide strip. Reject the whole region — it's neither wall nor window. The
    // regularity test spares adjacent walls (whose spacings are uneven).
    if (isStairRegion(segs, g.theta, g.offset, runStart, runEnd, angleTol)) continue;

    // --- gather band-parallel raw segments, cluster by offset into face lines ---
    interface Frag {
      off: number;
      a: number;
      b: number;
    }
    const frags: Frag[] = [];
    for (const s of segs) {
      if (!isArch(s)) continue;
      const th = fold(Math.atan2(s.y1 - s.y0, s.x1 - s.x0));
      let da = Math.abs(th - g.theta);
      da = Math.min(da, Math.PI - da);
      if (da > angleTol) continue;
      const off = s.x0 * pvx + s.y0 * pvy;
      if (Math.abs(off - g.offset) > halfBand) continue;
      let a = s.x0 * ux + s.y0 * uy;
      let b = s.x1 * ux + s.y1 * uy;
      if (a > b) [a, b] = [b, a];
      if (b < runStart - 4 || a > runEnd + 4) continue;
      frags.push({ off, a: Math.max(a, runStart), b: Math.min(b, runEnd) });
    }
    if (frags.length === 0) {
      walls.push(g.pieces[0].cl);
      continue;
    }

    // cluster fragments into distinct face/glass lines by perpendicular offset
    frags.sort((p, q) => p.off - q.off);
    const clusters: [number, number][][] = []; // each cluster = list of [a,b]
    let ci = 0;
    while (ci < frags.length) {
      let cj = ci;
      const ivs: [number, number][] = [];
      while (cj < frags.length && frags[cj].off - frags[ci].off <= params.offsetTol) {
        ivs.push([frags[cj].a, frags[cj].b]);
        cj++;
      }
      // merge collinear fragments within this line (bridge small gaps)
      ivs.sort((m, n) => m[0] - n[0]);
      const merged: [number, number][] = [];
      let cs = ivs[0][0];
      let ce = ivs[0][1];
      for (let k = 1; k < ivs.length; k++) {
        if (ivs[k][0] <= ce + params.mergeGap) ce = Math.max(ce, ivs[k][1]);
        else {
          merged.push([cs, ce]);
          cs = ivs[k][0];
          ce = ivs[k][1];
        }
      }
      merged.push([cs, ce]);
      clusters.push(merged);
      ci = cj;
    }

    // coverage count profile = how many distinct lines cover each position s
    const allIntervals: [number, number][] = [];
    for (const c of clusters) for (const iv of c) allIntervals.push(iv);
    const profile = coverageProfile(allIntervals);

    const toXY = (s: number, off: number) => ({
      x: ux * s + pvx * off,
      y: uy * s + pvy * off,
    });

    // --- classify runs; build opening-aware continuous walls ---
    // A door is an interior count==0 gap (<= doorCap) with real wall on both
    // sides; it BRIDGES the wall. A count==0 gap wider than doorCap SPLITS the
    // wall into separate runs. A window is a count>=3 span.
    let matStart: number | null = null; // start of the current continuous wall
    let matEnd = runStart;

    const flushWall = () => {
      if (matStart != null && matEnd - matStart >= params.minMaterialPx) {
        const p0 = toXY(matStart, g.offset);
        const p1 = toXY(matEnd, g.offset);
        walls.push({ x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y, thickness });
      }
      matStart = null;
    };

    for (let i = 0; i < profile.length; i++) {
      const r = profile[i];
      const w = r.b - r.a;
      const isEnd = i === 0 || i === profile.length - 1;

      if (r.count >= 3) {
        // 3+ parallel lines CRAMPED inside the wall band = a WINDOW (2 faces +
        // glass/frame panes). "Cramped" is guaranteed by the narrow band; stairs
        // are spaced far apart and handled by isStairRegion above. The wall
        // continues through the window (keep it as material) and we carve it.
        if (matStart == null) matStart = r.a;
        matEnd = r.b;
        if (w >= params.minWindowPx && w <= windowCap) {
          const p0 = toXY(r.a, g.offset);
          const p1 = toXY(r.b, g.offset);
          openings.push({
            id: `op${oid++}`,
            type: "window",
            x0: p0.x,
            y0: p0.y,
            x1: p1.x,
            y1: p1.y,
            width: w,
            thickness,
          });
        }
        continue;
      }

      if (r.count === 0) {
        if (!isEnd && w >= params.minDoorPx && w <= doorCap && matStart != null) {
          // door: bridge the gap, carve an opening
          matEnd = r.b;
          const p0 = toXY(r.a, g.offset);
          const p1 = toXY(r.b, g.offset);
          openings.push({
            id: `op${oid++}`,
            type: "door",
            x0: p0.x,
            y0: p0.y,
            x1: p1.x,
            y1: p1.y,
            width: w,
            thickness,
          });
        } else {
          // real separation (or trailing/leading empty) → end this wall
          flushWall();
        }
        continue;
      }

      // count 1 or 2 → solid wall material
      if (matStart == null) matStart = r.a;
      matEnd = r.b;
    }
    flushWall();
  }

  // --- arc-driven doors: each big swing arc confirms a door on the nearest wall ---
  // A 90° swing is centered on the hinge (radius R = leaf length); its two
  // endpoints are the closed-leaf tip and the open-leaf tip. The hinge and the
  // closed tip both lie ON the wall a door-width apart; the open tip sticks out
  // perpendicular. So of {p0, p1, centerA, centerB}, the two closest to the wall
  // line are the door jambs — project them to get the span.
  const arcDoors: SuggestedOpening[] = [];
  for (const arc of arcs) {
    if (arc.chord < params.minArcChordPx || arc.chord > params.maxArcChordPx) continue;
    const mx = (arc.x0 + arc.x1) / 2;
    const my = (arc.y0 + arc.y1) / 2;
    const cdx = arc.x1 - arc.x0;
    const cdy = arc.y1 - arc.y0;
    const cl = Math.hypot(cdx, cdy) || 1;
    const nx = -cdy / cl;
    const ny = cdx / cl;
    const half = arc.chord / 2; // hinge candidates sit ±chord/2 along the normal
    const cand = [
      { x: arc.x0, y: arc.y0 },
      { x: arc.x1, y: arc.y1 },
      { x: mx + half * nx, y: my + half * ny },
      { x: mx - half * nx, y: my - half * ny },
    ];

    // nearest wall centerline to the arc
    let best: Centerline | null = null;
    let bestd = Infinity;
    for (const c of centerlines) {
      const d = pointCenterlineDist(mx, my, c);
      if (d < bestd) {
        bestd = d;
        best = c;
      }
    }
    if (!best || bestd > params.arcMaxWallDist) continue;

    const dx = best.x1 - best.x0;
    const dy = best.y1 - best.y0;
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L;
    const uy = dy / L;
    // (t along wall, perpendicular distance) for each candidate
    const proj = cand
      .map((p) => {
        const t = (p.x - best!.x0) * ux + (p.y - best!.y0) * uy;
        const projx = best!.x0 + ux * t;
        const projy = best!.y0 + uy * t;
        return { t, perp: Math.hypot(p.x - projx, p.y - projy) };
      })
      .sort((a, b) => a.perp - b.perp);
    const t0 = Math.min(proj[0].t, proj[1].t);
    const t1 = Math.max(proj[0].t, proj[1].t);
    if (t1 - t0 < params.minDoorPx || t1 - t0 > doorCap * 1.3) continue;
    arcDoors.push({
      id: `opa${arcDoors.length}`,
      type: "door",
      x0: best.x0 + ux * t0,
      y0: best.y0 + uy * t0,
      x1: best.x0 + ux * t1,
      y1: best.y0 + uy * t1,
      width: t1 - t0,
      thickness: best.thickness,
    });
  }

  // Merge: prefer arc doors; drop gap-doors that duplicate an arc door.
  const near = (a: SuggestedOpening, b: SuggestedOpening) =>
    Math.hypot((a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2, (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2) <
    Math.max(a.width, b.width) * 0.6;
  const merged = openings.filter(
    (o) => o.type !== "door" || !arcDoors.some((a) => near(o, a)),
  );
  merged.push(...arcDoors);

  return { openings: merged, walls };
}

/**
 * True if a wide strip around a wall direction holds 4+ parallel lines at
 * roughly uniform spacing — the signature of stairs (or a tread/tile grid).
 * Walls (even a couple side by side) have uneven spacing and fail this.
 */
function isStairRegion(
  segs: ImportSegment[],
  theta: number,
  offset: number,
  s0: number,
  s1: number,
  angleTol: number,
  stripPx = 200,
  minLines = 4,
  gapMin = 12,
  gapMax = 110,
  regularity = 2.0,
): boolean {
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);
  const vx = -uy;
  const vy = ux;
  // distinct parallel lines (by perpendicular offset) overlapping [s0,s1]
  const offs: number[] = [];
  for (const s of segs) {
    if (!isArch(s)) continue;
    const th = fold(Math.atan2(s.y1 - s.y0, s.x1 - s.x0));
    let da = Math.abs(th - theta);
    da = Math.min(da, Math.PI - da);
    if (da > angleTol) continue;
    const o = s.x0 * vx + s.y0 * vy;
    if (Math.abs(o - offset) > stripPx) continue;
    const a = s.x0 * ux + s.y0 * uy;
    const b = s.x1 * ux + s.y1 * uy;
    if (Math.min(Math.max(a, b), s1) - Math.max(Math.min(a, b), s0) < 20) continue;
    offs.push(o);
  }
  if (offs.length < minLines) return false;
  offs.sort((a, b) => a - b);
  // collapse near-duplicate offsets into distinct lines
  const lines: number[] = [];
  for (const o of offs) {
    if (lines.length === 0 || o - lines[lines.length - 1] > 3) lines.push(o);
  }
  // scan for a contiguous run of >=minLines with uniform gaps in [gapMin,gapMax]
  for (let i = 0; i < lines.length; i++) {
    const gaps: number[] = [];
    let j = i;
    while (j + 1 < lines.length) {
      const gap = lines[j + 1] - lines[j];
      if (gap < gapMin || gap > gapMax) break;
      gaps.push(gap);
      j++;
    }
    if (gaps.length + 1 >= minLines) {
      const mn = Math.min(...gaps);
      const mx = Math.max(...gaps);
      if (mx / mn <= regularity) return true;
    }
    if (j > i) i = j - 1;
  }
  return false;
}

// Distance from a point to a centerline segment.
function pointCenterlineDist(px: number, py: number, c: Centerline): number {
  const abx = c.x1 - c.x0;
  const aby = c.y1 - c.y0;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-9) return Math.hypot(px - c.x0, py - c.y0);
  let t = ((px - c.x0) * abx + (py - c.y0) * aby) / len2;
  t = Math.min(1, Math.max(0, t));
  return Math.hypot(px - (c.x0 + abx * t), py - (c.y0 + aby * t));
}

/**
 * Build centerlines from the user's traced walls (the "clean" opening pass):
 * each trace segment becomes a centerline, with thickness measured from the
 * underlying PDF double-line at its midpoint (falls back to `fallback` px).
 * Running detectOpenings on THESE gives high-precision openings because the
 * wall geometry is human-verified.
 */
export function traceToCenterlines(
  points: TracePoint[],
  segments: TraceSegment[],
  segs: ImportSegment[],
  fallback = 28,
): Centerline[] {
  const byId = new Map(points.map((p) => [p.id, p]));
  const out: Centerline[] = [];
  for (const s of segments) {
    const a = byId.get(s.a);
    const b = byId.get(s.b);
    if (!a || !b) continue;
    const th = measureThicknessAt((a.x + b.x) / 2, (a.y + b.y) / 2, segs) ?? fallback;
    out.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y, thickness: th });
  }
  return out;
}

/**
 * Locate the trace segment a detected opening belongs to and its normalized
 * span (t0..t1). Picks the parallel segment whose line is closest to the
 * opening's midpoint and that actually contains it. Returns null if none fits.
 */
export function mapOpeningToSegment(
  op: SuggestedOpening,
  points: TracePoint[],
  segments: TraceSegment[],
  maxPerp = 18,
): { segmentId: string; t0: number; t1: number } | null {
  const byId = new Map(points.map((p) => [p.id, p]));
  const mx = (op.x0 + op.x1) / 2;
  const my = (op.y0 + op.y1) / 2;
  const opTheta = fold(Math.atan2(op.y1 - op.y0, op.x1 - op.x0));

  let best: { id: string; t0: number; t1: number; perp: number } | null = null;
  for (const s of segments) {
    const a = byId.get(s.a);
    const b = byId.get(s.b);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-6) continue;
    let da = Math.abs(fold(Math.atan2(dy, dx)) - opTheta);
    da = Math.min(da, Math.PI - da);
    if (da > 0.15) continue; // must be parallel to the opening
    const tMid = ((mx - a.x) * dx + (my - a.y) * dy) / len2;
    if (tMid < -0.02 || tMid > 1.02) continue; // midpoint must lie on the wall
    const px = a.x + dx * tMid;
    const py = a.y + dy * tMid;
    const perp = Math.hypot(mx - px, my - py);
    if (perp > maxPerp) continue;
    const t0 = ((op.x0 - a.x) * dx + (op.y0 - a.y) * dy) / len2;
    const t1 = ((op.x1 - a.x) * dx + (op.y1 - a.y) * dy) / len2;
    if (!best || perp < best.perp) {
      best = {
        id: s.id,
        t0: Math.min(1, Math.max(0, Math.min(t0, t1))),
        t1: Math.min(1, Math.max(0, Math.max(t0, t1))),
        perp,
      };
    }
  }
  if (!best || best.t1 - best.t0 < 1e-3) return null;
  return { segmentId: best.id, t0: best.t0, t1: best.t1 };
}
