import type { FixtureItem, Node, Room, Scene } from "@/schema/scene";
import { WALL_HEIGHT, DEFAULT_THICKNESS } from "@/schema/constants";
import { nodeMap, pointInPolygon, roomArea } from "@/lib/rooms/roomArea";
import { resolveCeilingState } from "@/lib/rooms/roomCeiling";
import { poleOfInaccessibility, type Point2 } from "@/lib/rooms/poleOfInaccessibility";
import { ROOM_LIGHT } from "./contract";
import { resolveCeilingHeights } from "./ceilingHeight";
import {
  DEFAULT_FIXTURE_COLOR_K,
  DEFAULT_FIXTURE_LUX,
  kelvinToColor,
  roomFixtureCandela,
  toRenderIntensity,
} from "./lightPresets";

/** Standoff a wall-mounted fixture's resolved position sits off the wall
 *  face, so it lands unambiguously inside the room it's mounted to face
 *  (not exactly on the boundary, where point-in-polygon is undefined) and far
 *  enough that dot(N,L) with its own wall isn't ~0 (Sprint 3c: a wall light
 *  sitting almost in the wall's own plane always renders that wall as the
 *  darkest surface in the room, however bright the fixture is). */
const WALL_FIXTURE_GAP_M = 0.14;

/** Fixed reference area a wall-mounted fixture sizes itself against, instead
 *  of the room's actual area (Sprint 3c). `roomFixtureCandela` scaling a
 *  ceiling fixture by room area is right for a light meant to flood the whole
 *  room; a wall sconce is a local light and that same scaling starves it in
 *  small hallways/bathrooms and gives it nothing at all in an unroofed
 *  balcony (area not even meaningful there). */
export const WALL_FIXTURE_REFERENCE_AREA_M2 = 6;

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
 * A room's own ceiling height — `room.ceilingHeight` when authored, otherwise
 * the tallest wall on its OWN perimeter. Delegates to the shared resolver
 * (`ceilingHeight.ts`) that `FloorMesh.tsx`'s `Ceilings` component and
 * `WallMesh.tsx`'s `Walls` component also resolve through, so a room's light
 * sits at the same height as its actual ceiling.
 */
export const ceilingHeights = resolveCeilingHeights;

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
 * Every room with a closed loop, regardless of `eligibleLitRooms`' open-
 * ceiling/min-area gates — the room-attribution surface for WALL-mounted
 * fixtures (Sprint 3a). Those two gates make sense for "does this room get a
 * ceiling-light DEFAULT", not for "does a fixture someone actually placed on
 * this wall light it" — a balcony (open ceiling) or an undersized hallway
 * still has a wall a sconce can be mounted to.
 */
export function allRoomsWithLoop(scene: Scene): EligibleRoom[] {
  const nodes = nodeMap(scene.nodes);
  const heights = ceilingHeights(scene);
  const out: EligibleRoom[] = [];
  for (const room of scene.rooms) {
    const loop = room.loop
      .map((id) => nodes.get(id))
      .filter((n): n is Node => n != null);
    if (loop.length < 3) continue;
    out.push({
      room,
      loop,
      area: roomArea(room.loop, nodes),
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
  // Ceiling fixtures only ever light an `eligibleLitRooms` room (unchanged);
  // wall fixtures attribute against every closed-loop room (Sprint 3a) —
  // computed once, not per fixture.
  const eligible = eligibleLitRooms(scene);
  const allRooms = allRoomsWithLoop(scene);
  const out: RoomLight[] = [];

  for (const item of fixtures) {
    const world = resolveFixtureWorldXY(item, scene);
    if (!world) continue;
    const mount = item.mount;
    const isWall = mount.kind === "wall";
    const rooms = isWall ? allRooms : eligible;
    const er = rooms.find((r) => pointInPolygon(world.x, world.y, r.loop));
    // A ceiling fixture with no eligible room genuinely lights nothing
    // (unchanged — that's the M2 always-a-room-first design). A WALL fixture
    // with no containing room at all isn't a "no light" case though: it's
    // mounted facing an area with no authored Room polygon whatsoever — a
    // facade, an entrance, a roof-deck edge — exactly Dan's screenshot (a
    // sconce that renders but stays visibly dark). It still lights *something*
    // (its own wall face), so it falls through to a room-less light below
    // instead of being dropped (Sprint 5).
    if (!er && !isWall) continue;

    const lux = item.targetLux ?? DEFAULT_FIXTURE_LUX;
    // Wall fixtures use a fixed reference area, not the room's actual area
    // (Sprint 3c) — see WALL_FIXTURE_REFERENCE_AREA_M2. A room-less wall
    // fixture uses the same fixed area; there's no room to scale against.
    const candela = roomFixtureCandela(isWall ? WALL_FIXTURE_REFERENCE_AREA_M2 : er!.area, lux);
    const y = mount.kind === "ceiling" ? er!.ceilingHeight - ROOM_LIGHT.dropBelowCeilingM : mount.sill;

    out.push({
      id: item.id,
      roomId: er ? er.room.id : `exterior:${item.id}`,
      position: [world.x, y, world.y],
      intensity: toRenderIntensity(candela),
      color: kelvinToColor(item.colorK ?? DEFAULT_FIXTURE_COLOR_K),
    });
  }

  return out;
}
