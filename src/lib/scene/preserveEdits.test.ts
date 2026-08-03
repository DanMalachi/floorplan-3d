// Headless: prove a regenerate keeps 3D-authored decisions and still lets the
// trace win on everything the trace owns.
// Run: npx tsx src/lib/scene/preserveEdits.test.ts

import type { Scene } from "@/schema/scene";
import { preserveSceneEdits } from "./preserveEdits";

let fails = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) fails++;
};

const scene = (p: Partial<Scene> = {}): Scene => ({
  schemaVersion: 2,
  units: "meters",
  nodes: [
    { id: "pt0", x: 0, y: 0 },
    { id: "pt1", x: 4, y: 0 },
    { id: "pt2", x: 4, y: 3 },
  ],
  walls: [{ id: "sg0", a: "pt0", b: "pt1", thickness: 0.1 }],
  openings: [
    { id: "op0", type: "door", wallId: "sg0", offset: 1, width: 0.9, height: 2, sill: 0 },
  ],
  rooms: [{ id: "room0", loop: ["pt0", "pt1", "pt2"] }],
  furniture: [],
  ...p,
});

// What the 3D side authored, on top of a generated scene.
const edited = scene({
  walls: [{ id: "sg0", a: "pt0", b: "pt1", thickness: 0.1, paintA: "#ff0000" }],
  openings: [
    {
      id: "op0", type: "door", wallId: "sg0", offset: 1, width: 0.9, height: 2, sill: 0,
      slide: { style: "bypass", panels: 2, glazed: true }, swingDeg: 0,
    },
  ],
  rooms: [{ id: "room0", loop: ["pt0", "pt1", "pt2"], floor: "tile-hex-white" }],
  furniture: [{ id: "f1", assetId: "sofa", x: 2, y: 1, rotation: 0 }],
  stairs: [
    { id: "st0", flights: [{ x0: 0, y0: 0, x1: 3, y1: 0 }], width: 0.9, rise: 2.4, style: "open" },
  ],
  // (3,1) sits inside room0's triangle (0,0)-(4,0)-(4,3).
  fixtures: [{ id: "fx0", assetId: "fx:flushDisc", rotation: 0, mount: { kind: "ceiling", x: 3, y: 1 } }],
});

// 1. A regenerate that changed only trace-owned values.
{
  const regenerated = scene({
    // the trace was corrected: thicker wall, wider door, and the stair got a
    // step override — all of which must WIN over the previous scene.
    walls: [{ id: "sg0", a: "pt0", b: "pt1", thickness: 0.2 }],
    openings: [
      { id: "op0", type: "door", wallId: "sg0", offset: 1, width: 1.1, height: 2, sill: 0 },
    ],
    stairs: [
      { id: "st0", flights: [{ x0: 0, y0: 0, x1: 3, y1: 0 }], width: 1.1, rise: 2.4, steps: 12 },
    ],
  });
  const out = preserveSceneEdits(edited, regenerated);

  ok(out.walls[0].thickness === 0.2, "trace wins: wall thickness is the regenerated one");
  ok(out.walls[0].paintA === "#ff0000", "3D wins: wall paint survives");
  ok(out.openings[0].width === 1.1, "trace wins: door width is the regenerated one");
  ok(out.openings[0].slide?.panels === 2, "3D wins: door joinery survives");
  ok(out.rooms[0].floor === "tile-hex-white", "3D wins: floor material survives");
  ok(out.furniture.length === 1, "3D wins: furniture is not wiped");
  ok(out.stairs?.[0].style === "open", "3D wins: stair style survives");
  ok(out.stairs?.[0].steps === 12 && out.stairs?.[0].width === 1.1, "trace wins: stair steps/width");
  ok((out.fixtures ?? []).length === 1, "3D wins: fixture survives an in-place trace correction");
}

// 2. Rooms renumber when the wall graph changes; the floor follows the LOOP.
{
  const regenerated = scene({
    rooms: [
      { id: "room0", loop: ["pt0", "pt1", "pt9"] }, // a different floor, same id
      { id: "room1", loop: ["pt2", "pt1", "pt0"] }, // the original one, renumbered
    ],
  });
  const out = preserveSceneEdits(edited, regenerated);
  ok(out.rooms[0].floor === undefined, "a genuinely new room keeps the default floor");
  ok(out.rooms[1].floor === "tile-hex-white", "the same floor keeps its material after renumbering");
  ok((out.fixtures ?? []).length === 1, "the fixture survives room renumbering (same triangle, new room id)");
}

// 2b. A from-scratch retrace with geometry unrelated to anything before it
// (a brand new plan, or a totally different house traced over an old one):
// the old fixture can't possibly land inside any new room, and the bug this
// guards is that `fixtures` used to still come back as `[]` (defined), which
// silently blocked `seedRoomFixtures` from ever giving the new rooms lights.
{
  const unrelated = scene({
    nodes: [
      { id: "z0", x: 100, y: 100 },
      { id: "z1", x: 106, y: 100 },
      { id: "z2", x: 106, y: 106 },
      { id: "z3", x: 100, y: 106 },
    ],
    walls: [
      { id: "zw0", a: "z0", b: "z1", thickness: 0.1 },
      { id: "zw1", a: "z1", b: "z2", thickness: 0.1 },
      { id: "zw2", a: "z2", b: "z3", thickness: 0.1 },
      { id: "zw3", a: "z3", b: "z0", thickness: 0.1 },
    ],
    openings: [],
    rooms: [{ id: "roomZ", loop: ["z0", "z1", "z2", "z3"] }],
  });
  const out = preserveSceneEdits(edited, unrelated);
  ok(out.fixtures === undefined,
    "an unrelated retrace leaves fixtures undefined (not []), so the new rooms get seeded, not left dark");
}

// 3. Things that no longer exist, or changed identity, don't come back.
{
  const regenerated = scene({
    walls: [{ id: "sg7", a: "pt0", b: "pt1", thickness: 0.1 }], // wall redrawn = new id
    openings: [
      // same id, but the user made it a WINDOW: door joinery must not follow.
      { id: "op0", type: "window", wallId: "sg7", offset: 1, width: 0.9, height: 1.2, sill: 0.9 },
    ],
    stairs: [],
  });
  const out = preserveSceneEdits(edited, regenerated);
  ok(out.walls[0].paintA === undefined, "paint does not jump to a wall with a new id");
  ok(out.openings[0].slide === undefined, "door joinery is dropped when the type changed");
  ok((out.stairs ?? []).length === 0, "a deleted stair stays deleted");
}

// 4. First generate: nothing to preserve, nothing to crash on.
{
  const out = preserveSceneEdits(null, scene());
  ok(out.furniture.length === 0 && out.walls.length === 1, "a first generate passes through");
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
