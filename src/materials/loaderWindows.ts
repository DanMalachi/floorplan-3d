"use client";

/** Texture loading for the real window frame material catalog. Mirrors
 *  loaderDoors.ts exactly — see its header for the synchronous-return/
 *  asynchronous-fill contract and the packed-ORM channel reasoning. */

import * as THREE from "three";
import { invalidate } from "@react-three/fiber";
import { getWindowMaterial } from "./registryWindows";

export interface WindowTextureSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  metalnessMap: THREE.Texture;
  aoMap: THREE.Texture;
}

const cache = new Map<string, WindowTextureSet>();
let loader: THREE.TextureLoader | null = null;

function applyTiling(tex: THREE.Texture, coverM: number): void {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.repeat.set(1 / coverM, 1 / coverM);
}

export function loadWindowTextures(id: string): WindowTextureSet | null {
  const cached = cache.get(id);
  if (cached) return cached;

  const material = getWindowMaterial(id);
  if (!material) return null;

  loader ??= new THREE.TextureLoader();

  // `invalidate` on arrival — see loaderDoors.ts for why.
  const map = loader.load(material.maps.color, () => invalidate());
  map.colorSpace = THREE.SRGBColorSpace;
  applyTiling(map, material.coverM);

  const normalMap = loader.load(material.maps.normal, () => invalidate());
  normalMap.colorSpace = THREE.NoColorSpace;
  applyTiling(normalMap, material.coverM);

  const orm = loader.load(material.maps.orm, () => invalidate());
  orm.colorSpace = THREE.NoColorSpace;
  applyTiling(orm, material.coverM);

  const set: WindowTextureSet = { map, normalMap, roughnessMap: orm, metalnessMap: orm, aoMap: orm };
  cache.set(id, set);
  return set;
}

export function windowMaterialMetalness(id: string): number | null {
  return getWindowMaterial(id)?.metalness ?? null;
}
