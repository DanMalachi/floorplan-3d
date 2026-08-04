import type { Scene } from "@/schema/scene";
import { WALL_HEIGHT, DEFAULT_THICKNESS } from "@/schema/constants";

/**
 * Fixture that produces RISER PANELS, which the sample scene cannot.
 *
 * A riser is generated when a room's bounding wall is taller than that room's
 * own ceiling. Ceiling height is the max over walls the room *owns* (walls no
 * other room's loop touches), so a taller wall only triggers a riser if it is
 * SHARED — a room's own tall wall just raises its ceiling instead.
 *
 * So: two rooms side by side, every own-wall at the default height, and the one
 * wall between them raised. Both rooms then sit at the default ceiling height
 * with 0.8 m of that shared wall standing above them, and both get a riser
 * sealing the strip along it.
 *
 *   z
 *   3  n3 ------ n2 ------ n6
 *      |    A    ||   B    |      || = shared wall, 3.2 m
 *   0  n0 ------ n1 ------ n5
 *      0         4         8   x
 */
const t = DEFAULT_THICKNESS;
const TALL = 3.2;

export const riserScene: Scene = {
  schemaVersion: 2,
  units: "meters",
  nodes: [
    { id: "n0", x: 0, y: 0 },
    { id: "n1", x: 4, y: 0 },
    { id: "n2", x: 4, y: 3 },
    { id: "n3", x: 0, y: 3 },
    { id: "n5", x: 8, y: 0 },
    { id: "n6", x: 8, y: 3 },
  ],
  walls: [
    // Room A perimeter — all default height.
    { id: "wa0", a: "n0", b: "n1", thickness: t },
    { id: "wa1", a: "n2", b: "n3", thickness: t },
    { id: "wa2", a: "n3", b: "n0", thickness: t },
    // The shared wall, deliberately taller than either room's ceiling.
    { id: "wshared", a: "n1", b: "n2", thickness: t, height: TALL },
    // Room B perimeter — all default height.
    { id: "wb0", a: "n1", b: "n5", thickness: t },
    { id: "wb1", a: "n5", b: "n6", thickness: t },
    { id: "wb2", a: "n6", b: "n2", thickness: t },
  ],
  openings: [
    // A window in each room, so the riser is checked in a lit interior rather
    // than a sealed black box.
    { id: "oa", type: "window", wallId: "wa2", offset: 1.5, width: 1.2, height: 1.2, sill: 0.9 },
    { id: "ob", type: "window", wallId: "wb1", offset: 1.5, width: 1.2, height: 1.2, sill: 0.9 },
  ],
  rooms: [
    { id: "ra", name: "A", loop: ["n0", "n1", "n2", "n3"] },
    { id: "rb", name: "B", loop: ["n1", "n5", "n6", "n2"] },
  ],
  furniture: [],
};

export const RISER_CEILING_HEIGHT = WALL_HEIGHT;
export const RISER_TOP = TALL;
