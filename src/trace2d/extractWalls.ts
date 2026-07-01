import type { ImportSegment } from "@/store/useSceneStore";

// Tunables (in background-image px). Defaults sized for the M0 sample plan
// (~1.9 px/pt), where wall double-lines sit ~15–44 px apart.
export interface ExtractParams {
  noiseMin: number; // drop only sub-pixel noise before merging fragments
  thinMin: number; // min face-to-face gap to call it a wall
  thickMax: number; // max gap (rejects far-apart parallels)
  minFaceLen: number; // min length of an ASSEMBLED face edge (after merging)
  angleTolDeg: number; // parallel tolerance
  minOverlap: number; // min shared run to emit a wall
  mergeGap: number; // bridge collinear fragments up to this gap
  offsetTol: number; // collinear if perpendicular offsets within this
  weldTol: number; // merge centerline endpoints within this into one node
  hatchMaxNeighbors: number; // reject if this many+ parallel faces overlap the strip (stairs/hatching)
  paneGapMax: number; // lines cramped within this (a 3+ stack = window) → inner ones are panes, not wall faces
  minWallSepPx: number; // reject parallel walls closer than this (stairs/hatch); 0 = off (needs scale)
  extendMax: number; // extend/trim a centerline end up to this far to meet a neighbor (close corners)
  thicknessTargets: number[]; // calibrated wall thicknesses (px); empty = use thinMin..thickMax
  thicknessTol: number; // accept a pair if within this of a calibrated target
}

// Accept a face-pair gap: if the user has calibrated wall thickness(es), only
// pairs near one of those; otherwise the wide default band.
function thicknessAccept(d: number, p: ExtractParams): boolean {
  if (p.thicknessTargets.length > 0) {
    return p.thicknessTargets.some((t) => Math.abs(d - t) <= p.thicknessTol);
  }
  return d >= p.thinMin && d <= p.thickMax;
}

export const DEFAULT_PARAMS: ExtractParams = {
  noiseMin: 1.5,
  thinMin: 5,
  thickMax: 60,
  minFaceLen: 16,
  angleTolDeg: 3,
  minOverlap: 12,
  mergeGap: 8,
  offsetTol: 2.5,
  weldTol: 14,
  hatchMaxNeighbors: 8,
  paneGapMax: 12,
  minWallSepPx: 0,
  extendMax: 26,
  thicknessTargets: [],
  thicknessTol: 4,
};

export interface Centerline {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  thickness: number;
}

export interface ExtractResult {
  centerlines: Centerline[];
  nodes: { id: string; x: number; y: number }[];
  segments: { id: string; a: string; b: string }[];
}

interface Edge {
  theta: number; // [0, π)
  offset: number; // perpendicular distance of the line from origin
  s0: number; // start along direction
  s1: number; // end along direction
}

const isBlack = (c: [number, number, number] | null) =>
  c != null && c[0] < 0.22 && c[1] < 0.22 && c[2] < 0.22;

// CAD layers that are never walls — dropped before wall detection / snapping.
export const NOISE_LAYERS = new Set([
  "RIHUT", // furniture
  "SANIT", // plumbing
  "steel",
  "nof tree",
  "nof plants",
  "nof pituach",
  "2TREE_PT",
  "PETACH", // door/window openings (handled separately)
]);

function pointSegDist(px: number, py: number, s: ImportSegment): number {
  const abx = s.x1 - s.x0;
  const aby = s.y1 - s.y0;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-9) return Math.hypot(px - s.x0, py - s.y0);
  let t = ((px - s.x0) * abx + (py - s.y0) * aby) / len2;
  t = Math.min(1, Math.max(0, t));
  return Math.hypot(px - (s.x0 + abx * t), py - (s.y0 + aby * t));
}

/**
 * Measure wall thickness at a clicked point: find the nearest black face, then
 * the closest parallel black face overlapping the click — the wall's other face.
 * Returns the gap in px (the wall thickness), or null if no pair is found.
 */
export function measureThicknessAt(
  x: number,
  y: number,
  segs: ImportSegment[],
  searchPx = 22,
): number | null {
  let best: ImportSegment | null = null;
  let bestd = searchPx;
  for (const s of segs) {
    if (!isBlack(s.color)) continue;
    const d = pointSegDist(x, y, s);
    if (d < bestd) {
      bestd = d;
      best = s;
    }
  }
  if (!best) return null;

  const theta = foldAngle(Math.atan2(best.y1 - best.y0, best.x1 - best.x0));
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);
  const vx = -uy;
  const vy = ux;
  const baseOff = best.x0 * vx + best.y0 * vy;
  const sClick = x * ux + y * uy;

  let gap: number | null = null;
  let gapAbs = Infinity;
  for (const s of segs) {
    if (!isBlack(s.color)) continue;
    const th = foldAngle(Math.atan2(s.y1 - s.y0, s.x1 - s.x0));
    let da = Math.abs(th - theta);
    da = Math.min(da, Math.PI - da);
    if (da > 0.1) continue;
    const off = s.x0 * vx + s.y0 * vy;
    const ag = Math.abs(off - baseOff);
    if (ag < 3 || ag > 80) continue;
    const sa = s.x0 * ux + s.y0 * uy;
    const sb = s.x1 * ux + s.y1 * uy;
    if (sClick < Math.min(sa, sb) - 4 || sClick > Math.max(sa, sb) + 4) continue;
    if (ag < gapAbs) {
      gapAbs = ag;
      gap = ag;
    }
  }
  return gap;
}

const foldAngle = (a: number) => {
  let t = a % Math.PI;
  if (t < 0) t += Math.PI;
  if (t >= Math.PI - 1e-9) t -= Math.PI;
  return t;
};

/**
 * Collapse double-line walls to centerlines.
 * 1. keep black, long-enough segments (drops furniture/text),
 * 2. cluster collinear fragments into face edges,
 * 3. pair parallel faces a wall-thickness apart → centerline + thickness,
 * 4. weld endpoints into a connected node/segment graph for face detection.
 */
export function extractWalls(
  segs: ImportSegment[],
  params: ExtractParams = DEFAULT_PARAMS,
): ExtractResult {
  const angleTol = (params.angleTolDeg * Math.PI) / 180;

  // --- collect black candidate segments with line geometry ---
  type Raw = { theta: number; offset: number; s0: number; s1: number };
  const raws: Raw[] = [];
  for (const sg of segs) {
    if (!isBlack(sg.color)) continue;
    if (sg.layer && NOISE_LAYERS.has(sg.layer)) continue; // drop furniture/plumbing/etc.
    const dx = sg.x1 - sg.x0;
    const dy = sg.y1 - sg.y0;
    const len = Math.hypot(dx, dy);
    if (len < params.noiseMin) continue; // keep fragments; merge assembles faces
    const theta = foldAngle(Math.atan2(dy, dx));
    const ux = Math.cos(theta);
    const uy = Math.sin(theta);
    const vx = -uy;
    const vy = ux;
    const offset = sg.x0 * vx + sg.y0 * vy;
    let a = sg.x0 * ux + sg.y0 * uy;
    let b = sg.x1 * ux + sg.y1 * uy;
    if (a > b) [a, b] = [b, a];
    raws.push({ theta, offset, s0: a, s1: b });
  }

  // --- bucket by angle, then cluster by offset → face edges (merge collinear) ---
  const angleBucket = new Map<number, Raw[]>();
  for (const r of raws) {
    const key = Math.round(r.theta / angleTol);
    let arr = angleBucket.get(key);
    if (!arr) {
      arr = [];
      angleBucket.set(key, arr);
    }
    arr.push(r);
  }

  const edges: Edge[] = [];
  for (const arr of angleBucket.values()) {
    const theta = arr.reduce((s, r) => s + r.theta, 0) / arr.length;
    arr.sort((p, q) => p.offset - q.offset);
    let i = 0;
    while (i < arr.length) {
      // group consecutive offsets within offsetTol = one infinite line
      let j = i;
      const members: Raw[] = [];
      while (j < arr.length && arr[j].offset - arr[i].offset <= params.offsetTol) {
        members.push(arr[j]);
        j++;
      }
      const offset = members.reduce((s, m) => s + m.offset, 0) / members.length;
      // merge s-intervals along the line
      members.sort((p, q) => p.s0 - q.s0);
      let cs = members[0].s0;
      let ce = members[0].s1;
      for (let k = 1; k < members.length; k++) {
        if (members[k].s0 <= ce + params.mergeGap) {
          ce = Math.max(ce, members[k].s1);
        } else {
          if (ce - cs >= params.minFaceLen) edges.push({ theta, offset, s0: cs, s1: ce });
          cs = members[k].s0;
          ce = members[k].s1;
        }
      }
      if (ce - cs >= params.minFaceLen) edges.push({ theta, offset, s0: cs, s1: ce });
      i = j;
    }
  }

  // --- pair parallel faces a wall-thickness apart ---
  const edgeBucket = new Map<number, Edge[]>();
  for (const e of edges) {
    const key = Math.round(e.theta / angleTol);
    let arr = edgeBucket.get(key);
    if (!arr) {
      arr = [];
      edgeBucket.set(key, arr);
    }
    arr.push(e);
  }

  interface Cand {
    e1: Edge;
    e2: Edge;
    overlap: number;
    o0: number;
    o1: number;
  }
  // Mark "pane" edges: a WINDOW is drawn as short glass/frame lines cramped
  // between the two (longer) wall faces. Such an inner line has a clearly LONGER
  // parallel face both above and below it (within paneGapMax·3, overlapping in
  // s). Pairing must skip these, else a window becomes 2–3 stacked walls. The
  // length test spares two genuine close walls (their faces are equal length).
  const paneEdges = new Set<Edge>();
  const paneSpread = params.paneGapMax * 3;
  for (const arr of edgeBucket.values()) {
    for (const e of arr) {
      const eLen = e.s1 - e.s0;
      let longerBelow = false;
      let longerAbove = false;
      for (const f of arr) {
        if (f === e) continue;
        const doff = f.offset - e.offset;
        if (Math.abs(doff) < 0.5 || Math.abs(doff) > paneSpread) continue;
        if (Math.min(e.s1, f.s1) - Math.max(e.s0, f.s0) < params.minOverlap) continue;
        if (f.s1 - f.s0 < eLen * 1.2) continue; // f must be a clearly longer face
        if (doff < 0) longerBelow = true;
        else longerAbove = true;
      }
      if (longerBelow && longerAbove) paneEdges.add(e);
    }
  }

  const cands: Cand[] = [];
  for (const arr of edgeBucket.values()) {
    for (let i = 0; i < arr.length; i++) {
      for (let k = i + 1; k < arr.length; k++) {
        const e1 = arr[i];
        const e2 = arr[k];
        if (paneEdges.has(e1) || paneEdges.has(e2)) continue; // skip window panes
        const d = Math.abs(e1.offset - e2.offset);
        if (!thicknessAccept(d, params)) continue;
        const o0 = Math.max(e1.s0, e2.s0);
        const o1 = Math.min(e1.s1, e2.s1);
        const overlap = o1 - o0;
        if (overlap < params.minOverlap) continue;
        // Reject stairs / cross-hatching: a real wall is an isolated face-pair,
        // but hatched fills stack many parallel faces overlapping the same strip.
        const center = (e1.offset + e2.offset) / 2;
        let neighbors = 0;
        for (const e of arr) {
          if (e === e1 || e === e2) continue;
          if (Math.abs(e.offset - center) > params.thickMax) continue;
          if (Math.min(e.s1, o1) - Math.max(e.s0, o0) >= params.minOverlap) neighbors++;
        }
        if (neighbors >= params.hatchMaxNeighbors) continue;
        cands.push({ e1, e2, overlap, o0, o1 });
      }
    }
  }
  // Emit a centerline piece for EVERY qualifying overlap (a long face may pair
  // with several opposite fragments), then merge collinear pieces into whole
  // walls. Avoids the recall loss of a one-pairing-per-face greedy.
  interface Piece {
    theta: number;
    offset: number;
    s0: number;
    s1: number;
    th: number;
  }
  const pieces: Piece[] = [];
  for (const c of cands) {
    pieces.push({
      theta: (c.e1.theta + c.e2.theta) / 2,
      offset: (c.e1.offset + c.e2.offset) / 2,
      s0: c.o0,
      s1: c.o1,
      th: Math.abs(c.e1.offset - c.e2.offset),
    });
  }
  const mk = (
    ux: number,
    uy: number,
    vx: number,
    vy: number,
    s0: number,
    s1: number,
    off: number,
    th: number,
  ): Centerline => ({
    x0: ux * s0 + vx * off,
    y0: uy * s0 + vy * off,
    x1: ux * s1 + vx * off,
    y1: uy * s1 + vy * off,
    thickness: th,
  });

  const pieceBucket = new Map<number, Piece[]>();
  for (const p of pieces) {
    const key = Math.round(p.theta / angleTol);
    let arr = pieceBucket.get(key);
    if (!arr) {
      arr = [];
      pieceBucket.set(key, arr);
    }
    arr.push(p);
  }
  const centerlines: Centerline[] = [];
  for (const arr of pieceBucket.values()) {
    const theta = arr.reduce((s, p) => s + p.theta, 0) / arr.length;
    const ux = Math.cos(theta);
    const uy = Math.sin(theta);
    const vx = -uy;
    const vy = ux;
    arr.sort((a, b) => a.offset - b.offset);
    let i = 0;
    while (i < arr.length) {
      let j = i;
      const mem: Piece[] = [];
      while (j < arr.length && arr[j].offset - arr[i].offset <= params.offsetTol) {
        mem.push(arr[j]);
        j++;
      }
      const offset = mem.reduce((s, m) => s + m.offset, 0) / mem.length;
      const th = mem.reduce((s, m) => s + m.th, 0) / mem.length;
      mem.sort((a, b) => a.s0 - b.s0);
      let cs = mem[0].s0;
      let ce = mem[0].s1;
      for (let k = 1; k < mem.length; k++) {
        if (mem[k].s0 <= ce + params.mergeGap) {
          ce = Math.max(ce, mem[k].s1);
        } else {
          centerlines.push(mk(ux, uy, vx, vy, cs, ce, offset, th));
          cs = mem[k].s0;
          ce = mem[k].s1;
        }
      }
      centerlines.push(mk(ux, uy, vx, vy, cs, ce, offset, th));
      i = j;
    }
  }

  // --- trim/extend endpoints to nearby centerline intersections (close corners) ---
  // Each centerline ends a wall-thickness short of the true corner; snap open
  // ends onto the line they would meet so L/T junctions actually coincide.
  const lines = centerlines.map((c) => {
    const dx = c.x1 - c.x0;
    const dy = c.y1 - c.y0;
    const L = Math.hypot(dx, dy) || 1;
    return { ux: dx / L, uy: dy / L, ax: c.x0, ay: c.y0, L };
  });
  const lineIntersect = (i: number, j: number) => {
    const li = lines[i];
    const lj = lines[j];
    const det = lj.ux * li.uy - li.ux * lj.uy;
    if (Math.abs(det) < 1e-6) return null; // parallel
    const qpx = lj.ax - li.ax;
    const qpy = lj.ay - li.ay;
    const t = (-qpx * lj.uy + lj.ux * qpy) / det;
    const x = li.ax + t * li.ux;
    const y = li.ay + t * li.uy;
    const sJ = (x - lj.ax) * lj.ux + (y - lj.ay) * lj.uy;
    return { x, y, sJ };
  };
  for (let i = 0; i < centerlines.length; i++) {
    for (const end of [0, 1] as const) {
      const ex = end === 0 ? centerlines[i].x0 : centerlines[i].x1;
      const ey = end === 0 ? centerlines[i].y0 : centerlines[i].y1;
      let bestX: { x: number; y: number } | null = null;
      let bestd = params.extendMax;
      for (let j = 0; j < centerlines.length; j++) {
        if (j === i) continue;
        const X = lineIntersect(i, j);
        if (!X) continue;
        const d = Math.hypot(X.x - ex, X.y - ey);
        if (d > bestd) continue;
        if (X.sJ < -params.extendMax || X.sJ > lines[j].L + params.extendMax) continue;
        bestd = d;
        bestX = X;
      }
      if (bestX) {
        if (end === 0) {
          centerlines[i].x0 = bestX.x;
          centerlines[i].y0 = bestX.y;
        } else {
          centerlines[i].x1 = bestX.x;
          centerlines[i].y1 = bestX.y;
        }
      }
    }
  }

  // Reject close parallel walls (stairs, tread hatching, double-detections): a
  // genuine wall has no parallel neighbor closer than minWallSepPx overlapping
  // it along its length. Stairs are exactly a stack of such close parallels.
  let kept = centerlines;
  if (params.minWallSepPx > 0) {
    const info = centerlines.map((c) => {
      const th = foldAngle(Math.atan2(c.y1 - c.y0, c.x1 - c.x0));
      const ux = Math.cos(th);
      const uy = Math.sin(th);
      const off = c.x0 * -uy + c.y0 * ux;
      const sa = c.x0 * ux + c.y0 * uy;
      const sb = c.x1 * ux + c.y1 * uy;
      return { th, off, s0: Math.min(sa, sb), s1: Math.max(sa, sb) };
    });
    kept = centerlines.filter((_, i) => {
      for (let j = 0; j < centerlines.length; j++) {
        if (j === i) continue;
        let da = Math.abs(info[i].th - info[j].th);
        da = Math.min(da, Math.PI - da);
        if (da > angleTol) continue;
        const perp = Math.abs(info[i].off - info[j].off);
        if (perp < 0.5 || perp >= params.minWallSepPx) continue;
        const ov = Math.min(info[i].s1, info[j].s1) - Math.max(info[i].s0, info[j].s0);
        if (ov >= params.minOverlap) return false; // has a close parallel neighbor
      }
      return true;
    });
  }

  const graph = buildPlanarGraph(kept, params.weldTol);
  return { centerlines: kept, nodes: graph.nodes, segments: graph.segments };
}

/**
 * Node a set of centerlines into a planar graph: split every segment at its
 * interior intersections with other segments (so T/cross junctions share a
 * node), then weld coincident endpoints. This is what lets planar-face room
 * detection close rooms from extracted walls.
 */
export function buildPlanarGraph(
  cls: { x0: number; y0: number; x1: number; y1: number }[],
  weldTol: number,
): { nodes: { id: string; x: number; y: number }[]; segments: { id: string; a: string; b: string }[] } {
  const segs = cls.map((c) => ({ ax: c.x0, ay: c.y0, bx: c.x1, by: c.y1 }));
  const splits: number[][] = segs.map(() => [0, 1]); // params along each segment

  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i];
      const b = segs[j];
      const rx = a.bx - a.ax;
      const ry = a.by - a.ay;
      const sx = b.bx - b.ax;
      const sy = b.by - b.ay;
      const denom = rx * sy - ry * sx;
      if (Math.abs(denom) < 1e-9) continue; // parallel
      const qpx = b.ax - a.ax;
      const qpy = b.ay - a.ay;
      const t = (qpx * sy - qpy * sx) / denom;
      const u = (qpx * ry - qpy * rx) / denom;
      if (t < -0.01 || t > 1.01 || u < -0.01 || u > 1.01) continue;
      if (t > 0.02 && t < 0.98) splits[i].push(t);
      if (u > 0.02 && u < 0.98) splits[j].push(u);
    }
  }

  const nodes: { id: string; x: number; y: number }[] = [];
  const findNode = (x: number, y: number) => {
    for (const n of nodes) if (Math.hypot(n.x - x, n.y - y) <= weldTol) return n.id;
    const n = { id: `sx${nodes.length}`, x, y };
    nodes.push(n);
    return n.id;
  };

  const segments: { id: string; a: string; b: string }[] = [];
  let sid = 0;
  for (let i = 0; i < segs.length; i++) {
    const a = segs[i];
    const ps = [...new Set(splits[i])].sort((m, n) => m - n);
    for (let k = 0; k < ps.length - 1; k++) {
      const t0 = ps[k];
      const t1 = ps[k + 1];
      const na = findNode(a.ax + (a.bx - a.ax) * t0, a.ay + (a.by - a.ay) * t0);
      const nb = findNode(a.ax + (a.bx - a.ax) * t1, a.ay + (a.by - a.ay) * t1);
      if (na === nb) continue;
      if (segments.some((s) => (s.a === na && s.b === nb) || (s.a === nb && s.b === na))) continue;
      segments.push({ id: `sxs${sid++}`, a: na, b: nb });
    }
  }
  return { nodes, segments };
}
