import type { Node, Opening, Room, Scene, Stair, Wall } from "@/schema/scene";
import type { TraceOpening, TracePoint, TraceSegment, TraceStair } from "./types";
import { DEFAULT_THICKNESS } from "@/schema/constants";
import { analyzeLoops } from "../lib/loops";

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
  stairs?: TraceStair[];
  metersPerPixel: number;
  /** Optional room-label tokens from the plan. Currently UNCONSUMED: it fed
   *  the room-type guess that was removed (see the note at the end of
   *  traceToScene). Kept on the input so TraceRail can keep handing OCR text
   *  through until there is a use for it that the user can actually see and
   *  correct. */
  texts?: PlanText[];
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
    thickness: s.thickness ?? DEFAULT_THICKNESS,
    height: s.height,
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

  // Stairs scale like nodes — only the traced AXIS is in pixels. `width`,
  // `rise` and `steps` were set in the panel and are already meters/counts, so
  // they pass straight through (the TraceOpening precedent: scale what was
  // traced, never what was typed).
  const stairs: Stair[] = (input.stairs ?? []).map((s) => ({
    id: s.id,
    flights: s.flights.map((f) => ({
      x0: f.x0 * mpp,
      y0: f.y0 * mpp,
      x1: f.x1 * mpp,
      y1: f.y1 * mpp,
    })),
    width: s.width,
    rise: s.rise,
    ...(s.steps != null ? { steps: s.steps } : {}),
  }));

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
    ...(stairs.length > 0 ? { stairs } : {}),
  };

  // Room TYPE is deliberately never guessed here.
  //
  // This used to run the Building Knowledge Layer on every generated scene
  // (buildRoomGraph -> classifyRoomsByRules) and then write the winning label
  // straight into `Room.name`, so a rule that fired wrongly did not merely
  // mislabel a room in one panel — it BECAME the room's persisted name, with
  // nothing in the UI showing that a guess had happened or offering a way to
  // correct it. A wrong guess you cannot see is worse than no guess, so the
  // whole pass is gone: rooms keep the neutral "Room N" that the loop pass
  // above gives them, and `Room.semantics` / `Scene.building` are left unset.
  //
  // Nothing downstream requires them: the walkthrough's spawn picker already
  // falls back to the exterior door and then to the largest room, and the
  // room inspector now shows measured dimensions instead of a verdict.

  return scene;
}
