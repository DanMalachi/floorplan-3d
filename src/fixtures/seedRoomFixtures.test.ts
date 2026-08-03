// Headless: default ceiling-fixture seeding. Run: npx tsx src/fixtures/seedRoomFixtures.test.ts

import type { Node, Room, Scene, Wall } from "@/schema/scene";
import { seedRoomFixtures } from "./seedRoomFixtures";
import { DEFAULT_FIXTURE_ASSET_ID } from "./catalog";

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

// Same mix of room kinds as roomLighting.test.ts: two normal rooms, a
// rail-bounded balcony, a sub-minimum sliver, and an authored-open room.
const nodes: Node[] = [
  n("a0", 0, 0), n("a1", 4, 0), n("a2", 4, 4), n("a3", 0, 4),
  n("b0", 8, 0), n("b1", 12, 0), n("b2", 12, 4), n("b3", 8, 4),
  n("c0", 0, -4), n("c1", 4, -4),
  n("d0", 20, 20), n("d1", 20.6, 20), n("d2", 20.6, 20.6), n("d3", 20, 20.6),
  n("e0", 30, 0), n("e1", 34, 0), n("e2", 34, 4), n("e3", 30, 4),
];
const walls: Wall[] = [
  wall("wa0", "a0", "a1"), wall("wa1", "a1", "a2"), wall("wa2", "a2", "a3"), wall("wa3", "a3", "a0"),
  wall("wb0", "b0", "b1"), wall("wb1", "b1", "b2"), wall("wb2", "b2", "b3"), wall("wb3", "b3", "b0"),
  wall("wc0", "a0", "c0"), wall("wc1", "c0", "c1"), wall("wc2", "c1", "a1", { kind: "rail" }),
  wall("wd0", "d0", "d1"), wall("wd1", "d1", "d2"), wall("wd2", "d2", "d3"), wall("wd3", "d3", "d0"),
  wall("we0", "e0", "e1"), wall("we1", "e1", "e2"), wall("we2", "e2", "e3"), wall("we3", "e3", "e0"),
];
const rooms: Room[] = [
  { id: "A", loop: ["a0", "a1", "a2", "a3"] },
  { id: "B", loop: ["b0", "b1", "b2", "b3"] },
  { id: "balcony", loop: ["a0", "c0", "c1", "a1"] },
  { id: "sliver", loop: ["d0", "d1", "d2", "d3"] },
  { id: "authoredOpen", loop: ["e0", "e1", "e2", "e3"], ceiling: "open" },
];
const freshScene = (): Scene => ({
  schemaVersion: 2, units: "meters", nodes, walls, openings: [], rooms, furniture: [],
});

console.log("\nseedRoomFixtures");
{
  const scene = freshScene();
  check("fresh scene has no fixtures key yet", scene.fixtures === undefined);

  const seeded = seedRoomFixtures(scene);
  const byRoom = new Map(
    (seeded.fixtures ?? [])
      .filter((f) => f.mount.kind === "ceiling")
      .map((f) => [f.id, f]),
  );

  check("only the two eligible rooms get seeded (2 fixtures total)", (seeded.fixtures ?? []).length === 2,
    `got ${(seeded.fixtures ?? []).length}`);
  check("room A got a default fixture", byRoom.has("fx-seed-A"));
  check("room B got a default fixture", byRoom.has("fx-seed-B"));
  check("the rail-bounded/sliver/authored-open rooms got nothing",
    !byRoom.has("fx-seed-balcony") && !byRoom.has("fx-seed-sliver") && !byRoom.has("fx-seed-authoredOpen"));
  check("every seeded fixture uses the default asset",
    [...byRoom.values()].every((f) => f.assetId === DEFAULT_FIXTURE_ASSET_ID));

  const second = seedRoomFixtures(seeded);
  check("calling it again on an already-seeded scene is a no-op (same array reference)",
    second === seeded);
  check("idempotent: fixture count is unchanged", (second.fixtures ?? []).length === (seeded.fixtures ?? []).length);

  const cleared: Scene = { ...seeded, fixtures: [] };
  const reseeded = seedRoomFixtures(cleared);
  check("a scene a user has explicitly cleared to [] is NEVER reseeded",
    (reseeded.fixtures ?? []).length === 0, `got ${(reseeded.fixtures ?? []).length}`);
  check("clearing returns the same (unmodified) scene, not a new object", reseeded === cleared);
}

console.log(failures === 0 ? "\nall seedRoomFixtures checks passed\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
