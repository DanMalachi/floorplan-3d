// Run: npm run test:security
//
// A hostile or corrupt live-room document must be refused BEFORE it reaches the
// owner's editor, local project, or cloud copy (SECURITY_AUDIT.md F-06).

import assert from "node:assert/strict";
import type { Scene } from "@/schema/scene";
import { inspectScene, SCENE_LIMITS } from "./sceneGuard";

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failures += 1;
    console.error(`  FAIL ${name}\n       ${(e as Error).message}`);
  }
}

const base = (): Scene =>
  ({
    schemaVersion: 2,
    units: "meters",
    nodes: [
      { id: "n1", x: 0, y: 0 },
      { id: "n2", x: 4.5, y: 0 },
    ],
    walls: [{ id: "w1", a: "n1", b: "n2", thickness: 0.2, height: 2.6 }],
    openings: [],
    rooms: [{ id: "r1", loop: ["n1", "n2"], name: "Kitchen" }],
    furniture: [{ id: "f1", x: 1, y: 1, rotation: 0 }],
  }) as unknown as Scene;

const withItems = (name: string, items: unknown[]): Scene => ({ ...base(), [name]: items }) as unknown as Scene;

console.log("inspectScene accepts");
check("a normal plan", () => assert.deepEqual(inspectScene(base()), { ok: true }));
check("a plan saved before stairs/fixtures existed (keys absent)", () => {
  const s = base() as unknown as Record<string, unknown>;
  delete s.stairs;
  delete s.fixtures;
  assert.equal(inspectScene(s as unknown as Scene).ok, true);
});
check("unknown extra fields from a newer client", () => {
  const s = withItems("furniture", [{ id: "f1", x: 1, y: 2, brandNewField: { a: [1, 2, 3] } }]);
  assert.equal(inspectScene(s).ok, true);
});

console.log("inspectScene refuses");
check("NaN and Infinity coordinates", () => {
  assert.equal(inspectScene(withItems("nodes", [{ id: "n", x: NaN, y: 0 }])).ok, false);
  assert.equal(inspectScene(withItems("nodes", [{ id: "n", x: Infinity, y: 0 }])).ok, false);
});
check("an absurd coordinate", () => {
  assert.equal(inspectScene(withItems("nodes", [{ id: "n", x: 1e12, y: 0 }])).ok, false);
});
check("a collection over its item ceiling", () => {
  const many = Array.from({ length: SCENE_LIMITS.perCollection.furniture + 1 }, (_, i) => ({ id: `f${i}`, x: 0, y: 0 }));
  assert.equal(inspectScene(withItems("furniture", many)).ok, false);
});
check("a megabyte string in a field", () => {
  assert.equal(inspectScene(withItems("rooms", [{ id: "r", name: "x".repeat(1_000_000) }])).ok, false);
});
check("an item with no id, or a non-string id", () => {
  assert.equal(inspectScene(withItems("walls", [{ a: "n1" }])).ok, false);
  assert.equal(inspectScene(withItems("walls", [{ id: 7 }])).ok, false);
});
check("an item that is not an object", () => {
  assert.equal(inspectScene(withItems("walls", ["nope"])).ok, false);
  assert.equal(inspectScene(withItems("walls", [null])).ok, false);
});
check("a collection that is not a list", () => {
  assert.equal(inspectScene({ ...base(), walls: { evil: 1 } } as unknown as Scene).ok, false);
});
check("a prototype-pollution key anywhere in an item", () => {
  const evil = JSON.parse(`{"id":"f","x":1,"meta":{"__proto__":{"polluted":true}}}`);
  assert.equal(inspectScene(withItems("furniture", [evil])).ok, false);
});
check("deeply nested values", () => {
  let deep: unknown = 1;
  for (let i = 0; i < 20; i++) deep = { a: deep };
  assert.equal(inspectScene(withItems("furniture", [{ id: "f", deep }])).ok, false);
});
check("a huge array inside an item", () => {
  assert.equal(inspectScene(withItems("rooms", [{ id: "r", loop: new Array(SCENE_LIMITS.maxArray + 1).fill("n") }])).ok, false);
});
check("a function smuggled into a field", () => {
  assert.equal(inspectScene(withItems("furniture", [{ id: "f", cb: () => 1 }])).ok, false);
});
check("a hostile building blob is checked too", () => {
  const s = { ...base(), building: { n: NaN } } as unknown as Scene;
  assert.equal(inspectScene(s).ok, false);
});

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nall passed");
