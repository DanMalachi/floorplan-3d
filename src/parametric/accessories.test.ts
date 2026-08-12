// Headless: the accessory split — mirror, towelRail, bin.
// Run: npx tsx src/parametric/accessories.test.ts
//
// These three came out of one "Mirror & accessories" generator that placed a
// towel ring and a bin at a mirror's dimensions. The checks that matter are
// therefore about SEPARATION: each product has its own size, its own mounting,
// its own button, and its own glyph — plus the one thing a mirror has to do,
// which is reflect.

import * as THREE from "three";
import { GENERATORS, sanitizeSpec, elevationOf } from "@/parametric";
import { ALL_PIECES, piecesOf, type CustomPiece } from "@/parametric/pieces";
import type { ParametricSpec } from "@/schema/scene";
import { BATHROOM_HOTSPOTS } from "@/ui/planDock/BathroomScene";
import { KITCHEN_HOTSPOTS } from "@/ui/planDock/KitchenScene";
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

// Paint, wood and fabric finishes build their textures on a browser canvas,
// which tsx has none of. Geometry is identical across finishes, so a card that
// defaults to one is rebuilt here in the first canvas-free finish ITS OWN
// generator offers — substituting a finish the generator doesn't list just
// gets reset by sanitizeSpec, straight back into the canvas.
const CANVAS_FREE = new Set(["steel", "ceramic", "acrylic", "glass-black", "counter-white", "laminate-matte", "laminate-gloss"]);
const headless = (p: CustomPiece, spec: ParametricSpec): ParametricSpec => {
  if (CANVAS_FREE.has(spec.finish)) return spec;
  const swap = p.generator.finishes.find((f) => CANVAS_FREE.has(f));
  return swap ? sanitizeSpec({ ...spec, finish: swap }) : spec;
};
const buildCard = (p: CustomPiece, patch: Partial<ParametricSpec> = {}) =>
  p.generator.build(headless(p, sanitizeSpec({ ...p.spec, ...patch } as ParametricSpec)));

const MIRRORS = piecesOf(GENERATORS.mirror);
const TOWELS = piecesOf(GENERATORS.towelRail);
const BINS = piecesOf(GENERATORS.bin);
const SPLIT = [...MIRRORS, ...TOWELS, ...BINS];

console.log("\nevery card builds and fits what it says it is");
for (const p of SPLIT) {
  const g = buildCard(p);
  const b = bbox(g);
  // A frameless mirror is legitimately two quads; a bin is not.
  check(`${p.glyphKey} builds meshes`, countVerts(g) > 20, `${countVerts(g)} verts`);
  check(`${p.glyphKey} has no NaN vertices`, !hasNaN(g));
  check(`${p.glyphKey} width within footprint`, b.max.x - b.min.x <= p.spec.dims.w + 0.03, `${(b.max.x - b.min.x).toFixed(3)} vs ${p.spec.dims.w}`);
  check(`${p.glyphKey} depth within footprint`, b.max.z - b.min.z <= p.spec.dims.d + 0.03, `${(b.max.z - b.min.z).toFixed(3)} vs ${p.spec.dims.d}`);
  check(`${p.glyphKey} height within its own height`, b.max.y - b.min.y <= p.spec.dims.h + 0.03, `${(b.max.y - b.min.y).toFixed(3)} vs ${p.spec.dims.h}`);
  check(`${p.glyphKey} sits on its base plane`, near(b.min.y, 0, 0.02), `min.y=${b.min.y.toFixed(3)}`);
}

console.log("\na mirror actually reflects — the whole complaint");
for (const p of MIRRORS) {
  const g = buildCard(p);
  let reflective: THREE.Mesh | null = null;
  g.traverse((o) => {
    if (o instanceof THREE.Mesh && o.userData.keepMaterial) reflective = o;
  });
  check(`${p.glyphKey} has a reflective pane`, !!reflective, "no Reflector in the group");
  if (!reflective) continue;
  const mesh = reflective as THREE.Mesh;
  const mat = mesh.material as THREE.ShaderMaterial;
  // A Reflector renders the scene to its own target each frame and reads it
  // back through this uniform. A MeshStandardMaterial at metalness 1 — the old
  // "mirror" — has no such thing, and reflects only the environment map, which
  // indoors is nothing at all.
  check(`${p.glyphKey} renders a live reflection texture`, !!mat.uniforms?.tDiffuse, "material has no tDiffuse uniform");
  check(`${p.glyphKey} owns a render target to dispose`, typeof (mesh as THREE.Mesh & { dispose?: () => void }).dispose === "function");
  // The flag is what stops ParametricModel cloning the material — a clone is a
  // frozen frame, i.e. a mirror showing one stale image forever.
  check(`${p.glyphKey} is flagged so its material is never cloned`, mesh.userData.keepMaterial === true);

  // …and you can SEE it. Glass recessed to the back of a deep frame sits at
  // the bottom of a well and reads as an empty picture frame from any angle
  // but dead-on, which is exactly how the framed mirror shipped.
  const glassFront = bbox(mesh).max.z;
  const itemFront = bbox(g).max.z;
  check(`${p.glyphKey} glass sits near the front face`, itemFront - glassFront < 0.012, `glass ${(itemFront - glassFront).toFixed(3)}m behind the front`);
}

console.log("\nmounting: mirrors and towels hang, bins stand");
for (const p of [...MIRRORS, ...TOWELS]) {
  check(`${p.glyphKey} is wall-mounted`, p.generator.wallMounted?.(p.spec) === true);
  check(`${p.glyphKey} has no floor-placement elevation`, elevationOf(p.spec) === undefined, `${elevationOf(p.spec)}`);
}
for (const p of BINS) {
  check(`${p.glyphKey} is NOT wall-mounted`, !(p.generator.wallMounted?.(p.spec) ?? false));
  check(`${p.glyphKey} starts on the floor`, elevationOf(p.spec) === undefined);
}

console.log("\nthe bin is a bin: open ones are open, lidded ones are shut");
{
  const open = BINS.find((p) => p.variantId === "open")!;
  const pedal = BINS.find((p) => p.variantId === "pedal")!;
  const firstHitY = (p: CustomPiece) => {
    const g = buildCard(p);
    g.updateMatrixWorld(true);
    const from = new THREE.Vector3(0, p.spec.dims.h + 0.5, 0);
    const hits = new THREE.Raycaster(from, new THREE.Vector3(0, -1, 0)).intersectObject(g, true);
    return hits.length ? hits[0].point.y : NaN;
  };
  const openY = firstHitY(open);
  const pedalY = firstHitY(pedal);
  // Straight down the middle: an open basket lets the ray reach its inner
  // floor; a pedal bin stops it at the lid.
  check("an open basket is hollow to the bottom", openY < open.spec.dims.h * 0.3, `first hit y=${openY.toFixed(3)} of ${open.spec.dims.h}`);
  check("a pedal bin's lid stops the ray", pedalY > pedal.spec.dims.h * 0.7, `first hit y=${pedalY.toFixed(3)} of ${pedal.spec.dims.h}`);
}

console.log("\neach product carries its own size — the reason for the split");
{
  const sizes = new Map(SPLIT.map((p) => [p.glyphKey, p.spec.dims]));
  const ring = sizes.get("towelRail:ring")!;
  const rail = sizes.get("towelRail:rail")!;
  const ladder = sizes.get("towelRail:ladder")!;
  check("a towel ring is much smaller than a rail", ring.w < rail.w * 0.5, `${ring.w} vs ${rail.w}`);
  check("a heated ladder is much taller than a rail", ladder.h > rail.h * 2, `${ladder.h} vs ${rail.h}`);
  const bathBin = sizes.get("bin:pedal")!;
  const kitchenBin = sizes.get("bin:kitchen")!;
  check("a kitchen bin is bigger than a bathroom one", kitchenBin.h > bathBin.h * 1.5, `${kitchenBin.h} vs ${bathBin.h}`);
  const distinct = new Set(SPLIT.map((p) => `${p.spec.dims.w}x${p.spec.dims.d}x${p.spec.dims.h}`));
  check("the twelve cards cover many distinct sizes", distinct.size >= 9, `${distinct.size}`);

  for (const g of [GENERATORS.mirror, GENERATORS.towelRail, GENERATORS.bin]) {
    check(`${g.id} variants are products, not inspector styles`, g.variantIsProduct === true);
    check(`${g.id} variants all carry their own defaults`, g.variants!.every((v) => !!v.defaults));
  }
}

console.log("\nnames and glyphs");
{
  const labels = SPLIT.map((p) => p.label);
  check("no card falls back to '<generator> · <variant>'", labels.every((l) => !l.includes("·")), labels.filter((l) => l.includes("·")).join(", "));
  check("card names are unique", new Set(labels).size === labels.length);
  for (const p of SPLIT) check(`${p.glyphKey} has a glyph`, !!GENERATOR_GLYPH[p.glyphKey]);
  const glyphs = SPLIT.map((p) => GENERATOR_GLYPH[p.glyphKey]);
  check("no two of them share a glyph", new Set(glyphs).size === glyphs.length);
}

console.log("\nthe old catch-all is gone from the pickers, not from old saves");
{
  const cards = ALL_PIECES();
  check("no card places the retired generator", !cards.some((p) => p.generator.id === "bathAccessory"));
  check("it still builds for items already saved with it", countVerts(GENERATORS.bathAccessory.build(sanitizeSpec({ ...GENERATORS.bathAccessory.defaultSpec, finish: "ceramic" }))) > 40);
}

console.log("\nbuttons: one per product, in every room the product appears in");
{
  const reached = (p: CustomPiece, hotspots: typeof BATHROOM_HOTSPOTS) => {
    const text = p.keywords.join(" ").toLowerCase();
    return hotspots.filter((h) => h.keywords.some((k) => text.includes(k)));
  };
  const bathIds = BATHROOM_HOTSPOTS.map((h) => h.id);
  check("bathroom has a Towels button", bathIds.includes("towels"));
  check("bathroom has a Bin button", bathIds.includes("bin"));
  check("the merged 'Towel & bin' button is gone", !bathIds.includes("extras"));
  check("bathroom hotspot ids are unique", new Set(bathIds).size === bathIds.length, bathIds.join(","));

  for (const p of MIRRORS) check(`${p.glyphKey} answers the Mirror button`, reached(p, BATHROOM_HOTSPOTS).some((h) => h.id === "mirror"));
  for (const p of TOWELS) check(`${p.glyphKey} answers the Towels button`, reached(p, BATHROOM_HOTSPOTS).some((h) => h.id === "towels"));
  for (const p of BINS.filter((p) => p.rooms.includes("bathroom")))
    check(`${p.glyphKey} answers the bathroom Bin button`, reached(p, BATHROOM_HOTSPOTS).some((h) => h.id === "bin"));
  for (const p of BINS.filter((p) => p.rooms.includes("kitchen")))
    check(`${p.glyphKey} answers the kitchen Trash button`, reached(p, KITCHEN_HOTSPOTS).some((h) => h.id === "trash"));

  // Buttons have to SEPARATE, not just match: the Mirror button must not
  // surface towels or a bin, which is what the shared generator used to do.
  for (const p of [...TOWELS, ...BINS])
    check(`${p.glyphKey} does NOT answer the Mirror button`, !reached(p, BATHROOM_HOTSPOTS).some((h) => h.id === "mirror"));
  for (const p of MIRRORS)
    check(`${p.glyphKey} does NOT answer the Bin button`, !reached(p, BATHROOM_HOTSPOTS).some((h) => h.id === "bin"));
}

console.log("\nand every card in the catalog still has a button in its rooms");
for (const p of ALL_PIECES()) {
  if (p.rooms.length === 0) continue;
  const text = p.keywords.join(" ").toLowerCase();
  for (const room of p.rooms) {
    const hotspots = room === "bathroom" ? BATHROOM_HOTSPOTS : room === "kitchen" ? KITCHEN_HOTSPOTS : null;
    if (!hotspots) continue; // other rooms are covered by appliances.test.ts
    check(`${p.glyphKey} reachable in ${room}`, hotspots.some((h) => h.keywords.some((k) => text.includes(k))));
  }
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
