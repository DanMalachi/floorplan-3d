"use client";

/**
 * Texture loading for image-based floors.
 *
 * ── Synchronous return, asynchronous fill ───────────────────────────────────
 * FloorMesh builds its material inside a `useMemo` and expects textures back
 * immediately — that contract was set by the original procedural textures, which
 * are drawn to a canvas on the spot. Images can't be decoded synchronously, so
 * this leans on a THREE.TextureLoader property: `load()` hands back a Texture
 * object right away and populates it when the bytes arrive, flipping
 * `needsUpdate` itself. The caller never awaits anything, the material is valid
 * from frame one, and the texture simply appears a moment later. That is what
 * keeps the protected-file change to a few lines instead of a refactor of
 * FloorMesh into async loading.
 *
 * ── Colour space is not cosmetic ────────────────────────────────────────────
 * Colour maps are sRGB. Normal and roughness maps are DATA — tagging them sRGB
 * applies a gamma curve to numbers that aren't colours, which makes lighting
 * subtly but persistently wrong. Each map is tagged explicitly below.
 */

import * as THREE from "three";
import { getFloorMaterial } from "./registry";

export interface FloorTextureSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

/** Textures are shared across every room using the material, so load once. */
const cache = new Map<string, FloorTextureSet>();
let loader: THREE.TextureLoader | null = null;

/**
 * Meter-scale tiling, matching the convention already used for the procedural
 * floors: one repeat spans `coverM` metres, so UVs authored in metres divide
 * straight through.
 */
function applyTiling(tex: THREE.Texture, coverM: number): void {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.repeat.set(1 / coverM, 1 / coverM);
}

/**
 * Returns the texture set for a catalog material, or null when the id isn't in
 * the catalog (a legacy procedural style, or an unknown id from a project saved
 * by a newer build). Callers fall back to the procedural textures.
 */
export function loadFloorTextures(id: string): FloorTextureSet | null {
  const cached = cache.get(id);
  if (cached) return cached;

  const material = getFloorMaterial(id);
  if (!material) return null;

  loader ??= new THREE.TextureLoader();

  const map = loader.load(material.maps.color);
  map.colorSpace = THREE.SRGBColorSpace;
  applyTiling(map, material.coverM);

  const normalMap = loader.load(material.maps.normal);
  normalMap.colorSpace = THREE.NoColorSpace; // direction data, never sRGB
  applyTiling(normalMap, material.coverM);

  const roughnessMap = loader.load(material.maps.roughness);
  roughnessMap.colorSpace = THREE.NoColorSpace; // control signal, never sRGB
  applyTiling(roughnessMap, material.coverM);

  const set: FloorTextureSet = { map, normalMap, roughnessMap };
  cache.set(id, set);
  return set;
}

/** Base roughness for a catalog material; null when the id isn't ours. */
export function floorMaterialRoughness(id: string): number | null {
  return getFloorMaterial(id)?.roughness ?? null;
}
