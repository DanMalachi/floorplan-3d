import type { Node, Opening, Room, Scene, Wall } from "@/schema/scene";
import type { TraceOpening, TracePoint, TraceSegment } from "./types";
import { DEFAULT_THICKNESS } from "@/schema/constants";
import { analyzeLoops } from "../lib/loops";
import { pointInPolygon } from "@/lib/rooms/roomArea";
import { buildRoomGraph } from "@/lib/rooms/semanticGraph";
import { classifyRoomsByRules, RULE_CONFIDENCE_GATE } from "@/lib/rooms/roomClassifier";
import { displayRoomType } from "@/lib/rooms/roomTaxonomy";

/** A text span from the plan (vector-PDF OCR), in image-pixel space. */
export interface PlanText {
  x: number; // px (span center)
  y: number;
  text: string;
}

export interface TraceToSceneInput {
  points: TracePoint[];
  segments: TraceSegment[];
  openings: TraceOpening[];
  metersPerPixel: number;
  texts?: PlanText[]; // optional room-label tokens for the knowledge layer
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
    // A traced rail stays a rail in 3D (low, see-through) and a traced portal
    // builds nothing at all, instead of either becoming a full-height wall.
    // Rooms still close through both — they live in scene.walls, and closure is
    // topology, not construction.
    ...(s.type === "rail" || s.type === "portal" ? { kind: s.type } : {}),
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

  const scene: Scene = {
    schemaVersion: 2,
    units: "meters",
    nodes,
    walls,
    openings: sceneOpenings,
    rooms,
    furniture: [],
  };

  // Building Knowledge Layer — free pass. Deterministic features + rule labels
  // are computed for every generated scene; the paid VLM escalation is a
  // separate explicit action (store.understandRooms).
  const graph = buildRoomGraph(scene);
  const ocr = input.texts?.length
    ? assignTextsToRooms(input.texts, rooms, pointMap)
    : undefined;
  const { rooms: semantics, building } = classifyRoomsByRules(graph, ocr);
  scene.rooms = rooms.map((r) => {
    const sem = semantics.get(r.id);
    if (!sem) return r;
    // Confident types also become the display name ("Room 3" -> "Bedroom").
    const name =
      sem.type !== "unknown" && sem.confidence >= RULE_CONFIDENCE_GATE
        ? displayRoomType(sem.type)
        : r.name;
    return { ...r, name, semantics: sem };
  });
  scene.building = building;

  return scene;
}

/** Assign plan text spans to the room whose loop (in px space) contains them. */
function assignTextsToRooms(
  texts: PlanText[],
  rooms: Room[],
  pointMap: Map<string, TracePoint>,
): Map<string, string[]> {
  const polys = rooms.map((r) => ({
    id: r.id,
    poly: r.loop
      .map((id) => pointMap.get(id))
      .filter((p): p is TracePoint => p != null),
  }));
  const out = new Map<string, string[]>();
  for (const t of texts) {
    const hit = polys.find((r) => r.poly.length >= 3 && pointInPolygon(t.x, t.y, r.poly));
    if (!hit) continue;
    const arr = out.get(hit.id);
    if (arr) arr.push(t.text);
    else out.set(hit.id, [t.text]);
  }
  return out;
}
