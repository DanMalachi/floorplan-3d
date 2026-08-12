// Headless: appliances (Phase 2) — the twelve white goods and the three hoods.
// Run: npx tsx src/parametric/appliances.test.ts
//
// Same bargain as bathroom.test.ts: the look is judged by eye, but the things
// that silently break — NaN vertices, an appliance floating or sunk into the
// floor, a variant that throws, a card with no glyph or no button in the
// illustrated room — are measurable, so they are measured.
//
// The heaviest checks here are the MOUNTING ones. Wall vs floor vs counter is
// the distinction that decides whether a fridge stands on the ground or hangs
// at eye level, and it is per-variant on a generator that mixes all three.

import * as THREE from "three";
import { GENERATORS, sanitizeSpec, elevationOf } from "@/parametric";
import { ALL_PIECES, piecesOf, type CustomPiece } from "@/parametric/pieces";
import { counterLiftOf, applyKitchenGesture, findHostRun } from "@/parametric/kitchenAttach";
import { counterSurfaces } from "@/parametric/CounterItemGhost";
import type { FurnitureItem, ParametricSpec, Scene } from "@/schema/scene";
import type { RoomType } from "@/furniture/catalog";
import { BATHROOM_HOTSPOTS } from "@/ui/planDock/BathroomScene";
import { BEDROOM_HOTSPOTS } from "@/ui/planDock/BedroomScene";
import { CLOSET_HOTSPOTS } from "@/ui/planDock/ClosetScene";
import { DINING_HOTSPOTS } from "@/ui/planDock/DiningScene";
import { GARAGE_HOTSPOTS } from "@/ui/planDock/GarageScene";
import { KIDS_HOTSPOTS } from "@/ui/planDock/KidsScene";
import { KITCHEN_HOTSPOTS, type RoomHotspot } from "@/ui/planDock/KitchenScene";
import { LAUNDRY_HOTSPOTS } from "@/ui/planDock/LaundryScene";
import { LIVING_HOTSPOTS } from "@/ui/planDock/LivingScene";
import { OUTDOORS_HOTSPOTS } from "@/ui/planDock/OutdoorsScene";
import { STUDY_HOTSPOTS } from "@/ui/planDock/StudyScene";
import { GENERATOR_GLYPH } from "@/ui/planDock/generatorGlyphs";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

function bbox(g: THREE.Object3D): THREE.Box3 {
  g.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(g);
}
function countVerts(g: THREE.Object3D): number {
  let n = 0;
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) n += o.geometry.getAttribute("position").count;
  });
  return n;
}
function hasNaN(g: THREE.Object3D): boolean {
  let bad = false;
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const arr = o.geometry.getAttribute("position").array as ArrayLike<number>;
    for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) bad = true;
  });
  return bad;
}

// Wood/paint finishes build their textures on a browser canvas, which doesn't
// exist under tsx. Geometry is identical across finishes, so anything that
// defaults to `painted` is built here in steel instead. Appearance is a
// browser concern (and is what the in-app visual pass is for).
const headless = (spec: ParametricSpec): ParametricSpec =>
  spec.finish === "painted" || spec.finish === "oak" || spec.finish === "walnut"
    ? sanitizeSpec({ ...spec, finish: "steel" })
    : spec;

const APPLIANCE_CARDS = piecesOf(GENERATORS.appliance);
const HOOD_CARDS = piecesOf(GENERATORS.rangeHood);
const PHASE2 = [...APPLIANCE_CARDS, ...HOOD_CARDS];

const buildCard = (p: CustomPiece, patch: Partial<ParametricSpec> = {}): THREE.Group =>
  p.generator.build(headless(sanitizeSpec({ ...p.spec, ...patch } as ParametricSpec)));

// ── Every card builds ─────────────────────────────────────────────────────
console.log("\nevery Phase 2 card builds real geometry");
for (const p of PHASE2) {
  const g = buildCard(p);
  check(`${p.glyphKey} builds meshes`, countVerts(g) > 200, `${countVerts(g)} verts`);
  check(`${p.glyphKey} has no NaN vertices`, !hasNaN(g));
}

// ── Footprint and floor contact (doors shut) ──────────────────────────────
console.log("\nshut, each one fits the footprint it claims");
for (const p of PHASE2) {
  const spec = sanitizeSpec({ ...p.spec, modules: { ...p.spec.modules, doorOpen: 0 } } as ParametricSpec);
  const b = bbox(buildCard(p, { modules: spec.modules }));
  const label = p.glyphKey;
  check(`${label} width within footprint`, b.max.x - b.min.x <= spec.dims.w + 0.03, `${(b.max.x - b.min.x).toFixed(3)} vs ${spec.dims.w}`);
  check(`${label} depth within footprint`, b.max.z - b.min.z <= spec.dims.d + 0.03, `${(b.max.z - b.min.z).toFixed(3)} vs ${spec.dims.d}`);
  check(`${label} height within its own height`, b.max.y - b.min.y <= spec.dims.h + 0.03, `${(b.max.y - b.min.y).toFixed(3)} vs ${spec.dims.h}`);
  // y=0 means "the floor" for a floor item and "the underside" for a hanging
  // one — either way nothing may hang below the origin, or a placed item cuts
  // through the floor / through the wall cabinet above it.
  check(`${label} sits on its own base plane`, near(b.min.y, 0, 0.015), `min.y=${b.min.y.toFixed(3)}`);
  check(`${label} reaches its full height`, b.max.y >= spec.dims.h - 0.05, `max.y=${b.max.y.toFixed(3)} vs ${spec.dims.h}`);
}

// ── Mounting: the thing that decides floor vs wall vs counter ─────────────
console.log("\nmounting mode is per variant and exactly one of the three");
const EXPECTED_MOUNT: Record<string, "floor" | "wall" | "counter"> = {
  "appliance:fridge-2door": "floor",
  "appliance:fridge-side-by-side": "floor",
  "appliance:fridge-under-counter": "floor",
  "appliance:oven": "floor",
  "appliance:range-cooker": "floor",
  "appliance:dishwasher-integrated": "floor",
  "appliance:dishwasher-steel": "floor",
  "appliance:washer": "floor",
  "appliance:dryer": "floor",
  "appliance:washer-dryer-stack": "floor",
  "appliance:microwave": "counter",
  "appliance:microwave-over-range": "wall",
  "rangeHood:chimney": "wall",
  "rangeHood:island": "counter",
  "rangeHood:visor": "wall",
};
for (const p of PHASE2) {
  const wall = p.generator.wallMounted?.(p.spec) ?? false;
  const counter = p.generator.counterItem?.(p.spec) ?? false;
  const mount = wall ? "wall" : counter ? "counter" : "floor";
  check(`${p.glyphKey} mounts as ${EXPECTED_MOUNT[p.glyphKey]}`, mount === EXPECTED_MOUNT[p.glyphKey], `got ${mount}`);
  check(`${p.glyphKey} is not both wall and counter`, !(wall && counter));
}

console.log("\nfloor variants start on the floor, not at a stored height");
for (const p of PHASE2) {
  if (EXPECTED_MOUNT[p.glyphKey] !== "floor") continue;
  // placeFurniture applies elevationOf() verbatim; anything non-undefined here
  // hangs a floor-standing machine in mid-air.
  check(`${p.glyphKey} has no default elevation`, elevationOf(p.spec) === undefined, `${elevationOf(p.spec)}`);
}

console.log("\nthe island hood hangs above its host counter, the worktop items sit on it");
{
  const island = HOOD_CARDS.find((p) => p.variantId === "island")!;
  check("island hood lifts clear of the worktop", counterLiftOf(island.spec) > 0.4, `${counterLiftOf(island.spec)}`);
  const micro = APPLIANCE_CARDS.find((p) => p.variantId === "microwave")!;
  check("worktop microwave sits ON the counter", counterLiftOf(micro.spec) === 0);
  check("sink still sits on the counter", counterLiftOf(GENERATORS.sink.defaultSpec) === 0);
  check("counter items cut no hole unless they need one", GENERATORS.appliance.cutoutSize?.(micro.spec) === null);
  check("the hood cuts no hole either", GENERATORS.rangeHood.cutoutSize?.(island.spec) === null);
}

// ── Doors ─────────────────────────────────────────────────────────────────
console.log("\ndoors that open, open — and only on the variants that have an inside");
const OPENABLE = [
  "appliance:fridge-2door",
  "appliance:fridge-side-by-side",
  "appliance:fridge-under-counter",
  "appliance:oven",
  "appliance:dishwasher-integrated",
  "appliance:dishwasher-steel",
];
for (const p of APPLIANCE_CARDS) {
  const openable = OPENABLE.includes(p.glyphKey);
  const doorModule = GENERATORS.appliance.modules.find((m) => m.key === "doorOpen")!;
  check(`${p.glyphKey} ${openable ? "offers" : "hides"} the door toggle`, (doorModule.appliesTo?.(p.spec) ?? true) === openable);
  if (!openable) continue;

  const shut = bbox(buildCard(p, { modules: { ...p.spec.modules, doorOpen: 0 } }));
  const open = buildCard(p, { modules: { ...p.spec.modules, doorOpen: 1 } });
  const ob = bbox(open);
  check(`${p.glyphKey} door swings clear of the body`, ob.max.z > shut.max.z + 0.1 || ob.max.x > shut.max.x + 0.1, `z ${shut.max.z.toFixed(2)}->${ob.max.z.toFixed(2)}`);
  // Mesh COUNT, not vertex count: shut, the body is one rounded box with a lot
  // of vertices; open, it's a shell plus shelves — more parts, fewer verts.
  const meshes = (g: THREE.Object3D) => {
    let n = 0;
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) n++;
    });
    return n;
  };
  check(`${p.glyphKey} open shows an interior`, meshes(open) > meshes(buildCard(p, { modules: { ...p.spec.modules, doorOpen: 0 } })) + 3, "no cavity behind the door");
  check(`${p.glyphKey} open door stays above the floor`, ob.min.y >= -0.02, `min.y=${ob.min.y.toFixed(3)}`);
  check(`${p.glyphKey} open builds without NaN`, !hasNaN(open));
}

console.log("\nan open fridge is hollow, not a painted-on door");
{
  const p = APPLIANCE_CARDS.find((c) => c.variantId === "fridge-2door")!;
  const open = buildCard(p, { modules: { doorOpen: 1 } });
  open.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 1.2, 2), new THREE.Vector3(0, 0, -1));
  const hits = ray.intersectObject(open, true);
  // Front wall gone, so the first thing the ray meets is inside the cabinet
  // (a shelf or the back lining), never a solid face at the front plane.
  const first = hits[0];
  check("a ray finds the inside of an open fridge", !!first, `${hits.length} hits`);
  if (first) check("nothing solid blocks the opening", first.point.z < p.spec.dims.d / 2 - 0.01, `first hit z=${first.point.z.toFixed(3)}`);
}

console.log("\nthe range cooker's hob answers its burner count");
{
  const p = APPLIANCE_CARDS.find((c) => c.variantId === "range-cooker")!;
  const four = countVerts(buildCard(p, { modules: { burners: 4 } }));
  const six = countVerts(buildCard(p, { modules: { burners: 6 } }));
  check("six burners is more geometry than four", six > four, `${four} vs ${six}`);
  const burnerModule = GENERATORS.appliance.modules.find((m) => m.key === "burners")!;
  check("burner count is offered on the range only", burnerModule.appliesTo?.(p.spec) === true);
  const fridge = APPLIANCE_CARDS.find((c) => c.variantId === "fridge-2door")!;
  check("a fridge is never asked how many burners it has", burnerModule.appliesTo?.(fridge.spec) === false);
}

console.log("\nhood lights are a labelled two-state control, and they change the hood");
{
  const doorModule = GENERATORS.rangeHood.modules.find((m) => m.key === "lights")!;
  check("lights render as words, not a 0/1 stepper", !!doorModule.toggle);
  const p = HOOD_CARDS[0];
  const lit = buildCard(p, { modules: { lights: 1 } });
  const dark = buildCard(p, { modules: { lights: 0 } });
  // Emitted light = colour × intensity. Intensity alone is 1 on every stock
  // MeshStandardMaterial (with a black emissive), so reading it says nothing.
  const emissiveOf = (g: THREE.Object3D) => {
    let max = 0;
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const m = o.material as THREE.MeshStandardMaterial;
        if (m?.emissive) {
          const lum = (m.emissive.r + m.emissive.g + m.emissive.b) / 3;
          max = Math.max(max, lum * (m.emissiveIntensity ?? 1));
        }
      }
    });
    return max;
  };
  check("lights on actually emits", emissiveOf(lit) > 0.3, `${emissiveOf(lit).toFixed(3)}`);
  check("lights off does not", emissiveOf(dark) < 0.01, `${emissiveOf(dark).toFixed(3)}`);
}

console.log("\nonly the integrated dishwasher is offered a door profile");
for (const p of APPLIANCE_CARDS) {
  const shown = GENERATORS.appliance.showFronts?.(p.spec) ?? true;
  check(`${p.glyphKey} front chips ${p.variantId === "dishwasher-integrated" ? "shown" : "hidden"}`, shown === (p.variantId === "dishwasher-integrated"));
}

// ── Cards: sizes, names, glyphs ───────────────────────────────────────────
console.log("\neach card places its own size, not one shared default");
{
  const dims = new Map(PHASE2.map((p) => [p.glyphKey, p.spec.dims]));
  const fridge = dims.get("appliance:fridge-2door")!;
  const micro = dims.get("appliance:microwave")!;
  const sbs = dims.get("appliance:fridge-side-by-side")!;
  check("a microwave is not fridge-sized", micro.h < fridge.h * 0.4, `${micro.h} vs ${fridge.h}`);
  check("a side-by-side is wider than a single fridge", sbs.w > fridge.w + 0.2, `${sbs.w} vs ${fridge.w}`);
  check("a stacked pair is taller than one machine", dims.get("appliance:washer-dryer-stack")!.h > dims.get("appliance:washer")!.h * 1.6);
  const distinct = new Set(PHASE2.map((p) => `${p.spec.dims.w}x${p.spec.dims.d}x${p.spec.dims.h}`));
  check("cards cover several distinct sizes", distinct.size >= 8, `${distinct.size} distinct`);
}

console.log("\nevery card has a name that stands on its own, and its own glyph");
{
  const labels = PHASE2.map((p) => p.label);
  check("no card falls back to '<generator> · <variant>'", labels.every((l) => !l.includes("·")), labels.filter((l) => l.includes("·")).join(", "));
  check("card names are unique", new Set(labels).size === labels.length);
  for (const p of PHASE2) check(`${p.glyphKey} has a glyph`, !!GENERATOR_GLYPH[p.glyphKey], "renders as an empty tile without one");
  const glyphs = PHASE2.map((p) => GENERATOR_GLYPH[p.glyphKey]);
  check("no two Phase 2 cards share a glyph", new Set(glyphs).size === glyphs.length);
}

// ── The navigator has to be able to reach all of it ───────────────────────
const ROOM_HOTSPOTS: Record<RoomType, RoomHotspot[]> = {
  kitchen: KITCHEN_HOTSPOTS,
  bathroom: BATHROOM_HOTSPOTS,
  bedroom: BEDROOM_HOTSPOTS,
  living: LIVING_HOTSPOTS,
  dining: DINING_HOTSPOTS,
  study: STUDY_HOTSPOTS,
  laundry: LAUNDRY_HOTSPOTS,
  closet: CLOSET_HOTSPOTS,
  kids: KIDS_HOTSPOTS,
  garage: GARAGE_HOTSPOTS,
  outdoors: OUTDOORS_HOTSPOTS,
};

/** The dock's own test: hotspot keyword ⊂ the card's keyword text. */
const reachedBy = (p: CustomPiece, room: RoomType) => {
  const text = p.keywords.join(" ").toLowerCase();
  return ROOM_HOTSPOTS[room].filter((h) => h.keywords.some((k) => text.includes(k)));
};

console.log("\nevery Phase 2 card has a button in every room it appears in");
for (const p of PHASE2) {
  for (const room of p.rooms) {
    const hits = reachedBy(p, room);
    check(`${p.glyphKey} is reachable in ${room}`, hits.length > 0, "no hotspot in that room's picture matches it");
  }
}

console.log("\n…and so does everything that shipped before it");
for (const p of ALL_PIECES()) {
  for (const room of p.rooms) {
    const hits = reachedBy(p, room);
    check(`${p.glyphKey} still reachable in ${room}`, hits.length > 0);
  }
}

console.log("\nthe new buttons are the ones that were missing");
{
  const kitchenIds = KITCHEN_HOTSPOTS.map((h) => h.id);
  check("kitchen has a Dishwasher button", kitchenIds.includes("dishwasher"));
  check("kitchen has a Range hood button", kitchenIds.includes("hood"));
  check("laundry has a Washing machine button", LAUNDRY_HOTSPOTS.some((h) => h.id === "washer"));
  // Clicking one button must not surface half the room.
  const dishwasherHotspot = KITCHEN_HOTSPOTS.find((h) => h.id === "dishwasher")!;
  const surfaced = APPLIANCE_CARDS.filter((p) => p.keywords.join(" ").includes(dishwasherHotspot.keywords[0]));
  check("the Dishwasher button surfaces exactly the dishwashers", surfaced.length === 2, `${surfaced.length} cards`);
  const hoodHotspot = KITCHEN_HOTSPOTS.find((h) => h.id === "hood")!;
  const hoods = ALL_PIECES().filter((p) => hoodHotspot.keywords.some((k) => p.keywords.join(" ").includes(k)));
  check("the Range hood button surfaces exactly the hoods", hoods.length === HOOD_CARDS.length, `${hoods.length} cards`);
}

console.log("\nthe Laundry tab is no longer empty");
{
  const laundry = ALL_PIECES().filter((p) => p.rooms.includes("laundry"));
  check("laundry has browsable pieces", laundry.length >= 3, `${laundry.length}`);
  const kitchen = ALL_PIECES().filter((p) => p.rooms.includes("kitchen"));
  check("kitchen gained the appliances", kitchen.length >= 15, `${kitchen.length}`);
  check("a washing machine does not appear on the Kitchen tab", !kitchen.some((p) => p.variantId === "washer"));
  check("a fridge does not appear on the Laundry tab", !laundry.some((p) => p.variantId === "fridge-2door"));
}

// ── Editing a placed item ─────────────────────────────────────────────────
// Placement reads the wall grid; editing used to read the FLOOR grid, so
// dragging a hood slid it out into the middle of the room at hood height.

console.log("\nediting: a wall item stays on the wall grid, at its own height");
{
  const t = 0.2;
  const room: Scene = {
    schemaVersion: 2,
    units: "meters",
    nodes: [
      { id: "n0", x: 0, y: 0 },
      { id: "n1", x: 4, y: 0 },
      { id: "n2", x: 4, y: 3 },
      { id: "n3", x: 0, y: 3 },
    ],
    walls: [
      { id: "w0", a: "n0", b: "n1", thickness: t },
      { id: "w1", a: "n1", b: "n2", thickness: t },
      { id: "w2", a: "n2", b: "n3", thickness: t },
      { id: "w3", a: "n3", b: "n0", thickness: t },
    ],
    openings: [],
    rooms: [{ id: "r0", loop: ["n0", "n1", "n2", "n3"] }],
    furniture: [],
  };
  const hood = HOOD_CARDS.find((p) => p.variantId === "chimney")!;
  const placed: FurnitureItem = {
    id: "f1",
    assetId: "param:rangeHood",
    x: 2,
    y: t / 2 + hood.spec.dims.d / 2, // on the bottom wall's face
    rotation: 0,
    elevation: 1.6,
    parametric: hood.spec,
  };
  const before: Scene = { ...room, furniture: [placed] };
  // Drag it into open floor, the way the generic floor snap would leave it.
  const dragged: Scene = { ...before, furniture: [{ ...placed, x: 2.4, y: 1.5 }] };
  const after = applyKitchenGesture(dragged, before);
  const item = after.furniture[0];
  const wallFaceY = t / 2 + hood.spec.dims.d / 2;
  check("a dragged hood returns to a wall face", near(item.y, wallFaceY, 0.02) || near(item.y, 3 - wallFaceY, 0.02), `y=${item.y.toFixed(3)}`);
  check("it slides ALONG the wall rather than snapping back", Math.abs(item.x - placed.x) > 0.05, `x=${item.x.toFixed(3)}`);
  check("its height off the floor is untouched", item.elevation === 1.6, `${item.elevation}`);
  check("it faces into the room", Number.isFinite(item.rotation));

  // A floor appliance must NOT be dragged onto a wall face by this pass.
  const fridge = APPLIANCE_CARDS.find((p) => p.variantId === "fridge-2door")!;
  const withFridge: Scene = {
    ...room,
    furniture: [{ id: "f2", assetId: "param:appliance", x: 2, y: 1.5, rotation: 0, parametric: fridge.spec }],
  };
  const movedFridge: Scene = {
    ...withFridge,
    furniture: [{ ...withFridge.furniture[0], x: 2.5, y: 1.4 }],
  };
  const fridgeAfter = applyKitchenGesture(movedFridge, withFridge).furniture[0];
  check("a floor appliance is left where the drag put it", fridgeAfter.x === 2.5 && fridgeAfter.y === 1.4, `${fridgeAfter.x},${fridgeAfter.y}`);
}

console.log("\nediting: variants of a PRODUCT set can't be swapped on a placed item");
{
  check("appliances are products, not styles", GENERATORS.appliance.variantIsProduct === true);
  check("hoods too", GENERATORS.rangeHood.variantIsProduct === true);
  // The bathroom sets are alternatives of one fixture at one size — switching
  // those on a placed item is still legitimate, so they must NOT be locked.
  check("toilet mountings stay switchable", !GENERATORS.toilet.variantIsProduct);
  check("every locked generator's variants carry their own size",
    [GENERATORS.appliance, GENERATORS.rangeHood].every((g) => g.variants!.every((v) => !!v.defaults)));
}

console.log("\nplacing onto a worktop reads the WORKTOP, not the floor under it");
{
  const run: FurnitureItem = {
    id: "run1",
    assetId: "param:kitchenBase",
    x: 1,
    y: 0.3,
    rotation: 0,
    parametric: sanitizeSpec({ ...GENERATORS.kitchenBase.defaultSpec, dims: { w: 2.4, d: 0.6, h: 0.9 } } as ParametricSpec),
  };
  const scene = { schemaVersion: 2, units: "meters", nodes: [], walls: [], openings: [], rooms: [], furniture: [run] } as Scene;
  const surfaces = counterSurfaces(scene);
  check("a straight run offers one worktop surface", surfaces.length === 1, `${surfaces.length}`);
  check("the surface sits at counter height", near(surfaces[0]?.top ?? 0, 0.9, 0.001), `${surfaces[0]?.top}`);
  check("it spans the run", near(surfaces[0]?.len ?? 0, 2.4, 0.001) && near(surfaces[0]?.d ?? 0, 0.6, 0.001));

  // An L run has to offer one per leg, or the second leg keeps reading the
  // floor and the ghost jumps as you cross the corner.
  const lRun: FurnitureItem = {
    ...run,
    id: "run2",
    parametric: sanitizeSpec({ ...run.parametric!, extraLegs: [{ turn: 1, w: 1.2 }] } as ParametricSpec),
  };
  check("an L run offers one per leg", counterSurfaces({ ...scene, furniture: [lRun] }).length === 2);
  check("a wall-cabinet run offers none", counterSurfaces({ ...scene, furniture: [{ ...run, id: "r3", parametric: GENERATORS.kitchenWall.defaultSpec }] }).length === 0);

  // The defect this replaced, measured: a pointer aimed at a spot ON the
  // worktop, read against the FLOOR instead, lands somewhere else entirely —
  // so the item lagged the cursor, and near the edge it fell off the host.
  const surface = surfaces[0];
  const eye = new THREE.Vector3(surface.x, 6, surface.y + 6); // a typical 3/4 view
  const target = new THREE.Vector3(surface.x + 0.6, surface.top, surface.y); // a point on the worktop
  const dir = target.clone().sub(eye).normalize();
  const tFloor = -eye.y / dir.y; // where that same ray meets the ground
  const floorHit = eye.clone().addScaledVector(dir, tFloor);
  const parallax = Math.hypot(floorHit.x - target.x, floorHit.z - target.z);
  check("reading the floor misses the aimed point by a lot", parallax > 0.5, `${parallax.toFixed(2)}m`);

  const onSurface = findHostRun(target.x, target.z, scene, 0.5);
  const onFloor = findHostRun(floorHit.x, floorHit.z, scene, 0.5);
  check("the worktop point resolves to the run", !!onSurface);
  check("the floor point resolves somewhere else (or nowhere)",
    !onFloor || Math.abs((onFloor.along ?? 0) - (onSurface?.along ?? 0)) > 0.2,
    `along ${onFloor?.along} vs ${onSurface?.along}`);
}

console.log("\nthe kitchen picture: microwave and trash are separate buttons");
{
  const ids = KITCHEN_HOTSPOTS.map((h) => h.id);
  check("microwave has its own button", ids.includes("microwave"));
  check("trash has its own button", ids.includes("trash"));
  check("there is no combined 'extras' button left", !ids.includes("extras"));
  check("hotspot ids are unique", new Set(ids).size === ids.length, ids.join(","));
  // "bin" is a substring of "cabinet" — as a keyword it fills Trash with units.
  const trash = KITCHEN_HOTSPOTS.find((h) => h.id === "trash")!;
  check("Trash does not match cabinets by the word 'bin'", !trash.keywords.includes("bin") && !"cabinet".includes(trash.keywords[0]));
}

console.log("\nthe range cooker's burners stay off the edges of its hob");
{
  const p = APPLIANCE_CARDS.find((c) => c.variantId === "range-cooker")!;
  const spec = p.spec;
  const g = buildCard(p);
  // Burner trivets are the only meshes above the hob line; measure how close
  // they get to the hob's own edges.
  const hobTop = spec.dims.h - 0.04;
  let minEdgeGap = Infinity;
  g.updateMatrixWorld(true);
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const b = new THREE.Box3().setFromObject(o);
    if (b.min.y < hobTop - 0.005) return; // below the hob: body, doors, fascia
    minEdgeGap = Math.min(minEdgeGap, spec.dims.w / 2 - b.max.x, b.min.x + spec.dims.w / 2);
  });
  check("burners keep clear of the hob's side edges", minEdgeGap > 0.05, `closest ${minEdgeGap.toFixed(3)}m`);
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
