import type { Scene } from "@/schema/scene";
import { WALL_HEIGHT } from "@/schema/constants";
import { MIN_CASTER_THICKNESS } from "./contract";
import { resolveCeilingState } from "@/lib/rooms/roomCeiling";

/**
 * Resolved ceiling height for every room: `room.ceilingHeight` when authored
 * (Sprint 4), otherwise the derived rule — the tallest wall on the room's OWN
 * perimeter (walls no neighbouring room's loop also references), falling
 * back to any bounding wall if the room has no perimeter wall of its own.
 *
 * The single place this rule lives — `FloorMesh.tsx`'s `Ceilings` component,
 * `WallMesh.tsx`'s `Walls` component (via `computeWallEffectiveHeights`
 * below), and `roomLighting.ts` all resolve through here, so none of them can
 * drift on where a room's ceiling actually sits.
 */
export function resolveCeilingHeights(scene: Scene): Map<string, number> {
  const wallByEdge = new Map(scene.walls.map((w) => [[w.a, w.b].sort().join("|"), w]));
  const roomsPerWall = new Map<string, number>();
  for (const room of scene.rooms) {
    for (let i = 0; i < room.loop.length; i++) {
      const wall = wallByEdge.get([room.loop[i], room.loop[(i + 1) % room.loop.length]].sort().join("|"));
      if (!wall) continue;
      roomsPerWall.set(wall.id, (roomsPerWall.get(wall.id) ?? 0) + 1);
    }
  }
  const heights = new Map<string, number>();
  for (const room of scene.rooms) {
    if (room.ceilingHeight != null) {
      heights.set(room.id, room.ceilingHeight);
      continue;
    }
    let perimeterHeight: number | null = null;
    let anyHeight: number | null = null;
    for (let i = 0; i < room.loop.length; i++) {
      const wall = wallByEdge.get([room.loop[i], room.loop[(i + 1) % room.loop.length]].sort().join("|"));
      if (!wall) continue;
      const h = wall.height ?? WALL_HEIGHT;
      anyHeight = anyHeight == null ? h : Math.max(anyHeight, h);
      if (roomsPerWall.get(wall.id) === 1) {
        perimeterHeight = perimeterHeight == null ? h : Math.max(perimeterHeight, h);
      }
    }
    heights.set(room.id, perimeterHeight ?? anyHeight ?? WALL_HEIGHT);
  }
  return heights;
}

/**
 * Each wall's render height, following the taller of its own authored height
 * and every room it borders' resolved ceiling (Sprint 4): an authored
 * per-room ceiling now converts a "shorter shared wall" case into the
 * already-handled riser case — the shared wall rises to the taller room's
 * ceiling, the shorter room sees a wall taller than its own ceiling, and the
 * existing riser rule (`FloorMesh.tsx`) seals that gap exactly as it already
 * does for any other bounding wall taller than a room's own ceiling.
 */
export function computeWallEffectiveHeights(
  scene: Scene,
  roomHeights: Map<string, number>,
): Map<string, number> {
  const wallByEdge = new Map(scene.walls.map((w) => [[w.a, w.b].sort().join("|"), w]));
  const heights = new Map<string, number>();
  for (const wall of scene.walls) heights.set(wall.id, wall.height ?? WALL_HEIGHT);
  for (const room of scene.rooms) {
    const roomH = roomHeights.get(room.id);
    if (roomH == null) continue;
    for (let i = 0; i < room.loop.length; i++) {
      const wall = wallByEdge.get([room.loop[i], room.loop[(i + 1) % room.loop.length]].sort().join("|"));
      if (!wall) continue;
      const prev = heights.get(wall.id) ?? wall.height ?? WALL_HEIGHT;
      heights.set(wall.id, Math.max(prev, roomH));
    }
  }
  return heights;
}

/**
 * Which rooms actually get a ceiling built over them.
 *
 * Resolved through `roomCeiling.ts` — the one place allowed to infer this —
 * rather than re-deriving rail adjacency here, which render-contract.md §8.3
 * forbids precisely because a second copy of the check drifts. It also means
 * an authored `room.ceiling` is honoured: `Ceilings` used to read rail edges
 * directly and would roof a room explicitly marked open to the sky.
 *
 * A rail means open to the SKY, so the room loses its ceiling. A portal means
 * open to the next ROOM, and the ceiling runs straight over it. Do not merge
 * the two.
 */
export function roomsWithCeiling(scene: Scene): Set<string> {
  const out = new Set<string>();
  for (const room of scene.rooms) {
    if (room.loop.length < 3) continue;
    if (resolveCeilingState(room, scene.walls) === "roofed") out.add(room.id);
  }
  return out;
}

/**
 * The height a wall's BODY is actually drawn to — its effective height plus
 * the ceiling slab of any roofed room it bounds.
 *
 * A ceiling is a solid, not a plane (it has to be, to cast a shadow without
 * acneing — render contract §3.4), and its underside is the room's ceiling
 * plane. That puts the slab's MIT thickness in the airspace above the wall
 * top, where from any outside or aerial angle it read as a white lip standing
 * proud of every wall. Walls carry that slab in a real building, so they end
 * at its top, not at its underside: raising the body by exactly the slab
 * thickness hides it behind the wall head and leaves the ceiling plane —
 * which lights, fixtures and `room.ceilingHeight` all resolve against —
 * exactly where it was.
 *
 * Separate from `computeWallEffectiveHeights` on purpose. That one is the
 * ceiling/riser contract (is this wall taller than the room's ceiling?) and
 * must keep comparing against the ceiling plane; this one is only about what
 * gets drawn, so a universal +slab can't make every wall look like it needs a
 * riser.
 */
export function computeWallRenderHeights(
  scene: Scene,
  roomHeights: Map<string, number>,
  effectiveHeights: Map<string, number>,
): Map<string, number> {
  const wallByEdge = new Map(scene.walls.map((w) => [[w.a, w.b].sort().join("|"), w]));
  const roofed = roomsWithCeiling(scene);
  const heights = new Map(effectiveHeights);
  for (const room of scene.rooms) {
    if (!roofed.has(room.id)) continue; // open to the sky — no slab to hide
    const roomH = roomHeights.get(room.id);
    if (roomH == null) continue;
    for (let i = 0; i < room.loop.length; i++) {
      const wall = wallByEdge.get([room.loop[i], room.loop[(i + 1) % room.loop.length]].sort().join("|"));
      if (!wall) continue;
      const prev = heights.get(wall.id) ?? wall.height ?? WALL_HEIGHT;
      heights.set(wall.id, Math.max(prev, roomH + MIN_CASTER_THICKNESS));
    }
  }
  return heights;
}
