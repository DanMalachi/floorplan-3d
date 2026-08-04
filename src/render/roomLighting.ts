import type { FixtureItem, Node, Room, Scene } from "@/schema/scene";
import { WALL_HEIGHT, DEFAULT_THICKNESS } from "@/schema/constants";
import { nodeMap, pointInPolygon, roomArea } from "@/lib/rooms/roomArea";
import { resolveCeilingState } from "@/lib/rooms/roomCeiling";
import { poleOfInaccessibility, type Point2 } from "@/lib/rooms/poleOfInaccessibility";
import { ROOM_LIGHT } from "./contract";
import {
  DEFAULT_FIXTURE_COLOR_K,
  DEFAULT_FIXTURE_LUX,
  kelvinToColor,
  roomFixtureCandela,
  toRenderIntensity,
} from "./lightPresets";

/** Standoff a wall-mounted fixture's resolved position sits off the wall
 *  face, so it lands unambiguously inside the room it's mounted to face
 *  (not exactly on the boundary, where point-in-polygon is undefined). Purely
 *  a room-attribution/render-position detail — not the fixture's visual size. */
const WALL_FIXTURE_GAP_M = 0.05;

/**
 * A ceiling light in render-ready form. `id` is the unique React key — a
 * room's own id when it's lit by the M2 pole-of-inaccessibility default, or a
 * `FixtureItem.id` when a user has placed one or more real fixtures in that
 * room (see `computeRoomLights` below).
 */
export interface RoomLight {
  id: string;
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

/** A room that qualifies for a ceiling light, with the geometric facts both
 *  `computeRoomLights` and `seedRoomFixtures` need — factored out so the two
 *  can never drift on "which rooms count" (loop closes, roofed, big enough). */
export interface EligibleRoom {
  room: Room;
  loop: Point2[];
  area: number;
  center: Point2;
  ceilingHeight: number;
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
export function ceilingHeights(scene: Scene): Map<string, number> {
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
 * Every room the scene currently considers light-eligible. Skips:
 *  - rooms whose loop doesn't close (< 3 nodes resolve) — nothing to light;
 *  - rooms open to the sky by design (`resolveCeilingState` — schema field
 *    first, rail-adjacency guess only when unauthored, §8.3);
 *  - rooms under `ROOM_LIGHT.minAreaM2` — closets, shafts, trace slivers.
 *
 * Shared by `computeRoomLights` (below) and `seedRoomFixtures` so the two can
 * never disagree about which rooms qualify.
 */
export function eligibleLitRooms(scene: Scene): EligibleRoom[] {
  const nodes = nodeMap(scene.nodes);
  const heights = ceilingHeights(scene);
  const out: EligibleRoom[] = [];

  for (const room of scene.rooms) {
    const loop = room.loop
      .map((id) => nodes.get(id))
      .filter((n): n is Node => n != null);
    if (loop.length < 3) continue;
    if (resolveCeilingState(room, scene.walls) === "open") continue;

    const area = roomArea(room.loop, nodes);
    if (area < ROOM_LIGHT.minAreaM2) continue;

    out.push({
      room,
      loop,
      area,
      center: poleOfInaccessibility(loop),
      ceilingHeight: heights.get(room.id) ?? WALL_HEIGHT,
    });
  }

  return out;
}

/**
 * A fixture's plan position, regardless of mount kind — the single place both
 * the lighting engine (room attribution below) and `FixtureLayer.tsx`
 * (render position) resolve it, so the two can never draw a fixture in a
 * different place than the one that actually lights a room.
 *
 * Ceiling mounts store plan (x,y) directly. Wall mounts store `wallId` +
 * `offset` along it (mirrors `Opening`'s own anchoring) + `side`, resolved
 * here to a point pushed `WALL_FIXTURE_GAP_M` off the wall's centerline —
 * enough that it lands inside the room that face belongs to, not exactly on
 * the boundary between it and its neighbour. Returns null when the mount
 * references a wall/nodes that no longer exist (deleted out from under it).
 */
export function resolveFixtureWorldXY(item: FixtureItem, scene: Scene): Point2 | null {
  const mount = item.mount;
  if (mount.kind === "ceiling") return { x: mount.x, y: mount.y };

  const wall = scene.walls.find((w) => w.id === mount.wallId);
  if (!wall) return null;
  const nodes = nodeMap(scene.nodes);
  const a = nodes.get(wall.a);
  const b = nodes.get(wall.b);
  if (!a || !b) return null;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) return null;
  const ux = dx / L;
  const uy = dy / L;
  const t = Math.min(Math.max(mount.offset, 0), L);
  const px = a.x + ux * t;
  const py = a.y + uy * t;

  // Wall-local normal: (-uy, ux) is the "a" (+Z) face, matching the same
  // formula WallMesh.tsx/RailMesh already use for every wall-plane offset.
  const sign = mount.side === "a" ? 1 : -1;
  const push = (wall.thickness ?? DEFAULT_THICKNESS) / 2 + WALL_FIXTURE_GAP_M;
  return { x: px + -uy * sign * push, y: py + ux * sign * push };
}

/**
 * Every room light the scene should currently show, driven by user-placed
 * `FixtureItem`s (ceiling or wall) when a room has any — one `RoomLight` per
 * fixture whose resolved position falls inside that room's loop, at the
 * fixture's own position, never a recomputed default — or by nothing at all
 * when it has none. There is deliberately no "always at least one light"
 * fallback here: `seedRoomFixtures` is what guarantees a fresh room starts
 * lit, and once a user empties a room of fixtures that is a real, respected
 * choice — matching furniture's "an empty room is a valid state" semantics —
 * not a gap this function silently patches over.
 *
 * Brightness and color are per-fixture (`FixtureItem.targetLux`/`colorK`,
 * defaulting to `DEFAULT_FIXTURE_LUX`/`DEFAULT_FIXTURE_COLOR_K` —
 * lightPresets.ts), not a room-wide constant. A room with N fixtures gets N
 * independent contributions at each fixture's own lux (each sized as if it
 * were the room's only one), not that total split across them — a deliberate
 * choice, not physical modelling: it keeps a second lamp actually
 * brightening the room.
 *
 * Pure and cheap (no THREE objects) so the R3F layer can memoize on `scene`
 * and own the mount/shadow-budget decision itself.
 */
export function computeRoomLights(scene: Scene): RoomLight[] {
  const fixtures = scene.fixtures ?? [];
  const out: RoomLight[] = [];

  for (const er of eligibleLitRooms(scene)) {
    for (const item of fixtures) {
      const world = resolveFixtureWorldXY(item, scene);
      if (!world || !pointInPolygon(world.x, world.y, er.loop)) continue;

      const lux = item.targetLux ?? DEFAULT_FIXTURE_LUX;
      const candela = roomFixtureCandela(er.area, lux);
      const mount = item.mount;
      const y =
        mount.kind === "ceiling" ? er.ceilingHeight - ROOM_LIGHT.dropBelowCeilingM : mount.sill;

      out.push({
        id: item.id,
        roomId: er.room.id,
        position: [world.x, y, world.y],
        intensity: toRenderIntensity(candela),
        color: kelvinToColor(item.colorK ?? DEFAULT_FIXTURE_COLOR_K),
      });
    }
  }

  return out;
}
