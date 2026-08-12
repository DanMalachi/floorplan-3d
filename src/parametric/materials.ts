"use client";

// Finish materials for parametric furniture. Reuses the existing door-finish
// infrastructure (src/decorate/doorTexture.ts, src/materials/loaderDoors.ts,
// src/materials/loader.ts) instead of writing new wood/paint shaders — same
// convention WallMesh.tsx's door-leaf effect uses.
//
// v2 (color wheel, docs/parametric-furniture.md R1): a finish id now only
// selects the TEXTURE. Free color is a separate `ParametricSpec.color`/
// `color2` field, applied by ParametricModel AFTER cloning each material —
// see `tagTint()` below, which generators call to mark which cloned meshes
// should receive the tint. `painted-white`/`painted-charcoal` and
// `fabric-linen`/`fabric-charcoal`/`fabric-sage` are kept as legacy aliases
// so P1-P4 saved items still render their original baked color exactly;
// new placements use `painted`/`fabric` plus a `color`.

import * as THREE from "three";
import { doorProceduralFinish } from "@/decorate/doorTexture";
import { loadDoorTextures, doorMaterialRoughness } from "@/materials/loaderDoors";
import { loadFloorTextures, floorMaterialRoughness } from "@/materials/loader";
import { makeCanvas, mulberry32, heightToNormal, applyTiling } from "@/decorate/proceduralTexture";

const cache = new Map<string, THREE.MeshStandardMaterial>();

const COLORABLE = new Set([
  "painted",
  "painted-white",
  "painted-charcoal",
  "laminate-matte",
  "laminate-gloss",
  "fabric",
  "fabric-linen",
  "fabric-charcoal",
  "fabric-sage",
  "fabric-boucle",
  "velvet",
  "leather",
  "counter-white",
  "counter-dark",
  "ceramic",
  "acrylic",
  // Rug piles are colorable: the wool photo is a near-neutral scan, so the
  // wheel tints the fibre instead of fighting a baked hue, and shag/flatweave
  // are drawn on a grey base for exactly that reason.
  "rug-wool",
  "rug-wool-navy",
  "rug-shag",
  "rug-flat",
]);

/** Photo-wood and counter-oak finishes ignore the color wheel — they keep
 *  their natural texture color. */
export function isColorable(id: string): boolean {
  return COLORABLE.has(id);
}

/** Tags every mesh in `obj` with the tint ParametricModel applies to its
 *  cloned material after cloning. No-op when the finish isn't colorable or
 *  no color is set — old saved items (no `color` field) render unchanged. */
export function tagTint(obj: THREE.Object3D, finishId: string, color: string | undefined): void {
  if (!color || !isColorable(finishId)) return;
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh) o.userData.tintColor = color;
  });
}

/** Like `tagTint`, but only meshes actually built from `mat` are tinted.
 *  Cabinet generators can tag whole sub-assemblies because everything in them
 *  wears the finish; a fixture can't — a toilet is ceramic AND chrome AND a
 *  dark waste, and tinting the group wholesale turns the tap pink along with
 *  the pan. */
export function tagTintOfMaterial(
  obj: THREE.Object3D,
  finishId: string,
  color: string | undefined,
  mat: THREE.Material,
): void {
  if (!color || !isColorable(finishId)) return;
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material === mat) o.userData.tintColor = color;
  });
}

// --- fabric procedural: fine speckle + a subtle woven grid -----------------
// Neutral gray base (color comes from material.color) so the canvas
// contributes only normal/roughness variation. Parameterized so
// fabric-boucle can rerun the same recipe at a different seed/scale.
interface FabricParams {
  seed: number;
  noiseAmp: number;
  cover: number;
}
const FABRIC_DEFAULT: FabricParams = { seed: 11, noiseAmp: 40, cover: 0.4 };
const FABRIC_BOUCLE: FabricParams = { seed: 23, noiseAmp: 80, cover: 0.25 };

function fabricColorCanvas(p: FabricParams): HTMLCanvasElement {
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  const rnd = mulberry32(p.seed);
  ctx.fillStyle = "rgb(128, 128, 128)";
  ctx.fillRect(0, 0, S, S);
  const img = ctx.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.round(THREE.MathUtils.clamp(128 + (rnd() - 0.5) * p.noiseAmp, 0, 255));
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  ctx.lineWidth = 2;
  for (let x = 0; x < S; x += 4) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, S);
    ctx.stroke();
  }
  for (let y = 0; y < S; y += 4) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(S, y);
    ctx.stroke();
  }
  return c;
}

function fabricRoughnessCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const S = src.width;
  const data = src.getContext("2d")!.getImageData(0, 0, S, S).data;
  const [out, octx] = makeCanvas(S);
  const img = octx.createImageData(S, S);
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 765; // 0..1
    const v = Math.round(THREE.MathUtils.clamp(0.75 + (1 - lum) * 0.2, 0.75, 0.95) * 255);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  return out;
}

const fabricCache = new Map<string, { normalMap: THREE.Texture; roughnessMap: THREE.Texture }>();
function fabricFinish(p: FabricParams = FABRIC_DEFAULT): { normalMap: THREE.Texture; roughnessMap: THREE.Texture } {
  const key = `${p.seed}:${p.noiseAmp}:${p.cover}`;
  let f = fabricCache.get(key);
  if (f) return f;
  const colorCanvas = fabricColorCanvas(p);
  const normalMap = new THREE.CanvasTexture(heightToNormal(colorCanvas, 0.35));
  normalMap.colorSpace = THREE.NoColorSpace;
  applyTiling(normalMap, p.cover);
  const roughnessMap = new THREE.CanvasTexture(fabricRoughnessCanvas(colorCanvas));
  roughnessMap.colorSpace = THREE.NoColorSpace;
  applyTiling(roughnessMap, p.cover);
  f = { normalMap, roughnessMap };
  fabricCache.set(key, f);
  return f;
}

// --- leather procedural: fabric-style base + dark cellular pore outlines ---
let leatherNormalCache: THREE.Texture | null = null;
function leatherNormalMap(): THREE.Texture {
  if (leatherNormalCache) return leatherNormalCache;
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  const rnd = mulberry32(7);
  ctx.fillStyle = "rgb(128, 128, 128)";
  ctx.fillRect(0, 0, S, S);
  const img = ctx.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.round(THREE.MathUtils.clamp(128 + (rnd() - 0.5) * 40, 0, 255));
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.06)";
  ctx.lineWidth = 1;
  for (let k = 0; k < 60; k++) {
    const cx = rnd() * S;
    const cy = rnd() * S;
    const rx = 4 + rnd() * 10;
    const ry = 3 + rnd() * 8;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, rnd() * Math.PI, 0, Math.PI * 2);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(heightToNormal(c, 0.5));
  tex.colorSpace = THREE.NoColorSpace;
  applyTiling(tex, 0.6);
  leatherNormalCache = tex;
  return tex;
}

// --- velvet: the default fabric canvas, baked at half normal strength -----
let velvetNormalCache: THREE.Texture | null = null;
function velvetNormalMap(): THREE.Texture {
  if (velvetNormalCache) return velvetNormalCache;
  const colorCanvas = fabricColorCanvas(FABRIC_DEFAULT);
  const tex = new THREE.CanvasTexture(heightToNormal(colorCanvas, 0.35 * 0.5));
  tex.colorSpace = THREE.NoColorSpace;
  applyTiling(tex, FABRIC_DEFAULT.cover);
  velvetNormalCache = tex;
  return tex;
}

function buildPainted(color: string, kind: "painted-white" | "painted-charcoal" = "painted-white"): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial();
  const finish = doorProceduralFinish(kind);
  m.map = finish.map ?? null;
  m.normalMap = finish.normalMap;
  m.roughnessMap = finish.roughnessMap;
  m.color.set(color);
  m.roughness = 0.78;
  m.metalness = 0;
  return m;
}

function buildOak(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial();
  const finish = doorProceduralFinish("oak");
  m.map = finish.map ?? null;
  m.normalMap = finish.normalMap;
  m.roughnessMap = finish.roughnessMap;
  m.color.set("#ffffff");
  m.roughness = 0.78;
  m.metalness = 0;
  return m;
}

function buildWalnut(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial();
  const tex = loadDoorTextures("walnut");
  m.map = tex?.map ?? null;
  m.normalMap = tex?.normalMap ?? null;
  m.roughnessMap = tex?.roughnessMap ?? null;
  m.aoMap = tex?.aoMap ?? null;
  m.metalnessMap = null;
  m.color.set("#ffffff");
  m.roughness = doorMaterialRoughness("walnut") ?? 0.25;
  m.metalness = 0;
  return m;
}

function buildFloorWood(id: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial();
  const tex = loadFloorTextures(id);
  m.map = tex?.map ?? null;
  m.normalMap = tex?.normalMap ?? null;
  m.roughnessMap = tex?.roughnessMap ?? null;
  m.color.set("#ffffff");
  m.roughness = floorMaterialRoughness(id) ?? 0.6;
  m.metalness = 0;
  return m;
}

// --- rug pile (Phase 3) ----------------------------------------------------
//
// A rug is read almost entirely from its SURFACE — the geometry is a slab, so
// everything that says "wool" instead of "painted board" lives here.
//
// Two things do that work. (1) SHEEN: wool and cut pile are fuzzy, and fuzz
// scatters light forward at grazing angles — the pale halo around the edge of
// a rug where it turns away from you. `MeshPhysicalMaterial.sheen` is exactly
// that lobe, and without it a rug at roughness 1 reads as matte cardboard, no
// matter what the normal map does. (2) A normal map with REAL depth: pile is
// millimetres of relief, so normalScale runs well above the 1.0 that suits a
// painted door.
//
// Wool takes the ambientCG carpet photo (same catalog the floors use, so the
// pile is a real scan at a real physical scale — 1.7m per repeat, and rug UVs
// are authored in metres, so the tiling lands life-size with no per-instance
// texture clone). Shag is procedural: a long-strand canvas, because no floor
// carpet in the catalog is a deep-pile shag and one bought at floor scale
// would tile visibly across a 1.6m rug.

/** Long, tangled strands — the height field a deep cut pile makes. Drawn as
 *  overlapping strokes rather than per-pixel noise: shag reads as STRANDS with
 *  direction and length, and pixel noise at any amplitude reads as sand. */
function shagHeightCanvas(): HTMLCanvasElement {
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  const rnd = mulberry32(31);
  ctx.fillStyle = "rgb(96, 96, 96)";
  ctx.fillRect(0, 0, S, S);
  ctx.lineCap = "round";
  // Two passes: a dense mat of shorter strands, then longer highlights lying
  // over it, so the surface has a top layer and a floor to it.
  for (const pass of [{ n: 4200, len: [4, 10], w: [1.4, 2.6], v: [60, 140] }, { n: 1500, len: [7, 16], w: [1.2, 2.2], v: [155, 225] }]) {
    for (let i = 0; i < pass.n; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const a = rnd() * Math.PI * 2;
      const len = pass.len[0] + rnd() * (pass.len[1] - pass.len[0]);
      const v = Math.round(pass.v[0] + rnd() * (pass.v[1] - pass.v[0]));
      ctx.strokeStyle = `rgb(${v}, ${v}, ${v})`;
      ctx.lineWidth = pass.w[0] + rnd() * (pass.w[1] - pass.w[0]);
      ctx.beginPath();
      ctx.moveTo(x, y);
      // Slight bend: a strand that flops, not a bristle.
      ctx.quadraticCurveTo(
        x + Math.cos(a) * len * 0.5 + (rnd() - 0.5) * 4,
        y + Math.sin(a) * len * 0.5 + (rnd() - 0.5) * 4,
        x + Math.cos(a) * len,
        y + Math.sin(a) * len,
      );
      ctx.stroke();
    }
  }
  return c;
}

/** The strand field again, this time as SHADING rather than relief: light on
 *  the strands that catch the room, dark in the gaps between them.
 *
 *  Relief alone was not enough — a normal map on a flat white surface reads as
 *  moulded icing, because deep pile in life is mostly self-shadowing, and
 *  self-shadowing is exactly what a normal map does not do. The map is greyed,
 *  never coloured, so `material.color` (and the colour wheel behind it) still
 *  owns the hue. */
function shagShadeCanvas(height: HTMLCanvasElement): HTMLCanvasElement {
  const S = height.width;
  const data = height.getContext("2d")!.getImageData(0, 0, S, S).data;
  const [out, octx] = makeCanvas(S);
  const img = octx.createImageData(S, S);
  for (let i = 0; i < data.length; i += 4) {
    // Height 0..1 → 0.5..1.15 shading, clamped. The floor of the range is the
    // gap between tufts; the top is a strand end facing the light.
    const lum = data[i] / 255;
    const v = Math.round(THREE.MathUtils.clamp(0.5 + lum * 0.65, 0, 1) * 255);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  return out;
}

// Metres per repeat. The first pass ran at 0.42 with fat strokes, which put
// single strands at 2cm+ across — the whole rug read as one blown-up photo of
// four tufts. Real shag yarn is 3–6mm wide; at 0.22m per 256px repeat, these
// strokes land at 1.2–2.2mm wide and 6–14mm long, and the SHAPE of the pile
// now comes from the mesh's own relief (see rug.ts) rather than from this map.
const SHAG_COVER = 0.22;
let shagCache: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture } | null = null;
function shagFinish(): { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture } {
  if (shagCache) return shagCache;
  const height = shagHeightCanvas();
  const map = new THREE.CanvasTexture(shagShadeCanvas(height));
  map.colorSpace = THREE.SRGBColorSpace;
  applyTiling(map, SHAG_COVER);
  const normalMap = new THREE.CanvasTexture(heightToNormal(height, 1.4));
  normalMap.colorSpace = THREE.NoColorSpace;
  applyTiling(normalMap, SHAG_COVER);
  const roughnessMap = new THREE.CanvasTexture(fabricRoughnessCanvas(height));
  roughnessMap.colorSpace = THREE.NoColorSpace;
  applyTiling(roughnessMap, SHAG_COVER);
  shagCache = { map, normalMap, roughnessMap };
  return shagCache;
}

/** Scanned carpet pile off the floor catalog (CC0 ambientCG), worn as a rug. */
function buildRugWool(floorId: string, color: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshPhysicalMaterial();
  const tex = loadFloorTextures(floorId);
  m.map = tex?.map ?? null;
  m.normalMap = tex?.normalMap ?? null;
  m.roughnessMap = tex?.roughnessMap ?? null;
  m.normalScale.set(1.6, 1.6); // pile depth, not a painted grain
  m.color.set(color);
  m.roughness = floorMaterialRoughness(floorId) ?? 0.95;
  m.metalness = 0;
  m.sheen = 0.8;
  m.sheenRoughness = 0.75;
  m.sheenColor.set("#ffffff");
  return m;
}

/** Deep cut pile: procedural strands, heavier sheen, no photo. */
function buildRugShag(color: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshPhysicalMaterial();
  const shag = shagFinish();
  m.map = shag.map; // strand shading — see shagShadeCanvas
  m.normalMap = shag.normalMap;
  // Down from 2.2: the mesh now carries the centimetre-scale relief, so this
  // map is only the yarn grain on top of it.
  m.normalScale.set(1.3, 1.3);
  m.roughnessMap = shag.roughnessMap;
  m.color.set(color);
  m.roughness = 1;
  m.metalness = 0;
  // Sheen tinted to the pile, not white: white sheen at full strength over a
  // pale wool blew the whole rug out to a flat sheet of paper.
  m.sheen = 0.6;
  m.sheenRoughness = 0.9;
  m.sheenColor.set(color);
  return m;
}

// --- patterned rugs -------------------------------------------------------
//
// A pattern is not a tiling texture: a Persian medallion sits in the MIDDLE of
// its rug, once, and its border follows the rug's own edge. So these maps are
// authored in 0..1 across the whole rug and ride UV CHANNEL 1, which rug.ts
// writes as a normalised set alongside the metric channel 0. The fibre grain
// stays on channel 0 in metres, so both are right at once: the weave repeats
// every 40cm, the medallion never repeats at all.
//
// None of the pattern finishes is colourable. The colour wheel multiplies the
// whole map, which turns a madder-and-indigo Persian into one muddy tone —
// these carry their own palette the way the photo-wood finishes do.

/** One pattern canvas, drawn portrait (a rug is longer than it is wide).
 *  768×1152 over a 2×3m rug puts one pixel at ~2.6mm, which is knot scale —
 *  the resolution the weave layer below needs to mean anything. */
function patternCanvas(paint: (ctx: CanvasRenderingContext2D, W: number, H: number, rnd: () => number) => void, seed: number): HTMLCanvasElement {
  const W = 768;
  const H = 1152;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  paint(ctx, W, H, mulberry32(seed));
  return c;
}

/**
 * The weave. This is what separates a rug from a printed vinyl mat, and the
 * first pass of these three shipped without it: a pattern painted in flat
 * fills is a PICTURE of a rug, because every real rug's colour is broken up at
 * knot scale — each knot takes dye slightly differently, each weft row sits a
 * fraction lower than the pile around it, and the warp runs as a faint ribbing
 * the whole length of the rug.
 *
 * Applied to a finished pattern canvas, it returns both the modulated colour
 * AND the matching height field, so the bumps land on the same knots as the
 * colour variation — light and pigment agreeing is most of what "woven" looks
 * like. Two pixels per knot (`cell`), so a 2.6mm pixel gives ~5mm knots.
 */
function weaveLayer(src: HTMLCanvasElement, cell = 2, amp = 0.3, seed = 17): { color: HTMLCanvasElement; height: HTMLCanvasElement } {
  const W = src.width;
  const H = src.height;
  const sctx = src.getContext("2d")!;
  const img = sctx.getImageData(0, 0, W, H);
  const [hc, hctx] = makeCanvas(W); // square canvas, resized below
  hc.width = W;
  hc.height = H;
  const hImg = hctx.createImageData(W, H);

  // One random value per knot, drawn once into a lattice so the same knot
  // keeps its dye across colour and height.
  const cw = Math.ceil(W / cell);
  const ch = Math.ceil(H / cell);
  const rnd = mulberry32(seed);
  const knot = new Float32Array(cw * ch);
  for (let i = 0; i < knot.length; i++) knot[i] = rnd();

  for (let y = 0; y < H; y++) {
    const ky = Math.floor(y / cell);
    // Weft: the row where one pass of the horizontal thread crosses. Sits low
    // and shaded — this is the line your eye reads as "rows of knots".
    const weftRow = y % cell === cell - 1;
    for (let x = 0; x < W; x++) {
      const kx = Math.floor(x / cell);
      const k = knot[ky * cw + kx];
      // Warp ribbing: faint vertical corduroy down the length of the rug.
      const warp = x % cell === 0 ? 1.03 : 1;
      let f = (1 + (k - 0.5) * amp) * warp * (weftRow ? 0.86 : 1);
      f = Math.max(0.6, Math.min(1.35, f));
      const i = (y * W + x) * 4;
      img.data[i] = Math.min(255, img.data[i] * f);
      img.data[i + 1] = Math.min(255, img.data[i + 1] * f);
      img.data[i + 2] = Math.min(255, img.data[i + 2] * f);

      const h = Math.max(0, Math.min(255, Math.round(150 + (k - 0.5) * 150 - (weftRow ? 70 : 0))));
      hImg.data[i] = h;
      hImg.data[i + 1] = h;
      hImg.data[i + 2] = h;
      hImg.data[i + 3] = 255;
    }
  }
  sctx.putImageData(img, 0, 0);
  hctx.putImageData(hImg, 0, 0);
  return { color: src, height: hc };
}

/** Roughness from a height field: the tops of the pile catch light, the shaded
 *  gaps between knots stay dead matte. Uniform roughness is the other half of
 *  why a flat pattern reads as print. */
function weaveRoughness(height: HTMLCanvasElement, lo = 0.72, hi = 0.99): HTMLCanvasElement {
  const W = height.width;
  const H = height.height;
  const data = height.getContext("2d")!.getImageData(0, 0, W, H).data;
  const [out, octx] = makeCanvas(W);
  out.width = W;
  out.height = H;
  const img = octx.createImageData(W, H);
  for (let i = 0; i < data.length; i += 4) {
    const t = data[i] / 255;
    const v = Math.round((hi - (hi - lo) * t) * 255);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  return out;
}

/** Abrash: the horizontal banding a hand-dyed field always has, because dye
 *  lots change as the weaver works up the loom. Without it a flat red field
 *  reads as printed vinyl. */
function abrash(ctx: CanvasRenderingContext2D, W: number, H: number, rnd: () => number): void {
  for (let y = 0; y < H; y += 4) {
    ctx.fillStyle = `rgba(0,0,0,${(rnd() * 0.05).toFixed(3)})`;
    ctx.fillRect(0, y, W, 4);
  }
}

function paintPersian(ctx: CanvasRenderingContext2D, W: number, H: number, rnd: () => number): void {
  const RED = "#8d2f26";
  const INDIGO = "#1e3355";
  const CREAM = "#e6d7b8";
  const GOLD = "#c08a3e";

  ctx.fillStyle = RED;
  ctx.fillRect(0, 0, W, H);

  // Border system: guard / main / guard, each inset from the last.
  const band = (inset: number, width: number, fill: string) => {
    ctx.strokeStyle = fill;
    ctx.lineWidth = width;
    ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
  };
  band(10, 20, INDIGO);
  band(26, 8, CREAM);
  band(48, 44, INDIGO);
  band(76, 8, CREAM);

  // Rosettes marching down the main border.
  ctx.fillStyle = GOLD;
  const step = 54;
  for (let t = 48; t < H - 48; t += step) {
    for (const x of [48, W - 48]) {
      ctx.beginPath();
      ctx.arc(x, t, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (let t = 48; t < W - 48; t += step) {
    for (const y of [48, H - 48]) {
      ctx.beginPath();
      ctx.arc(t, y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Field: corner spandrels, then the medallion with its pendants.
  const cx = W / 2;
  const cy = H / 2;
  ctx.fillStyle = INDIGO;
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
    ctx.beginPath();
    ctx.moveTo(cx + sx * (W / 2 - 92), cy + sy * (H / 2 - 92));
    ctx.lineTo(cx + sx * (W / 2 - 92), cy + sy * (H / 2 - 240));
    ctx.quadraticCurveTo(cx + sx * (W / 2 - 200), cy + sy * (H / 2 - 200), cx + sx * (W / 2 - 240), cy + sy * (H / 2 - 92));
    ctx.closePath();
    ctx.fill();
  }

  const lobed = (r: number, ry: number, fill: string, lobes = 16) => {
    ctx.beginPath();
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      const k = 1 + 0.12 * Math.cos(a * lobes);
      const x = cx + Math.cos(a) * r * k;
      const y = cy + Math.sin(a) * ry * k;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  // Pendants first, so the medallion sits over their stems.
  ctx.fillStyle = INDIGO;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx - 16, cy + s * 120);
    ctx.lineTo(cx + 16, cy + s * 120);
    ctx.lineTo(cx, cy + s * 210);
    ctx.closePath();
    ctx.fill();
  }
  lobed(120, 175, INDIGO);
  lobed(96, 142, CREAM);
  lobed(64, 96, RED);
  lobed(28, 42, GOLD, 8);

  // Scattered field motifs, mirrored across both axes so the rug is symmetric
  // the way a knotted one is.
  ctx.fillStyle = CREAM;
  for (let i = 0; i < 26; i++) {
    const px = 100 + rnd() * (W / 2 - 150);
    const py = 110 + rnd() * (H / 2 - 160);
    if (Math.hypot(px - cx, (py - cy) * 0.7) < 150) continue;
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      const x = cx + sx * (px - cx);
      const y = cy + sy * (py - cy);
      ctx.beginPath();
      ctx.ellipse(x, y, 5, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  abrash(ctx, W, H, rnd);
}

function paintModern(ctx: CanvasRenderingContext2D, W: number, H: number, rnd: () => number): void {
  ctx.fillStyle = "#e2dacb";
  ctx.fillRect(0, 0, W, H);
  // Three blocks and two rules. A modern rug is a composition, not a repeat —
  // drawn once at rug scale, never tiled.
  //
  // The blocks are DELIBERATELY oversized. The first pass used tasteful small
  // ones, and by the time a 2×2.9m rug is half under a sofa and seen from
  // standing height, a tasteful small block is a smudge. A composition has to
  // survive being furnished on top of.
  ctx.fillStyle = "#2b2f33";
  ctx.fillRect(0, H * 0.09, W * 0.52, H * 0.26);
  ctx.fillStyle = "#b05a33";
  ctx.fillRect(W * 0.26, H * 0.45, W * 0.74, H * 0.16);
  ctx.fillStyle = "#7f9089";
  ctx.fillRect(W * 0.05, H * 0.7, W * 0.4, H * 0.19);
  ctx.strokeStyle = "#2b2f33";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.4);
  ctx.lineTo(W, H * 0.4);
  ctx.moveTo(W * 0.66, H * 0.02);
  ctx.lineTo(W * 0.66, H * 0.38);
  ctx.moveTo(W * 0.55, H * 0.66);
  ctx.lineTo(W, H * 0.66);
  ctx.stroke();
  abrash(ctx, W, H, rnd);
}

/** Braided jute, drawn in the round: concentric coils of alternating strands,
 *  which is exactly how a braided rug is made — one rope, spiralled and
 *  stitched. Doubles as the height field, so the braid has real relief. */
function juteCanvas(): HTMLCanvasElement {
  const S = 768;
  const [c, ctx] = makeCanvas(S);
  c.width = S;
  c.height = S;
  const rnd = mulberry32(5);
  ctx.fillStyle = "#b09468";
  ctx.fillRect(0, 0, S, S);
  const mid = S / 2;
  const coil = 22; // strand thickness in px
  for (let r = S / 2 - 4; r > 6; r -= coil) {
    const circ = 2 * Math.PI * r;
    const strands = Math.max(8, Math.round(circ / 18));
    for (let i = 0; i < strands; i++) {
      const a0 = (i / strands) * Math.PI * 2;
      const a1 = ((i + 0.55) / strands) * Math.PI * 2;
      const tone = 150 + Math.round(rnd() * 60) + (i % 2 === 0 ? 22 : -18);
      ctx.strokeStyle = `rgb(${tone}, ${Math.round(tone * 0.86)}, ${Math.round(tone * 0.62)})`;
      ctx.lineWidth = coil * 0.82;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(mid, mid, r, a0, a1);
      ctx.stroke();
      // Fibres INSIDE the strand. A jute strand is a twisted bundle of dry
      // fibres, and a strand drawn as one flat arc reads as painted rope —
      // these thin off-radius arcs are what make it read as spun.
      for (let f = 0; f < 5; f++) {
        const off = (f / 4 - 0.5) * coil * 0.62;
        const shade = tone + Math.round((rnd() - 0.5) * 70);
        ctx.strokeStyle = `rgba(${shade}, ${Math.round(shade * 0.85)}, ${Math.round(shade * 0.6)}, 0.55)`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(mid, mid, r + off, a0 + 0.004, a1 - 0.004);
        ctx.stroke();
      }
    }
    // The seam between coils — the shadow line that says "rope", not "disc".
    ctx.strokeStyle = "rgba(60,44,26,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mid, mid, r - coil / 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  return c;
}

interface PatternMaps {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}
const patternCache = new Map<string, PatternMaps>();

/** Pattern textures ride UV channel 1 (0..1 across the whole rug), and each
 *  one ships colour, normal AND roughness from the same weave field. */
function patternFinish(kind: "persian" | "modern" | "jute"): PatternMaps {
  const hit = patternCache.get(kind);
  if (hit) return hit;

  const base = kind === "jute"
    ? juteCanvas()
    : patternCanvas(kind === "persian" ? paintPersian : paintModern, kind === "persian" ? 3 : 9);
  // Jute is a rope, not a knotted pile: coarser cell, and the braid's own
  // relief already carries the big shapes, so the weave only adds fibre.
  const woven = kind === "jute"
    ? weaveLayer(base, 3, 0.26, 41)
    : weaveLayer(base, 2, 0.3, kind === "persian" ? 17 : 29);

  const map = new THREE.CanvasTexture(woven.color);
  map.colorSpace = THREE.SRGBColorSpace;
  map.channel = 1;
  map.anisotropy = 8;

  // Jute keeps the braid's own height field as well: the coil seams are
  // centimetres deep, the fibre is fractions of a millimetre, and only the
  // combination reads as rope.
  const heightSrc = kind === "jute" ? base : woven.height;
  const normalMap = new THREE.CanvasTexture(heightToNormal(heightSrc, kind === "jute" ? 0.9 : 0.7));
  normalMap.colorSpace = THREE.NoColorSpace;
  normalMap.channel = 1;
  normalMap.anisotropy = 8;

  const roughnessMap = new THREE.CanvasTexture(weaveRoughness(woven.height, kind === "jute" ? 0.86 : 0.74));
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.channel = 1;

  const out: PatternMaps = { map, normalMap, roughnessMap };
  patternCache.set(kind, out);
  return out;
}

/** Knotted/tufted wool wearing a pattern: the design on channel 1, the weave
 *  grain still metric on channel 0. */
function buildRugPattern(kind: "persian" | "modern"): THREE.MeshStandardMaterial {
  const m = new THREE.MeshPhysicalMaterial();
  const p = patternFinish(kind);
  m.map = p.map;
  // Normal and roughness come from the SAME weave field as the colour, on the
  // same UV channel. The first pass borrowed the metric fabric grain instead:
  // the bumps had nothing to do with the knots, so the pattern still read as
  // ink on cloth rather than dye in wool.
  m.normalMap = p.normalMap;
  m.normalScale.set(1.1, 1.1);
  m.roughnessMap = p.roughnessMap;
  m.color.set("#ffffff"); // the map owns the colour
  m.roughness = 1;
  m.metalness = 0;
  m.sheen = 0.5;
  m.sheenRoughness = 0.75;
  m.sheenColor.set("#ffffff");
  return m;
}

/** Braided natural fibre — coarser, drier and far less sheen than wool. */
function buildRugJute(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshPhysicalMaterial();
  const jute = patternFinish("jute");
  m.map = jute.map;
  m.normalMap = jute.normalMap;
  m.normalScale.set(1.8, 1.8);
  m.roughnessMap = jute.roughnessMap;
  m.color.set("#ffffff");
  m.roughness = 1;
  m.metalness = 0;
  m.sheen = 0.2;
  m.sheenRoughness = 1;
  m.sheenColor.set("#d8c39a");
  return m;
}

/** Flatweave/kilim cotton. Deliberately map-free — it is the base the patterned
 *  styles get drawn onto later, and it is the ONLY rug finish that needs
 *  neither a canvas nor an image decode, which is what lets the headless suite
 *  build every rug card.
 *
 *  Map-free does not have to mean flat-looking: the woven relief comes from
 *  rug.ts's mesh displacement (1.5mm on this finish), and the cotton read comes
 *  from a broad, warm sheen rather than a white one — the first pass was a
 *  chalky grey card. */
function buildRugFlat(color: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshPhysicalMaterial();
  m.color.set(color);
  m.roughness = 0.86;
  m.metalness = 0;
  m.sheen = 0.7;
  m.sheenRoughness = 0.45;
  m.sheenColor.set("#efe4d2");
  return m;
}

function buildLaminate(roughness: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial();
  m.color.set("#e8e6e1");
  m.roughness = roughness;
  m.metalness = 0;
  return m;
}

function buildFlat(color: string, roughness: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial();
  m.color.set(color);
  m.roughness = roughness;
  m.metalness = 0;
  return m;
}

function buildFabric(color: string, params: FabricParams = FABRIC_DEFAULT): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial();
  const fabric = fabricFinish(params);
  m.normalMap = fabric.normalMap;
  m.roughnessMap = fabric.roughnessMap;
  m.color.set(color);
  m.roughness = 1;
  m.metalness = 0;
  return m;
}

function buildCounterDark(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial();
  m.color.set("#2e2f31");
  m.roughnessMap = fabricFinish().roughnessMap;
  m.roughness = 0.4;
  m.metalness = 0;
  return m;
}

function buildVelvet(): THREE.MeshStandardMaterial {
  // MeshPhysicalMaterial extends MeshStandardMaterial — a valid return here.
  const m = new THREE.MeshPhysicalMaterial();
  m.normalMap = velvetNormalMap();
  m.color.set("#5a4a6a");
  m.roughness = 0.6;
  m.metalness = 0;
  m.sheen = 1.0;
  m.sheenRoughness = 0.5;
  m.sheenColor.set("#5a4a6a");
  return m;
}

function buildLeather(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial();
  m.normalMap = leatherNormalMap();
  m.color.set("#6b4a35");
  m.roughness = 0.42;
  m.metalness = 0;
  return m;
}

function buildSteel(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial();
  m.color.set("#c6c8ca");
  m.metalness = 0.9;
  m.roughness = 0.3;
  return m;
}

// Glazed sanitary ceramic. The gloss is a CLEARCOAT, not just a low
// roughness: fired glaze is a transparent layer over an opaque white body, so
// it holds a tight specular highlight while the body underneath stays matte.
// Roughness alone gives a chalky sheen that reads as plaster — which is what
// the first pass looked like. MeshPhysicalMaterial extends
// MeshStandardMaterial, so this is a valid return here (same as buildVelvet).
function buildCeramic(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshPhysicalMaterial();
  m.color.set("#f7f7f5");
  m.metalness = 0;
  m.roughness = 0.35;
  m.clearcoat = 1;
  m.clearcoatRoughness = 0.02;
  m.envMapIntensity = 1.35;
  return m;
}

// Sanitary acrylic (baths, shower trays): same glazed look, a slightly softer
// clearcoat — moulded acrylic is a touch less mirror-like than fired glaze.
function buildAcrylic(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshPhysicalMaterial();
  m.color.set("#f5f6f5");
  m.metalness = 0;
  m.roughness = 0.3;
  m.clearcoat = 1;
  m.clearcoatRoughness = 0.06;
  m.envMapIntensity = 1.2;
  return m;
}

function buildGlassBlack(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial();
  m.color.set("#101113");
  m.metalness = 0;
  m.roughness = 0.1;
  return m;
}

function buildFinish(id: string): THREE.MeshStandardMaterial {
  switch (id) {
    case "walnut":
      return buildWalnut();
    case "oak":
    case "counter-oak":
      return buildOak();
    case "painted":
    case "painted-white":
      return buildPainted("#f4f4f2", "painted-white");
    case "painted-charcoal":
      return buildPainted("#3a3d40", "painted-charcoal");
    case "laminate-matte":
      return buildLaminate(0.5);
    case "laminate-gloss":
      return buildLaminate(0.12);
    case "wood-walnut-dark":
    case "wood-plank-pale":
      return buildFloorWood(id);
    case "fabric":
    case "fabric-linen":
      return buildFabric("#d8d2c4");
    case "fabric-charcoal":
      return buildFabric("#4a4d52");
    case "fabric-sage":
      return buildFabric("#9aa88f");
    case "fabric-boucle":
      return buildFabric("#e3ded2", FABRIC_BOUCLE);
    case "velvet":
      return buildVelvet();
    case "leather":
      return buildLeather();
    case "counter-white":
      return buildFlat("#e9e7e2", 0.35);
    case "counter-dark":
      return buildCounterDark();
    case "steel":
      return buildSteel();
    case "ceramic":
      return buildCeramic();
    case "acrylic":
      return buildAcrylic();
    case "glass-black":
      return buildGlassBlack();
    case "rug-wool":
      return buildRugWool("carpet-beige", "#efe7da");
    case "rug-wool-navy":
      return buildRugWool("carpet-navy", "#ffffff");
    case "rug-shag":
      return buildRugShag("#e5ddd0");
    case "rug-flat":
      return buildRugFlat("#cfc4b0");
    case "rug-persian":
      return buildRugPattern("persian");
    case "rug-modern":
      return buildRugPattern("modern");
    case "rug-jute":
      return buildRugJute();
    default:
      return buildPainted("#f4f4f2", "painted-white");
  }
}

/** Module-level cache per finish id — materials ARE shared across items;
 *  parametric meshes never tint-mutate the shared material (color wheel
 *  tinting clones per instance in ParametricModel), so sharing is safe. */
export function finishMaterial(id: string): THREE.MeshStandardMaterial {
  let m = cache.get(id);
  if (!m) {
    m = buildFinish(id);
    cache.set(id, m);
  }
  return m;
}
