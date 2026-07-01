import type { Node, Opening, Room, Scene, Wall } from "@/schema/scene";
import type { TraceOpening, TracePoint, TraceSegment } from "@/store/useSceneStore";
import { DEFAULT_THICKNESS } from "@/schema/constants";
import { analyzeLoops } from "@/lib/loops";

export interface TraceToSceneInput {
  points: TracePoint[];
  segments: TraceSegment[];
  openings: TraceOpening[];
  metersPerPixel: number;
}

/**
 * Convert the traced network into a Scene (the single source of truth the M1
 * renderer consumes). Trace coords are image pixels; we scale to meters via
 * metersPerPixel. Walls come from every segment; floors only from CLOSED loops
 * (closure gates extrusion). Opening positions become offsets in meters from
 * the wall's node `a`, matching buildWallSegments.
 */
export function traceToScene(input: TraceToSceneInput): Scene {
  const { points, segments, openings, metersPerPixel: mpp } = input;
  const pointMap = new Map(points.map((p) => [p.id, p]));
  const segMap = new Map(segments.map((s) => [s.id, s]));

  const nodes: Node[] = points.map((p) => ({
    id: p.id,
    x: p.x * mpp,
    y: p.y * mpp,
  }));

  const walls: Wall[] = segments.map((s) => ({
    id: s.id,
    a: s.a,
    b: s.b,
    thickness: DEFAULT_THICKNESS,
  }));

  const sceneOpenings: Opening[] = [];
  for (const o of openings) {
    const seg = segMap.get(o.segmentId);
    if (!seg) continue;
    const a = pointMap.get(seg.a);
    const b = pointMap.get(seg.b);
    if (!a || !b) continue;
    const lengthMeters = Math.hypot(b.x - a.x, b.y - a.y) * mpp;
    const center = (o.t0 + o.t1) / 2;
    sceneOpenings.push({
      id: o.id,
      type: o.type,
      wallId: o.segmentId,
      offset: center * lengthMeters,
      width: Math.abs(o.t1 - o.t0) * lengthMeters,
      height: o.height,
      sill: o.sill,
    });
  }

  const { loops } = analyzeLoops(points, segments);
  const rooms: Room[] = loops.map((loop, i) => ({
    id: `room${i}`,
    name: `Room ${i + 1}`,
    loop: loop.points,
  }));

  return {
    schemaVersion: 1,
    units: "meters",
    nodes,
    walls,
    openings: sceneOpenings,
    rooms,
  };
}
