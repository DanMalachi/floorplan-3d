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
  /** Folder under /furniture/factory/tex/. Absent = a plain colour (thread,
   *  metal), which the scripts also build without maps. */
  tex?: string;
  normalScale?: number;
  /** Blender "Specular IOR Level" (0.5 = the glTF default F0 of 0.04). */
  specular: number;
  /** `pile_sheen`: the baked GLBs carry KHR_materials_sheen (colour +
   *  roughness; the exporter drops Blender's weight, so three loads it at
   *  sheen 1 — match what the app showed when the piece was approved). */
  sheen?: { color: [number, number, number]; roughness: number };
  /** `tone_setup` + `tone_apply`: smooth light/dark patches from world-space
   *  noise multiplied into the base colour (the scripts bake it as a vertex
   *  colour; see ToneMaterial). amp per octave at 7 / 19 / 47 cycles per m. */
  tone?: [number, number, number];
  /** Plain-colour materials: linear RGB, as the glTF factor stores it. */
  color?: [number, number, number];
  roughness?: number;
  metalness?: number;
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
  "leather-grain": { tex: "leather-grain", normalScale: 1.0, specular: 0.55, tone: [0.115, 0.06, 0.02] },
  // Tone-on-tone thread: colour comes per instance (0.58 × the hide, linear).
  thread: { specular: 0.3, roughness: 0.6 },
  "hessian-380-chaise": { tex: "hessian-380", normalScale: 2.4, specular: 0.2, tone: [0.1, 0.06, 0.025] },
  // Polished nickel, metallic 0.72: a pure mirror renders black in the dark
  // viewer env (build script's note).
  nickel: { specular: 0.5, color: [0.7454, 0.7529, 0.7758], roughness: 0.34, metalness: 0.72 },
  // Astra bed: the script's own numpy tiles, Principled defaults otherwise.
  "oatmeal-upholstery": { tex: "oatmeal-upholstery", normalScale: 0.45, specular: 0.5 },
  "ivory-washed-linen": { tex: "ivory-washed-linen", normalScale: 0.45, specular: 0.5 },
  "bed-natural-oak": { tex: "bed-natural-oak", normalScale: 0.6, specular: 0.5 },
} satisfies Record<string, FactoryMaterialDef>;

export type FactoryMaterialId = keyof typeof FACTORY_MATERIALS;

/** The scripts' tone is a per-vertex colour from world-space noise, written
 *  after the piece is centred. Computing it on the CPU costs 3 noise calls per
 *  vertex per rebuild (~25ms on a 150k-triangle sofa), so it runs in the
 *  vertex shader instead: same octaves and offsets, same Blender-axis
 *  position (the mesh's own space IS the centred build, glTF axes), same
 *  per-vertex interpolation. The noise is our own gradient noise, not
 *  Blender's — tone only has to read as the same soft patches.
 *  Survives ParametricModel's clone(): the amplitudes ride in userData. */
const TONE_GLSL = /* glsl */ `
varying float vTone;
vec3 toneGrad(vec3 c) {
  uvec3 h = uvec3(ivec3(c) + 4096);
  h = h * 1664525u + 1013904223u;
  h.x += h.y * h.z; h.y += h.z * h.x; h.z += h.x * h.y;
  h ^= h >> 16u;
  h.x += h.y * h.z; h.y += h.z * h.x; h.z += h.x * h.y;
  return vec3(h & 0xffffu) / 32767.5 - 1.0;
}
float toneNoise(vec3 p) {
  vec3 i = floor(p), f = p - i;
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = dot(toneGrad(i), f);
  float n100 = dot(toneGrad(i + vec3(1, 0, 0)), f - vec3(1, 0, 0));
  float n010 = dot(toneGrad(i + vec3(0, 1, 0)), f - vec3(0, 1, 0));
  float n110 = dot(toneGrad(i + vec3(1, 1, 0)), f - vec3(1, 1, 0));
  float n001 = dot(toneGrad(i + vec3(0, 0, 1)), f - vec3(0, 0, 1));
  float n101 = dot(toneGrad(i + vec3(1, 0, 1)), f - vec3(1, 0, 1));
  float n011 = dot(toneGrad(i + vec3(0, 1, 1)), f - vec3(0, 1, 1));
  float n111 = dot(toneGrad(i + vec3(1, 1, 1)), f - vec3(1, 1, 1));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y), mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}
`;

export class ToneMaterial extends THREE.MeshPhysicalMaterial {
  onBeforeCompile(shader: THREE.WebGLProgramParametersWithUniforms): void {
    const a = this.userData.factoryTone as [number, number, number] | undefined;
    if (!a) return;
    const f = (x: number) => x.toFixed(4);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${TONE_GLSL}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
  {
    vec3 b = vec3(position.x, -position.z, position.y); // glTF axes -> Blender's
    vTone = 1.0 + ${f(a[0])} * toneNoise(b * 7.0 + vec3(3.1, 1.7, 5.3))
                + ${f(a[1])} * toneNoise(b * 19.0 + vec3(9.2, 4.4, 1.1))
                + ${f(a[2])} * toneNoise(b * 47.0 + vec3(2.6, 7.7, 3.9));
  }`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vTone;")
      .replace("#include <color_fragment>", "#include <color_fragment>\n  diffuseColor.rgb *= vTone;");
  }

  customProgramCacheKey(): string {
    return `factory-tone:${JSON.stringify(this.userData.factoryTone ?? null)}`;
  }
}

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
  m = new (def.tone ? ToneMaterial : THREE.MeshPhysicalMaterial)({
    roughness: def.roughness ?? 1,
    metalness: def.metalness ?? 0,
  });
  if (def.tone) m.userData.factoryTone = def.tone;
  if (def.color) m.color.setRGB(...def.color, THREE.LinearSRGBColorSpace);
  // Headless tests (tsx) have no DOM to load images into; geometry is all
  // they measure.
  if (def.tex && typeof document !== "undefined") {
    m.map = tex(base + "color.webp", true);
    m.normalMap = tex(base + "normal.webp", false);
    m.roughnessMap = tex(base + "roughness.webp", false);
  }
  if (def.normalScale) m.normalScale.set(def.normalScale, def.normalScale);
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
