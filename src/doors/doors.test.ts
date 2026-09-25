// Headless: the door look model and door geometry.
// Run: npx tsx src/doors/doors.test.ts

import * as THREE from "three";
import type { Opening, Scene } from "@/schema/scene";
import {
  applyLookToKind,
  DEFAULT_LOOKS,
  doorKinds,
  doorRenderKey,
  houseLooks,
  outsideSide,
  resolveDoorLook,
  GLAZED_DESIGNS,
  type DoorDesign,
  type DoorLook,
} from "./look";
import { buildLeaf, buildTrim, HANDLE_HEIGHT } from "./geometry";
import { LOOK_PRESETS } from "./presets";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

// Two rooms sharing wMid; wLeft is exterior (front room only).
const base = (): Scene => ({
  schemaVersion: 2,
  units: "meters",
  nodes: [
    { id: "a", x: 0, y: 0 }, { id: "b", x: 6, y: 0 }, { id: "c", x: 6, y: 4 },
    { id: "d", x: 0, y: 4 }, { id: "e", x: 0, y: -4 }, { id: "f", x: 6, y: -4 },
  ],
  walls: [
    { id: "wMid", a: "a", b: "b", thickness: 0.12 },
    { id: "wRight", a: "b", b: "c", thickness: 0.12 },
    { id: "wFront", a: "c", b: "d", thickness: 0.12 },
    { id: "wLeft", a: "d", b: "a", thickness: 0.12 },
    { id: "wBL", a: "a", b: "e", thickness: 0.12 },
    { id: "wBB", a: "e", b: "f", thickness: 0.12 },
    { id: "wBR", a: "f", b: "b", thickness: 0.12 },
  ],
  openings: [
    { id: "i1", type: "door", wallId: "wMid", offset: 1, width: 0.9, height: 2.1, sill: 0 },
    { id: "i2", type: "door", wallId: "wMid", offset: 3, width: 0.9, height: 2.1, sill: 0 },
    { id: "i3", type: "door", wallId: "wMid", offset: 5, width: 0.9, height: 2.1, sill: 0 },
    { id: "e1", type: "door", wallId: "wLeft", offset: 2, width: 1, height: 2.2, sill: 0 },
    { id: "w1", type: "window", wallId: "wFront", offset: 3, width: 1.2, height: 1.2, sill: 0.9 },
    { id: "p1", type: "door", wallId: "wRight", offset: 2, width: 2.4, height: 2.2, sill: 0 }, // derived patio
  ],
  rooms: [
    { id: "front", loop: ["a", "b", "c", "d"] },
    { id: "back", loop: ["e", "f", "b", "a"] },
  ],
  furniture: [],
});

console.log("kinds");
{
  const s = base();
  const k = doorKinds(s);
  check("shared-wall door is interior", k.get("i1") === "interior");
  check("exterior-wall door is entry", k.get("e1") === "entry");
  check("window is not a door look", !k.has("w1"));
  check("patio slider keeps the window finish", !k.has("p1"));
  check("no rooms = everything interior", doorKinds({ ...base(), rooms: [] }).get("e1") === "interior");
  // wLeft runs d(0,4) -> a(0,0): u = (0,-1), left normal (1, 0) points INTO
  // the front room, so outside is the right side (-1).
  check("entry outside side", outsideSide(s, s.openings.find((o) => o.id === "e1")!) === -1);
}

console.log("house look");
{
  const s = base();
  check("no styled door = defaults", JSON.stringify(houseLooks(s).interior) === JSON.stringify(DEFAULT_LOOKS.interior));
  const walnut = LOOK_PRESETS["grooved-walnut"];
  const s2 = applyLookToKind(s, "interior", walnut);
  check("apply-to-kind styles every interior door", ["i1", "i2", "i3"].every((id) => s2.openings.find((o) => o.id === id)?.door === walnut));
  check("apply-to-kind leaves entry alone", !s2.openings.find((o) => o.id === "e1")?.door);
  // A new, unstyled interior door follows the house.
  const s3: Scene = { ...s2, openings: [...s2.openings, { id: "i4", type: "door", wallId: "wMid", offset: 4, width: 0.8, height: 2.1, sill: 0 }] };
  check("new door takes the house look", JSON.stringify(resolveDoorLook(s3, s3.openings.at(-1)!).look) === JSON.stringify(walnut));
  check("new door is not an override", resolveDoorLook(s3, s3.openings.at(-1)!).own === false);
  // One override does not change the house.
  const white = LOOK_PRESETS["shaker-white"];
  const s4: Scene = { ...s3, openings: s3.openings.map((o) => (o.id === "i1" ? { ...o, door: white } : o)) };
  check("override stays per door", JSON.stringify(houseLooks(s4).interior) === JSON.stringify(walnut));
  check("override resolves as own", resolveDoorLook(s4, s4.openings[0]).own);
}

console.log("legacy doorMaterial");
{
  const s = base();
  const o: Opening = { ...s.openings[0], doorMaterial: "walnut" };
  const r = resolveDoorLook({ ...s, openings: [o, ...s.openings.slice(1)] }, o);
  check("walnut maps to walnut veneer", r.look.surface.kind === "wood" && r.look.surface.species === "american-walnut");
  const w: Opening = { ...s.openings[0], doorMaterial: "painted-white" };
  check("painted-white = house look", !resolveDoorLook({ ...s, openings: [w] }, w).own);
}

console.log("render key");
{
  const s = base();
  const k1 = doorRenderKey(s, "e1");
  check("render key is stable per scene", k1 === doorRenderKey(s, "e1"));
  check("render key parses", JSON.parse(k1).kind === "entry");
  check("window has no render key", doorRenderKey(s, "w1") === "");
}

console.log("geometry");
const tris = (g?: THREE.BufferGeometry) => (g ? g.getAttribute("position").count / 3 : 0);
const bbox = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox();
  return g.boundingBox!;
};
const designs: DoorDesign[] = [
  "flush", "flush-grooves", "shaker", "shaker-3", "panel-5", "raised-4",
  "glass-full", "glass-lites", "glass-slot", "entry-slab", "entry-grooves", "entry-slot",
  "panel-2", "flush-inlay", "planked", "glass-grid", "french", "entry-grille", "entry-lines",
];
for (const design of designs) {
  const look: DoorLook = { ...DEFAULT_LOOKS.interior, design, handle: "lever-round" };
  for (const [W, H] of [[0.6, 1.9], [0.9, 2.1], [1.2, 2.6]] as const) {
    const T = design.startsWith("entry") ? 0.068 : 0.04;
    // Applied relief and inlays stand a few mm proud of the face by design.
    const proud = design === "entry-lines" ? 0.0031 : 0;
    const p = buildLeaf(look, { W, H, T, handleY: HANDLE_HEIGHT - H / 2 });
    const b = p.body ? bbox(p.body) : null;
    const within =
      !!b && b.min.x >= -W / 2 - 1e-4 && b.max.x <= W / 2 + 1e-4 && b.min.y >= -H / 2 - 1e-4 && b.max.y <= H / 2 + 1e-4 &&
      b.max.z <= T / 2 + proud + 1e-4 && b.min.z >= -T / 2 - proud - 1e-4;
    check(`${design} ${W}x${H} body fills the leaf, no spill`, within &&
      Math.abs(b!.max.x - b!.min.x - W) < 0.005 && Math.abs(b!.max.y - b!.min.y - H) < 0.005,
      b ? `${b.min.toArray().map((v) => v.toFixed(3))} ${b.max.toArray().map((v) => v.toFixed(3))}` : "no body");
    const glazed = GLAZED_DESIGNS.has(design);
    check(`${design} ${W}x${H} glass iff glazed`, glazed === tris(p.glass) > 0);
    const total = tris(p.body) + tris(p.recess) + tris(p.glass) + tris(p.hardware) + tris(p.seal);
    check(`${design} ${W}x${H} budget`, total < 60_000, `${total} tris`);
  }
}
{
  // Hinges on the requested face, handle near the latch edge.
  const look: DoorLook = { ...DEFAULT_LOOKS.interior, design: "flush", handle: "knob" };
  const plus = buildLeaf(look, { W: 0.9, H: 2.1, T: 0.04, handleY: 0, hingeFace: 1 });
  const minus = buildLeaf(look, { W: 0.9, H: 2.1, T: 0.04, handleY: 0, hingeFace: -1 });
  // Hinge knuckles sit at x = -W/2; compare the hardware near the hinge edge.
  const zNearHinge = (g: THREE.BufferGeometry) => {
    const pos = g.getAttribute("position");
    let z = 0, n = 0;
    for (let i = 0; i < pos.count; i++) if (pos.getX(i) < -0.4) { z += pos.getZ(i); n++; }
    return z / n;
  };
  check("hinges on +Z face", zNearHinge(plus.hardware!) > 0.01);
  check("hinges on -Z face", zNearHinge(minus.hardware!) < -0.01);
  const sliding = buildLeaf(look, { W: 0.9, H: 2.1, T: 0.04, handleY: 0, sliding: true });
  const b = bbox(sliding.hardware!);
  check("sliding leaf: no hinges, flush pull only", b.min.x > 0.3, `${b.min.x}`);
}
{
  // Trim: casing both faces, stop behind the flush leaf.
  const g = buildTrim({ start: 1, end: 2, top: 2.1, faceZ: 0.064, lining: 0.06, swingZ: 1, leafT: 0.04, leafFaceZ: 0.061, trim: "flat" })!;
  const b = bbox(g);
  check("casing proud of both faces", b.max.z > 0.07 && b.min.z < -0.07);
  // Casing covers the rough opening edge (the jamb and its shim gap) and laps
  // onto the wall.
  check("casing covers the rough opening edge", b.min.x < 1 - 0.01 && b.max.x > 2 + 0.01, `${b.min.x} ${b.max.x}`);
  const noCasing = bbox(buildTrim({ start: 1, end: 2, top: 2.1, faceZ: 0.064, lining: 0.06, swingZ: 1, leafT: 0.04, leafFaceZ: 0.061, trim: "minimal" })!);
  check("minimal trim: stop only, inside the wall", noCasing.max.z < 0.064 && noCasing.min.z > -0.064);
  check("stop behind the leaf (non-swing side)", noCasing.max.z <= 0.061 - 0.04);
}

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nall door checks passed");
