// Headless: Phase 3, soft decor. Run: npx tsx src/parametric/softDecor.test.ts
//
// Currently covers RUGS. The rest of the phase (wall art, TV, curtains) lands
// in this same file — the suite is per-phase, not per-generator.
//
// A rug is the first item in the catalog whose whole job is its SURFACE, so
// the checks that matter here are not "is it the right shape" (it's a slab)
// but: does it lie flat, does it stay out of the collision system, and are its
// UVs in metres — because a 0..1 UV set stretches a 1.7m carpet scan across
// the whole rug, which is a doll's-house rug at any size.

import * as THREE from "three";
import { GENERATORS, sanitizeSpec, elevationOf } from "@/parametric";
import { isColorable } from "@/parametric/materials";
import { ALL_PIECES, piecesOf, type CustomPiece } from "@/parametric/pieces";
import type { ParametricSpec } from "@/schema/scene";
import { LIVING_HOTSPOTS } from "@/ui/planDock/LivingScene";
import { BEDROOM_HOTSPOTS } from "@/ui/planDock/BedroomScene";
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

// Same rule as the other suites: finishes built on a canvas — or, new here,
// finishes that DECODE AN IMAGE (the ambientCG carpet scans go through
// THREE.TextureLoader, which needs a document just as much as a canvas does) —
// can't build under tsx. Each card is rebuilt in the first such-free finish
// ITS OWN generator offers; anything else is reset by sanitizeSpec.
const CANVAS_FREE = new Set([
  "steel",
  "ceramic",
  "acrylic",
  "glass-black",
  "counter-white",
  "laminate-matte",
  "laminate-gloss",
  "rug-flat",
]);
const headless = (p: CustomPiece, spec: ParametricSpec): ParametricSpec => {
  if (CANVAS_FREE.has(spec.finish)) return spec;
  const swap = p.generator.finishes.find((f) => CANVAS_FREE.has(f));
  return swap ? sanitizeSpec({ ...spec, finish: swap }) : spec;
};
const buildCard = (p: CustomPiece, patch: Partial<ParametricSpec> = {}) =>
  p.generator.build(headless(p, sanitizeSpec({ ...p.spec, ...patch } as ParametricSpec)));

const RUGS = piecesOf(GENERATORS.rug);

console.log("\nevery rug builds and fits what it says it is");
for (const p of RUGS) {
  const g = buildCard(p);
  const b = bbox(g);
  check(`${p.glyphKey} builds meshes`, countVerts(g) > 8, `${countVerts(g)} verts`);
  check(`${p.glyphKey} has no NaN vertices`, !hasNaN(g));
  check(`${p.glyphKey} width within footprint`, b.max.x - b.min.x <= p.spec.dims.w + 0.03, `${(b.max.x - b.min.x).toFixed(3)} vs ${p.spec.dims.w}`);
  check(`${p.glyphKey} depth within footprint`, b.max.z - b.min.z <= p.spec.dims.d + 0.03, `${(b.max.z - b.min.z).toFixed(3)} vs ${p.spec.dims.d}`);
  check(`${p.glyphKey} sits on its base plane`, near(b.min.y, 0, 0.005), `min.y=${b.min.y.toFixed(4)}`);
  // Flat means flat: a rug that stands 5cm proud is a plinth, and anything
  // above its own declared height is furniture you'd trip on.
  check(`${p.glyphKey} is no taller than its pile`, b.max.y <= p.spec.dims.h + 0.002, `${b.max.y.toFixed(4)} vs ${p.spec.dims.h}`);
  check(`${p.glyphKey} is genuinely thin`, p.spec.dims.h <= 0.05, `${p.spec.dims.h}m`);
}

console.log("\nrugs are walked over, not walked into");
{
  check("the rug generator is noCollide", GENERATORS.rug.noCollide === true);
  for (const p of RUGS) {
    check(`${p.glyphKey} is not wall-mounted`, !(p.generator.wallMounted?.(p.spec) ?? false));
    check(`${p.glyphKey} starts on the floor`, elevationOf(p.spec) === undefined, `${elevationOf(p.spec)}`);
    check(`${p.glyphKey} is not a counter item`, !(p.generator.counterItem?.(p.spec) ?? false));
  }
}

console.log("\nUVs are in metres — the check the whole material rests on");
for (const p of RUGS) {
  const g = buildCard(p);
  // The pile is the mesh carrying a texture-bearing surface: find the widest
  // UV span in the group and compare it to the rug's real size. Authored 0..1,
  // this span is 1 whatever the rug measures; authored in metres it tracks it.
  let maxU = 0;
  let maxV = 0;
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const uv = o.geometry.getAttribute("uv");
    if (!uv) return;
    let lo = Infinity, hi = -Infinity, lo2 = Infinity, hi2 = -Infinity;
    for (let i = 0; i < uv.count; i++) {
      lo = Math.min(lo, uv.getX(i));
      hi = Math.max(hi, uv.getX(i));
      lo2 = Math.min(lo2, uv.getY(i));
      hi2 = Math.max(hi2, uv.getY(i));
    }
    maxU = Math.max(maxU, hi - lo);
    maxV = Math.max(maxV, hi2 - lo2);
  });
  check(`${p.glyphKey} UV spans metres across`, near(maxU, p.spec.dims.w, 0.1), `u span ${maxU.toFixed(3)} vs ${p.spec.dims.w}m`);
  check(`${p.glyphKey} UV spans metres deep`, near(maxV, p.spec.dims.d, 0.1), `v span ${maxV.toFixed(3)} vs ${p.spec.dims.d}m`);
}

console.log("\nthe pile has REAL relief — a few mm of it, in the mesh");
for (const p of RUGS) {
  const g = buildCard(p);
  // Height spread across the top surface. A texture-only rug is dead flat
  // here, which is exactly what reads as printed lino once it crosses the
  // eye line: a normal map has no silhouette and casts no shadow.
  g.updateMatrixWorld(true);
  let lo = Infinity;
  let hi = -Infinity;
  let verts = 0;
  const v = new THREE.Vector3();
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const pos = o.geometry.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      // WORLD space: the backing plane is authored lying in its own XY and
      // rotated into place, so its local y runs the length of the rug.
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (v.y <= 0.0005) continue; // floor ring / backing
      lo = Math.min(lo, v.y);
      hi = Math.max(hi, v.y);
      verts++;
    }
  });
  const relief = hi - lo;
  check(`${p.glyphKey} pile relief is millimetres, not zero`, relief >= 0.001, `${(relief * 1000).toFixed(1)}mm`);
  check(`${p.glyphKey} relief stays within the declared height`, relief <= p.spec.dims.h, `${(relief * 1000).toFixed(1)}mm of ${(p.spec.dims.h * 1000).toFixed(0)}mm`);
  // Enough vertices to carry cm-scale bumps, few enough to stay a rug.
  check(`${p.glyphKey} is subdivided but not absurd`, verts > 400 && verts < 40000, `${verts} verts`);
}

console.log("\nthe edge turns over — no coplanar tape seam, no inward-facing rim");
for (const p of RUGS) {
  const g = buildCard(p);
  const b = bbox(g);
  // A skirt has to actually reach the floor from the rim…
  let skirt: THREE.Mesh | null = null;
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const ob = bbox(o);
    if (ob.min.y <= 0.002 && ob.max.y > 0.004) skirt = o;
  });
  check(`${p.glyphKey} has a skirt from rim to the base`, !!skirt);
  // …and nothing may lie IN the floor plane. A rug's underside at y=0 is
  // coplanar with the floor mesh, which z-fights into a dashed black line
  // round the whole rim — the artifact this 1.5mm lift exists to kill.
  check(`${p.glyphKey} underside clears the floor plane`, b.min.y >= 0.0008, `min.y=${b.min.y.toFixed(5)}`);
  if (!skirt) continue;
  // …and face OUTWARD. An inward-wound rim disappears at grazing angles,
  // which leaves the same hard line the tape seam drew.
  const mesh = skirt as THREE.Mesh;
  const nrm = mesh.geometry.getAttribute("normal");
  const pos = mesh.geometry.getAttribute("position");
  const cx = (b.max.x + b.min.x) / 2;
  const cz = (b.max.z + b.min.z) / 2;
  let outward = 0;
  let total = 0;
  for (let i = 0; i < pos.count; i++) {
    const rx = pos.getX(i) - cx;
    const rz = pos.getZ(i) - cz;
    const len = Math.hypot(rx, rz);
    if (len < 1e-4) continue;
    total++;
    if ((nrm.getX(i) * rx + nrm.getZ(i) * rz) / len > 0) outward++;
  }
  check(`${p.glyphKey} rim faces outward`, outward === total, `${outward}/${total}`);
}

console.log("\npatterns get their own UV channel, and never tile");
for (const p of RUGS) {
  const g = buildCard(p);
  let ok = true;
  let lo = Infinity;
  let hi = -Infinity;
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const uv1 = o.geometry.getAttribute("uv1");
    // A patterned material samples uv1 on EVERY mesh it is applied to. A mesh
    // without the attribute renders one texel of the medallion stretched
    // across itself, which is how the backing and the chamfer would break.
    if (!uv1) { ok = false; return; }
    for (let i = 0; i < uv1.count; i++) {
      lo = Math.min(lo, uv1.getX(i), uv1.getY(i));
      hi = Math.max(hi, uv1.getX(i), uv1.getY(i));
    }
  });
  check(`${p.glyphKey} carries uv1 on every mesh`, ok);
  check(`${p.glyphKey} uv1 spans 0..1 exactly once`, lo >= -0.02 && hi <= 1.02 && hi - lo > 0.9, `${lo.toFixed(2)}..${hi.toFixed(2)}`);
}

console.log("\npatterned wool keeps its own palette");
{
  const PATTERNED = ["rug-persian", "rug-modern", "rug-jute"];
  for (const f of PATTERNED) {
    check(`${f} is offered as a finish`, GENERATORS.rug.finishes.includes(f));
    // The wheel multiplies the map: a madder-and-indigo Persian tinted sage is
    // one muddy tone, so these opt out the way the photo-wood finishes do.
    check(`${f} ignores the colour wheel`, !isColorable(f));
  }
  const styleCards = RUGS.filter((p) => PATTERNED.includes(p.spec.finish));
  check("three patterned cards ship", styleCards.length === 3, styleCards.map((p) => p.variantId).join(","));
  for (const p of styleCards) {
    // Shape belongs to the product: the jute card is a disc, the other two are
    // rectangles, whatever material anyone re-tunes them to later.
    const b = bbox(buildCard(p));
    const square = Math.abs((b.max.x - b.min.x) - (b.max.z - b.min.z)) < 0.02;
    check(`${p.glyphKey} has the shape its product implies`, p.variantId === "jute" ? square : !square);
  }
}

console.log("\nthe colour wheel reaches the whole rug");
{
  const p = RUGS[0];
  const g = buildCard(p, { color: "#8fa87e" });
  let tinted = 0;
  let meshes = 0;
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    meshes++;
    if (o.userData.tintColor === "#8fa87e") tinted++;
  });
  check("every mesh of a tinted rug carries the tint", tinted === meshes && meshes > 0, `${tinted}/${meshes}`);
}

console.log("\ncards, names and glyphs");
{
  const labels = RUGS.map((p) => p.label);
  check("no card falls back to '<generator> · <variant>'", labels.every((l) => !l.includes("·")), labels.join(", "));
  check("card names are unique", new Set(labels).size === labels.length);
  for (const p of RUGS) check(`${p.glyphKey} has a glyph`, !!GENERATOR_GLYPH[p.glyphKey]);
  const glyphs = RUGS.map((p) => GENERATOR_GLYPH[p.glyphKey]);
  check("no two rugs share a glyph", new Set(glyphs).size === glyphs.length);
  const sizes = new Set(RUGS.map((p) => `${p.spec.dims.w}x${p.spec.dims.d}x${p.spec.dims.h}`));
  check("each rug card carries its own size", sizes.size === RUGS.length, `${sizes.size} of ${RUGS.length}`);
  check("rug variants are products, not inspector styles", GENERATORS.rug.variantIsProduct === true);
  check("every rug variant carries its own defaults", GENERATORS.rug.variants!.every((v) => !!v.defaults));
  // The suite itself has to be able to build every card, which means the
  // generator must offer at least one finish that needs no DOM.
  check("the rug generator offers a canvas-free finish", GENERATORS.rug.finishes.some((f) => CANVAS_FREE.has(f)));
}

console.log("\nbuttons: a rug you can reach through the picture");
{
  const reach = (p: CustomPiece, hotspots: typeof LIVING_HOTSPOTS) => {
    const text = p.keywords.join(" ").toLowerCase();
    return hotspots.filter((h) => h.keywords.some((k) => text.includes(k)));
  };
  for (const [room, hotspots] of [["living", LIVING_HOTSPOTS], ["bedroom", BEDROOM_HOTSPOTS]] as const) {
    check(`${room} has a Rug button`, hotspots.some((h) => h.id === "rug"));
    check(`${room} hotspot ids are unique`, new Set(hotspots.map((h) => h.id)).size === hotspots.length);
    // The decor button used to carry "rug" as a keyword. Two buttons matching
    // the same product is the collision that hid the kitchen bin behind
    // "cabinet" — the rug must answer exactly one.
    for (const p of RUGS) {
      const hit = reach(p, hotspots);
      check(`${p.glyphKey} answers the ${room} Rug button`, hit.some((h) => h.id === "rug"));
      check(`${p.glyphKey} answers ONLY that button in ${room}`, hit.length === 1, hit.map((h) => h.id).join(","));
    }
  }
}

console.log("\nand every card in the catalog still has a button in its rooms");
for (const p of ALL_PIECES()) {
  const text = p.keywords.join(" ").toLowerCase();
  for (const room of p.rooms) {
    const hotspots = room === "living" ? LIVING_HOTSPOTS : room === "bedroom" ? BEDROOM_HOTSPOTS : null;
    if (!hotspots) continue; // other rooms are covered by the Phase 1/2 suites
    check(`${p.glyphKey} reachable in ${room}`, hotspots.some((h) => h.keywords.some((k) => text.includes(k))));
  }
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
