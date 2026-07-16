// Headless: an OPEN boundary closes a room without building a wall.
// Run: npx tsx src/lib/rooms/portals.test.ts

import type { Scene, Wall } from "@/schema/scene";
import { isSolidWall } from "@/schema/scene";
import { buildRoomGraph, walkableConnections } from "./semanticGraph";
import { buildWallSegments, buildBaseboards } from "@/viewport3d/geometry/buildWallSegments";
import { solveJunctions } from "@/viewport3d/geometry/wallJunctions";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const T = 0.1;
const w = (id: string, a: string, b: string, extra: Partial<Wall> = {}): Wall => ({
  id, a, b, thickness: T, ...extra,
});

/**
 * Two rooms side by side sharing their middle edge — the shape this whole
 * feature exists for:
 *
 *   n0 --------- n1 --------- n2      living | corridor, sharing n1-n4
 *   |    living   |  corridor  |
 *   n5 --------- n4 --------- n3
 *
 * `middle` is what the shared edge is made of.
 */
function twoRooms(middle: Wall["kind"]): Scene {
  return {
    schemaVersion: 2,
    units: "meters",
    nodes: [
      { id: "n0", x: 0, y: 0 }, { id: "n1", x: 5, y: 0 }, { id: "n2", x: 8, y: 0 },
      { id: "n3", x: 8, y: 4 }, { id: "n4", x: 5, y: 4 }, { id: "n5", x: 0, y: 4 },
    ],
    walls: [
      w("top1", "n0", "n1"), w("top2", "n1", "n2"),
      w("right", "n2", "n3"),
      w("bot2", "n3", "n4"), w("bot1", "n4", "n5"),
      w("left", "n5", "n0"),
      w("mid", "n1", "n4", middle === undefined ? {} : { kind: middle }),
    ],
    openings: [],
    rooms: [
      { id: "living", name: "Living", loop: ["n0", "n1", "n4", "n5"] },
      { id: "corridor", name: "Corridor", loop: ["n1", "n2", "n3", "n4"] },
    ],
    furniture: [],
  };
}

const nodeMapOf = (s: Scene) => new Map(s.nodes.map((n) => [n.id, n]));

// ---------------------------------------------------------------------------
console.log("\na portal is not a solid wall");
{
  check("wall is solid", isSolidWall(w("x", "a", "b")));
  check("rail is not", !isSolidWall(w("x", "a", "b", { kind: "rail" })));
  check("portal is not", !isSolidWall(w("x", "a", "b", { kind: "portal" })));
}

// ---------------------------------------------------------------------------
console.log("\na portal builds NOTHING, but still closes the room");
{
  const scene = twoRooms("portal");
  const nodes = nodeMapOf(scene);
  const mid = scene.walls.find((x) => x.id === "mid")!;

  check("no wall body", buildWallSegments(mid, [], nodes).length === 0);
  check("no baseboard", buildBaseboards(mid, [], nodes).length === 0);
  // The whole point: closure is topology, so the rooms survive regardless.
  const graph = buildRoomGraph(scene);
  check("both rooms still exist", graph.size === 2);
  const living = graph.get("living")!;
  check("living keeps its real area", Math.abs(living.features.areaM2 - 20) < 1e-6,
    `${living.features.areaM2} m2`);
}

// ---------------------------------------------------------------------------
console.log("\nrooms across a portal are SEPARATE but connected");
{
  const graph = buildRoomGraph(twoRooms("portal"));
  const living = graph.get("living")!;
  const corridor = graph.get("corridor")!;

  check("living opens into the corridor", living.relationships.opensInto.includes("corridor"));
  check("corridor opens into the living room", corridor.relationships.opensInto.includes("living"));
  check("they are adjacent", living.relationships.sharesWallWith.includes("corridor"));
  check("counted as an open boundary", living.features.portalWallCount === 1);
  check("no door was invented", living.features.doorCount === 0);
  check("no window was invented", living.features.windowCount === 0);
  // The regression this guards: circulation must count an open boundary as a
  // way through, or an open-plan corridor stops reading as circulation.
  check("the portal is walkable", walkableConnections(living) === 1);
}

// ---------------------------------------------------------------------------
console.log("\na solid wall is NOT an open boundary");
{
  const graph = buildRoomGraph(twoRooms(undefined));
  const living = graph.get("living")!;
  check("nothing opens into anything", living.relationships.opensInto.length === 0);
  check("no open boundary counted", living.features.portalWallCount === 0);
  check("not walkable without a door", walkableConnections(living) === 0);
  check("still adjacent", living.relationships.sharesWallWith.includes("corridor"));
}

// ---------------------------------------------------------------------------
console.log("\na portal is never an exterior wall");
{
  // A portal on the outside edge borders one room — it still isn't a wall.
  const scene = twoRooms("portal");
  scene.walls = scene.walls.map((x) => (x.id === "left" ? { ...x, kind: "portal" as const } : x));
  const living = buildRoomGraph(scene).get("living")!;
  check("open outer edge is not counted as exterior wall",
    living.features.exteriorWallCount === 2, // top1 + bot1 only
    `got ${living.features.exteriorWallCount}`);
  check("both open edges counted as portals", living.features.portalWallCount === 2);
}

// ---------------------------------------------------------------------------
console.log("\nwalls meeting a portal cap square (no mitre into thin air)");
{
  const scene = twoRooms("portal");
  const ends = solveJunctions(scene.walls, nodeMapOf(scene));
  check("the portal itself gets no joinery", ends.get("mid") === undefined);
  // n1 has top1, top2 (collinear) and the portal. The portal must drop out
  // BEFORE the degree test, leaving a plain 2-wall collinear run.
  const top1 = ends.get("top1")!;
  check("the through-run ignores the portal",
    top1.x1L === 0 && top1.x1R === 0,
    `x1L=${top1.x1L} x1R=${top1.x1R}`);
}

// ---------------------------------------------------------------------------
console.log("\nan open alcove is not a closet");
{
  // A tiny room with a door to the bedroom AND an open boundary elsewhere is a
  // passage, not a dead-end closet.
  const scene: Scene = {
    schemaVersion: 2,
    units: "meters",
    nodes: [
      { id: "a0", x: 0, y: 0 }, { id: "a1", x: 4, y: 0 }, { id: "a2", x: 4, y: 4 },
      { id: "a3", x: 0, y: 4 }, { id: "a4", x: 5.2, y: 0 }, { id: "a5", x: 5.2, y: 4 },
      { id: "a6", x: 8, y: 0 }, { id: "a7", x: 8, y: 4 },
    ],
    walls: [
      w("bedTop", "a0", "a1"), w("bedBot", "a3", "a2"), w("bedLeft", "a3", "a0"),
      w("bedRight", "a1", "a2"), // door into the alcove
      w("alcTop", "a1", "a4"), w("alcBot", "a2", "a5"),
      w("alcOpen", "a4", "a5", { kind: "portal" }), // opens onward -> a passage
      w("hallTop", "a4", "a6"), w("hallBot", "a5", "a7"), w("hallEnd", "a6", "a7"),
    ],
    openings: [
      { id: "d0", type: "door", wallId: "bedRight", offset: 2, width: 0.8, height: 2, sill: 0 },
    ],
    rooms: [
      { id: "bed", name: "Bed", loop: ["a0", "a1", "a2", "a3"] },
      { id: "alcove", name: "Alcove", loop: ["a1", "a4", "a5", "a2"] }, // 4.8 m2 -> under 3? no
      { id: "hall", name: "Hall", loop: ["a4", "a6", "a7", "a5"] },
    ],
    furniture: [],
  };
  // Shrink the alcove under the 3 m2 closet threshold.
  scene.nodes = scene.nodes.map((n) =>
    n.id === "a4" ? { ...n, x: 4.6 } : n.id === "a5" ? { ...n, x: 4.6 } : n,
  );
  const graph = buildRoomGraph(scene);
  const alcove = graph.get("alcove")!;
  check("alcove is small enough to tempt the closet rule", alcove.features.areaM2 < 3,
    `${alcove.features.areaM2.toFixed(2)} m2`);
  check("alcove opens onward", alcove.relationships.opensInto.includes("hall"));
  check("bedroom does NOT claim it as a closet", graph.get("bed")!.features.hasCloset === false);
}

console.log(failures === 0 ? "\nall portal checks passed\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
