import type { ImportSegment, ImportArc } from "../types";
import { extractWalls, DEFAULT_PARAMS, scaleExtractParams, type Centerline } from "../extractWalls";
import type { SuggestedOpening } from "../detectOpenings";
import { isClutterLayer } from "../dxf/layerClass";
import { extractFaces } from "./faces";

// -----------------------------------------------------------------------------
// Vector Interpreter (Phase F, v1). Deterministic geometry → topology → walls →
// apertures on EXACT vector input (DWG / vector PDF). No pixel heuristics: the
// coordinates are exact, so we reason with geometry, not thresholds tuned to a
// plan. This is the first cut of the Observation Graph's objective layers; it
// emits walls + openings so we can score against ground truth with the existing
// harness while the full graph schema is built out.
//
// Design levers, chosen from the measured baseline failures:
//   • WALLS: pair parallel faces into bands with EXACT thickness, then keep only
//     bands whose thickness sits in a dominant thickness CLUSTER. Real walls
//     share a few thicknesses; furniture / hatch parallel-pairs have scattered
//     gaps and fall away. (This is Phase B's ThicknessDistribution in action.)
//   • DOORS: trust the swing ARC only. A door is drawn as a swing; a bare wall
//     gap is not evidence of a door. This kills the phantom gap-doors that
//     wrecked baseline precision (up to 19 false doors on one plan).
//   • WINDOWS: glazing (≥3 cramped parallel lines) inside a wall band whose far
//     side is OUTSIDE the building (ray test) — "a window is glazing in an
//     exterior wall", the human read, not a bounding box.
// -----------------------------------------------------------------------------

export interface VectorObservation {
  walls: Centerline[];
  openings: SuggestedOpening[];
  thicknessClusters: number[]; // dominant wall thicknesses (px), for provenance
  faces?: number; // count of enclosed rooms found by the topology pass
}

// ---- scale-aware constants --------------------------------------------------

interface Scale {
  minThick: number; // px
  maxThick: number;
  minOverlap: number;
  snapEps: number;
  thickBin: number;
  minArcChord: number;
  maxArcChord: number;
  minWindow: number;
  maxWindow: number;
  bridgeMax: number;
  minFaceArea: number;
}

function scaleFor(mpp: number | null): Scale {
  const m = (meters: number, pxFallback: number) => (mpp && mpp > 0 ? meters / mpp : pxFallback);
  return {
    minThick: m(0.06, 4), // 6 cm – thinnest real partition
    maxThick: m(0.6, 60), // 60 cm – thickest (incl. MAMAD / envelope)
    minOverlap: m(0.3, 20), // a wall face is at least ~30 cm long
    snapEps: m(0.03, 3), // coincident-endpoint tolerance
    thickBin: m(0.02, 2), // 2 cm thickness histogram bin
    minArcChord: m(0.5, 24), // ignore tiny arcs (corners, text)
    maxArcChord: m(2.5, 260),
    minWindow: m(0.3, 20),
    maxWindow: m(3.0, 300),
    bridgeMax: m(1.5, 150), // close gaps up to ~a wide doorway so rooms enclose
    minFaceArea: mpp && mpp > 0 ? 0.8 / (mpp * mpp) : 1600, // ≥0.8 m² = a real room
  };
}

const ANGLE_TOL = (2 * Math.PI) / 180;

// ---- geometry helpers -------------------------------------------------------

const fold = (a: number) => {
  let t = a % Math.PI;
  if (t < 0) t += Math.PI;
  return t >= Math.PI - 1e-9 ? t - Math.PI : t;
};
const angDiff = (a: number, b: number) => {
  let d = Math.abs(a - b);
  return Math.min(d, Math.PI - d);
};

interface Edge {
  theta: number; // [0,π)
  offset: number; // signed perpendicular distance of the line from origin
  s0: number; // start along direction
  s1: number; // end along direction
  ux: number;
  uy: number;
  vx: number; // perpendicular unit
  vy: number;
  layer: string;
}

function isInk(s: ImportSegment): boolean {
  return (
    s.color != null && s.color[0] < 0.22 && s.color[1] < 0.22 && s.color[2] < 0.22 && !isClutterLayer(s.layer)
  );
}

// Merge exact segments that lie on the same infinite line into maximal edges.
function buildEdges(segs: ImportSegment[], sc: Scale): Edge[] {
  interface Raw {
    theta: number;
    offset: number;
    ux: number;
    uy: number;
    vx: number;
    vy: number;
    a: number;
    b: number;
    layer: string;
  }
  const raws: Raw[] = [];
  for (const s of segs) {
    const dx = s.x1 - s.x0;
    const dy = s.y1 - s.y0;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const theta = fold(Math.atan2(dy, dx));
    const ux = Math.cos(theta);
    const uy = Math.sin(theta);
    const vx = -uy;
    const vy = ux;
    const offset = s.x0 * vx + s.y0 * vy;
    const a = s.x0 * ux + s.y0 * uy;
    const b = s.x1 * ux + s.y1 * uy;
    raws.push({ theta, offset, ux, uy, vx, vy, a: Math.min(a, b), b: Math.max(a, b), layer: s.layer });
  }
  // bucket by (theta, offset) so collinear fragments group together
  const key = (r: Raw) => `${Math.round(r.theta / ANGLE_TOL)}:${Math.round(r.offset / sc.snapEps)}`;
  const groups = new Map<string, Raw[]>();
  for (const r of raws) {
    const k = key(r);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  const edges: Edge[] = [];
  for (const g of groups.values()) {
    g.sort((m, n) => m.a - n.a);
    let cs = g[0].a;
    let ce = g[0].b;
    const flush = (r0: Raw) => {
      if (ce - cs >= 1e-6)
        edges.push({
          theta: r0.theta,
          offset: r0.offset,
          s0: cs,
          s1: ce,
          ux: r0.ux,
          uy: r0.uy,
          vx: r0.vx,
          vy: r0.vy,
          layer: r0.layer,
        });
    };
    for (let i = 1; i < g.length; i++) {
      if (g[i].a <= ce + sc.snapEps) ce = Math.max(ce, g[i].b);
      else {
        flush(g[i - 1]);
        cs = g[i].a;
        ce = g[i].b;
      }
    }
    flush(g[g.length - 1]);
  }
  return edges;
}

interface Band {
  cl: Centerline;
  thickness: number;
}

// Pair parallel edges whose perpendicular gap is a plausible wall thickness and
// that overlap enough — a wall's two faces. Each edge pairs with its nearest
// eligible partner (closest gap) to avoid triple-counting stacked lines.
function pairBands(edges: Edge[], sc: Scale): Band[] {
  const bands: Band[] = [];
  const used = new Set<number>();
  // index edges by angle bucket for a cheaper neighbour scan
  for (let i = 0; i < edges.length; i++) {
    if (used.has(i)) continue;
    const e = edges[i];
    let best = -1;
    let bestGap = Infinity;
    let bestOv = 0;
    for (let j = 0; j < edges.length; j++) {
      if (j === i || used.has(j)) continue;
      const f = edges[j];
      if (angDiff(e.theta, f.theta) > ANGLE_TOL) continue;
      const gap = Math.abs(e.offset - f.offset);
      if (gap < sc.minThick || gap > sc.maxThick) continue;
      const ov = Math.min(e.s1, f.s1) - Math.max(e.s0, f.s0);
      if (ov < sc.minOverlap) continue;
      if (gap < bestGap) {
        best = j;
        bestGap = gap;
        bestOv = ov;
      }
    }
    if (best >= 0) {
      used.add(i);
      used.add(best);
      const f = edges[best];
      const s0 = Math.max(e.s0, f.s0);
      const s1 = Math.min(e.s1, f.s1);
      const midOff = (e.offset + f.offset) / 2;
      const x0 = e.ux * s0 + e.vx * midOff;
      const y0 = e.uy * s0 + e.vy * midOff;
      const x1 = e.ux * s1 + e.vx * midOff;
      const y1 = e.uy * s1 + e.vy * midOff;
      void bestOv;
      bands.push({ cl: { x0, y0, x1, y1, thickness: bestGap }, thickness: bestGap });
    }
  }
  return bands;
}

// Dominant thickness clusters: histogram gaps, keep bins holding a meaningful
// share. Walls concentrate on a few thicknesses; stray furniture gaps scatter.
function thicknessClusters(bands: Band[], sc: Scale): number[] {
  if (!bands.length) return [];
  const bins = new Map<number, number>();
  for (const b of bands) {
    const k = Math.round(b.thickness / sc.thickBin);
    bins.set(k, (bins.get(k) ?? 0) + 1);
  }
  const total = bands.length;
  const peaks: number[] = [];
  for (const [k, n] of bins) {
    // a cluster must hold at least 8% of bands or 2 members (whichever larger)
    if (n >= Math.max(2, total * 0.08)) peaks.push(k * sc.thickBin);
  }
  return peaks.sort((a, b) => a - b);
}

const nearCluster = (t: number, clusters: number[], tol: number) =>
  clusters.some((c) => Math.abs(t - c) <= tol);

// ---- apertures --------------------------------------------------------------

function pointCenterlineDist(px: number, py: number, c: Centerline): number {
  const abx = c.x1 - c.x0;
  const aby = c.y1 - c.y0;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-9) return Math.hypot(px - c.x0, py - c.y0);
  let t = ((px - c.x0) * abx + (py - c.y0) * aby) / len2;
  t = Math.min(1, Math.max(0, t));
  return Math.hypot(px - (c.x0 + abx * t), py - (c.y0 + aby * t));
}

// Doors from swing arcs only — high precision. Place the opening (width R, the
// 90° swing radius) along the nearest wall at the arc's base (hinge).
function arcDoors(arcs: ImportArc[], walls: Centerline[], sc: Scale): SuggestedOpening[] {
  const out: SuggestedOpening[] = [];
  let id = 0;
  for (const arc of arcs) {
    if (arc.chord < sc.minArcChord || arc.chord > sc.maxArcChord) continue;
    const R = arc.chord / Math.SQRT2;
    const A = { x: arc.x0, y: arc.y0 };
    const B = { x: arc.x1, y: arc.y1 };
    // nearest wall to either endpoint
    let bw: Centerline | null = null;
    let bd = Infinity;
    for (const w of walls) {
      const d = Math.min(pointCenterlineDist(A.x, A.y, w), pointCenterlineDist(B.x, B.y, w));
      if (d < bd) {
        bd = d;
        bw = w;
      }
    }
    if (!bw || bd > sc.maxThick * 2) continue;
    // project the endpoint nearest the wall as the hinge; span R along the wall
    const L = Math.hypot(bw.x1 - bw.x0, bw.y1 - bw.y0) || 1;
    const ux = (bw.x1 - bw.x0) / L;
    const uy = (bw.y1 - bw.y0) / L;
    const hinge = pointCenterlineDist(A.x, A.y, bw) <= pointCenterlineDist(B.x, B.y, bw) ? A : B;
    const tH = (hinge.x - bw.x0) * ux + (hinge.y - bw.y0) * uy;
    // swing opens toward the far endpoint; pick direction along the wall
    const far = hinge === A ? B : A;
    const tF = (far.x - bw.x0) * ux + (far.y - bw.y0) * uy;
    const dir = Math.sign(tF - tH || 1);
    const t0 = Math.min(tH, tH + dir * R);
    const t1 = Math.max(tH, tH + dir * R);
    out.push({
      id: `vd${id++}`,
      type: "door",
      x0: bw.x0 + ux * t0,
      y0: bw.y0 + uy * t0,
      x1: bw.x0 + ux * t1,
      y1: bw.y0 + uy * t1,
      width: t1 - t0,
      thickness: bw.thickness,
      flags: ["arc"],
    });
  }
  return out;
}

// Ray from (px,py)+t·(dx,dy) vs segment: crossing parameter t>0 or null.
function crossRaySeg(px: number, py: number, dx: number, dy: number, s: ImportSegment): number | null {
  const ex = s.x1 - s.x0;
  const ey = s.y1 - s.y0;
  const det = ex * dy - dx * ey;
  if (Math.abs(det) < 1e-9) return null;
  const t = (-(s.x0 - px) * ey + ex * (s.y0 - py)) / det;
  const u = (dx * (s.y0 - py) - dy * (s.x0 - px)) / det;
  return t > 1e-6 && u >= 0 && u <= 1 ? t : null;
}

// A wall is exterior if a ray out one face reaches the plan edge crossing ≤1
// other ink line — the same "is this side outside?" test used for windows.
function wallIsExterior(w: Centerline, ink: ImportSegment[], maxT: number): boolean {
  const L = Math.hypot(w.x1 - w.x0, w.y1 - w.y0) || 1;
  const ux = (w.x1 - w.x0) / L;
  const uy = (w.y1 - w.y0) / L;
  const nx = -uy;
  const ny = ux;
  const mx = (w.x0 + w.x1) / 2;
  const my = (w.y0 + w.y1) / 2;
  const off = w.thickness / 2 + 4;
  const clearest = (sign: number) => {
    let best = Infinity;
    for (const a of [-0.3, 0, 0.3]) {
      const sx = mx + ux * a * L + sign * nx * off;
      const sy = my + uy * a * L + sign * ny * off;
      let n = 0;
      for (const s of ink) {
        const t = crossRaySeg(sx, sy, sign * nx, sign * ny, s);
        if (t != null && t <= maxT) n++;
      }
      best = Math.min(best, n);
    }
    return best;
  };
  return Math.min(clearest(1), clearest(-1)) <= 1;
}

// Windows: along each EXTERIOR wall, a span covered by ≥3 parallel ink lines
// inside the wall band = glazing.
function windows(walls: Centerline[], ink: ImportSegment[], sc: Scale): SuggestedOpening[] {
  const out: SuggestedOpening[] = [];
  let id = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of ink) {
    minX = Math.min(minX, s.x0, s.x1);
    minY = Math.min(minY, s.y0, s.y1);
    maxX = Math.max(maxX, s.x0, s.x1);
    maxY = Math.max(maxY, s.y0, s.y1);
  }
  const maxT = Number.isFinite(minX) ? Math.hypot(maxX - minX, maxY - minY) : 1e5;

  for (const w of walls) {
    if (!wallIsExterior(w, ink, maxT)) continue;
    const theta = fold(Math.atan2(w.y1 - w.y0, w.x1 - w.x0));
    const ux = Math.cos(theta);
    const uy = Math.sin(theta);
    const vx = -uy;
    const vy = ux;
    const cOff = ((w.x0 + w.x1) / 2) * vx + ((w.y0 + w.y1) / 2) * vy;
    const wS0 = Math.min(w.x0 * ux + w.y0 * uy, w.x1 * ux + w.y1 * uy);
    const wS1 = Math.max(w.x0 * ux + w.y0 * uy, w.x1 * ux + w.y1 * uy);
    const half = w.thickness / 2 + sc.thickBin;
    // parallel ink lines within the band → coverage intervals
    const ivs: [number, number][] = [];
    for (const s of ink) {
      const th = fold(Math.atan2(s.y1 - s.y0, s.x1 - s.x0));
      if (angDiff(th, theta) > ANGLE_TOL) continue;
      const off = s.x0 * vx + s.y0 * vy;
      if (Math.abs(off - cOff) > half) continue;
      let a = s.x0 * ux + s.y0 * uy;
      let b = s.x1 * ux + s.y1 * uy;
      if (a > b) [a, b] = [b, a];
      const ca = Math.max(a, wS0);
      const cb = Math.min(b, wS1);
      if (cb - ca > 1e-6) ivs.push([ca, cb]);
    }
    if (ivs.length < 3) continue;
    // coverage-count profile; ≥3 spans = glazing
    const pts = new Set<number>();
    for (const [a, b] of ivs) {
      pts.add(a);
      pts.add(b);
    }
    const breaks = [...pts].sort((m, n) => m - n);
    for (let i = 0; i < breaks.length - 1; i++) {
      const a = breaks[i];
      const b = breaks[i + 1];
      const mid = (a + b) / 2;
      let count = 0;
      for (const [ia, ib] of ivs) if (ia <= mid && mid < ib) count++;
      const wdt = b - a;
      if (count >= 3 && wdt >= sc.minWindow && wdt <= sc.maxWindow) {
        out.push({
          id: `vw${id++}`,
          type: "window",
          x0: ux * a + vx * cOff,
          y0: uy * a + vy * cOff,
          x1: ux * b + vx * cOff,
          y1: uy * b + vy * cOff,
          width: wdt,
          thickness: w.thickness,
          flags: ["glazing"],
        });
      }
    }
  }
  return out;
}

// ---- top level --------------------------------------------------------------

export function interpretVector(
  segs: ImportSegment[],
  arcs: ImportArc[],
  mpp: number | null,
): VectorObservation {
  const sc = scaleFor(mpp);
  const ink = segs.filter(isInk);
  // 1. Candidate centerlines from the proven geometric extractor (collinear
  //    assembly, hatch filtering). This is a high-RECALL set that includes
  //    furniture/stray false walls.
  const candidates = extractWalls(ink, scaleExtractParams(DEFAULT_PARAMS, mpp)).centerlines;
  // 2. TOPOLOGY: build the planar arrangement and keep only centerlines that
  //    BOUND an enclosed room. A wall separates two spaces; furniture and stray
  //    lines don't — so this prunes false walls by construction (precision).
  const { faces, wallEdges } = extractFaces(candidates, {
    snapEps: sc.snapEps,
    bridgeMax: sc.bridgeMax,
    minFaceArea: sc.minFaceArea,
  });
  const walls = wallEdges;
  const clusters = thicknessClusters(walls.map((w) => ({ cl: w, thickness: w.thickness })), sc);
  void buildEdges;
  void pairBands;
  void nearCluster;
  // 3. OPENINGS by SIGNATURE on the validated walls: doors from swing arcs,
  //    windows from glazing in exterior walls.
  const openings = [...arcDoors(arcs, walls, sc), ...windows(walls, ink, sc)];
  return { walls, openings, thicknessClusters: clusters, faces: faces.length };
}
