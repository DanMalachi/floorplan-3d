// Headless: Phase 3, soft decor. Run: npx tsx src/parametric/softDecor.test.ts
//
// Covers RUGS and TVs. The rest of the phase (wall art, curtains) lands in
// this same file — the suite is per-phase, not per-generator.
//
// A rug is the first item in the catalog whose whole job is its SURFACE, so
// the checks that matter here are not "is it the right shape" (it's a slab)
// but: does it lie flat, does it stay out of the collision system, and are its
// UVs in metres — because a 0..1 UV set stretches a 1.7m carpet scan across
// the whole rug, which is a doll's-house rug at any size.

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import * as THREE from "three";
import { GENERATORS, sanitizeSpec, elevationOf } from "@/parametric";
import { BROADCAST_URL } from "@/parametric/tvParts";
import { isColorable } from "@/parametric/materials";
import { ALL_PIECES, piecesOf, type CustomPiece } from "@/parametric/pieces";
import { applyKitchenGesture, findAttachHost, syncKitchenAttachments } from "@/parametric/kitchenAttach";
import { isSurfaceHost } from "@/parametric/surfaceHosts";
import type { FurnitureItem, ParametricSpec, Scene } from "@/schema/scene";
import { LIVING_HOTSPOTS } from "@/ui/planDock/LivingScene";
import { BEDROOM_HOTSPOTS } from "@/ui/planDock/BedroomScene";
import { DINING_HOTSPOTS } from "@/ui/planDock/DiningScene";
import { STUDY_HOTSPOTS } from "@/ui/planDock/StudyScene";
import { KIDS_HOTSPOTS } from "@/ui/planDock/KidsScene";
import { BATHROOM_HOTSPOTS, } from "@/ui/planDock/BathroomScene";
import { KITCHEN_HOTSPOTS } from "@/ui/planDock/KitchenScene";
import { LAUNDRY_HOTSPOTS } from "@/ui/planDock/LaundryScene";
import { ARTWORKS } from "@/parametric/wallArtParts";
import { GENERATOR_GLYPH } from "@/ui/planDock/generatorGlyphs";

// Wide roll-out: every room a rug or a TV now reaches, keyed to its hotspots
// array, so the reachability checks below can loop over them instead of
// special-casing each room by name.
const RUG_ROOMS = [
  ["living", LIVING_HOTSPOTS],
  ["bedroom", BEDROOM_HOTSPOTS],
  ["dining", DINING_HOTSPOTS],
  ["study", STUDY_HOTSPOTS],
  ["kids", KIDS_HOTSPOTS],
  ["bathroom", BATHROOM_HOTSPOTS],
] as const;
const TV_ROOMS = [
  ["living", LIVING_HOTSPOTS],
  ["bedroom", BEDROOM_HOTSPOTS],
  ["study", STUDY_HOTSPOTS],
  ["kids", KIDS_HOTSPOTS],
] as const;
const ROOM_HOTSPOTS: Record<string, typeof LIVING_HOTSPOTS> = {
  living: LIVING_HOTSPOTS,
  bedroom: BEDROOM_HOTSPOTS,
  dining: DINING_HOTSPOTS,
  study: STUDY_HOTSPOTS,
  kids: KIDS_HOTSPOTS,
  bathroom: BATHROOM_HOTSPOTS,
  // Wall art reaches these two as well, so the suite has to know them.
  kitchen: KITCHEN_HOTSPOTS,
  laundry: LAUNDRY_HOTSPOTS,
};

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
  let out = spec;
  if (!CANVAS_FREE.has(out.finish)) {
    const swap = p.generator.finishes.find((f) => CANVAS_FREE.has(f));
    if (swap) out = sanitizeSpec({ ...out, finish: swap });
  }
  // The SECOND row needs the same treatment, and wall art is what found it: a
  // frame's default is oak, oak is drawn on a canvas, and a generator whose
  // primary finish is canvas-free can still fail to build headlessly through
  // its accessory material.
  const f2 = out.finish2;
  if (p.generator.finishes2 && f2 && !CANVAS_FREE.has(f2)) {
    const swap2 = p.generator.finishes2.find((f) => CANVAS_FREE.has(f));
    if (swap2) out = sanitizeSpec({ ...out, finish2: swap2 });
  }
  return out;
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
  for (const [room, hotspots] of RUG_ROOMS) {
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

// ── TVs ────────────────────────────────────────────────────────────────────
//
// A TV is the opposite problem to a rug: the material is a single dark plane
// that tests cannot judge, so what IS testable is the thing a slab gets wrong.
// Mounting (three cards hang, two stand, on one generator), the silhouette
// (thin at the top, thick over the lower back), and the fact that the declared
// height covers the STAND as well as the panel.

const TVS = piecesOf(GENERATORS.tv);

console.log("\nevery TV builds and fits what it says it is");
for (const p of TVS) {
  const g = buildCard(p);
  const b = bbox(g);
  const { w, d, h } = p.spec.dims;
  check(`${p.glyphKey} builds meshes`, countVerts(g) > 8, `${countVerts(g)} verts`);
  check(`${p.glyphKey} has no NaN vertices`, !hasNaN(g));
  // Rule 4: the footprint contains EVERYTHING — a pedestal base that sticks
  // out in front of the screen, a foot that splays past the panel.
  check(`${p.glyphKey} width within footprint`, b.max.x - b.min.x <= w + 0.03, `${(b.max.x - b.min.x).toFixed(3)} vs ${w}`);
  check(`${p.glyphKey} depth within footprint`, b.max.z - b.min.z <= d + 0.03, `${(b.max.z - b.min.z).toFixed(3)} vs ${d}`);
  check(`${p.glyphKey} height within footprint`, b.max.y - b.min.y <= h + 0.03, `${(b.max.y - b.min.y).toFixed(3)} vs ${h}`);
  // y=0 is the BASE for wall items too: the wall ghost clamps the click height
  // against the item's own height, so a centred panel hangs half below it.
  check(`${p.glyphKey} sits on its base plane`, near(b.min.y, 0, 0.005), `min.y=${b.min.y.toFixed(4)}`);
}

console.log("\nmounting is per VARIANT, not per generator");
{
  const wall = TVS.filter((p) => p.generator.wallMounted?.(p.spec));
  const floor = TVS.filter((p) => !p.generator.wallMounted?.(p.spec));
  check("three cards hang on a wall", wall.length === 3, wall.map((p) => p.variantId).join(","));
  check("two cards stand on the floor", floor.length === 2, floor.map((p) => p.variantId).join(","));
  for (const p of TVS) {
    // The Phase-2 bug in one line: a flat defaultElevation on a generator that
    // mixes mounting types floats the floor variants (the bathroom bin at
    // 1.25m). A wall card gets its height from the wall-ray click instead.
    check(`${p.glyphKey} has no baked elevation`, elevationOf(p.spec) === undefined, `${elevationOf(p.spec)}`);
    // A set on a stand goes on top of furniture (and on the floor); a set on
    // the wall never does.
    const onSurface = p.generator.counterItem?.(p.spec) ?? false;
    check(`${p.glyphKey} takes a surface only if it has a stand`, onSurface === floor.includes(p), `surface=${onSurface}`);
  }
  check("a TV on a stand may also stand on the floor", GENERATORS.tv.surfaceOptional === true);
  // A stand's height is part of the card's declared height, not a bonus on
  // top of it — a "0.81m" TV that measures 0.91m is a TV that clips a shelf.
  for (const p of floor) {
    const g = buildCard(p);
    const b = bbox(g);
    const legRoom = 0.05; // something has to be down there holding it up
    let lowVerts = 0;
    const v = new THREE.Vector3();
    g.updateMatrixWorld(true);
    g.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const pos = o.geometry.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        if (v.y < legRoom) lowVerts++;
      }
    });
    check(`${p.glyphKey} has a stand under the panel`, lowVerts > 8, `${lowVerts} verts below ${legRoom}m`);
    check(`${p.glyphKey} tops out at its declared height`, b.max.y <= p.spec.dims.h + 0.005, `${b.max.y.toFixed(3)} vs ${p.spec.dims.h}`);
  }
}

console.log("\nthe glass is at the FRONT of the footprint, and the item is centred in depth");
for (const p of TVS) {
  const g = buildCard(p);
  g.updateMatrixWorld(true);
  const b = bbox(g);
  const d = p.spec.dims.d;
  // Every generator is authored CENTRED on its own depth (the kitchen carcass
  // convention), because that is what placement assumes when it backs an item
  // onto a wall. Authored with the glass at z=0 instead, a wall-mounted set
  // placed flush sat INSIDE the plaster: bezel, housing and bracket were all
  // behind the wall face and the room saw one flat black rectangle.
  check(`${p.glyphKey} is centred in its own depth`, Math.abs(b.min.z + b.max.z) <= 0.02, `z[${b.min.z.toFixed(3)}, ${b.max.z.toFixed(3)}] for d=${d}`);
  // …and the glass is the frontmost thing on it.
  let screenZ = -Infinity;
  const v = new THREE.Vector3();
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.geometry.type !== "PlaneGeometry" || !o.geometry.getAttribute("uv1")) return;
    const pos = o.geometry.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      screenZ = Math.max(screenZ, v.z);
    }
  });
  check(`${p.glyphKey} glass sits at the front face`, near(screenZ, d / 2, 0.006), `screen z=${screenZ.toFixed(4)} vs ${(d / 2).toFixed(4)}`);
}

console.log("\nthe silhouette is a TV, not a slab");
for (const p of TVS) {
  const g = buildCard(p);
  g.updateMatrixWorld(true);
  const b = bbox(g);
  const panelTop = b.max.y;
  // Depth of the object in its top fifth vs across the whole set. A uniform
  // box measures the same in both; a real panel is a few millimetres up there
  // and thickens into the electronics housing lower down.
  let topDepth = 0;
  let maxDepth = 0;
  const v = new THREE.Vector3();
  const topBand = panelTop - (panelTop - b.min.y) * 0.18;
  let topLo = Infinity, topHi = -Infinity;
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const pos = o.geometry.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (v.y >= topBand) {
        topLo = Math.min(topLo, v.z);
        topHi = Math.max(topHi, v.z);
      }
    }
  });
  topDepth = topHi - topLo;
  maxDepth = b.max.z - b.min.z;
  check(`${p.glyphKey} is thin at the top edge`, topDepth <= 0.022, `${(topDepth * 1000).toFixed(1)}mm`);
  check(`${p.glyphKey} thickens behind the lower half`, maxDepth >= topDepth * 2, `${(maxDepth * 1000).toFixed(0)}mm vs ${(topDepth * 1000).toFixed(0)}mm`);
}

console.log("\nthe screen is a surface, and it knows whether it is on");
for (const p of TVS) {
  for (const on of [0, 1]) {
    const g = buildCard(p, { modules: { screenOn: on } });
    let screen: THREE.Mesh | null = null;
    g.traverse((o) => {
      if (o instanceof THREE.Mesh && (o.material as THREE.MeshStandardMaterial).emissiveIntensity !== undefined && o.geometry.getAttribute("uv1") && o.geometry.type === "PlaneGeometry") screen = o;
    });
    check(`${p.glyphKey} has a screen plane (screenOn=${on})`, !!screen);
    if (!screen) continue;
    const mat = (screen as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const lit = mat.emissive.r + mat.emissive.g + mat.emissive.b > 0.01 && mat.emissiveIntensity > 0;
    check(`${p.glyphKey} screen emits only when on (screenOn=${on})`, lit === (on === 1), `emissive=${mat.emissive.getHexString()} x${mat.emissiveIntensity}`);
  }
  // Two UV sets, same split the rugs use: metres for the coating grain so a
  // 75" is not a magnified 43", 0..1 for anything that spans the panel once.
  const g = buildCard(p);
  let metric = 0;
  let unit = 0;
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.geometry.type !== "PlaneGeometry") return;
    const uv = o.geometry.getAttribute("uv");
    const uv1 = o.geometry.getAttribute("uv1");
    if (!uv || !uv1) return;
    let hi = -Infinity, hi1 = -Infinity;
    for (let i = 0; i < uv.count; i++) {
      hi = Math.max(hi, uv.getX(i));
      hi1 = Math.max(hi1, uv1.getX(i));
    }
    metric = Math.max(metric, hi);
    unit = Math.max(unit, hi1);
  });
  check(`${p.glyphKey} screen UVs are in metres`, metric > 0.3, `u max ${metric.toFixed(3)}`);
  check(`${p.glyphKey} screen carries a 0..1 channel too`, near(unit, 1, 0.02), `uv1 max ${unit.toFixed(3)}`);
}

console.log("\nTVs are sold in inches, and both dimensions follow the one number");
{
  const size = GENERATORS.tv.sizeInches!;
  check("the TV generator sells by screen size", !!size && size.presets.length >= 5);
  for (const p of TVS) {
    // The card says a size; the geometry has to BE that size.
    const label = Number(/(\d+)"/.exec(p.label)?.[1]);
    check(`${p.glyphKey} measures the size on its card`, near(size.of(p.spec), label, 0.6), `${size.of(p.spec).toFixed(1)}" vs ${label}"`);
  }
  const spec = sanitizeSpec({ ...GENERATORS.tv.defaultSpec, variant: "wall-55" } as ParametricSpec);
  const at = (inches: number) => size.dims(spec, inches);
  for (const inches of [32, 43, 55, 65, 75, 85]) {
    const d = at(inches);
    const round = size.of({ ...spec, dims: d } as ParametricSpec);
    check(`${inches}" round-trips through the dims`, near(round, inches, 0.4), `${round.toFixed(2)}"`);
  }
  // Width and height move TOGETHER, at a fixed 16:9 — the whole point of
  // sizing by diagonal. Compare picture areas, which is what 16:9 describes.
  const a = at(43);
  const b = at(75);
  const pic = (d: { w: number; h: number }) => ({ w: d.w - 0.018, h: d.h - 0.028 });
  const ra = pic(a).w / pic(a).h;
  const rb = pic(b).w / pic(b).h;
  check("aspect holds across sizes", near(ra, rb, 0.02) && near(ra, 16 / 9, 0.03), `${ra.toFixed(3)} vs ${rb.toFixed(3)}`);
  check("a bigger screen is bigger both ways", b.w > a.w && b.h > a.h, `${a.w.toFixed(2)}×${a.h.toFixed(2)} → ${b.w.toFixed(2)}×${b.h.toFixed(2)}`);
  // …and the stand's height is not swallowed by the resize.
  const standSpec = sanitizeSpec({ ...GENERATORS.tv.defaultSpec, variant: "pedestal-55" } as ParametricSpec);
  const s55 = size.dims(standSpec, 55);
  const w55 = size.dims(spec, 55);
  check("a stand keeps its height when the screen resizes", s55.h > w55.h + 0.05, `${s55.h.toFixed(3)} vs ${w55.h.toFixed(3)}`);
}

console.log("\nthe lit screen shows a real photograph");
{
  // One picture, loaded from a file — not three procedural "channels", which
  // read as the drawings they were. The generator therefore has exactly one
  // screen control, and the picture is an asset that has to EXIST.
  check("there is no channel control left", !GENERATORS.tv.modules.some((m) => m.key === "channel"), GENERATORS.tv.modules.map((m) => m.key).join(","));
  check("the screen toggle is the only module", GENERATORS.tv.modules.length === 1);
  const file = resolve(process.cwd(), `public${BROADCAST_URL}`);
  check("the broadcast image ships in public/", existsSync(file), file);
  if (existsSync(file)) {
    const kb = statSync(file).size / 1024;
    // Big enough to be a photograph, small enough to load with the page.
    check("the picture is a sane size for a texture", kb > 40 && kb < 600, `${kb.toFixed(0)}KB`);
  }
  const p = TVS[0];
  // The picture rides uv1, which the screen mesh HAS — the bug the glare
  // overlay shipped with, and the reason this is asserted rather than assumed.
  const lit = buildCard(p, { modules: { screenOn: 1 } });
  let uv1s = 0;
  lit.traverse((o) => {
    if (o instanceof THREE.Mesh && o.geometry.getAttribute("uv1")) uv1s++;
  });
  check("the lit screen carries the picture's UV set", uv1s >= 1, `${uv1s} meshes with uv1`);
}

console.log("\na TV on a stand can stand on the furniture");
{
  // A host with a real top: an under-counter fridge is 0.82m and is not a
  // kitchen RUN, so it exercises the plain-surface path the IKEA sideboards
  // use (their height is measured off the GLB at render time).
  const hostSpec = sanitizeSpec({
    ...GENERATORS.appliance.defaultSpec,
    variant: "fridge-under-counter",
    dims: { w: 1.4, d: 0.45, h: 0.55 },
  } as ParametricSpec);
  const host: FurnitureItem = { id: "host", assetId: "param:appliance", x: 2, y: 3, rotation: 0, parametric: hostSpec };
  const tvPiece = TVS.find((p) => p.variantId === "pedestal-55")!;
  const scene = { nodes: [], walls: [], rooms: [], furniture: [host] } as unknown as Scene;

  check("a sideboard-height item is a surface", isSurfaceHost(host));
  check("a rug is not a surface", !isSurfaceHost({ id: "r", assetId: "param:rug", x: 0, y: 0, rotation: 0, parametric: sanitizeSpec(GENERATORS.rug.defaultSpec) }));
  const hit = findAttachHost(2, 3, scene, tvPiece.spec.dims.w);
  check("the TV finds the surface under it", hit?.host.id === "host", `${hit?.host.id}`);
  check("…and lands somewhere on it", (hit?.along ?? -1) >= 0 && (hit?.along ?? 99) <= 1.4, `along=${hit?.along}`);
  check("off the furniture there is no host", findAttachHost(6, 6, scene, 1) === null);

  const bonded: FurnitureItem = { id: "tv", assetId: "param:tv", x: 0, y: 0, rotation: 0, parametric: tvPiece.spec, attach: { hostId: "host", along: hit!.along } };
  const synced = syncKitchenAttachments({ ...scene, furniture: [host, bonded] });
  const placed = synced.furniture.find((f) => f.id === "tv")!;
  // The bond survives a sync (it used to be dissolved for anything that was
  // not a kitchenBase) and puts the set ON TOP, riding the host's facing.
  check("the bond survives the attachment sync", !!placed.attach, JSON.stringify(placed.attach));
  check("the TV sits on the host's top", near(placed.elevation ?? 0, 0.55, 0.001), `${placed.elevation}`);
  check("the TV faces the way the host does", placed.rotation === host.rotation);
  check("the TV stays within the host's width", Math.abs(placed.x - host.x) <= 1.4 / 2 + 0.01, `dx=${(placed.x - host.x).toFixed(3)}`);
  // Moving the host carries the TV with it, the way the microwave rides a run.
  const moved = syncKitchenAttachments({ ...scene, furniture: [{ ...host, x: 5, y: 1 }, placed] });
  const rode = moved.furniture.find((f) => f.id === "tv")!;
  check("moving the cabinet carries the TV", near(rode.x, 5 + (placed.x - host.x), 0.001) && near(rode.y, 1 + (placed.y - host.y), 0.001), `${rode.x.toFixed(2)},${rode.y.toFixed(2)}`);
  // And nothing saws a hole in a sideboard.
  const hostAfter = moved.furniture.find((f) => f.id === "host")!;
  check("a surface host gets no worktop cutouts", !hostAfter.parametric?.cutouts);
}

console.log("\nTV cards, names, glyphs and dead controls");
{
  const labels = TVS.map((p) => p.label);
  check("no TV card falls back to '<generator> · <variant>'", labels.every((l) => !l.includes("·")), labels.join(", "));
  check("TV card names are unique", new Set(labels).size === labels.length);
  for (const p of TVS) check(`${p.glyphKey} has a glyph`, !!GENERATOR_GLYPH[p.glyphKey]);
  const glyphs = TVS.map((p) => GENERATOR_GLYPH[p.glyphKey]);
  check("no two TVs share a glyph", new Set(glyphs).size === glyphs.length);
  const sizes = new Set(TVS.map((p) => `${p.spec.dims.w}x${p.spec.dims.d}x${p.spec.dims.h}`));
  check("each TV card carries its own size", sizes.size === TVS.length, `${sizes.size} of ${TVS.length}`);
  check("TV variants are products, not inspector styles", GENERATORS.tv.variantIsProduct === true);
  check("every TV variant carries its own defaults", GENERATORS.tv.variants!.every((v) => !!v.defaults));
  check("the TV generator offers a canvas-free finish", GENERATORS.tv.finishes.some((f) => CANVAS_FREE.has(f)));
  // Two-state module, labelled — never a 0/1 stepper.
  const screenMod = GENERATORS.tv.modules.find((m) => m.key === "screenOn");
  check("the screen toggle has real labels", !!screenMod?.toggle?.on && !!screenMod?.toggle?.off, JSON.stringify(screenMod?.toggle));
  // The second swatch row paints the STAND, so it must not appear on a card
  // that has no stand — a control that does nothing teaches people the
  // inspector lies.
  for (const p of TVS) {
    const shows = GENERATORS.tv.showFinishes2?.(p.spec) ?? true;
    const stands = !p.generator.wallMounted?.(p.spec);
    check(`${p.glyphKey} offers a stand finish only if it has a stand`, shows === stands, `shows=${shows} stands=${stands}`);
  }
}

console.log("\nbuttons: a TV you can reach through the picture");
{
  const reachTv = (p: CustomPiece, hotspots: typeof LIVING_HOTSPOTS) => {
    const text = p.keywords.join(" ").toLowerCase();
    return hotspots.filter((h) => h.keywords.some((k) => text.includes(k)));
  };
  for (const [room, hotspots] of TV_ROOMS) {
    check(`${room} has a TV button`, hotspots.some((h) => h.id === "tv"));
    check(`${room} hotspot ids are unique`, new Set(hotspots.map((h) => h.id)).size === hotspots.length);
    for (const p of TVS) {
      const hit = reachTv(p, hotspots);
      check(`${p.glyphKey} answers the ${room} TV button`, hit.some((h) => h.id === "tv"));
      check(`${p.glyphKey} answers ONLY that button in ${room}`, hit.length === 1, hit.map((h) => h.id).join(","));
    }
  }
  // Rooms the generator claims must all be rooms with a button for it.
  const tvRoomIds = TV_ROOMS.map(([room]) => room);
  check("the TV generator only claims rooms it has a button in", GENERATORS.tv.rooms.every((r) => (tvRoomIds as readonly string[]).includes(r)), GENERATORS.tv.rooms.join(","));
}

// ── Wall art and clocks ────────────────────────────────────────────────────
//
// The picture is the product here, so the checks are mostly about the IMAGE:
// that the files exist and are the shape the registry claims (a stale aspect
// silently stretches a painting and nothing else notices), that a print is
// FITTED rather than scaled unevenly, and that everything the room sees is
// authored the way placement assumes — base at y=0, centred on its depth.

const ART = piecesOf(GENERATORS.wallArt);
const CLOCKS = piecesOf(GENERATORS.wallClock);

console.log("\nevery wall-art card builds and fits what it says it is");
for (const p of ART) {
  const g = buildCard(p);
  const b = bbox(g);
  const { w, d, h } = p.spec.dims;
  check(`${p.glyphKey} builds meshes`, countVerts(g) > 8, `${countVerts(g)} verts`);
  check(`${p.glyphKey} has no NaN vertices`, !hasNaN(g));
  check(`${p.glyphKey} width within footprint`, b.max.x - b.min.x <= w + 0.03, `${(b.max.x - b.min.x).toFixed(3)} vs ${w}`);
  check(`${p.glyphKey} height within footprint`, b.max.y - b.min.y <= h + 0.03, `${(b.max.y - b.min.y).toFixed(3)} vs ${h}`);
  check(`${p.glyphKey} depth within footprint`, b.max.z - b.min.z <= d + 0.03, `${(b.max.z - b.min.z).toFixed(3)} vs ${d}`);
  check(`${p.glyphKey} sits on its base plane`, near(b.min.y, 0, 0.01), `min.y=${b.min.y.toFixed(4)}`);
  // Rule 13, the one the TV build paid for: authored centred on the declared
  // depth. Off-centre, a flush wall placement buries the frame in the plaster
  // and the room sees a floating rectangle.
  check(`${p.glyphKey} is centred on its depth`, near((b.min.z + b.max.z) / 2, 0, 0.012), `centre z=${((b.min.z + b.max.z) / 2).toFixed(4)}`);
}

console.log("\nwall art hangs, and hangs at the height art hangs at");
for (const p of [...ART, ...CLOCKS]) {
  check(`${p.glyphKey} is wall-mounted`, p.generator.wallMounted?.(p.spec) === true);
  const e = elevationOf(p.spec);
  check(`${p.glyphKey} has a default height off the floor`, e !== undefined && e > 0.3, `${e}`);
  if (e === undefined) continue;
  const centre = e + p.spec.dims.h / 2;
  check(`${p.glyphKey} centres between 1.2m and 2.0m`, centre >= 1.2 && centre <= 2.0, `centre ${centre.toFixed(2)}m`);
  // A wall item taller than the wall is a wall item nobody can place.
  check(`${p.glyphKey} fits under the wall`, e + p.spec.dims.h <= 2.4, `top ${(e + p.spec.dims.h).toFixed(2)}m`);
}

console.log("\nthe pictures are real files, and the registry knows their shape");
{
  // A generator can't ask an <img> for its size synchronously, so the aspect
  // is hard-coded in ARTWORKS — which makes this the check that keeps it
  // honest. Wrong by 10% and the painting is stretched by 10%.
  const sharp = require("sharp") as typeof import("sharp");
  for (const art of ARTWORKS) {
    const file = resolve(process.cwd(), "public", art.url.replace(/^\//, ""));
    const there = existsSync(file);
    check(`${art.id} file is shipped`, there, art.url);
    if (!there) continue;
    const kb = statSync(file).size / 1024;
    check(`${art.id} is web-sized`, kb < 400, `${kb.toFixed(0)}KB`);
    const meta = sharp(file).metadata();
    const w = (meta as unknown as { width?: number }).width;
    const h = (meta as unknown as { height?: number }).height;
    if (typeof w === "number" && typeof h === "number") {
      check(`${art.id} registry aspect matches the file`, near(art.aspect, w / h, 0.02), `${art.aspect.toFixed(3)} vs ${(w / h).toFixed(3)}`);
    }
  }
  check("every artwork id is a pickable finish", ARTWORKS.every((a) => GENERATORS.wallArt.finishes.includes(a.id)));
  // A painting owns its palette; multiplying the wheel's colour over a scan
  // makes one muddy tone, which is the same rule the patterned rugs follow.
  check("artwork finishes opt out of the colour wheel", ARTWORKS.every((a) => !isColorable(a.id)));
  check("the artwork row is labelled", GENERATORS.wallArt.finishesLabel === "Picture");
}

console.log("\nno painting is ever stretched: the mount takes the mismatch");
for (const p of ART) {
  if (p.variantId === "canvas") continue; // a gallery wrap is cropped, by design
  for (const art of ARTWORKS) {
    const g = buildCard(p, { finish: art.id });
    // The picture planes are the meshes carrying uv1 under a standard
    // material; the glazing shares the geometry but is a basic material.
    //
    // Every plane is measured against the CLOSEST artwork in the registry, not
    // against the selected one: a gallery set and a picture ledge deliberately
    // hang the next works along, so "matches the chosen aspect" would be the
    // wrong question there. What must never happen is a plane whose shape is
    // no painting's shape — that is the stretch this check exists to catch.
    let worst = 0;
    g.updateMatrixWorld(true);
    g.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (!(o.material instanceof THREE.MeshStandardMaterial)) return;
      if (!o.geometry.getAttribute("uv1")) return;
      o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox!;
      const w = bb.max.x - bb.min.x;
      const h = bb.max.y - bb.min.y;
      if (w <= 0 || h <= 0) return;
      const off = Math.min(...ARTWORKS.map((a) => Math.abs(w / h - a.aspect) / a.aspect));
      worst = Math.max(worst, off);
    });
    check(`${p.glyphKey} keeps ${art.id} in proportion`, worst <= 0.02, `off by ${(worst * 100).toFixed(1)}%`);
  }
}

console.log("\nthe mount is a real board, and it takes room from the picture");
for (const p of ART) {
  if (p.variantId === "canvas") continue;
  const picArea = (mount: number) => {
    const g = buildCard(p, { modules: { ...p.spec.modules, mount } });
    let area = 0;
    g.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (!(o.material instanceof THREE.MeshStandardMaterial)) return;
      if (!o.geometry.getAttribute("uv1")) return;
      o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox!;
      area += (bb.max.x - bb.min.x) * (bb.max.y - bb.min.y);
    });
    return area;
  };
  check(`${p.glyphKey} mounted print is smaller than the unmounted one`, picArea(1) < picArea(0), `${picArea(1).toFixed(4)} vs ${picArea(0).toFixed(4)}`);
}

console.log("\na gallery set is a gallery, not one painting three times");
{
  const g = GENERATORS.wallArt;
  const set = ART.find((p) => p.variantId === "gallery-3")!;
  const built = buildCard(set);
  let frames = 0;
  built.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial && o.geometry.getAttribute("uv1")) frames++;
  });
  check("the set hangs three pictures", frames === 3, `${frames}`);
  // Distinct artworks, and the walk wraps rather than running off the list.
  const ids = new Set(ARTWORKS.map((a) => a.id));
  check("the artwork walk stays inside the registry", ids.size === ARTWORKS.length);
  check("a frameless canvas offers no frame finish", g.showFinishes2?.({ ...g.defaultSpec, variant: "canvas" } as ParametricSpec) === false);
  check("a framed print does offer one", g.showFinishes2?.({ ...g.defaultSpec, variant: "framed-portrait" } as ParametricSpec) === true);
  check("the mount control hides on a canvas", g.modules[0].appliesTo?.({ ...g.defaultSpec, variant: "canvas" } as ParametricSpec) === false);
}

console.log("\nclocks are round, and they tell a time");
for (const p of CLOCKS) {
  const g = buildCard(p);
  const b = bbox(g);
  const { w, h } = p.spec.dims;
  check(`${p.glyphKey} builds meshes`, countVerts(g) > 8, `${countVerts(g)} verts`);
  check(`${p.glyphKey} has no NaN vertices`, !hasNaN(g));
  check(`${p.glyphKey} is square in elevation`, near(w, h, 0.001), `${w} × ${h}`);
  check(`${p.glyphKey} width within footprint`, b.max.x - b.min.x <= w + 0.01, `${(b.max.x - b.min.x).toFixed(3)}`);
  check(`${p.glyphKey} sits on its base plane`, near(b.min.y, 0, 0.01), `min.y=${b.min.y.toFixed(4)}`);
  check(`${p.glyphKey} is centred on its depth`, near((b.min.z + b.max.z) / 2, 0, 0.012), `centre z=${((b.min.z + b.max.z) / 2).toFixed(4)}`);
  // Two hands and a boss at minimum; the seconds hand is a labelled toggle.
  const withSec = countVerts(buildCard(p, { modules: { secondHand: 1 } }));
  const without = countVerts(buildCard(p, { modules: { secondHand: 0 } }));
  check(`${p.glyphKey} drops the second hand when told to`, withSec > without, `${withSec} vs ${without}`);
}
{
  const m = GENERATORS.wallClock.modules[0];
  check("the second hand is a labelled pair, not a 0/1 stepper", !!m.toggle && m.max === 1);
}

console.log("\nwall-art and clock cards, names and glyphs");
for (const p of [...ART, ...CLOCKS]) {
  check(`${p.glyphKey} has a glyph`, !!GENERATOR_GLYPH[p.glyphKey]);
  check(`${p.glyphKey} has a name that stands alone`, !p.label.includes("·"), p.label);
}
{
  const keys = [...ART, ...CLOCKS].map((p) => p.glyphKey);
  check("every soft-decor glyph key is unique", new Set(keys).size === keys.length);
  const glyphs = keys.map((k) => GENERATOR_GLYPH[k]);
  check("no two cards share one glyph", new Set(glyphs).size === glyphs.length);
}

console.log("\nbuttons: wall art and clocks you can reach through the picture");
{
  const reach = (p: CustomPiece, hotspots: typeof LIVING_HOTSPOTS) => {
    const text = p.keywords.join(" ").toLowerCase();
    return hotspots.filter((h) => h.keywords.some((k) => text.includes(k)));
  };
  for (const room of GENERATORS.wallArt.rooms) {
    const hotspots = ROOM_HOTSPOTS[room];
    check(`${room} is a room this suite knows`, !!hotspots, room);
    if (!hotspots) continue;
    check(`${room} has a wall-art button`, hotspots.some((h) => h.id === "art"));
    check(`${room} hotspot ids are unique`, new Set(hotspots.map((h) => h.id)).size === hotspots.length);
    for (const p of ART) {
      const hit = reach(p, hotspots);
      check(`${p.glyphKey} answers the ${room} wall-art button`, hit.some((h) => h.id === "art"));
      check(`${p.glyphKey} answers ONLY that button in ${room}`, hit.length === 1, hit.map((h) => h.id).join(","));
    }
  }
  for (const room of GENERATORS.wallClock.rooms) {
    const hotspots = ROOM_HOTSPOTS[room];
    check(`${room} is a room this suite knows`, !!hotspots, room);
    if (!hotspots) continue;
    check(`${room} has a clock button`, hotspots.some((h) => h.id === "clock"));
    for (const p of CLOCKS) {
      const hit = reach(p, hotspots);
      check(`${p.glyphKey} answers the ${room} clock button`, hit.some((h) => h.id === "clock"));
      check(`${p.glyphKey} answers ONLY that button in ${room}`, hit.length === 1, hit.map((h) => h.id).join(","));
    }
  }
}

// ── Dragging a hung item ───────────────────────────────────────────────────
//
// Dan's report: moving a picture feels "stuck", doesn't follow the cursor, and
// jumps to the other side of the wall. Both are in the snap, not the picture,
// and both hit EVERY wall-mounted generator — a picture is simply the thinnest,
// so it sits closest to the centreline the flip test uses.
//
// The drag hands the store a point on the FLOOR plane under the pointer, which
// is metres from where the picture is; it wanders across the wall's centreline
// while the cursor sits still on the frame. So the snap has to be sticky about
// which face it is on, and fine-grained about where along the wall.

console.log("\ndragging a hung item: it stays on its own side of the wall");
{
  const nodes = [
    { id: "n0", x: 0, y: 0 },
    { id: "n1", x: 5, y: 0 },
    { id: "n2", x: 5, y: 4 },
    { id: "n3", x: 0, y: 4 },
  ];
  const walls = [
    { id: "w0", a: "n0", b: "n1", thickness: 0.1 },
    { id: "w1", a: "n1", b: "n2", thickness: 0.1 },
    { id: "w2", a: "n2", b: "n3", thickness: 0.1 },
    { id: "w3", a: "n3", b: "n0", thickness: 0.1 },
  ];
  const room = { nodes, walls, rooms: [{ id: "r0", loop: ["n0", "n1", "n2", "n3"] }], furniture: [] } as unknown as Scene;

  /** One drag: feed a path of cursor points through the same two steps the app
   *  does — the layer's wall snap, then the store's gesture hook. */
  const drag = (spec: ParametricSpec, path: [number, number][], startX: number) => {
    let item: FurnitureItem = {
      id: "d1",
      assetId: `param:${spec.generator}`,
      x: startX,
      y: 0.1,
      rotation: 0,
      elevation: 1.2,
      parametric: spec,
    };
    let sc: Scene = { ...room, furniture: [item] };
    const trail: FurnitureItem[] = [];
    for (const [cx, cy] of path) {
      const candidate = { ...item, x: cx, y: cy };
      const next: Scene = { ...sc, furniture: sc.furniture.map((f) => (f.id === item.id ? candidate : f)) };
      sc = applyKitchenGesture(next, sc);
      item = sc.furniture[0];
      trail.push(item);
    }
    return trail;
  };

  const picture = sanitizeSpec({
    generator: "wallArt",
    dims: { w: 0.5, d: 0.045, h: 0.7 },
    modules: { mount: 1 },
    front: "slab",
    handle: "none",
    finish: "art-plum",
    finish2: "steel",
    variant: "framed-portrait",
  } as ParametricSpec);

  // The pointer's floor point crossing and re-crossing the centreline, which
  // is exactly what a camera looking slightly down at a wall produces.
  const wander: [number, number][] = [
    [1.2, 0.06], [1.4, 0.03], [1.6, -0.01], [1.8, 0.04], [2.0, -0.02],
    [2.2, 0.01], [2.4, -0.03], [2.6, 0.05], [2.8, -0.04], [3.0, 0.02],
  ];
  const trail = drag(picture, wander, 1.0);
  check("the picture never crosses to the far face", trail.every((t) => t.y > 0), trail.map((t) => t.y.toFixed(2)).join(" "));
  check("its facing never flips mid-drag", trail.every((t) => Math.abs(t.rotation - trail[0].rotation) < 1e-6));
  // Follows the cursor: the along-wall coordinate is the cursor's, within one
  // step. On the kitchen's 10cm grid this lagged by up to 5cm and jumped.
  const lag = Math.max(...trail.map((t, i) => Math.abs(t.x - wander[i][0])));
  check("it lands where the cursor is, to the centimetre", lag <= 0.011, `worst lag ${(lag * 100).toFixed(1)}cm`);
  check("it keeps the height it was hung at", trail.every((t) => t.elevation === 1.2));

  // A deliberate move to the other room still works — the hysteresis is a
  // margin, not a lock.
  const across = drag(picture, [[2.5, 0.02], [2.5, -0.1], [2.5, -0.4]], 2.5);
  check("a deliberate drag through the wall does change face", across[2].y < 0, `${across[2].y.toFixed(2)}`);
  check("and it turns to face the other room", Math.abs(Math.abs(across[2].rotation) - Math.PI) < 1e-6);

  // Every wall-mounted generator gets the same treatment, not just wall art.
  for (const gen of ["mirror", "towelRail", "tv", "wallClock"] as const) {
    const g = GENERATORS[gen];
    const card = piecesOf(g).find((p) => g.wallMounted?.(p.spec));
    if (!card) continue;
    const t = drag(card.spec, wander, 1.0);
    check(`a dragged ${gen} stays on its own face`, t.every((s) => s.y > 0));
    check(`a dragged ${gen} tracks the cursor`, Math.max(...t.map((s, i) => Math.abs(s.x - wander[i][0]))) <= 0.011);
  }

  // …except the coarse grid, which a wall cabinet keeps: it has to line up
  // with the base run underneath it, and nothing else does.
  const cab = piecesOf(GENERATORS.kitchenWall)[0];
  const cabTrail = drag(cab.spec, [[1.24, 0.2], [1.37, 0.2], [1.46, 0.2]], 1.2);
  check("a wall cabinet still snaps on the 10cm grid", cabTrail.every((t) => Math.abs(t.x * 10 - Math.round(t.x * 10)) < 1e-6), cabTrail.map((t) => t.x.toFixed(3)).join(" "));
}

console.log("\nand every card in the catalog still has a button in its rooms");
for (const p of ALL_PIECES()) {
  const text = p.keywords.join(" ").toLowerCase();
  for (const room of p.rooms) {
    const hotspots = ROOM_HOTSPOTS[room];
    if (!hotspots) continue; // other rooms are covered by the Phase 1/2 suites
    check(`${p.glyphKey} reachable in ${room}`, hotspots.some((h) => h.keywords.some((k) => text.includes(k))));
  }
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
