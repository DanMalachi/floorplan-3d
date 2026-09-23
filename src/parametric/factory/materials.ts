import * as THREE from "three";

// Materials for the factory ports: the SAME CC0 / own-work maps the Blender
// build scripts use (public/furniture/factory/tex/, see manifest.json there
// and docs/DATA_RIGHTS.md), not canvas stand-ins. Upholstery colour ships the
// way the scripts do it: a luminance-normalised grey weave multiplied by one
// colour — here `material.color`, set per instance by ParametricModel from
// `userData.tintColor`. UVs are already metres/tile (geom.ts `fabricUV`), so
// every texture repeats 1:1 and the weave keeps its physical size on any
// sofa size.

export interface FactoryMaterialDef {
  /** Folder under /furniture/factory/tex/. */
  tex: string;
  normalScale: number;
  /** Blender "Specular IOR Level" (0.5 = the glTF default F0 of 0.04). */
  specular: number;
  /** `pile_sheen`: the baked GLBs carry KHR_materials_sheen (colour +
   *  roughness; the exporter drops Blender's weight, so three loads it at
   *  sheen 1 — match what the app showed when the piece was approved). */
  sheen?: { color: [number, number, number]; roughness: number };
}

export const FACTORY_MATERIALS = {
  "rough-linen": { tex: "rough-linen", normalScale: 1.8, specular: 0.25 },
  "oak-veneer-01": { tex: "oak-veneer-01", normalScale: 1.0, specular: 0.4 },
  "curly-teddy-natural": { tex: "curly-teddy-natural", normalScale: 1.6, specular: 0.2 },
  // Same hessian tiles, each script's own normal strength.
  "hessian-380-plain": { tex: "hessian-380", normalScale: 2.8, specular: 0.2 },
  "velour-velvet": {
    tex: "velour-velvet", normalScale: 1.5, specular: 0.12,
    sheen: { color: [0.94, 1, 0.94], roughness: 0.42 },
  },
} satisfies Record<string, FactoryMaterialDef>;

export type FactoryMaterialId = keyof typeof FACTORY_MATERIALS;

const cache = new Map<string, THREE.MeshPhysicalMaterial>();
let loader: THREE.TextureLoader | null = null;

function tex(url: string, srgb: boolean): THREE.Texture {
  loader ??= new THREE.TextureLoader();
  // Sync-return / async-fill, like src/materials/loader.ts: three renders the
  // untextured material until the image lands.
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Shared per id (never mutated per item — ParametricModel clones before it
 *  tints, which shares these textures rather than reloading them). */
export function factoryMaterial(id: FactoryMaterialId): THREE.MeshPhysicalMaterial {
  let m = cache.get(id);
  if (m) return m;
  const def: FactoryMaterialDef = FACTORY_MATERIALS[id];
  const base = `/furniture/factory/tex/${def.tex}/`;
  m = new THREE.MeshPhysicalMaterial({ roughness: 1, metalness: 0 });
  // Headless tests (tsx) have no DOM to load images into; geometry is all
  // they measure.
  if (typeof document !== "undefined") {
    m.map = tex(base + "color.webp", true);
    m.normalMap = tex(base + "normal.webp", false);
    m.roughnessMap = tex(base + "roughness.webp", false);
  }
  m.normalScale.set(def.normalScale, def.normalScale);
  // Blender's level 0.5 is F0 0.04; three's specularIntensity scales that F0.
  m.specularIntensity = def.specular / 0.5;
  if (def.sheen) {
    m.sheen = 1;
    m.sheenColor.setRGB(...def.sheen.color, THREE.LinearSRGBColorSpace); // glTF factors are linear
    m.sheenRoughness = def.sheen.roughness;
  }
  m.name = id;
  cache.set(id, m);
  return m;
}
