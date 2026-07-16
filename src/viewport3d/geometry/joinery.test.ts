// Headless: what actually hangs in an opening — passages and sliding doors.
// Run: npx tsx src/viewport3d/geometry/joinery.test.ts

import type { Opening, Scene, SlideSpec } from "@/schema/scene";
import {
  buildJoinery,
  type JoineryFrame,
  type JoineryPiece,
  type JoineryRole,
} from "./buildJoinery";
import { buildWallSegments } from "./buildWallSegments";
import { buildRoomGraph, walkableConnections } from "@/lib/rooms/semanticGraph";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

// A 4 m wall running along +x from the origin.
const F: JoineryFrame = { ax: 0, ay: 0, ux: 1, uy: 0, L: 4, th: 0.1, wallH: 2.4 };

const op = (o: Partial<Opening> = {}): Opening => ({
  id: "o", type: "door", wallId: "w", offset: 2, width: 1.6, height: 2.1, sill: 0, ...o,
});
const roles = (ps: JoineryPiece[]) => new Set(ps.map((p) => p.role));
const of = (ps: JoineryPiece[], r: JoineryRole) => ps.filter((p) => p.role === r);
// The test wall runs along +x, so a piece's world z IS its offset across the
// wall and its world x IS its distance along it.
const along = (p: JoineryPiece) => p.position[0];
const across = (p: JoineryPiece) => p.position[2];

// ---------------------------------------------------------------------------
console.log("\npassage — the opening stays, the door goes");
{
  const cased = buildJoinery(op({ type: "passage" }), F);
  check("no leaf", of(cased, "leaf").length === 0);
  check("no handle", of(cased, "handle").length === 0);
  check("no glass", of(cased, "glass").length === 0);
  check("but it IS cased by default", of(cased, "frame").length > 0);

  const bare = buildJoinery(op({ type: "passage", lining: false }), F);
  check("bare passage has nothing at all", bare.length === 0, `${bare.length} pieces`);

  // The point of the whole feature: the wall still has a real hole in it.
  const nodes = new Map([["a", { id: "a", x: 0, y: 0 }], ["b", { id: "b", x: 4, y: 0 }]]);
  const wall = { id: "w", a: "a", b: "b", thickness: 0.1 };
  const solid = buildWallSegments(wall, [], nodes);
  const holed = buildWallSegments(wall, [op({ type: "passage" })], nodes);
  check("a passage cuts the wall like any opening", holed.length > solid.length,
    `${solid.length} -> ${holed.length} pieces`);
  const spans = holed.filter((p) => p.size[1] > 2.0); // full-height pieces only
  check("the gap is the passage's width",
    Math.abs(spans.reduce((s, p) => s + p.size[0], 0) - (4 - 1.6)) < 1e-6);
}

// ---------------------------------------------------------------------------
console.log("\ndeleting vs removing a door");
{
  // Delete = wall goes solid again. Passage = hole stays. Both are wanted, and
  // they are NOT the same operation.
  const nodes = new Map([["a", { id: "a", x: 0, y: 0 }], ["b", { id: "b", x: 4, y: 0 }]]);
  const wall = { id: "w", a: "a", b: "b", thickness: 0.1 };
  check("deleted -> one solid run", buildWallSegments(wall, [], nodes).length === 1);
  // Pier, lintel over the head, pier: the 2.1 m passage doesn't reach the 2.4 m
  // ceiling, so the wall carries on above it.
  const holed = buildWallSegments(wall, [op({ type: "passage" })], nodes);
  check("passage -> wall is cut into piers + lintel", holed.length === 3,
    `${holed.length} pieces`);
  check("nothing spans the gap at head height",
    !holed.some((p) => p.position[1] < 2.1 && p.position[0] > 1.2 && p.position[0] < 2.8));
}

// ---------------------------------------------------------------------------
const patio: SlideSpec = { style: "bypass", panels: 2, glazed: true };
const closet: SlideSpec = { style: "bypass", panels: 2, glazed: false };
const barn: SlideSpec = { style: "surface", panels: 1, glazed: false };

console.log("\nsliding — a swing door is not a slider");
{
  const swing = buildJoinery(op({ swingDeg: 0 }), F);
  check("swing door has a leaf", of(swing, "leaf").length === 1);
  check("swing door has no track", of(swing, "track").length === 0);
  check("slider has a track", of(buildJoinery(op({ slide: patio }), F), "track").length === 1);
}

console.log("\npatio slider — 2 glazed sashes");
{
  const p = buildJoinery(op({ slide: patio }), F);
  check("two panes", of(p, "glass").length === 2);
  check("each pane is framed by stiles", of(p, "mullion").length === 4);
  check("no swing leaf", of(p, "leaf").length === 0);
  check("has a head track", roles(p).has("track"));
}

console.log("\ncloset bypass — solid panels, no glass");
{
  const c2 = buildJoinery(op({ slide: closet }), F);
  check("two solid panels", of(c2, "leaf").length === 2);
  check("no glass", of(c2, "glass").length === 0);
  const c3 = buildJoinery(op({ slide: { ...closet, panels: 3 } }), F);
  check("three panels when asked", of(c3, "leaf").length === 3);
}

console.log("\nbypass panels ride separate tracks (or they'd intersect)");
{
  const p = of(buildJoinery(op({ slide: closet }), F), "leaf");
  // Panels are 35mm thick; their track depths must be further apart than that.
  const gap = Math.abs(across(p[0]) - across(p[1]));
  check("tracks are deeper apart than a panel is thick", gap > 0.035,
    `gap ${gap.toFixed(3)} m vs 0.035 m panel`);
}

console.log("\nbypass: shut covers the hole, open clears half of it");
{
  const shut = of(buildJoinery(op({ slide: { ...closet, open: 0 } }), F), "leaf");
  check("shut panels sit apart, tiling the opening",
    Math.abs(along(shut[0]) - along(shut[1])) > 0.5,
    `${Math.abs(along(shut[0]) - along(shut[1])).toFixed(2)} m apart`);

  const open = of(buildJoinery(op({ slide: { ...closet, open: 1, side: "end" } }), F), "leaf");
  check("fully open, panels stack on each other",
    Math.abs(along(open[0]) - along(open[1])) < 1e-6,
    `${Math.abs(along(open[0]) - along(open[1])).toFixed(3)} m apart`);
  check("they stack at the END jamb", along(open[0]) > 2,
    `stacked at s=${along(open[0]).toFixed(2)}`);

  const toStart = of(buildJoinery(op({ slide: { ...closet, open: 1, side: "start" } }), F), "leaf");
  check("side=start stacks at the other jamb", along(toStart[0]) < 2,
    `stacked at s=${along(toStart[0]).toFixed(2)}`);
}

console.log("\nbarn — one leaf, proud of the wall, parks clear of the hole");
{
  const shut = buildJoinery(op({ slide: barn }), F);
  const leaf = of(shut, "leaf")[0];
  check("exactly one leaf", of(shut, "leaf").length === 1);
  check("it hangs off the wall face, not inside it",
    Math.abs(across(leaf)) > F.th / 2,
    `z=${across(leaf).toFixed(3)} vs wall half-thickness ${F.th / 2}`);
  check("it is wider than the hole it covers", leaf.size[0] > 1.6 - 2 * 0.06,
    `${leaf.size[0].toFixed(2)} m`);

  const open = of(buildJoinery(op({ slide: { ...barn, open: 1 } }), F), "leaf")[0];
  check("sliding open moves it along the wall", along(open) > along(leaf) + 1,
    `${along(leaf).toFixed(2)} -> ${along(open).toFixed(2)}`);
}

// ---------------------------------------------------------------------------
console.log("\nsemantics — a passage is neither a door nor a window");
{
  const scene: Scene = {
    schemaVersion: 2,
    units: "meters",
    nodes: [
      { id: "n0", x: 0, y: 0 }, { id: "n1", x: 5, y: 0 }, { id: "n2", x: 8, y: 0 },
      { id: "n3", x: 8, y: 4 }, { id: "n4", x: 5, y: 4 }, { id: "n5", x: 0, y: 4 },
    ],
    walls: [
      { id: "top1", a: "n0", b: "n1", thickness: 0.1 },
      { id: "top2", a: "n1", b: "n2", thickness: 0.1 },
      { id: "right", a: "n2", b: "n3", thickness: 0.1 },
      { id: "bot2", a: "n3", b: "n4", thickness: 0.1 },
      { id: "bot1", a: "n4", b: "n5", thickness: 0.1 },
      { id: "left", a: "n5", b: "n0", thickness: 0.1 },
      { id: "mid", a: "n1", b: "n4", thickness: 0.1 },
    ],
    openings: [
      { id: "p0", type: "passage", wallId: "mid", offset: 2, width: 1.6, height: 2.1, sill: 0 },
    ],
    rooms: [
      { id: "living", name: "Living", loop: ["n0", "n1", "n4", "n5"] },
      { id: "corridor", name: "Corridor", loop: ["n1", "n2", "n3", "n4"] },
    ],
    furniture: [],
  };
  const living = buildRoomGraph(scene).get("living")!;
  // The regression: the old else-branch counted every non-door as a window, so
  // a passage would have handed this room phantom daylight.
  check("not counted as a window", living.features.windowCount === 0);
  check("not counted as a door", living.features.doorCount === 0);
  check("it opens into the corridor", living.relationships.opensInto.includes("corridor"));
  check("you can walk through it", walkableConnections(living) === 1);
}

console.log(failures === 0 ? "\nall joinery checks passed\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
