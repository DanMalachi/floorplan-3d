import type { TracePoint, TraceSegment } from "@/store/useSceneStore";

export interface ClosedLoop {
  points: string[]; // ordered point ids; closure implied (last connects to first)
}

export interface LoopAnalysis {
  loops: ClosedLoop[]; // enclosed rooms (planar faces)
  hasOpenChain: boolean; // a loose end exists (degree-1 node) — still in progress
}

interface XY {
  x: number;
  y: number;
}

/**
 * Find every enclosed room as a planar face of the traced graph.
 *
 * Handles junctions (degree > 2): an internal wall dividing a space yields TWO
 * rooms. Method: half-edge traversal — at each node, neighbors are sorted by
 * angle; the next half-edge in a face is the next neighbor clockwise from the
 * one we arrived along. Every directed edge belongs to exactly one face. With
 * this turn rule the BOUNDED interior faces come out clockwise (negative area,
 * y-up) and the single unbounded outer face per component comes out positive, so
 * we keep the negative-area faces. A dangling spur (bridge edge) is traversed in
 * both directions inside the outer face only, so it never pollutes a room.
 */
export function findRooms(
  points: TracePoint[],
  segments: TraceSegment[],
): ClosedLoop[] {
  const coord = new Map<string, XY>(points.map((p) => [p.id, { x: p.x, y: p.y }]));

  const adj = new Map<string, Set<string>>();
  for (const p of points) adj.set(p.id, new Set());
  for (const s of segments) {
    if (s.a === s.b) continue;
    if (!coord.has(s.a) || !coord.has(s.b)) continue;
    adj.get(s.a)!.add(s.b);
    adj.get(s.b)!.add(s.a);
  }

  // Neighbors sorted by angle around each node.
  const sorted = new Map<string, string[]>();
  for (const [id, set] of adj) {
    const c = coord.get(id)!;
    const arr = [...set].sort(
      (m, n) =>
        Math.atan2(coord.get(m)!.y - c.y, coord.get(m)!.x - c.x) -
        Math.atan2(coord.get(n)!.y - c.y, coord.get(n)!.x - c.x),
    );
    sorted.set(id, arr);
  }

  // Next half-edge after arriving at v from u: the neighbor just clockwise of u.
  const next = (u: string, v: string): string | null => {
    const nbrs = sorted.get(v);
    if (!nbrs || nbrs.length === 0) return null;
    const idx = nbrs.indexOf(u);
    if (idx === -1) return null;
    const j = (idx - 1 + nbrs.length) % nbrs.length;
    return nbrs[j];
  };

  const visited = new Set<string>();
  const key = (u: string, v: string) => `${u}>${v}`;
  const faces: string[][] = [];

  for (const s of segments) {
    for (const [u0, v0] of [
      [s.a, s.b],
      [s.b, s.a],
    ] as const) {
      if (!coord.has(u0) || !coord.has(v0)) continue;
      if (visited.has(key(u0, v0))) continue;
      const face: string[] = [];
      let u = u0;
      let v = v0;
      let guard = 0;
      const limit = segments.length * 2 + 8;
      while (!visited.has(key(u, v)) && guard++ < limit) {
        visited.add(key(u, v));
        face.push(u);
        const w = next(u, v);
        if (w === null) break;
        u = v;
        v = w;
      }
      if (face.length >= 3) faces.push(face);
    }
  }

  const loops: ClosedLoop[] = [];
  for (const f of faces) {
    // Dedup guard: a real face visits distinct nodes.
    if (new Set(f).size !== f.length) continue;
    if (signedAreaYUp(f, coord) < -1e-6) loops.push({ points: f });
  }
  return loops;
}

// Shoelace area in a y-up convention (image y is down, so negate). Bounded
// interior faces come out positive; the outer face comes out negative.
function signedAreaYUp(face: string[], coord: Map<string, XY>): number {
  let a = 0;
  for (let i = 0; i < face.length; i++) {
    const p = coord.get(face[i])!;
    const q = coord.get(face[(i + 1) % face.length])!;
    a += p.x * -q.y - q.x * -p.y;
  }
  return a / 2;
}

/** Rooms plus whether the trace still has loose ends (degree-1 nodes). */
export function analyzeLoops(
  points: TracePoint[],
  segments: TraceSegment[],
): LoopAnalysis {
  const deg = new Map<string, number>();
  for (const p of points) deg.set(p.id, 0);
  for (const s of segments) {
    if (s.a === s.b) continue;
    deg.set(s.a, (deg.get(s.a) ?? 0) + 1);
    deg.set(s.b, (deg.get(s.b) ?? 0) + 1);
  }
  let hasOpenChain = false;
  for (const d of deg.values()) if (d === 1) hasOpenChain = true;

  return { loops: findRooms(points, segments), hasOpenChain };
}
