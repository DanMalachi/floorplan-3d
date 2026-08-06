"use client";

// Finish materials for parametric furniture. Reuses the existing door-finish
// infrastructure (src/decorate/doorTexture.ts, src/materials/loaderDoors.ts)
// instead of writing new wood/paint shaders — same convention WallMesh.tsx's
// door-leaf effect uses. Only the 4 wood/paint finishes wardrobe.ts needs ship
// here; fabric-*/counter-* land alongside the kitchen/sofa generators that
// actually reference them.

import * as THREE from "three";
import { doorProceduralFinish } from "@/decorate/doorTexture";
import { loadDoorTextures, doorMaterialRoughness } from "@/materials/loaderDoors";

const cache = new Map<string, THREE.MeshStandardMaterial>();

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
  const kind = id === "oak" || id === "painted-charcoal" ? id : "painted-white";
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
