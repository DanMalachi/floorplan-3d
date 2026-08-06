"use client";

// Finish materials for parametric furniture. Reuses the existing door-finish
// infrastructure (src/decorate/doorTexture.ts, src/materials/loaderDoors.ts)
// instead of writing new wood/paint shaders — same convention WallMesh.tsx's
// door-leaf effect uses. fabric-* (sofa, P4) lands alongside the generator
// that actually references it; the procedural canvas it needs is written
// here already because counter-dark (kitchenRun) borrows it for speckle.

import * as THREE from "three";
import { doorProceduralFinish } from "@/decorate/doorTexture";
import { loadDoorTextures, doorMaterialRoughness } from "@/materials/loaderDoors";
import { makeCanvas, mulberry32, heightToNormal, applyTiling } from "@/decorate/proceduralTexture";

const cache = new Map<string, THREE.MeshStandardMaterial>();

// --- fabric procedural: fine speckle + a subtle woven grid -----------------
// Neutral gray base (color comes from material.color, same convention as the
// painted door finishes) so the canvas contributes only normal/roughness
// variation. counter-dark borrows the roughnessMap at "low strength" via
// multiplication with its own low material.roughness scalar.
function fabricColorCanvas(): HTMLCanvasElement {
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  const rnd = mulberry32(11);
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

let fabricCache: { normalMap: THREE.Texture; roughnessMap: THREE.Texture } | null = null;
function fabricFinish(): { normalMap: THREE.Texture; roughnessMap: THREE.Texture } {
  if (fabricCache) return fabricCache;
  const colorCanvas = fabricColorCanvas();
  const cover = 0.4;
  const normalMap = new THREE.CanvasTexture(heightToNormal(colorCanvas, 0.35));
  normalMap.colorSpace = THREE.NoColorSpace;
  applyTiling(normalMap, cover);
  const roughnessMap = new THREE.CanvasTexture(fabricRoughnessCanvas(colorCanvas));
  roughnessMap.colorSpace = THREE.NoColorSpace;
  applyTiling(roughnessMap, cover);
  fabricCache = { normalMap, roughnessMap };
  return fabricCache;
}

function buildFinish(id: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial();
  if (id === "walnut") {
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
  if (id === "counter-white") {
    m.color.set("#e9e7e2");
    m.roughness = 0.35;
    m.metalness = 0;
    return m;
  }
  if (id === "counter-dark") {
    m.color.set("#2e2f31");
    m.roughnessMap = fabricFinish().roughnessMap;
    m.roughness = 0.4;
    m.metalness = 0;
    return m;
  }
  const kind = id === "oak" || id === "counter-oak" ? "oak" : id === "painted-charcoal" ? "painted-charcoal" : "painted-white";
  const finish = doorProceduralFinish(kind);
  m.map = finish.map ?? null;
  m.normalMap = finish.normalMap;
  m.roughnessMap = finish.roughnessMap;
  m.color.set(kind === "painted-charcoal" ? "#3a3d40" : kind === "oak" ? "#ffffff" : "#f4f4f2");
  m.roughness = 0.78;
  m.metalness = 0;
  return m;
}

/** Module-level cache per finish id — materials ARE shared across items;
 *  parametric meshes never tint-mutate materials (ParametricModel clones
 *  per instance for tint/opacity), so sharing the base material is safe. */
export function finishMaterial(id: string): THREE.MeshStandardMaterial {
  let m = cache.get(id);
  if (!m) {
    m = buildFinish(id);
    cache.set(id, m);
  }
  return m;
}
