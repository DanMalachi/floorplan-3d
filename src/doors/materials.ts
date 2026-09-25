import * as THREE from "three";
import { invalidate } from "@react-three/fiber";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { DoorSurface, GlassId, MetalId, PolymerId, Sheen, VeneerId } from "./look";

/**
 * Physical materials for doors: every surface is a measured-ish material, not
 * a flat colour.
 *
 * - WOOD is a real Poly Haven veneer scan (CC0), graded once at bake time to
 *   the FINISHED species colour (scripts/doors/bake-veneers.mjs). The finish
 *   (matte oil / satin / gloss lacquer) is a physical film on top: roughness
 *   plus a clearcoat layer, never a colour change.
 * - PAINT, POWDER COAT and POLYMERS are dielectrics (F0 ~0.04, from their
 *   IOR) whose sheen comes from roughness and whose character comes from a
 *   micro-texture: roller orange-peel for paint, coarser stipple for powder
 *   coat, fine grain for laminate. A flat fill with no micro-normal reads as
 *   printed vinyl.
 * - METALS are conductors: colour lives in the reflection (base colour = F0,
 *   linear values from physicallybased.info), brushed finishes are
 *   anisotropic.
 * - GLASS is a thin dielectric pane (IOR 1.52): mostly reflection at grazing
 *   angles and transmission face-on. Transmission is FAKED with opacity:
 *   real transmission needs its own render pass per frame, which the
 *   integrated-GPU budget (docs/PERFORMANCE.md) can't carry for every door.
 *
 * All textured maps are in METRES: door geometry writes UVs in metres, so a
 * texture repeats at 1 / tileMetres and grain keeps its physical size on any
 * door size.
 */

// --- Textures ----------------------------------------------------------------

let loader: THREE.TextureLoader | null = null;
const texCache = new Map<string, THREE.Texture>();

function loadTex(url: string, srgb: boolean, tileM: number): THREE.Texture {
  const key = `${url}|${tileM}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  loader ??= new THREE.TextureLoader();
  // Sync-return / async-fill, like src/materials/loader.ts. The invalidate on
  // arrival matters: the viewport renders on demand.
  const t = loader.load(url, () => invalidate());
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.repeat.set(1 / tileM, 1 / tileM);
  texCache.set(key, t);
  return t;
}

/** Poly Haven veneers are 1 m square (manifest.json `tileMetres`). */
const VENEER_TILE_M = 1;

function veneerMaps(species: VeneerId) {
  const base = `/materials/doors/veneer/${species}/`;
  return {
    map: loadTex(base + "color.webp", true, VENEER_TILE_M),
    normalMap: loadTex(base + "normal.webp", false, VENEER_TILE_M),
    roughnessMap: loadTex(base + "roughness.webp", false, VENEER_TILE_M),
  };
}

/** Seeded PRNG so every generated map is identical on every load. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable value noise, summed over octaves (periodic, so the map tiles). */
function tileNoise(N: number, cells: number[], amps: number[], seed: number): Float32Array {
  const out = new Float32Array(N * N);
  const rnd = mulberry32(seed);
  cells.forEach((c, oi) => {
    const g = new Float32Array(c * c).map(() => rnd());
    const s = (x: number) => x * x * (3 - 2 * x);
    for (let y = 0; y < N; y++) {
      const fy = (y / N) * c;
      const y0 = Math.floor(fy);
      const ty = s(fy - y0);
      for (let x = 0; x < N; x++) {
        const fx = (x / N) * c;
        const x0 = Math.floor(fx);
        const tx = s(fx - x0);
        const at = (i: number, j: number) => g[((j % c) * c + (i % c)) | 0];
        const v =
          (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) +
          (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
        out[y * N + x] += (v - 0.5) * amps[oi];
      }
    }
  });
  return out;
}

/** Height field -> tangent-space normal map (OpenGL convention, like the
 *  Poly Haven nor_gl maps). `strength` in height units per texel. */
function heightToNormalTex(h: Float32Array, N: number, strength: number, tileM: number): THREE.DataTexture {
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const hx = h[y * N + ((x + 1) % N)] - h[y * N + ((x - 1 + N) % N)];
      const hy = h[((y + 1) % N) * N + x] - h[((y - 1 + N) % N) * N + x];
      let nx = -hx * strength;
      let ny = -hy * strength;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const i = (y * N + x) * 4;
      data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.repeat.set(1 / tileM, 1 / tileM);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

const genCache = new Map<string, THREE.Texture>();
function generated(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = genCache.get(key);
  if (!t) {
    t = make();
    genCache.set(key, t);
  }
  return t;
}

/** Micro-textures, each at its real physical scale (tile size in metres). */
const MICRO = {
  // Roller-applied paint: soft orange peel, ~2-4 mm cells.
  paint: () => generated("paint", () => heightToNormalTex(tileNoise(256, [24, 64], [1, 0.35], 11), 256, 2.2, 0.12)),
  // Powder coat: a tighter, more even orange peel, visible at arm's length.
  powder: () => generated("powder", () => heightToNormalTex(tileNoise(256, [48, 110], [1, 0.5], 23), 256, 3.2, 0.1)),
  // Laminate: fine stipple embossed into the melamine surface.
  stipple: () => generated("stipple", () => heightToNormalTex(tileNoise(256, [96, 200], [1, 0.6], 37), 256, 2.4, 0.05)),
  // Brushing: long streaks along U (the geometry lays U along a handle's
  // long axis), fine across. Built from 1-D noise stretched along U.
  brushed: () =>
    generated("brushed", () => {
      const N = 256;
      const rnd = mulberry32(53);
      const rows = new Float32Array(N).map(() => rnd() - 0.5);
      const h = new Float32Array(N * N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] = rows[y] + 0.3 * rows[(y * 7 + ((x / 64) | 0)) % N];
      return heightToNormalTex(h, N, 0.9, 0.03);
    }),
  // Textured ("hammered") glass: soft irregular dimples a few mm across,
  // the obscure glazing of older panelled doors.
  hammered: () => generated("hammered", () => heightToNormalTex(tileNoise(256, [18, 40], [1, 0.45], 71), 256, 5, 0.12)),
  // Metallic powder coat: aluminium flake just under the film, a fine sparkle.
  flake: () => generated("flake", () => heightToNormalTex(tileNoise(256, [128, 256], [1, 1], 83), 256, 6, 0.02)),
  // Fluted glass: vertical half-round flutes. `pitch` metres per flute; the
  // texture holds 8 flutes, so tileM = 8 * pitch.
  flutes: (pitch: number) =>
    generated(`flutes${pitch}`, () => {
      const N = 256;
      const n = 8;
      const h = new Float32Array(N * N);
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const f = ((x / N) * n) % 1; // 0..1 across one flute
          h[y * N + x] = Math.sqrt(Math.max(0, 1 - (2 * f - 1) ** 2)); // half-round profile
        }
      }
      return heightToNormalTex(h, N, 3.5, n * pitch);
    }),
};

// --- Surfaces ----------------------------------------------------------------

/** Base colours of metals, LINEAR RGB (physicallybased.info, checked
 *  2026-09-25), and their finish. Bronze/gunmetal/black are finishes rather
 *  than bare metals: a patinated or PVD/powder coat. */
export const METALS: Record<MetalId, { color: [number, number, number]; metalness: number; roughness: number; anisotropy?: number; clearcoat?: number }> = {
  "stainless-brushed": { color: [0.669, 0.639, 0.598], metalness: 1, roughness: 0.3, anisotropy: 0.75 },
  "stainless-polished": { color: [0.669, 0.639, 0.598], metalness: 1, roughness: 0.08 },
  chrome: { color: [0.654, 0.685, 0.701], metalness: 1, roughness: 0.04 },
  "nickel-satin": { color: [0.697, 0.641, 0.563], metalness: 1, roughness: 0.28, anisotropy: 0.5 },
  "brass-satin": { color: [0.91, 0.778, 0.423], metalness: 1, roughness: 0.3, anisotropy: 0.5 },
  "brass-polished": { color: [0.91, 0.778, 0.423], metalness: 1, roughness: 0.07, clearcoat: 0.6 },
  bronze: { color: [0.3, 0.2, 0.13], metalness: 0.85, roughness: 0.42 }, // oil-rubbed patina
  copper: { color: [0.932, 0.623, 0.522], metalness: 1, roughness: 0.25 },
  "aluminium-anodised": { color: [0.916, 0.923, 0.924], metalness: 1, roughness: 0.38 }, // bead-blasted
  "black-matte": { color: [0.022, 0.022, 0.023], metalness: 0, roughness: 0.55 }, // powder coat
  gunmetal: { color: [0.2, 0.2, 0.21], metalness: 1, roughness: 0.32 }, // dark PVD
};

/** Wood finish films. Base roughness multiplies the scan's own pore-driven
 *  roughness map; the clearcoat is the lacquer film sitting on top. A thicker
 *  film fills the pores, so the veneer normal flattens as sheen rises. */
const WOOD_SHEEN: Record<Sheen, { roughness: number; clearcoat: number; ccRough: number; normal: number }> = {
  matte: { roughness: 0.95, clearcoat: 0, ccRough: 0, normal: 0.9 }, // hardwax oil
  satin: { roughness: 0.8, clearcoat: 0.35, ccRough: 0.32, normal: 0.7 }, // satin lacquer
  gloss: { roughness: 0.65, clearcoat: 1, ccRough: 0.05, normal: 0.35 }, // piano lacquer
};

/** Paint-like film sheens: [roughness, clearcoat, clearcoatRoughness]. */
const FILM_SHEEN: Record<Sheen, [number, number, number]> = {
  matte: [0.78, 0, 0],
  satin: [0.42, 0, 0],
  gloss: [0.24, 0.7, 0.08],
};

const POLYMERS: Record<PolymerId, { roughness: number; ior: number; micro: "stipple" | "powder" | "paint" | null; normal: number; specular?: number }> = {
  upvc: { roughness: 0.28, ior: 1.542, micro: "paint", normal: 0.03 },
  hpl: { roughness: 0.55, ior: 1.5, micro: "stipple", normal: 0.1 },
  supermatte: { roughness: 0.92, ior: 1.5, micro: "stipple", normal: 0.05, specular: 0.6 },
  fibreglass: { roughness: 0.4, ior: 1.55, micro: "powder", normal: 0.08 },
};

/** Paint colours are authored as sRGB hex (the swatch as it looks on a
 *  chart); three converts to linear for shading. */
function setHex(m: THREE.MeshPhysicalMaterial, hex: string) {
  m.color.set(hex);
}

/** Build a fresh material for a surface. Fresh per call on purpose: each door
 *  fades and glows on its own (cutaway, selection), so it cannot share a
 *  material instance with another door. Textures ARE shared. */
export function surfaceMaterial(s: DoorSurface): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({ metalness: 0 });
  m.ior = 1.5;
  switch (s.kind) {
    case "wood": {
      const maps = veneerMaps(s.species);
      const f = WOOD_SHEEN[s.sheen];
      m.map = maps.map;
      m.normalMap = maps.normalMap;
      m.roughnessMap = maps.roughnessMap;
      m.normalScale.set(f.normal, f.normal);
      m.roughness = f.roughness;
      m.clearcoat = f.clearcoat;
      m.clearcoatRoughness = f.ccRough;
      break;
    }
    case "paint":
    case "powder": {
      const [r, cc, ccr] = FILM_SHEEN[s.sheen];
      setHex(m, s.color);
      m.normalMap = s.kind === "paint" ? MICRO.paint() : MICRO.powder();
      // Orange peel is shallow: visible only in the highlight, never as relief.
      const n = s.kind === "paint" ? 0.035 : s.sheen === "matte" ? 0.12 : 0.08;
      m.normalScale.set(n, n);
      // Powder coat cures harder and a touch shinier than a brushed enamel at
      // the same nominal sheen.
      m.roughness = s.kind === "powder" ? r * 0.9 : r;
      m.clearcoat = cc;
      m.clearcoatRoughness = ccr;
      if (s.kind === "powder" && s.metallic) {
        // Metallic powder: flake in the film makes it partly conductor-like;
        // the clear topcoat keeps a sharp dielectric highlight over it.
        m.metalness = 0.55;
        m.roughness = 0.38;
        m.normalMap = MICRO.flake();
        m.normalScale.set(0.18, 0.18);
        m.clearcoat = Math.max(cc, 0.4);
        m.clearcoatRoughness = 0.18;
      }
      break;
    }
    case "polymer": {
      const p = POLYMERS[s.polymer];
      setHex(m, s.color);
      m.roughness = p.roughness;
      m.ior = p.ior;
      if (p.specular != null) m.specularIntensity = p.specular;
      if (p.micro) {
        m.normalMap = MICRO[p.micro]();
        m.normalScale.set(p.normal, p.normal);
      }
      break;
    }
    case "metal":
      applyMetal(m, s.metal);
      break;
  }
  return m;
}

function applyMetal(m: THREE.MeshPhysicalMaterial, id: MetalId) {
  const d = METALS[id];
  m.color.setRGB(d.color[0], d.color[1], d.color[2], THREE.LinearSRGBColorSpace);
  m.metalness = d.metalness;
  m.roughness = d.roughness;
  if (d.anisotropy) {
    m.anisotropy = d.anisotropy;
    m.normalMap = MICRO.brushed();
    m.normalScale.set(0.25, 0.25);
  }
  if (d.clearcoat) {
    m.clearcoat = d.clearcoat;
    m.clearcoatRoughness = 0.04;
  }
  // Metals are all reflection: give them the full environment so they don't
  // go black in a dim room.
  m.envMapIntensity = 1.35;
}

export function metalMaterial(id: MetalId): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial();
  applyMetal(m, id);
  return m;
}

/** Glass: a thin pane, so reflection is Fresnel off two faces and what you
 *  see face-on is mostly what's behind it. Opacity stands in for
 *  transmission (see header); frosting scatters, so it raises opacity and
 *  roughness together; tints absorb, so they darken + raise opacity. */
export const GLASS: Record<GlassId, { color: string; opacity: number; roughness: number; flutes?: number; hammered?: boolean }> = {
  clear: { color: "#eef6f6", opacity: 0.16, roughness: 0.03 },
  frosted: { color: "#f4f7f7", opacity: 0.72, roughness: 0.55 }, // acid-etched
  fluted: { color: "#eef5f4", opacity: 0.42, roughness: 0.12, flutes: 0.013 }, // 13 mm flutes
  reeded: { color: "#eef5f4", opacity: 0.45, roughness: 0.1, flutes: 0.006 }, // 6 mm reeds
  textured: { color: "#f1f5f3", opacity: 0.5, roughness: 0.14, hammered: true },
  bronze: { color: "#6b5440", opacity: 0.55, roughness: 0.03 },
  grey: { color: "#4a4f52", opacity: 0.58, roughness: 0.03 },
};

export function glassMaterial(id: GlassId): THREE.MeshPhysicalMaterial {
  const g = GLASS[id];
  const m = new THREE.MeshPhysicalMaterial({
    color: g.color,
    roughness: g.roughness,
    metalness: 0,
    transparent: true,
    opacity: g.opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  m.ior = 1.52;
  m.envMapIntensity = 1.4;
  if (g.flutes) {
    m.normalMap = MICRO.flutes(g.flutes);
    m.normalScale.set(1, 1);
  }
  if (g.hammered) {
    m.normalMap = MICRO.hammered();
    m.normalScale.set(1, 1);
  }
  m.userData.baseOpacity = g.opacity;
  return m;
}

/** Rubber seal / gasket and the dark shadow line inside grooves. */
export function sealMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color: "#1b1b1c", roughness: 0.85, metalness: 0 });
}

/** The body material as seen at the bottom of a narrow routed channel: a
 *  6 x 3 mm groove sees a small slice of the room, so it is lit far less than
 *  the face around it. Stands in for the ambient occlusion this renderer
 *  doesn't compute; without it a groove is invisible face-on. */
export function recessMaterial(body: THREE.MeshPhysicalMaterial): THREE.MeshPhysicalMaterial {
  const m = body.clone();
  m.color.multiplyScalar(0.42);
  m.clearcoat = 0;
  return m;
}

// --- Reflections ---------------------------------------------------------------

const envByRenderer = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();

/**
 * What a door reflects. The scene's IBL is a procedural sky (Environment3d):
 * a bright overhead panel and two side panels over a BLACK horizon. A door
 * is vertical, so most of what its face and hardware reflect is that
 * horizon: stainless, chrome and brass rendered as black, and a gloss
 * lacquer read as matte. Real doors stand in rooms and reflect walls, floor
 * and windows, which is what RoomEnvironment is: a neutral interior with
 * light panels. Its level is tied to the scene's own IBL level every frame
 * (see DoorAssembly), so it never brightens a door past its surroundings.
 */
export function doorEnvMap(gl: THREE.WebGLRenderer): THREE.Texture {
  let t = envByRenderer.get(gl);
  if (!t) {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    t = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    envByRenderer.set(gl, t);
  }
  return t;
}
