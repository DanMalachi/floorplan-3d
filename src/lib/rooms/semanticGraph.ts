// Building Knowledge Layer — deterministic feature + relationship extraction.
//
// Everything in this file is FREE and exact: it reads the geometric Scene the
// system already trusts and derives per-room features (area, openings, exterior
// walls, shape) and room-to-room relationships (shared walls, door connections).
// No heuristics about MEANING live here — that's roomClassifier's job. This
// split is the layer's core contract: geometry -> features -> classification.

import type { Id, RoomFeatures, RoomRelationships, Scene } from "../../schema/scene";
import { nodeMap, roomArea } from "./roomArea";

/** One room's deterministic description. The `features`/`relationships` halves
 *  are persisted into Room.semantics; the extras below feed the rule classifier
 *  only and are never stored. */
export interface RoomGraphEntry {
  roomId: Id;
  features: RoomFeatures;
  relationships: RoomRelationships;
  // --- internal extras (classifier evidence, not persisted) ---
  boundaryWallIds: Id[];
  doorConnections: { room: Id; opening: Id }[]; // connectedVia filtered to doors
  portalConnections: { room: Id }[]; // rooms reached with no barrier at all
  passageConnections: { room: Id; opening: Id }[]; // reached through a cased opening
  exteriorDoorCount: number; // doors in walls that border only this room
  maxDoorWidthM: number;
}

/** Ways out of this room that you never have to open: a portal (no wall) or a
 *  passage (a hole in one). Different construction, same fact — the space is
 *  continuous through here. */
export const openConnections = (e: RoomGraphEntry): number =>
  e.portalConnections.length + e.passageConnections.length;

/** Every way you can walk out of this room. A corridor open to the living room
 *  is as connected as one with a door onto it, so circulation rules must count
 *  both — otherwise an open plan reads as a dead end. */
export const walkableConnections = (e: RoomGraphEntry): number =>
  e.doorConnections.length + openConnections(e);

export type RoomGraph = Map<Id, RoomGraphEntry>;

const pairKey = (a: Id, b: Id) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Build the full deterministic room graph for a scene. */
export function buildRoomGraph(scene: Scene): RoomGraph {
  const nodes = nodeMap(scene.nodes);
  const wallById = new Map(scene.walls.map((w) => [w.id, w]));

  // Node-pair -> wall ids. Loops come from the same segments walls do, so every
  // loop edge resolves to a real wall (traceToScene guarantees 1:1).
  const wallsByPair = new Map<string, Id[]>();
  for (const w of scene.walls) {
    const k = pairKey(w.a, w.b);
    const arr = wallsByPair.get(k);
    if (arr) arr.push(w.id);
    else wallsByPair.set(k, [w.id]);
  }

  // Per-room boundary walls (deduped, loop order irrelevant).
  const boundary = new Map<Id, Set<Id>>();
  for (const room of scene.rooms) {
    const set = new Set<Id>();
    const L = room.loop.length;
    for (let i = 0; i < L; i++) {
      const ids = wallsByPair.get(pairKey(room.loop[i], room.loop[(i + 1) % L]));
      if (ids) for (const id of ids) set.add(id);
    }
    boundary.set(room.id, set);
  }

  // Wall -> rooms multiplicity. A boundary wall touching exactly one room is
  // exterior (the other side is outside the building).
  const wallRooms = new Map<Id, Id[]>();
  for (const [roomId, walls] of boundary) {
    for (const w of walls) {
      const arr = wallRooms.get(w);
      if (arr) arr.push(roomId);
      else wallRooms.set(w, [roomId]);
    }
  }

  const openingsByWall = new Map<Id, typeof scene.openings>();
  for (const o of scene.openings) {
    const arr = openingsByWall.get(o.wallId);
    if (arr) arr.push(o);
    else openingsByWall.set(o.wallId, [o]);
  }

  const graph: RoomGraph = new Map();

  for (const room of scene.rooms) {
    const walls = boundary.get(room.id) ?? new Set<Id>();
    const loopPts = room.loop
      .map((id) => nodes.get(id))
      .filter((n): n is NonNullable<typeof n> => n != null);

    // Shape: perimeter, longest single wall edge, bbox aspect ratio.
    let perimeterM = 0;
    let longestWallM = 0;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < loopPts.length; i++) {
      const p = loopPts[i];
      const q = loopPts[(i + 1) % loopPts.length];
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      perimeterM += len;
      if (len > longestWallM) longestWallM = len;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const w = maxX - minX;
    const h = maxY - minY;
    const aspectRatio =
      w > 1e-9 && h > 1e-9 ? Math.max(w, h) / Math.min(w, h) : 1;

    // Openings + relationships.
    let doorCount = 0;
    let windowCount = 0;
    let exteriorWallCount = 0;
    let railWallCount = 0;
    let portalWallCount = 0;
    let exteriorDoorCount = 0;
    let maxDoorWidthM = 0;
    const connectedVia: { room: Id; opening: Id }[] = [];
    const doorConnections: { room: Id; opening: Id }[] = [];
    const portalConnections: { room: Id }[] = [];
    const passageConnections: { room: Id; opening: Id }[] = [];
    const sharesWall = new Set<Id>();
    const opensInto = new Set<Id>();

    for (const wallId of walls) {
      const rooms = wallRooms.get(wallId) ?? [];
      const kind = wallById.get(wallId)?.kind;
      const isPortal = kind === "portal";
      // A portal is an absence, not a wall: it can't be an exterior wall, and
      // it can't carry an opening (there's nothing to cut a hole in).
      const isExterior = rooms.length === 1 && !isPortal;
      if (isExterior) exteriorWallCount++;
      if (kind === "rail") railWallCount++;
      if (isPortal) portalWallCount++;
      const other = rooms.find((r) => r !== room.id);
      if (other) sharesWall.add(other); // adjacency, whatever the edge is made of
      if (other && isPortal) {
        opensInto.add(other);
        portalConnections.push({ room: other });
      }

      for (const op of openingsByWall.get(wallId) ?? []) {
        // A passage is neither: it's a hole with no door in it. Counting it as
        // a window (the old else-branch) would give every open way through a
        // wall phantom daylight and skew bedroom/bathroom scoring.
        if (op.type === "door") {
          doorCount++;
          if (op.width > maxDoorWidthM) maxDoorWidthM = op.width;
          if (isExterior) exteriorDoorCount++;
        } else if (op.type === "window") {
          windowCount++;
        }
        if (other) {
          const link = { room: other, opening: op.id };
          connectedVia.push(link);
          if (op.type === "door") doorConnections.push(link);
          if (op.type === "passage") {
            opensInto.add(other);
            passageConnections.push(link);
          }
        }
      }
    }

    const features: RoomFeatures = {
      areaM2: roomArea(room.loop, nodes),
      doorCount,
      windowCount,
      exteriorWallCount,
      railWallCount,
      portalWallCount,
      longestWallM,
      perimeterM,
      aspectRatio,
      hasCloset: false, // second pass below — needs every room's entry first
    };

    graph.set(room.id, {
      roomId: room.id,
      features,
      relationships: {
        sharesWallWith: [...sharesWall],
        connectedVia,
        opensInto: [...opensInto],
      },
      boundaryWallIds: [...walls],
      doorConnections,
      portalConnections,
      passageConnections,
      exteriorDoorCount,
      maxDoorWidthM,
    });
  }

  // Second pass: hasCloset — a small windowless single-door room whose only
  // door connection is this room reads as this room's closet. A closet is a
  // DEAD END, so one that also opens into somewhere else is a passage instead.
  for (const entry of graph.values()) {
    for (const link of entry.doorConnections) {
      const c = graph.get(link.room);
      if (!c) continue;
      const f = c.features;
      if (
        f.areaM2 < 3 &&
        f.windowCount === 0 &&
        f.doorCount === 1 &&
        c.doorConnections.length === 1 &&
        openConnections(c) === 0 &&
        c.doorConnections[0].room === entry.roomId
      ) {
        entry.features.hasCloset = true;
        break;
      }
    }
  }

  return graph;
}
