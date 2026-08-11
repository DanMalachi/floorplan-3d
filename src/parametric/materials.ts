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
