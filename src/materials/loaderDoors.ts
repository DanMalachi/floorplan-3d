"use client";

/**
 * Texture loading for the real door material catalog. Same synchronous-
 * return/asynchronous-fill contract as loader.ts (floors) — WallMesh builds
 * its opening materials inside a `useMemo` expecting textures back
 * immediately, so `TextureLoader.load()`'s "hand back a Texture now, fill it
 * in later" behavior is what keeps that a non-refactor.
 *
 * The ingested asset ships one packed ORM (occlusion/roughness/metalness)
 * texture rather than a separate roughness map — standard glTF channel
 * packing (R=AO, G=roughness, B=metalness), which three.js's
 * MeshStandardMaterial already reads correctly per-slot from one shared
 * texture reference.
 */

import * as THREE from "three";
import { invalidate } from "@react-three/fiber";
import { getDoorMaterial } from "./registryDoors";

export interface DoorTextureSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  metalnessMap: THREE.Texture;
  aoMap: THREE.Texture;
}

const cache = new Map<string, DoorTextureSet>();
let loader: THREE.TextureLoader | null = null;

function applyTiling(tex: THREE.Texture, coverM: number): void {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.repeat.set(1 / coverM, 1 / coverM);
}

/** Returns the texture set for a door material id, or null when unrecognized
 *  (an unknown/legacy id — callers fall back to the procedural finishes). */
export function loadDoorTextures(id: string): DoorTextureSet | null {
  const cached = cache.get(id);
  if (cached) return cached;

  const material = getDoorMaterial(id);
  if (!material) return null;

  loader ??= new THREE.TextureLoader();

  // `invalidate` on arrival — the renderer draws on demand and a texture that
  // fills itself in later changes no React prop, so nothing would schedule the
  // frame that shows it. No-op under `frameloop="always"`.
  const map = loader.load(material.maps.color, () => invalidate());
  map.colorSpace = THREE.SRGBColorSpace;
  applyTiling(map, material.coverM);

  const normalMap = loader.load(material.maps.normal, () => invalidate());
  normalMap.colorSpace = THREE.NoColorSpace;
  applyTiling(normalMap, material.coverM);

  const orm = loader.load(material.maps.orm, () => invalidate());
  orm.colorSpace = THREE.NoColorSpace;
  applyTiling(orm, material.coverM);

  const set: DoorTextureSet = { map, normalMap, roughnessMap: orm, metalnessMap: orm, aoMap: orm };
  cache.set(id, set);
  return set;
}

export function doorMaterialRoughness(id: string): number | null {
  return getDoorMaterial(id)?.roughness ?? null;
}
