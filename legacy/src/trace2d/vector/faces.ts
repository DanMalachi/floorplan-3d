import type { Centerline } from "../extractWalls";

// -----------------------------------------------------------------------------
// Planar arrangement + face extraction from wall CENTERLINES. This is the core
// of the vector Interpreter: rooms are the enclosed faces of the centerline
// graph, and a real wall is an edge that BOUNDS a face. Deriving walls this way
// is high-precision by construction — furniture and stray lines don't separate
// two rooms, so they never become face boundaries and are pruned automatically.
//
// Pipeline: split segments at intersections & T-junctions → snap coincident
// nodes → bridge door-sized collinear gaps so rooms close → trace faces by
// half-edge angular traversal → keep room-sized bounded faces → boundary edges
// are the walls.
// -----------------------------------------------------------------------------

export interface FaceResult {
  /** Room-sized bounded faces, each a closed polygon (image px). */
  faces: { x: number; y: number }[][];
  /** Centerlines that bound at least one face — the validated walls. */
  wallEdges: Centerline[];
}

interface Pt {
  x: number;
  y: number;
}
interface Seg {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  thickness: number;
}

const EPS = 1e-6;

function segInt(a: Seg, b: Seg): { ta: number; tb: number } | null {
  const r1x = a.x1 - a.x0;
  const r1y = a.y1 - a.y0;
  const r2x = b.x1 - b.x0;
  const r2y = b.y1 - b.y0;
  const den = r1x * r2y - r1y * r2x;
  if (Math.abs(den) < EPS) return null; // parallel
  const ta = ((b.x0 - a.x0) * r2y - (b.y0 - a.y0) * r2x) / den;
  const tb = ((b.x0 - a.x0) * r1y - (b.y0 - a.y0) * r1x) / den;
  if (ta < -EPS || ta > 1 + EPS || tb < -EPS || tb > 1 + EPS) return null;
  return { ta, tb };
}

// param of the projection of point p onto segment s (clamped 0..1), and its dist
function projParam(px: number, py: number, s: Seg): { t: number; d: number } {
  const dx = s.x1 - s.x0;
  const dy = s.y1 - s.y0;
  const len2 = dx * dx + dy * dy;
  if (len2 < EPS) return { t: 0, d: Math.hypot(px - s.x0, py - s.y0) };
  let t = ((px - s.x0) * dx + (py - s.y0) * dy) / len2;
  t = Math.min(1, Math.max(0, t));
  return { t, d: Math.hypot(px - (s.x0 + dx * t), py - (s.y0 + dy * t)) };
}

export function extractFaces(
  centerlines: Centerline[],
  opts: { snapEps: number; bridgeMax: number; minFaceArea: number },
): FaceResult {
  const { snapEps, bridgeMax, minFaceArea } = opts;
  const segs: Seg[] = centerlines
    .map((c) => ({ x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, thickness: c.thickness }))
    .filter((s) => Math.hypot(s.x1 - s.x0, s.y1 - s.y0) > snapEps);

  // --- 1. split at intersections + T-junctions -------------------------------
  const cuts: number[][] = segs.map(() => [0, 1]);
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const x = segInt(segs[i], segs[j]);
      if (x) {
        cuts[i].push(x.ta);
        cuts[j].push(x.tb);
      }
    }
  }
  // T-junctions: an endpoint of one segment lying ON another → split the other.
  for (let i = 0; i < segs.length; i++) {
    for (const [ex, ey] of [
      [segs[i].x0, segs[i].y0],
      [segs[i].x1, segs[i].y1],
    ]) {
      for (let j = 0; j < segs.length; j++) {
        if (j === i) continue;
        const { t, d } = projParam(ex, ey, segs[j]);
        if (d <= snapEps && t > EPS && t < 1 - EPS) cuts[j].push(t);
      }
    }
  }

  // --- 2. build nodes (snapped) + edges --------------------------------------
  const nodes: Pt[] = [];
  const nodeKey = new Map<string, number>();
  const q = (v: number) => Math.round(v / snapEps);
  const nodeAt = (x: number, y: number): number => {
    const k = `${q(x)}:${q(y)}`;
    let id = nodeKey.get(k);
    if (id == null) {
      id = nodes.length;
      nodes.push({ x, y });
      nodeKey.set(k, id);
    }
    return id;
  };
  const edgeKey = new Set<string>();
  const edges: { a: number; b: number; thickness: number }[] = [];
  const addEdge = (a: number, b: number, thickness: number) => {
    if (a === b) return;
    const k = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (edgeKey.has(k)) return;
    edgeKey.add(k);
    edges.push({ a, b, thickness });
  };
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const ps = [...new Set(cuts[i].filter((t) => t >= -EPS && t <= 1 + EPS))].sort((m, n) => m - n);
    for (let k = 0; k + 1 < ps.length; k++) {
      const t0 = ps[k];
      const t1 = ps[k + 1];
      const na = nodeAt(s.x0 + (s.x1 - s.x0) * t0, s.y0 + (s.y1 - s.y0) * t0);
      const nb = nodeAt(s.x0 + (s.x1 - s.x0) * t1, s.y0 + (s.y1 - s.y0) * t1);
      addEdge(na, nb, s.thickness);
    }
  }

  // --- 3. bridge door-sized collinear gaps so rooms close --------------------
  // A door is a gap in a wall: two near-collinear dangling ends a door-width
  // apart. Connect them (and general junction near-misses) so the room encloses.
  const degree = () => {
    const deg = new Array(nodes.length).fill(0);
    for (const e of edges) {
      deg[e.a]++;
      deg[e.b]++;
    }
    return deg;
  };
  {
    const deg = degree();
    const dangling = nodes.map((_, i) => i).filter((i) => deg[i] === 1);
    for (const i of dangling) {
      // direction of the dangling edge INTO node i
      const e = edges.find((ed) => ed.a === i || ed.b === i);
      if (!e) continue;
      const other = e.a === i ? e.b : e.a;
      const dirx = nodes[i].x - nodes[other].x;
      const diry = nodes[i].y - nodes[other].y;
      const dl = Math.hypot(dirx, diry) || 1;
      let best = -1;
      let bestScore = Infinity;
      for (const jNode of dangling) {
        if (jNode === i) continue;
        const dx = nodes[jNode].x - nodes[i].x;
        const dy = nodes[jNode].y - nodes[i].y;
        const dist = Math.hypot(dx, dy);
        if (dist < EPS || dist > bridgeMax) continue;
        // prefer collinear continuation (dot with dangling dir ~ +1)
        const dot = (dx * dirx + dy * diry) / (dist * dl);
        if (dot < 0.7) continue; // must extend roughly forward
        const score = dist * (2 - dot); // closer + straighter wins
        if (score < bestScore) {
          bestScore = score;
          best = jNode;
        }
      }
      if (best >= 0) addEdge(i, best, e.thickness);
    }
  }

  // --- 4. face traversal (half-edge angular walk) ----------------------------
  // outgoing half-edges per node, sorted by angle
  interface HE {
    from: number;
    to: number;
    thickness: number;
    ang: number;
    twin: number;
    id: number;
  }
  const hes: HE[] = [];
  const outAt: number[][] = nodes.map(() => []);
  for (const e of edges) {
    const a1 = Math.atan2(nodes[e.b].y - nodes[e.a].y, nodes[e.b].x - nodes[e.a].x);
    const i1 = hes.length;
    const i2 = hes.length + 1;
    hes.push({ from: e.a, to: e.b, thickness: e.thickness, ang: a1, twin: i2, id: i1 });
    hes.push({ from: e.b, to: e.a, thickness: e.thickness, ang: a1 + Math.PI, twin: i1, id: i2 });
    outAt[e.a].push(i1);
    outAt[e.b].push(i2);
  }
  const norm = (a: number) => {
    let x = a % (2 * Math.PI);
    if (x < 0) x += 2 * Math.PI;
    return x;
  };
  for (const list of outAt) list.sort((p, r) => norm(hes[p].ang) - norm(hes[r].ang));
  // next(he): arrive at he.to via he; the next boundary half-edge is the one
  // clockwise-adjacent to the twin (he.to → he.from) among outgoing at he.to.
  const nextHE = (heId: number): number => {
    const he = hes[heId];
    const list = outAt[he.to];
    const twinAng = norm(hes[he.twin].ang);
    // find twin index, take the previous in CCW order = most-clockwise turn
    let idx = list.findIndex((h) => h === he.twin);
    if (idx < 0) idx = 0;
    const prev = list[(idx - 1 + list.length) % list.length];
    return prev;
  };

  // Trace every face cycle. Each half-edge belongs to exactly one face.
  const visited = new Set<number>();
  interface Cycle {
    poly: Pt[];
    area2: number; // signed
    keys: Set<string>;
  }
  const cycles: Cycle[] = [];
  for (let start = 0; start < hes.length; start++) {
    if (visited.has(start)) continue;
    const loop: number[] = [];
    let cur = start;
    let guard = 0;
    while (!visited.has(cur) && guard++ < hes.length + 5) {
      visited.add(cur);
      loop.push(cur);
      cur = nextHE(cur);
    }
    if (cur !== start || loop.length < 3) continue;
    const poly = loop.map((h) => ({ x: nodes[hes[h].from].x, y: nodes[hes[h].from].y }));
    let area2 = 0;
    for (let k = 0; k < poly.length; k++) {
      const p = poly[k];
      const nn = poly[(k + 1) % poly.length];
      area2 += p.x * nn.y - nn.x * p.y;
    }
    const keys = new Set<string>();
    for (const h of loop) {
      const e = hes[h];
      keys.add(e.from < e.to ? `${e.from}:${e.to}` : `${e.to}:${e.from}`);
    }
    cycles.push({ poly, area2, keys });
  }
  // The unbounded outer face(s) trace with the largest magnitude; every other
  // bounded cycle above room size is a room, regardless of winding sign (a
  // disconnected plan produces one outer face PER connected component).
  const maxAbs = cycles.reduce((m, c) => Math.max(m, Math.abs(c.area2)), 0);
  const faces: Pt[][] = [];
  const faceEdgeKeys: Set<string>[] = [];
  for (const c of cycles) {
    const area = Math.abs(c.area2) / 2;
    if (area >= minFaceArea && Math.abs(c.area2) < maxAbs - EPS) {
      faces.push(c.poly);
      faceEdgeKeys.push(c.keys);
    }
  }

  // --- 5. wall edges = edges bounding at least one kept face ------------------
  const bounding = new Set<string>();
  for (const keys of faceEdgeKeys) for (const k of keys) bounding.add(k);
  const wallEdges: Centerline[] = [];
  for (const e of edges) {
    const k = e.a < e.b ? `${e.a}:${e.b}` : `${e.b}:${e.a}`;
    if (!bounding.has(k)) continue;
    wallEdges.push({ x0: nodes[e.a].x, y0: nodes[e.a].y, x1: nodes[e.b].x, y1: nodes[e.b].y, thickness: e.thickness });
  }

  return { faces, wallEdges };
}
