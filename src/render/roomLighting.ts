import type { Node, Scene } from "@/schema/scene";
import { WALL_HEIGHT } from "@/schema/constants";
import { nodeMap, roomArea } from "@/lib/rooms/roomArea";
import { resolveCeilingState } from "@/lib/rooms/roomCeiling";
import { poleOfInaccessibility } from "@/lib/rooms/poleOfInaccessibility";
import { ROOM_LIGHT } from "./contract";
import { ROOM_FIXTURE_COLOR, roomFixtureCandela, toRenderIntensity } from "./lightPresets";

/**
 * One ceiling light per detected room (M2, `docs/render-contract.md`). No
 * placement UI, no per-room tuning — position and intensity are both derived
 * from the room's own loop and area.
 */
export interface RoomLight {
  roomId: string;
  /** Plan-space world position: (x, ceilingHeight - drop, planY). Matches the
   *  (x, y) -> (x, 0, y) mapping every other mesh in this scene uses
   *  (`triangulateFloor.ts`), so the caller can place it in the same
   *  recentred group as Floors/Ceilings/Walls without a second transform. */
  position: [number, number, number];
  /** Renderer-space intensity — already through `toRenderIntensity`. */
  intensity: number;
  color: string;
}

/**
 * A room's own ceiling height: the tallest wall on its OWN perimeter (walls
 * no neighbouring room's loop also references), falling back to any bounding
 * wall if the room has no perimeter wall of its own. Mirrors the height rule
 * `FloorMesh.tsx`'s `Ceilings` component uses to place the ceiling slab
 * itself — reimplemented here (not imported: that component isn't exported
 * for reuse, and this is a stable geometric fact independent of camera mode
 * or mesh visibility, not the rail-adjacency *presence* question §8.3
 * reserves for the schema field) so a room's light sits at the same height as
 * its actual ceiling.
 */
function ceilingHeights(scene: Scene): Map<string, number> {
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
 * Every room light the scene should currently show. Skips:
 *  - rooms whose loop doesn't close (< 3 nodes resolve) — nothing to light;
 *  - rooms open to the sky by design (`resolveCeilingState` — schema field
 *    first, rail-adjacency guess only when unauthored, §8.3);
 *  - rooms under `ROOM_LIGHT.minAreaM2` — closets, shafts, trace slivers.
 *
 * Pure and cheap (no THREE objects) so the R3F layer can memoize on `scene`
 * and own the mount/shadow-budget decision itself.
 */
export function computeRoomLights(scene: Scene): RoomLight[] {
  const nodes = nodeMap(scene.nodes);
  const heights = ceilingHeights(scene);
  const out: RoomLight[] = [];

  for (const room of scene.rooms) {
    const loop = room.loop
      .map((id) => nodes.get(id))
      .filter((n): n is Node => n != null);
    if (loop.length < 3) continue;
    if (resolveCeilingState(room, scene.walls) === "open") continue;

    const area = roomArea(room.loop, nodes);
    if (area < ROOM_LIGHT.minAreaM2) continue;

    const center = poleOfInaccessibility(loop);
    const height = heights.get(room.id) ?? WALL_HEIGHT;
    const candela = roomFixtureCandela(area, ROOM_LIGHT.targetLux);

    out.push({
      roomId: room.id,
      position: [center.x, height - ROOM_LIGHT.dropBelowCeilingM, center.y],
      intensity: toRenderIntensity(candela),
      color: ROOM_FIXTURE_COLOR,
    });
  }

  return out;
}
