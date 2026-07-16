// Phase 6 (+ later refinement): a real walkthrough spawn point, rather than
// wherever the orbit camera happened to be sitting when the mode was entered
// (Phase 1's stand-in). Priority:
//   1. An exterior door — one on a wall bordering exactly one room, i.e. the
//      building's perimeter, not an interior partition — near the room the
//      Building Knowledge Layer classified as "entry" if there is one.
//   2. Any single exterior door, or the one bordering the largest room if
//      there are several and none is tagged "entry".
//   3. The entry room's centroid, if classified but no exterior door was
//      found on it (unusual, but the schema doesn't guarantee one).
//   4. The largest room's centroid.
//   5. The plan's node bounding-box center, if there are no rooms at all.
// Only the door-based cases (1-2) also return a facing yaw — "walk in and
// look into the room" only makes sense when there's an actual doorway to
// walk in through; a bare room centroid has no obviously-correct facing.

import type { Id, Node, Opening, Room, Scene, Wall } from "@/schema/scene";
import { nodeMap, roomArea } from "@/lib/rooms/roomArea";

const ENTRANCE_INSET_M = 1.2; // how far inside the doorway the spawn point sits

/** Area-weighted polygon centroid (shoelace-based) — more representative of
 *  "the middle of the room" than a plain vertex average for irregular
 *  (L-shaped, notched) room outlines. */
function polygonCentroid(loop: Id[], nodes: Map<Id, Node>): { x: number; y: number } | null {
  const pts = loop.map((id) => nodes.get(id)).filter((n): n is Node => n != null);
  if (pts.length < 3) return null;
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-9) {
    // Degenerate (near-zero-area) loop — fall back to a plain vertex average.
    const n = pts.length;
    return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n };
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

const edgeKey = (a: Id, b: Id) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** wallId -> the room(s) whose loop walks that wall's edge. A wall bordering
 *  exactly one room is the building's perimeter (exterior); bordering two is
 *  an interior partition. */
function wallBorderingRooms(scene: Scene): Map<Id, Room[]> {
  const wallByEdge = new Map<string, Wall>();
  for (const w of scene.walls) wallByEdge.set(edgeKey(w.a, w.b), w);

  const out = new Map<Id, Room[]>();
  for (const room of scene.rooms) {
    const loop = room.loop;
    for (let i = 0; i < loop.length; i++) {
      const wall = wallByEdge.get(edgeKey(loop[i], loop[(i + 1) % loop.length]));
      if (!wall) continue;
      const list = out.get(wall.id);
      if (list) list.push(room);
      else out.set(wall.id, [room]);
    }
  }
  return out;
}

interface EntranceCandidate {
  opening: Opening;
  wall: Wall;
  room: Room;
}

function findEntranceDoor(scene: Scene, nodes: Map<Id, Node>): EntranceCandidate | null {
  const bordering = wallBorderingRooms(scene);
  const candidates: EntranceCandidate[] = [];
  for (const opening of scene.openings) {
    if (opening.type !== "door") continue;
    const wall = scene.walls.find((w) => w.id === opening.wallId);
    if (!wall) continue;
    const rooms = bordering.get(wall.id);
    if (!rooms || rooms.length !== 1) continue; // interior partition or orphan wall — not exterior
    candidates.push({ opening, wall, room: rooms[0] });
  }
  if (candidates.length === 0) return null;

  const entryCandidate = candidates.find((c) => c.room.semantics?.type === "entry");
  if (entryCandidate) return entryCandidate;
  if (candidates.length === 1) return candidates[0];

  // Multiple exterior doors, none tagged "entry" — the one bordering the
  // largest room is the more likely main entrance (a back/service door
  // usually opens onto a smaller utility space).
  let best = candidates[0];
  let bestArea = roomArea(best.room.loop, nodes);
  for (const c of candidates.slice(1)) {
    const area = roomArea(c.room.loop, nodes);
    if (area > bestArea) {
      best = c;
      bestArea = area;
    }
  }
  return best;
}

/** A point just inside the doorway, `ENTRANCE_INSET_M` in from the door's
 *  center along whichever wall-normal points toward the bordering room, plus
 *  the yaw that faces that same inward direction. */
function spawnNearEntrance(c: EntranceCandidate, nodes: Map<Id, Node>): { x: number; y: number; yaw: number } | null {
  const a = nodes.get(c.wall.a);
  const b = nodes.get(c.wall.b);
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) return null;
  const ux = dx / L;
  const uy = dy / L;

  const doorX = a.x + ux * c.opening.offset;
  const doorY = a.y + uy * c.opening.offset;

  // Wall has two possible normals; pick whichever points toward the
  // bordering room's centroid (i.e. inward, not out into the yard).
  const nx = -uy;
  const ny = ux;
  const roomCentroid = polygonCentroid(c.room.loop, nodes) ?? { x: doorX, y: doorY };
  const towardRoom = (roomCentroid.x - doorX) * nx + (roomCentroid.y - doorY) * ny;
  const inX = towardRoom >= 0 ? nx : -nx;
  const inY = towardRoom >= 0 ? ny : -ny;

  return {
    x: doorX + inX * ENTRANCE_INSET_M,
    y: doorY + inY * ENTRANCE_INSET_M,
    // Same yaw convention as the camera rig (forward(yaw) = (-sin yaw, -cos
    // yaw) in world (x, z), and plan (x, y) maps to world (x, z) unchanged —
    // so inverting that formula on the plan-space inward direction directly
    // gives the world yaw, no extra conversion needed.
    yaw: Math.atan2(-inX, -inY),
  };
}

/** Plan-space (x, y) spawn point, plus a facing yaw when spawning at a real
 *  doorway. Caller converts x/y to world via the same recenter offset used
 *  everywhere else (world = plan - offset); yaw needs no conversion. */
export function pickSpawnPoint(scene: Scene): { x: number; y: number; yaw?: number } {
  const nodes = nodeMap(scene.nodes);

  const entrance = findEntranceDoor(scene, nodes);
  if (entrance) {
    const spot = spawnNearEntrance(entrance, nodes);
    if (spot) return spot;
  }

  const entry = scene.rooms.find((r) => r.semantics?.type === "entry");
  const pool = entry ? [entry] : scene.rooms;

  let best: { room: Room; area: number } | null = null;
  for (const room of pool) {
    const area = roomArea(room.loop, nodes);
    if (!best || area > best.area) best = { room, area };
  }
  if (best) {
    const c = polygonCentroid(best.room.loop, nodes);
    if (c) return c;
  }

  if (scene.nodes.length === 0) return { x: 0, y: 0 };
  const xs = scene.nodes.map((n) => n.x);
  const ys = scene.nodes.map((n) => n.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}
