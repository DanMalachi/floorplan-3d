import type { ImportSegment, ImportArc, TracePoint, TraceSegment } from "@/store/useSceneStore";
import type { Centerline } from "./extractWalls";
import { NOISE_LAYERS, measureThicknessAt, REF_MPP } from "./extractWalls";

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
  windowPerimeterMargin: number; // windows must sit within this of the building perimeter
  // Phase 2.5 candidate mode: keep openings the filters would drop, tagged with
  // WHY in `flags`, so the VLM can make the final call.
  keepRejected?: boolean;
}

// Rescale the px-semantic detection params to keep meaning the same real-world
// sizes on renders at a different scale than the reference tuning (see
// scaleExtractParams in extractWalls.ts).
export function scaleDetectParams(p: DetectParams, mpp: number | null): DetectParams {
  if (!mpp || mpp <= 0) return p;
  const k = REF_MPP / mpp;
  if (Math.abs(k - 1) < 0.15) return p;
  const s = (v: number, floor: number) => Math.max(floor, v * k);
  return {
    ...p,
    bandMargin: s(p.bandMargin, 1.5),
    offsetTol: s(p.offsetTol, 1.5),
    mergeGap: s(p.mergeGap, 3),
    groupOffsetTol: s(p.groupOffsetTol, 3),
    minDoorPx: s(p.minDoorPx, 8),
    minMaterialPx: s(p.minMaterialPx, 4),
    minWindowPx: s(p.minWindowPx, 10),
    minArcChordPx: s(p.minArcChordPx, 12),
    maxArcChordPx: s(p.maxArcChordPx, 100),
    arcMaxWallDist: s(p.arcMaxWallDist, 15),
    windowPerimeterMargin: s(p.windowPerimeterMargin, 15),
  };
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
  arcMaxWallDist: 60,
  windowPerimeterMargin: 40,
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
  // Candidate-mode provenance: "arc" (swing-arc door), "gap" (coverage-gap door),
  // "inStairRegion", "interior" (window off the perimeter), "dupOfArc".
  flags?: string[];
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
    const stairRun = isStairRegion(segs, g.theta, g.offset, runStart, runEnd, angleTol);
    if (stairRun && !params.keepRejected) continue;
    const runFlags = stairRun ? ["inStairRegion"] : [];

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
            ...(runFlags.length ? { flags: [...runFlags] } : {}),
          });
        }
        continue;
      }

      if (r.count === 0) {
        // A doorway is a gap in a REAL wall — it needs proper wall on BOTH
        // sides. Real wall reads as coverage count >= 2 (two faces / a filled
        // outline); collinear furniture edges form pseudo-runs of single lines
        // (count 1), which is what phantom cross-room doors are made of. Length
        // stays permissive (jamb stubs between corridor doors are ~15-20px).
        const prev = profile[i - 1];
        const next = profile[i + 1];
        const flanked =
          prev != null &&
          next != null &&
          prev.count >= 2 &&
          next.count >= 2 &&
          prev.b - prev.a >= params.minMaterialPx &&
          next.b - next.a >= params.minMaterialPx;
        if (!isEnd && flanked && w >= params.minDoorPx && w <= doorCap && matStart != null) {
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
            flags: ["gap", ...runFlags],
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

  // --- arc + door-leaf → doors ---
  // A door is drawn as a swing ARC plus the door LEAF (2 parallel lines = the
  // panel). The leaf runs from the hinge (its base, = the arc's center) to the
  // closed-leaf tip (= one arc endpoint). The opening sits IN FRONT OF the arc,
  // along the wall, at a RIGHT ANGLE to the leaf: from the hinge, perpendicular
  // to the leaf, a door-width toward the open swing. We anchor on the hinge so
  // placement is reliable even when the arc midpoint is far from the wall.
  const arcDoors: SuggestedOpening[] = [];
  for (const arc of arcs) {
    if (arc.chord < params.minArcChordPx || arc.chord > params.maxArcChordPx) continue;
    const R = arc.chord / Math.SQRT2; // door width (90° swing)
    const A = { x: arc.x0, y: arc.y0 };
    const B = { x: arc.x1, y: arc.y1 };

    // Build hinge candidates: the leaf base (most reliable) plus the two
    // arc-center candidates as fallback. The correct hinge sits ON a wall.
    const mx = (A.x + B.x) / 2;
    const my = (A.y + B.y) / 2;
    const cl = Math.hypot(B.x - A.x, B.y - A.y) || 1;
    const nx = -(B.y - A.y) / cl;
    const ny = (B.x - A.x) / cl;
    const h = arc.chord / 2;
    const openByWall = nearestWallDist(A, centerlines) <= nearestWallDist(B, centerlines) ? A : B;
    const hingeCands: { hinge: { x: number; y: number }; openTip: { x: number; y: number } }[] = [
      { hinge: { x: mx + h * nx, y: my + h * ny }, openTip: openByWall },
      { hinge: { x: mx - h * nx, y: my - h * ny }, openTip: openByWall },
    ];
    const leaf = findDoorLeaf(segs, arc, R);
    if (leaf) {
      // the leaf end coinciding with an arc endpoint is the closed tip; the
      // other leaf end is the hinge; the far arc endpoint is the open tip.
      const d1 = Math.min(dist(leaf.e1, A), dist(leaf.e1, B));
      const d2 = Math.min(dist(leaf.e2, A), dist(leaf.e2, B));
      const leafHinge = d1 <= d2 ? leaf.e2 : leaf.e1;
      const closer = d1 <= d2 ? leaf.e1 : leaf.e2;
      const openTip = dist(closer, A) <= dist(closer, B) ? B : A;
      hingeCands.unshift({ hinge: leafHinge, openTip }); // prefer the leaf hinge
    }

    // Doorway model: the door swings 90° from CLOSED (leaf lying IN the wall
    // line, its tip = one arc endpoint) to OPEN (the drawn leaf, tip = the
    // other endpoint). So the doorway wall contains BOTH the hinge and the
    // CLOSED tip, and the doorway spans hinge → closed tip. When the leaf is
    // drawn, the closed tip is identifiable wall-free: hinge→closedTip runs
    // roughly PERPENDICULAR to the leaf (90° swing) — without this, a corner
    // door's side wall (hinge sits on it too, open tip nearby) can win and the
    // span lands 90° off the true doorway.
    let leafClosedTip: { x: number; y: number } | null = null;
    if (leaf) {
      const ll = Math.hypot(leaf.e2.x - leaf.e1.x, leaf.e2.y - leaf.e1.y) || 1;
      const ldx = (leaf.e2.x - leaf.e1.x) / ll;
      const ldy = (leaf.e2.y - leaf.e1.y) / ll;
      const hingeRef = hingeCands[0].hinge; // leaf hinge (unshifted preference)
      const perpness = (t: { x: number; y: number }) => {
        const vl = Math.hypot(t.x - hingeRef.x, t.y - hingeRef.y) || 1;
        return Math.abs(((t.x - hingeRef.x) * ldx + (t.y - hingeRef.y) * ldy) / vl); // 0 = ⊥ leaf
      };
      const pA = perpness(A);
      const pB = perpness(B);
      const cand = pA <= pB ? A : B;
      if (Math.min(pA, pB) < 0.5) leafClosedTip = cand; // within ~60° of ⊥
    }

    // Score every wall by dist(hinge) + dist(closed tip). In strict mode place
    // the door on the best wall only; in candidate (keepRejected) mode emit the
    // top TWO distinct placements — at corners the geometry is genuinely
    // ambiguous, and the VLM sees where the actual gap is. Recall first.
    interface WallPick {
      c: Centerline;
      score: number;
      hinge: { x: number; y: number };
      tip: { x: number; y: number };
    }
    const picks: WallPick[] = [];
    for (const c of centerlines) {
      let tip: { x: number; y: number };
      let dTip: number;
      if (leafClosedTip) {
        tip = leafClosedTip;
        dTip = pointCenterlineDist(tip.x, tip.y, c);
      } else {
        const dA = pointCenterlineDist(A.x, A.y, c);
        const dB = pointCenterlineDist(B.x, B.y, c);
        tip = dA <= dB ? A : B;
        dTip = Math.min(dA, dB);
      }
      let hinge = hingeCands[0].hinge;
      let scoreBest = Infinity;
      for (const cand of hingeCands) {
        const dH = pointCenterlineDist(cand.hinge.x, cand.hinge.y, c);
        if (dH + dTip < scoreBest) {
          scoreBest = dH + dTip;
          hinge = cand.hinge;
        }
      }
      if (scoreBest <= params.arcMaxWallDist * 2) {
        picks.push({ c, score: scoreBest, hinge, tip });
      }
    }
    picks.sort((p, q) => p.score - q.score);
    // Distinct placements only: skip a second pick collinear with the first.
    const chosen: WallPick[] = [];
    for (const p of picks) {
      if (chosen.length >= (params.keepRejected ? 2 : 1)) break;
      const dup = chosen.some((q) => {
        let da = Math.abs(
          fold(Math.atan2(q.c.y1 - q.c.y0, q.c.x1 - q.c.x0)) -
            fold(Math.atan2(p.c.y1 - p.c.y0, p.c.x1 - p.c.x0)),
        );
        da = Math.min(da, Math.PI - da);
        return da < 0.2;
      });
      if (!dup) chosen.push(p);
    }
    for (let pi = 0; pi < chosen.length; pi++) {
      const { c: bw, hinge, tip } = chosen[pi];
      const L = Math.hypot(bw.x1 - bw.x0, bw.y1 - bw.y0) || 1;
      const ux = (bw.x1 - bw.x0) / L;
      const uy = (bw.y1 - bw.y0) / L;
      const tH = (hinge.x - bw.x0) * ux + (hinge.y - bw.y0) * uy;
      const tC = (tip.x - bw.x0) * ux + (tip.y - bw.y0) * uy;
      let t0 = Math.min(tH, tC);
      let t1 = Math.max(tH, tC);
      // Sanity: the span should be about the door width R; fall back to R from
      // the hinge when the projection degenerates (e.g. skewed arc endpoints).
      if (t1 - t0 < R * 0.4 || t1 - t0 > R * 1.6) {
        const dir = Math.sign(tC - tH || 1);
        t0 = Math.min(tH, tH + dir * Math.min(R, doorCap * 1.3));
        t1 = Math.max(tH, tH + dir * Math.min(R, doorCap * 1.3));
      }
      if (t1 - t0 < params.minDoorPx) continue;
      arcDoors.push({
        id: `opa${arcDoors.length}`,
        type: "door",
        x0: bw.x0 + ux * t0,
        y0: bw.y0 + uy * t0,
        x1: bw.x0 + ux * t1,
        y1: bw.y0 + uy * t1,
        width: t1 - t0,
        thickness: bw.thickness,
        flags: pi === 0 ? ["arc"] : ["arc", "altWall"],
      });
    }
  }

  // Merge: prefer arc doors; drop gap-doors that duplicate an arc door — either
  // overlapping, or collinear on the same wall within ~a door-width (the same
  // doorway picked up twice).
  const dupOfArc = (g: SuggestedOpening) =>
    arcDoors.some((a) => {
      const gmx = (g.x0 + g.x1) / 2;
      const gmy = (g.y0 + g.y1) / 2;
      const amx = (a.x0 + a.x1) / 2;
      const amy = (a.y0 + a.y1) / 2;
      if (Math.hypot(gmx - amx, gmy - amy) < Math.max(a.width, g.width) * 0.6) return true;
      const aL = Math.hypot(a.x1 - a.x0, a.y1 - a.y0) || 1;
      const ux = (a.x1 - a.x0) / aL;
      const uy = (a.y1 - a.y0) / aL;
      const perp = Math.abs((gmx - amx) * -uy + (gmy - amy) * ux);
      const along = Math.abs((gmx - amx) * ux + (gmy - amy) * uy);
      return perp < 12 && along < (a.width + g.width) * 0.9;
    });
  const merged = openings.flatMap((o) => {
    if (o.type === "door" && dupOfArc(o)) {
      if (!params.keepRejected) return [];
      return [{ ...o, flags: [...(o.flags ?? []), "dupOfArc"] }];
    }
    return [o];
  });
  merged.push(...arcDoors);

  // Windows sit on the building perimeter (exterior walls). Drop interior false
  // windows — door frames / fixtures whose 3 cramped lines mimic a window.
  let result = merged;
  if (centerlines.length) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const c of centerlines) {
      minX = Math.min(minX, c.x0, c.x1);
      maxX = Math.max(maxX, c.x0, c.x1);
      minY = Math.min(minY, c.y0, c.y1);
      maxY = Math.max(maxY, c.y0, c.y1);
    }
    const m = params.windowPerimeterMargin;
    result = merged.flatMap((o) => {
      if (o.type !== "window") return [o];
      const mx = (o.x0 + o.x1) / 2;
      const my = (o.y0 + o.y1) / 2;
      const onPerimeter = Math.min(mx - minX, maxX - mx, my - minY, maxY - my) <= m;
      if (onPerimeter) return [o];
      if (!params.keepRejected) return [];
      return [{ ...o, flags: [...(o.flags ?? []), "interior"] }];
    });
  }

  return { openings: result, walls };
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

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

function nearestWallDist(p: { x: number; y: number }, cls: Centerline[]): number {
  let d = Infinity;
  for (const c of cls) d = Math.min(d, pointCenterlineDist(p.x, p.y, c));
  return d;
}

/**
 * Find the door leaf near a swing arc: the 2 parallel lines (the panel), roughly
 * the door width (R) long and a few px apart, close to the arc. Returns the
 * midline endpoints, or null. Used to orient the opening perpendicular to the
 * leaf and anchor it at the hinge (the leaf's base).
 */
function findDoorLeaf(
  segs: ImportSegment[],
  arc: ImportArc,
  R: number,
): { e1: { x: number; y: number }; e2: { x: number; y: number } } | null {
  const mx = (arc.x0 + arc.x1) / 2;
  const my = (arc.y0 + arc.y1) / 2;
  interface C {
    th: number;
    ux: number;
    uy: number;
    vx: number;
    vy: number;
    off: number;
    s0: number;
    s1: number;
  }
  const cand: C[] = [];
  for (const s of segs) {
    if (!isArch(s)) continue;
    const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
    if (len < R * 0.5 || len > R * 1.6) continue;
    if (Math.hypot((s.x0 + s.x1) / 2 - mx, (s.y0 + s.y1) / 2 - my) > R * 1.3) continue;
    const th = fold(Math.atan2(s.y1 - s.y0, s.x1 - s.x0));
    const ux = Math.cos(th);
    const uy = Math.sin(th);
    const vx = -uy;
    const vy = ux;
    const off = s.x0 * vx + s.y0 * vy;
    const a = s.x0 * ux + s.y0 * uy;
    const b = s.x1 * ux + s.y1 * uy;
    cand.push({ th, ux, uy, vx, vy, off, s0: Math.min(a, b), s1: Math.max(a, b) });
  }
  for (let i = 0; i < cand.length; i++) {
    for (let j = i + 1; j < cand.length; j++) {
      let da = Math.abs(cand[i].th - cand[j].th);
      da = Math.min(da, Math.PI - da);
      if (da > 0.09) continue;
      const gap = Math.abs(cand[i].off - cand[j].off);
      if (gap < 1.5 || gap > 12) continue; // thin panel
      const ov = Math.min(cand[i].s1, cand[j].s1) - Math.max(cand[i].s0, cand[j].s0);
      if (ov < R * 0.4) continue;
      const { ux, uy, vx, vy } = cand[i];
      const off = (cand[i].off + cand[j].off) / 2;
      const s0 = Math.min(cand[i].s0, cand[j].s0);
      const s1 = Math.max(cand[i].s1, cand[j].s1);
      return {
        e1: { x: ux * s0 + vx * off, y: uy * s0 + vy * off },
        e2: { x: ux * s1 + vx * off, y: uy * s1 + vy * off },
      };
    }
  }
  return null;
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
