// Regenerating from the trace re-derives everything the TRACE owns — where
// walls run, how thick they are, which holes are in them, where the stairs
// climb. It must not throw away what only the 3D side knows.
//
// The split is the whole idea: a field is carried over if, and only if, no
// trace gesture can author it. Anything the trace does author (a wall's
// thickness, an opening's width, a stair's rise) is re-derived on purpose —
// otherwise correcting the plan would silently fail to change the model.
//
// Matching is by id, which survives regeneration because traceToScene reuses
// the trace's own ids. Rooms are the exception: their ids are positional
// (`room0`, `room1`…) and shuffle when the wall graph changes, so they match on
// the set of nodes in their loop instead — the same floor, however it's
// numbered this time.

import type { Opening, Room, Scene, Stair, Wall } from "@/schema/scene";

/** A room's identity that survives renumbering: the node set of its loop. */
const loopKey = (room: Room) => [...room.loop].sort().join("|");

/**
 * Carry 3D-authored properties from `prev` onto a freshly generated `next`.
 *
 * `prev` is the scene that was on screen before Generate; pass null/undefined
 * on a first generate. The result is a new Scene — neither input is mutated.
 */
export function preserveSceneEdits(prev: Scene | null | undefined, next: Scene): Scene {
  if (!prev) return next;

  // Walls: paint is applied per FACE in Decorate and has no trace equivalent.
  const prevWalls = new Map(prev.walls.map((w) => [w.id, w]));
  const walls: Wall[] = next.walls.map((w) => {
    const before = prevWalls.get(w.id);
    if (!before || (before.paintA == null && before.paintB == null)) return w;
    return {
      ...w,
      ...(before.paintA != null ? { paintA: before.paintA } : {}),
      ...(before.paintB != null ? { paintB: before.paintB } : {}),
    };
  });

  // Openings: joinery is chosen in Build. The trace only says "door here, this
  // wide" — it can't say "patio slider, half open, hinged at the far jamb".
  // Dropped when the TYPE changed, because a window has no swing and a door
  // has no mullion grid.
  const prevOpenings = new Map(prev.openings.map((o) => [o.id, o]));
  const openings: Opening[] = next.openings.map((o) => {
    const before = prevOpenings.get(o.id);
    if (!before || before.type !== o.type) return o;
    return {
      ...o,
      ...(before.swingDeg !== undefined ? { swingDeg: before.swingDeg } : {}),
      ...(before.hinge !== undefined ? { hinge: before.hinge } : {}),
      ...(before.slide !== undefined ? { slide: before.slide } : {}),
      ...(before.mullions !== undefined ? { mullions: before.mullions } : {}),
      ...(before.lining !== undefined ? { lining: before.lining } : {}),
    };
  });

  // Stairs: how one is BUILT (solid vs open) is a 3D choice; where it runs,
  // how wide and how many steps all come from the trace.
  const prevStairs = new Map((prev.stairs ?? []).map((s) => [s.id, s]));
  const nextStairs = next.stairs ?? [];
  const stairs: Stair[] = nextStairs.map((s) => {
    const before = prevStairs.get(s.id);
    return before?.style ? { ...s, style: before.style } : s;
  });

  // Rooms: the floor material is picked in Decorate, per room.
  const prevFloors = new Map(
    prev.rooms.filter((r) => r.floor != null).map((r) => [loopKey(r), r.floor]),
  );
  const rooms: Room[] = next.rooms.map((r) => {
    const floor = prevFloors.get(loopKey(r));
    return floor != null ? { ...r, floor } : r;
  });

  return {
    ...next,
    walls,
    openings,
    rooms,
    // Furniture is placed in plan coordinates and has no trace representation at
    // all, so a regenerate emits an empty list. Keeping the old one is the only
    // way a plan correction doesn't clear the room.
    furniture: next.furniture.length > 0 ? next.furniture : prev.furniture,
    ...(nextStairs.length > 0 ? { stairs } : {}),
    // Fixtures: same story as furniture — the trace has no lighting concept at
    // all, so a regenerate's `next.fixtures` is always empty (or undefined, for
    // a scene that's never been through the seeder). Carry `prev`'s forward.
    fixtures: (next.fixtures?.length ?? 0) > 0 ? next.fixtures! : (prev.fixtures ?? []),
  };
}
