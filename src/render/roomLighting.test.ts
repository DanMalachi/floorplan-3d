// Headless: pole-of-inaccessibility placement + room-light derivation.
// Run: npx tsx src/render/roomLighting.test.ts

import type { Node, Room, Scene, Wall } from "@/schema/scene";
import { poleOfInaccessibility } from "@/lib/rooms/poleOfInaccessibility";
import { pointInPolygon } from "@/lib/rooms/roomArea";
import { computeRoomLights } from "./roomLighting";
import { ROOM_LIGHT } from "./contract";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const n = (id: string, x: number, y: number): Node => ({ id, x, y });
const wall = (id: string, a: string, b: string, extra: Partial<Wall> = {}): Wall => ({
  id, a, b, thickness: 0.1, ...extra,
});

// ---------------------------------------------------------------------------
console.log("\npole of inaccessibility");
{
  const square = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
  const p = poleOfInaccessibility(square);
  check("square room centers near (2,2)", Math.hypot(p.x - 2, p.y - 2) < 0.05, `got (${p.x},${p.y})`);

  // An L: a 6x6 square with a 3x3 bite out of the top-right corner. The
  // vertex-average centroid of this loop lands at (2.57, 2.57) — inside the
  // missing bite, i.e. OUTSIDE the room. The pole must not.
  const L = [
    { x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 3 },
    { x: 3, y: 3 }, { x: 3, y: 6 }, { x: 0, y: 6 },
  ];
  const naiveCentroidX = L.reduce((s, p) => s + p.x, 0) / L.length;
  const naiveCentroidY = L.reduce((s, p) => s + p.y, 0) / L.length;
  check("naive centroid of this L falls outside it (sanity check on the fixture)",
    !pointInPolygon(naiveCentroidX, naiveCentroidY, L));

  const pole = poleOfInaccessibility(L);
  check("pole of the L lands inside the room", pointInPolygon(pole.x, pole.y, L), `got (${pole.x},${pole.y})`);
}

// ---------------------------------------------------------------------------
console.log("\ncomputeRoomLights");
{
  // Two 4x4 rooms sharing an edge; a third, rail-bounded (balcony) room; a
  // fourth, tiny sliver under the area floor; a fifth, normal-sized but
  // explicitly authored ceiling:"open".
  const nodes: Node[] = [
    n("a0", 0, 0), n("a1", 4, 0), n("a2", 4, 4), n("a3", 0, 4), // room A
    n("b2", 8, 4), n("b1", 8, 0), // room B (shares a1-a2 edge conceptually via own loop)
    n("c0", 0, -4), n("c1", 4, -4), // rail-bounded balcony, shares a0-a1
    n("d0", 20, 20), n("d1", 20.6, 20), n("d2", 20.6, 20.6), n("d3", 20, 20.6), // sliver
    n("e0", 30, 0), n("e1", 34, 0), n("e2", 34, 4), n("e3", 30, 4), // authored-open
  ];
  const walls: Wall[] = [
    wall("wa0", "a0", "a1"), wall("wa1", "a1", "a2"), wall("wa2", "a2", "a3"), wall("wa3", "a3", "a0"),
    wall("wb0", "a1", "b1"), wall("wb1", "b1", "b2"), wall("wb2", "b2", "a2"), // reuses a1-a2 as shared
    wall("wc0", "a0", "c0"), wall("wc1", "c0", "c1"), wall("wc2", "c1", "a1", { kind: "rail" }),
    wall("wd0", "d0", "d1"), wall("wd1", "d1", "d2"), wall("wd2", "d2", "d3"), wall("wd3", "d3", "d0"),
    wall("we0", "e0", "e1"), wall("we1", "e1", "e2"), wall("we2", "e2", "e3"), wall("we3", "e3", "e0"),
  ];
  const rooms: Room[] = [
    { id: "A", loop: ["a0", "a1", "a2", "a3"] },
    { id: "B", loop: ["a1", "b1", "b2", "a2"] },
    { id: "balcony", loop: ["a0", "c0", "c1", "a1"] }, // bounded by a rail edge (c1-a1)
    { id: "sliver", loop: ["d0", "d1", "d2", "d3"] },
    { id: "authoredOpen", loop: ["e0", "e1", "e2", "e3"], ceiling: "open" },
  ];
  const scene: Scene = { schemaVersion: 2, units: "meters", nodes, walls, openings: [], rooms, furniture: [] };

  const lights = computeRoomLights(scene);
  const byRoom = new Map(lights.map((l) => [l.roomId, l]));

  check("room A gets a light", byRoom.has("A"));
  check("room B gets a light", byRoom.has("B"));
  check("rail-bounded balcony gets no light", !byRoom.has("balcony"));
  check(
    `sliver room (${(0.6 * 0.6).toFixed(2)} m2 < ${ROOM_LIGHT.minAreaM2} m2 min) gets no light`,
    !byRoom.has("sliver"),
  );
  check("authored ceiling:\"open\" room gets no light even though it's not rail-bounded", !byRoom.has("authoredOpen"));

  // B is a 4x4 room too (8-4=4 wide, 0-4 tall) — same area as A, so same intensity.
  const a = byRoom.get("A")!;
  const b = byRoom.get("B")!;
  check("equal-area rooms get equal intensity, not hand-tuned per room",
    Math.abs(a.intensity - b.intensity) < 1e-9, `A=${a.intensity} B=${b.intensity}`);
  check("light sits below the ceiling, not at floor level", a.position[1] > 1.5 && a.position[1] < 2.4,
    `y=${a.position[1]}`);

  // Double the floor area (8x4=32 vs 4x4=16) and check intensity scales
  // linearly with it, per the documented flux/area derivation.
  const bigRoom: Scene = {
    ...scene,
    rooms: [{ id: "big", loop: ["a0", "a1", "b1", "b2", "a2", "a3"] }],
  };
  // a0..a1..b1..b2..a2..a3 traces A+B combined (8x4 rectangle minus nothing,
  // since a1-a2 was the internal shared edge) — area 32 m2, double A's 16...
  // actually A is 4x4=16, combined rectangle is 8x4=32. Exactly 2x.
  const combined = computeRoomLights(bigRoom)[0];
  check("intensity scales linearly with area (2x area -> 2x intensity)",
    Math.abs(combined.intensity / a.intensity - 2) < 1e-6,
    `ratio=${combined.intensity / a.intensity}`);
}

console.log(failures === 0 ? "\nall room-lighting checks passed\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
