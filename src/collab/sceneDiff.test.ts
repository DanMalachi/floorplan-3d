// Headless: prove the diff-bridge round-trips and MERGES concurrent edits.
// Run: npx tsx src/collab/sceneDiff.test.ts

import * as Y from "yjs";
import type { Scene } from "@/schema/scene";
import { readScene, seedSceneDoc } from "./sceneDoc";
import { applySceneDiff } from "./sceneDiff";

const PRES = { envPreset: "none" as const, timeOfDay: 13, weather: "clear" as const, wallMode: "full" as const, showCeilings: true };

const base = (): Scene => ({
  schemaVersion: 2,
  units: "meters",
  nodes: [
    { id: "n0", x: 0, y: 0 },
    { id: "n1", x: 4, y: 0 },
    { id: "n2", x: 4, y: 3 },
  ],
  walls: [
    { id: "w1", a: "n0", b: "n1", thickness: 0.1 },
    { id: "w2", a: "n1", b: "n2", thickness: 0.1 },
  ],
  openings: [],
  rooms: [{ id: "r0", name: "Room", loop: ["n0", "n1", "n2"] }],
  furniture: [],
});

let fails = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) fails++;
};

// 1. seed round-trips
{
  const doc = new Y.Doc();
  seedSceneDoc(doc, base(), PRES);
  const s = readScene(doc);
  ok(s.nodes.length === 3 && s.walls.length === 2 && s.rooms.length === 1, "seed round-trips");
}

// 2. granular field update + add + remove
{
  const doc = new Y.Doc();
  seedSceneDoc(doc, base(), PRES);
  const prev = readScene(doc);
  const next: Scene = {
    ...prev,
    nodes: prev.nodes.map((n) => (n.id === "n0" ? { ...n, x: 1.5 } : n)),
    walls: [...prev.walls.filter((w) => w.id !== "w2"), { id: "w3", a: "n1", b: "n2", thickness: 0.2 }],
  };
  applySceneDiff(doc, prev, next, {});
  const r = readScene(doc);
  ok(r.nodes.find((n) => n.id === "n0")!.x === 1.5, "node move applied");
  ok(!r.walls.some((w) => w.id === "w2"), "wall removed");
  ok(r.walls.some((w) => w.id === "w3"), "wall added");
}

// 3. MERGE: two clients edit DIFFERENT items from the same base -> both survive
{
  const doc1 = new Y.Doc();
  seedSceneDoc(doc1, base(), PRES);
  const doc2 = new Y.Doc();
  Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1)); // doc2 starts equal to doc1

  const s1prev = readScene(doc1);
  applySceneDiff(doc1, s1prev, { ...s1prev, walls: s1prev.walls.map((w) => (w.id === "w1" ? { ...w, thickness: 0.3 } : w)) }, { c: 1 });

  const s2prev = readScene(doc2); // stale base — does NOT include doc1's change
  applySceneDiff(doc2, s2prev, { ...s2prev, walls: s2prev.walls.map((w) => (w.id === "w2" ? { ...w, paintA: "#ff0000" } : w)) }, { c: 2 });

  // exchange
  Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));
  Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));

  for (const [tag, doc] of [["doc1", doc1], ["doc2", doc2]] as const) {
    const r = readScene(doc);
    const w1 = r.walls.find((w) => w.id === "w1")!;
    const w2 = r.walls.find((w) => w.id === "w2")!;
    ok(w1.thickness === 0.3 && w2.paintA === "#ff0000", `${tag}: concurrent edits merged (no clobber)`);
  }
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
