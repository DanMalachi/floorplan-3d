import type { TracePoint, TraceSegment } from "../trace2d/types";

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
 * Drop dangling chains, leaving the graph's 2-core.
 *
 * A degree-1 node cannot bound a room, so every edge hanging off one is removed —
 * repeatedly, since removing an edge can strand the node behind it. This matters
 * because a spur pointing INTO a room forces that room's face to walk out along
 * the spur and back, visiting nodes twice. Such a face is still geometrically
 * correct (the excursion contributes no area), but it is not a simple polygon,
 * and the floor triangulation downstream needs simple polygons. Pruning first is
 * cleaner than trying to repair the face afterwards, and it means a half-drawn
 * wall no longer makes the room it sits in disappear.
 */
function twoCore(segments: TraceSegment[], coord: Map<string, XY>): TraceSegment[] {
  let live = segments.filter(
    (s) => s.a !== s.b && coord.has(s.a) && coord.has(s.b),
  );
  for (;;) {
    const deg = new Map<string, number>();
    for (const s of live) {
      deg.set(s.a, (deg.get(s.a) ?? 0) + 1);
      deg.set(s.b, (deg.get(s.b) ?? 0) + 1);
    }
    const kept = live.filter(
      (s) => (deg.get(s.a) ?? 0) > 1 && (deg.get(s.b) ?? 0) > 1,
    );
    if (kept.length === live.length) return kept;
    live = kept;
  }
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
 * we keep the negative-area faces. Dangling spurs are pruned beforehand, so
 * every face here is a simple polygon.
 */
export function findRooms(
  points: TracePoint[],
  segments: TraceSegment[],
): ClosedLoop[] {
  const coord = new Map<string, XY>(points.map((p) => [p.id, { x: p.x, y: p.y }]));

  // Only the 2-core can bound rooms; a half-drawn run must not affect existing ones.
  const core = twoCore(segments, coord);

  const adj = new Map<string, Set<string>>();
  for (const p of points) adj.set(p.id, new Set());
  for (const s of core) {
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

  for (const s of core) {
    for (const [u0, v0] of [
      [s.a, s.b],
      [s.b, s.a],
    ] as const) {
      if (visited.has(key(u0, v0))) continue;
      const face: string[] = [];
      let u = u0;
      let v = v0;
      let guard = 0;
      const limit = core.length * 2 + 8;
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
