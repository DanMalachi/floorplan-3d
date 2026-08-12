// Headless: bathroom fixtures (Phase 1) — toilet + bathtub geometry.
// Run: npx tsx src/parametric/bathroom.test.ts
//
// These generators are judged by eye in the end, but the things that silently
// break geometry — NaN vertices, an item floating above or sinking through the
// floor, a "hollow" that isn't hollow, a variant that throws — are all
// measurable, so they're measured here rather than eyeballed.

import * as THREE from "three";
import { GENERATORS, sanitizeSpec, elevationOf } from "@/parametric";
import { ALL_PIECES } from "@/parametric/pieces";
import type { ParametricSpec } from "@/schema/scene";
import { BATHROOM_HOTSPOTS } from "@/ui/planDock/BathroomScene";
import { BEDROOM_HOTSPOTS } from "@/ui/planDock/BedroomScene";
import { CLOSET_HOTSPOTS } from "@/ui/planDock/ClosetScene";
import { DINING_HOTSPOTS } from "@/ui/planDock/DiningScene";
import { GARAGE_HOTSPOTS } from "@/ui/planDock/GarageScene";
import { KIDS_HOTSPOTS } from "@/ui/planDock/KidsScene";
import { KITCHEN_HOTSPOTS } from "@/ui/planDock/KitchenScene";
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

type BathId = "toilet" | "bathtub" | "shower" | "vanity" | "bathAccessory";
const BATH_IDS: BathId[] = ["toilet", "bathtub", "shower", "vanity", "bathAccessory"];

// These are GEOMETRY tests, and geometry is identical across finishes. The
// wood/paint finishes build their textures on a browser canvas, which doesn't
// exist under tsx — so anything defaulting to `painted` is built here with a
// canvas-free finish instead. Material appearance is a browser concern.
const HEADLESS_FINISH: Partial<Record<BathId, string>> = { vanity: "ceramic", bathAccessory: "ceramic" };

const specFor = (id: BathId, patch: Partial<ParametricSpec> = {}): ParametricSpec => {
  const finish = HEADLESS_FINISH[id];
  return sanitizeSpec({ ...GENERATORS[id].defaultSpec, ...(finish ? { finish } : {}), ...patch } as ParametricSpec);
};

// ── Toilet ────────────────────────────────────────────────────────────────
console.log("\ntoilet — every variant builds, sits on the floor, fills its footprint");
for (const variant of ["close-coupled", "wall-hung", "back-to-wall"]) {
  const spec = specFor("toilet", { variant });
  const g = GENERATORS.toilet.build(spec);
  const b = bbox(g);
  const label = `toilet/${variant}`;

  check(`${label} builds meshes`, countVerts(g) > 200, `${countVerts(g)} verts`);
  check(`${label} has no NaN vertices`, !hasNaN(g));
  check(`${label} width fits footprint`, b.max.x - b.min.x <= spec.dims.w + 0.02, `${(b.max.x - b.min.x).toFixed(3)}m vs ${spec.dims.w}`);
  check(`${label} depth fits footprint`, b.max.z - b.min.z <= spec.dims.d + 0.02, `${(b.max.z - b.min.z).toFixed(3)}m vs ${spec.dims.d}`);
}

console.log("\ntoilet — floor contact per mounting type");
{
  const floorStanding = bbox(GENERATORS.toilet.build(specFor("toilet", { variant: "close-coupled" })));
  check("close-coupled rests on the floor", near(floorStanding.min.y, 0, 0.01), `min.y=${floorStanding.min.y.toFixed(3)}`);

  const btw = bbox(GENERATORS.toilet.build(specFor("toilet", { variant: "back-to-wall" })));
  check("back-to-wall rests on the floor", near(btw.min.y, 0, 0.01), `min.y=${btw.min.y.toFixed(3)}`);

  // The whole point of a wall-hung pan is the air underneath it.
  const wallHung = bbox(GENERATORS.toilet.build(specFor("toilet", { variant: "wall-hung" })));
  check("wall-hung pan floats clear of the floor", wallHung.min.y > 0.1, `min.y=${wallHung.min.y.toFixed(3)}`);
}

console.log("\ntoilet — height semantics and the seat");
{
  // Measured with the lid DOWN: a raised lid legitimately stands taller than
  // the cistern, so it would mask what these two checks are actually about.
  const closedLid = { variant: "close-coupled", modules: { lidOpen: 0 } };
  const b = bbox(GENERATORS.toilet.build(specFor("toilet", { ...closedLid, dims: { w: 0.36, d: 0.66, h: 0.78 } })));
  check("close-coupled tops out at the requested height", near(b.max.y, 0.78, 0.05), `max.y=${b.max.y.toFixed(3)}`);

  // A taller spec must grow the cistern, not the pan (seat height is fixed by
  // ergonomics), so the top moves with h.
  const tall = bbox(GENERATORS.toilet.build(specFor("toilet", { ...closedLid, dims: { w: 0.36, d: 0.66, h: 0.95 } })));
  check("taller spec raises the cistern", tall.max.y > b.max.y + 0.1, `${b.max.y.toFixed(2)} -> ${tall.max.y.toFixed(2)}`);

  // Seat height is ergonomic, NOT a function of h — it must not drift when the
  // cistern grows.
  const seatLow = bbox(GENERATORS.toilet.build(specFor("toilet", { ...closedLid, dims: { w: 0.36, d: 0.66, h: 0.7 } })));
  check("seat height is independent of cistern height", near(seatLow.min.y, 0, 0.01) && near(b.min.y, 0, 0.01));

  const open = bbox(GENERATORS.toilet.build(specFor("toilet", { modules: { lidOpen: 1 } })));
  const closed = bbox(GENERATORS.toilet.build(specFor("toilet", { modules: { lidOpen: 0 } })));
  check("open lid stands up above the closed one", open.max.y > closed.max.y || open.min.z < closed.min.z - 0.05, `open=${open.max.y.toFixed(2)} closed=${closed.max.y.toFixed(2)}`);
}

console.log("\ntoilet — a raised lid clears the cistern");
{
  // Caught by eye on review: the seat was as long as the pan, and the pan
  // tucks under the cistern — so the lid hinged behind the cistern face and
  // swung straight through it.
  const d = 0.66;
  const spec = specFor("toilet", { variant: "close-coupled", dims: { w: 0.36, d, h: 0.78 }, modules: { lidOpen: 1 } });
  const g = GENERATORS.toilet.build(spec);
  g.updateMatrixWorld(true);

  let lidBox: THREE.Box3 | null = null;
  g.traverse((o) => {
    if (o.name === "lid") lidBox = new THREE.Box3().setFromObject(o);
  });

  const cisternFrontZ = -d / 2 + 0.21; // cistern spans the back 21cm
  check("lid mesh is findable", lidBox !== null);
  if (lidBox) {
    const box = lidBox as THREE.Box3;
    check("raised lid stays in front of the cistern face", box.min.z >= cisternFrontZ - 0.005, `lid back z=${box.min.z.toFixed(3)}, cistern face z=${cisternFrontZ.toFixed(3)}`);
    check("raised lid actually stands up", box.max.y - box.min.y > 0.3, `lid height=${(box.max.y - box.min.y).toFixed(3)}`);
  }
}

console.log("\ntoilet — the pan is a real hollow, not a capped box");
{
  // The lathe climbs the outside and descends into the bowl. If the profile
  // were ever flattened to a solid, the vertex count would collapse.
  const g = GENERATORS.toilet.build(specFor("toilet", { modules: { lidOpen: 1 } }));
  check("lathe carries the full profile", countVerts(g) > 1000, `${countVerts(g)} verts`);
}

// ── Bathtub ───────────────────────────────────────────────────────────────
console.log("\nbathtub — every variant builds, sits on the floor, fills its footprint");
for (const variant of ["alcove", "freestanding"]) {
  const spec = specFor("bathtub", { variant });
  const g = GENERATORS.bathtub.build(spec);
  const b = bbox(g);
  const label = `bathtub/${variant}`;

  check(`${label} builds meshes`, countVerts(g) > 200, `${countVerts(g)} verts`);
  check(`${label} has no NaN vertices`, !hasNaN(g));
  check(`${label} rests on the floor`, near(b.min.y, 0, 0.01), `min.y=${b.min.y.toFixed(3)}`);
  check(`${label} width fits footprint`, b.max.x - b.min.x <= spec.dims.w + 0.02, `${(b.max.x - b.min.x).toFixed(3)}m`);
  check(`${label} depth fits footprint`, b.max.z - b.min.z <= spec.dims.d + 0.02, `${(b.max.z - b.min.z).toFixed(3)}m`);
}

console.log("\nbathtub — the basin is a recess, not a lid");
{
  const spec = specFor("bathtub", { dims: { w: 1.7, d: 0.7, h: 0.55 }, modules: { tap: 0 } });
  const g = GENERATORS.bathtub.build(spec);
  const b = bbox(g);
  check("rim sits at the requested height", near(b.max.y, 0.55, 0.02), `max.y=${b.max.y.toFixed(3)}`);

  // Fire a ray straight down through the middle. A solid block returns its top
  // face at rim height; a real tub's first hit is the basin floor, well below.
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, -1, 0));
  g.updateMatrixWorld(true);
  const hits = ray.intersectObject(g, true);
  check("a ray down the middle reaches into the basin", hits.length > 0 && hits[0].point.y < 0.45, hits.length ? `first hit y=${hits[0].point.y.toFixed(3)}` : "no hit");
}

console.log("\nbathtub — tap module");
{
  const withTap = countVerts(GENERATORS.bathtub.build(specFor("bathtub", { modules: { tap: 1 } })));
  const without = countVerts(GENERATORS.bathtub.build(specFor("bathtub", { modules: { tap: 0 } })));
  check("tap adds geometry", withTap > without, `${without} -> ${withTap}`);
}

// ── Spec plumbing ─────────────────────────────────────────────────────────
console.log("\nspec sanitizing");
for (const id of ["toilet", "bathtub"] as const) {
  const g = GENERATORS[id];
  check(`${id} is registered`, !!g && g.id === id);
  check(`${id} is tagged to the bathroom tab`, g.rooms.includes("bathroom"), g.rooms.join("/"));

  // Out-of-range dims and an unknown variant must clamp, not throw.
  const wild = sanitizeSpec({ ...g.defaultSpec, dims: { w: 99, d: -3, h: 0 }, variant: "nonsense" } as ParametricSpec);
  check(`${id} clamps absurd dims`, wild.dims.w <= g.dimLimits.w[1] && wild.dims.d >= g.dimLimits.d[0]);
  check(`${id} falls back to a valid variant`, g.variants!.some((v) => v.id === wild.variant), String(wild.variant));
  check(`${id} still builds from the clamped spec`, countVerts(g.build(wild)) > 100);
}

// ── Shower, vanity, accessories ───────────────────────────────────────────
console.log("\nshower — variants build and the tray/enclosure agree");
for (const variant of ["enclosure", "walk-in", "wet-room"]) {
  const spec = specFor("shower", { variant });
  const g = GENERATORS.shower.build(spec);
  const b = bbox(g);
  check(`shower/${variant} builds`, countVerts(g) > 200 && !hasNaN(g));
  check(`shower/${variant} rests on the floor`, near(b.min.y, 0, 0.01), `min.y=${b.min.y.toFixed(3)}`);
  check(`shower/${variant} fits its footprint`, b.max.x - b.min.x <= spec.dims.w + 0.02 && b.max.z - b.min.z <= spec.dims.d + 0.02);
}
{
  // A wet room is the tiled-in variant — it must not ship a tray.
  const wet = countVerts(GENERATORS.shower.build(specFor("shower", { variant: "wet-room" })));
  const tray = countVerts(GENERATORS.shower.build(specFor("shower", { variant: "walk-in" })));
  check("wet room has no tray geometry", wet < tray, `${wet} vs ${tray}`);

  const enclosure = bbox(GENERATORS.shower.build(specFor("shower", { variant: "enclosure", dims: { w: 0.9, d: 0.9, h: 2.0 } })));
  check("enclosure glass reaches full height", near(enclosure.max.y, 2.0, 0.06), `max.y=${enclosure.max.y.toFixed(3)}`);
}

console.log("\nvanity — every variant builds and the basin is open");
for (const variant of ["vanity-doors", "vanity-drawers", "countertop", "pedestal"]) {
  const spec = specFor("vanity", { variant });
  const g = GENERATORS.vanity.build(spec);
  const b = bbox(g);
  check(`vanity/${variant} builds`, countVerts(g) > 200 && !hasNaN(g));
  check(`vanity/${variant} rests on the floor`, near(b.min.y, 0, 0.012), `min.y=${b.min.y.toFixed(3)}`);
  check(`vanity/${variant} fits its width`, b.max.x - b.min.x <= spec.dims.w + 0.03, `${(b.max.x - b.min.x).toFixed(3)}m`);
}
{
  // Same probe as the bathtub: a ray down the basin centre must fall past the
  // top surface into the bowl, or the "basin" is just a painted lid.
  const g = GENERATORS.vanity.build(specFor("vanity", { variant: "vanity-doors", dims: { w: 0.8, d: 0.46, h: 0.85 } }));
  g.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 2, 0.01), new THREE.Vector3(0, -1, 0));
  const hits = ray.intersectObject(g, true);
  check("a ray down the basin centre passes the top", hits.length > 0 && hits[0].point.y < 0.85, hits.length ? `first hit y=${hits[0].point.y.toFixed(3)}` : "no hit");
}

// The accessory catch-all is RETIRED (split into mirror/towelRail/bin), but a
// project saved before the split still holds items pointing at it, so it has
// to keep rendering every variant it ever placed — and has to stay out of the
// pickers while it does. Same contract kitchenRun has.
console.log("\nretired accessories — old saves still render, nothing new is offered");
for (const variant of ["mirror", "cabinet", "towel-rail", "towel-ladder", "bin"]) {
  const g = GENERATORS.bathAccessory.build(specFor("bathAccessory", { variant }));
  check(`saved accessory/${variant} still builds`, countVerts(g) > 40 && !hasNaN(g), `${countVerts(g)} verts`);
}
check("the retired generator is off every room tab", GENERATORS.bathAccessory.rooms.length === 0);
check(
  "a saved wall accessory keeps its wall height",
  (elevationOf(specFor("bathAccessory", { variant: "mirror" })) ?? 0) > 0.9,
);
// …and the one that doesn't hang starts ON the floor. A flat generator-level
// elevation used to hang the bin at 1.25m too.
check(
  "a saved bin keeps its place on the floor",
  elevationOf(specFor("bathAccessory", { variant: "bin" })) === undefined,
);

console.log("\nthe bathroom's own fixtures are on the bathroom tab");
for (const id of BATH_IDS) {
  if (id === "bathAccessory") continue; // retired above
  check(`${id} is tagged bathroom`, GENERATORS[id].rooms.includes("bathroom"));
  check(`${id} clamps + builds from an absurd spec`, countVerts(GENERATORS[id].build(specFor(id, { dims: { w: 99, d: -3, h: 0 }, variant: "nonsense" }))) > 40);
}

// ── Navigator wiring ──────────────────────────────────────────────────────
// Every generator has to be REACHABLE from the illustrated room: it needs a
// hotspot whose keywords match it, or clicking through the picture can never
// surface it. This is what caught the mirror having no button of its own.
console.log("\nnavigator — every generator is reachable from a hotspot in each of its rooms");
{
  const HOTSPOTS_BY_ROOM: Partial<Record<string, { id: string; label: string; keywords: string[] }[]>> = {
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

  // Every VARIANT is its own card, so every variant — not just the generator —
  // has to be reachable, and in the rooms THAT CARD appears in: Phase 2's
  // appliance generator spans kitchen/laundry/bathroom while each of its cards
  // belongs to one or two of them (`piecesOf` resolves that).
  for (const piece of ALL_PIECES()) {
    const words = piece.keywords.join(" ").toLowerCase();
    for (const room of piece.rooms) {
      const hotspots = HOTSPOTS_BY_ROOM[room];
      if (!hotspots) continue;
      const hit = hotspots.find((h) => h.keywords.some((k) => words.includes(k)));
      check(`${piece.glyphKey} is reachable from a ${room} hotspot`, !!hit, `keywords "${words}" match no hotspot`);
    }
  }

  check(
    "bathroom has a Mirror hotspot of its own",
    BATHROOM_HOTSPOTS.some((h) => h.id === "mirror"),
  );
  // Hotspot ids drive the scene art lookup; a duplicate silently shadows one.
  const ids = BATHROOM_HOTSPOTS.map((h) => h.id);
  check("bathroom hotspot ids are unique", new Set(ids).size === ids.length, ids.join(","));
}

console.log("\nvariants are browsable pieces, each standing on its own");
{
  // Every bathroom generator must offer several distinct cards — that is the
  // whole point of splitting variants out into the picker.
  for (const [id, min] of [
    ["toilet", 3],
    ["shower", 3],
    ["vanity", 4],
    ["bathAccessory", 5],
    ["bathtub", 2],
  ] as const) {
    const vs = GENERATORS[id].variants ?? [];
    check(`${id} offers ${min}+ pieces`, vs.length >= min, `${vs.length}`);
    // A card name has to make sense with nothing else around it: "Doors" does
    // not, "Vanity with doors" does.
    check(`${id} variants all carry a standalone card name`, vs.every((v) => !!v.cardLabel), vs.map((v) => v.cardLabel ?? `MISSING:${v.id}`).join(", "));
    check(`${id} variant ids are unique`, new Set(vs.map((v) => v.id)).size === vs.length);
    check(`${id} card names are unique`, new Set(vs.map((v) => v.cardLabel)).size === vs.length);
  }

  // Each variant must actually build something different — identical geometry
  // across variants would mean the extra cards are lying.
  for (const id of BATH_IDS) {
    const vs = GENERATORS[id].variants ?? [];
    if (vs.length < 2) continue;
    const sizes = vs.map((v) => countVerts(GENERATORS[id].build(specFor(id, { variant: v.id }))));
    check(`${id} variants are not all identical`, new Set(sizes).size > 1, sizes.join("/"));
  }
}

console.log("\nevery browsable piece has its own glyph");
{
  // A missing glyph renders a blank tile — which is exactly how the bathroom
  // cards first shipped, so this is guarded rather than remembered.
  for (const g of Object.values(GENERATORS)) {
    if (g.rooms.length === 0) continue;
    if (!g.variants || g.variants.length <= 1) {
      check(`${g.id} has a glyph`, !!GENERATOR_GLYPH[g.id]);
      continue;
    }
    for (const v of g.variants) {
      const key = `${g.id}:${v.id}`;
      check(`${key} has a glyph`, !!(GENERATOR_GLYPH[key] ?? GENERATOR_GLYPH[g.id]), "no per-variant glyph and no generator fallback");
    }
    // At least one variant must look different from the generic fallback, or
    // the cards are visually identical and the split gains nothing.
    const distinct = g.variants.filter((v) => !!GENERATOR_GLYPH[`${g.id}:${v.id}`]).length;
    check(`${g.id} variants are visually distinguishable`, distinct >= g.variants.length - 1, `${distinct}/${g.variants.length} have their own glyph`);
  }
}

console.log("\nwall-mounted items declare it, so placement reads the wall grid");
{
  const acc = GENERATORS.bathAccessory;
  check("mirror is wall-mounted", acc.wallMounted?.(specFor("bathAccessory", { variant: "mirror" })) === true);
  check("towel rail is wall-mounted", acc.wallMounted?.(specFor("bathAccessory", { variant: "towel-rail" })) === true);
  // A bin stands on the floor — the predicate exists precisely for this.
  check("bin is NOT wall-mounted", acc.wallMounted?.(specFor("bathAccessory", { variant: "bin" })) === false);
  check("bathtub is not wall-mounted", GENERATORS.bathtub.wallMounted === undefined);
}

console.log("\ntwo-state modules declare word labels, not 0/1");
for (const g of Object.values(GENERATORS)) {
  for (const m of g.modules) {
    if (m.min === 0 && m.max === 1) {
      check(`${g.id}.${m.key} has toggle labels`, !!m.toggle, "boolean module rendered as a stepper");
    }
  }
}

console.log(failures === 0 ? "\nAll bathroom checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
