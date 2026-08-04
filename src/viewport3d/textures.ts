"use client";

// Procedural floor textures: stylized wood, tile and concrete drawn once to a
// canvas, plus a derived normal map so grain, grout and micro-relief catch the
// light. No image assets, no network, deterministic across sessions. Floors
// carry meter-scale UVs, so texture.repeat is set from the physical cover size.

import { useEffect, useState } from "react";
import * as THREE from "three";
import type { FloorStyle } from "@/schema/scene";
import { loadFloorTextures, floorMaterialRoughness } from "@/materials/loader";
import { ktx2FloorsEnabled } from "@/lib/featureFlags";
import { getKtx2FloorMaterial } from "@/materials/registryKtx2";
import { loadKtx2FloorTextures } from "@/materials/loaderKtx2";

interface FloorTex {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  /** Only image-based catalog materials ship one; procedural styles use the
   *  scalar from floorRoughness() alone. */
  roughnessMap?: THREE.Texture;
  /** KTX2 catalog materials only — material-spec.md §6's packed ORM texture,
   *  same object as `roughnessMap`. See `loaderKtx2.ts` for why metalness
   *  isn't wired (every floor is dielectric). */
  aoMap?: THREE.Texture;
}
const cache = new Map<FloorStyle, FloorTex>();

/** The three procedurally drawn styles this module has always provided. */
type ProceduralStyle = "wood" | "tile" | "concrete";
const PROCEDURAL: ProceduralStyle[] = ["wood", "tile", "concrete"];
const isProcedural = (s: FloorStyle): s is ProceduralStyle =>
  (PROCEDURAL as string[]).includes(s);

/** A drawn colour canvas plus the real-world size (meters) it spans. */
interface Drawn {
  canvas: HTMLCanvasElement;
  cover: number;
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return [c, c.getContext("2d")!];
}

/** Small deterministic PRNG so textures are identical across sessions. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function woodCanvas(): Drawn {
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  const rnd = mulberry32(7);
  const planks = 4; // texture spans ~2.4m -> ~0.6m planks
  const pw = S / planks;
  for (let i = 0; i < planks; i++) {
    const tone = 0.88 + rnd() * 0.24;
    ctx.fillStyle = `rgb(${Math.round(166 * tone)}, ${Math.round(124 * tone)}, ${Math.round(82 * tone)})`;
    ctx.fillRect(i * pw, 0, pw, S);
    // grain
    ctx.strokeStyle = "rgba(90, 60, 30, 0.18)";
    ctx.lineWidth = 1;
    for (let g = 0; g < 7; g++) {
      const x = i * pw + rnd() * pw;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + rnd() * 6 - 3, S * 0.33, x + rnd() * 6 - 3, S * 0.66, x + rnd() * 4 - 2, S);
      ctx.stroke();
    }
    // plank seam
    ctx.fillStyle = "rgba(60, 40, 20, 0.55)";
    ctx.fillRect(i * pw, 0, 2, S);
    // board ends, staggered per plank
    const y0 = Math.floor(rnd() * 4) * (S / 4);
    ctx.fillRect(i * pw, y0, pw, 2);
  }
  return { canvas: c, cover: 2.4 };
}

function tileCanvas(): Drawn {
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  const rnd = mulberry32(3);
  const tiles = 2; // ~0.6m tiles over a 1.2m texture
  const tw = S / tiles;
  for (let i = 0; i < tiles; i++) {
    for (let j = 0; j < tiles; j++) {
      const tone = 0.95 + rnd() * 0.07;
      ctx.fillStyle = `rgb(${Math.round(214 * tone)}, ${Math.round(213 * tone)}, ${Math.round(206 * tone)})`;
      ctx.fillRect(i * tw, j * tw, tw, tw);
    }
  }
  ctx.strokeStyle = "rgba(140, 140, 132, 0.9)";
  ctx.lineWidth = 3;
  for (let i = 0; i <= tiles; i++) {
    ctx.beginPath(); ctx.moveTo(i * tw, 0); ctx.lineTo(i * tw, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * tw); ctx.lineTo(S, i * tw); ctx.stroke();
  }
  return { canvas: c, cover: 1.2 };
}

function concreteCanvas(): Drawn {
  const S = 128;
  const [c, ctx] = makeCanvas(S);
  const rnd = mulberry32(11);
  ctx.fillStyle = "#9aa0a8";
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    const v = 130 + Math.floor(rnd() * 60);
    ctx.fillStyle = `rgba(${v}, ${v + 4}, ${v + 8}, 0.16)`;
    ctx.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  return { canvas: c, cover: 1.6 };
}

/**
 * Derive a tiling normal map from a colour canvas: darker pixels read as lower,
 * so plank seams, grout lines and speckle become grooves. Central-difference
 * gradient, edge-wrapped so the result tiles seamlessly like the colour map.
 */
function heightToNormal(src: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const S = src.width;
  const data = src.getContext("2d")!.getImageData(0, 0, S, S).data;
  const h = (x: number, y: number) => {
    const xx = ((x % S) + S) % S;
    const yy = ((y % S) + S) % S;
    const i = (yy * S + xx) * 4;
    return (data[i] + data[i + 1] + data[i + 2]) / 765; // 0..1 luminance
  };
  const [out, octx] = makeCanvas(S);
  const img = octx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      img.data[i] = (-dx / len) * 0.5 * 255 + 127.5;
      img.data[i + 1] = (-dy / len) * 0.5 * 255 + 127.5;
      img.data[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

/** Shared tiling: meter-scale repeat (1 repeat spans `cover` meters). */
function applyTiling(tex: THREE.CanvasTexture, cover: number) {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.repeat.set(1 / cover, 1 / cover);
}

/** How pronounced each style's relief is (grout crisper than wood grain). */
const NORMAL_STRENGTH: Record<ProceduralStyle, number> = {
  wood: 2.2,
  tile: 3.5,
  concrete: 1.2,
};

/**
 * Textures for a floor style.
 *
 * Two sources feed this now. Ids in the image-based catalog (src/materials)
 * resolve to real PBR maps; the three original ids — and anything unrecognised,
 * so a project can never render an untextured floor — fall through to the
 * procedural canvases below.
 */
export function floorTexture(style: FloorStyle): FloorTex {
  let tex = cache.get(style);
  if (tex) return tex;

  if (!isProcedural(style)) {
    const loaded = loadFloorTextures(style);
    if (loaded) {
      cache.set(style, loaded);
      return loaded;
    }
  }

  // Procedural fallback. An unknown id lands on "wood" rather than crashing.
  const key: ProceduralStyle = isProcedural(style) ? style : "wood";
  const { canvas, cover } =
    key === "wood" ? woodCanvas() : key === "tile" ? tileCanvas() : concreteCanvas();
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  applyTiling(map, cover);
  const normalMap = new THREE.CanvasTexture(heightToNormal(canvas, NORMAL_STRENGTH[key]));
  normalMap.colorSpace = THREE.NoColorSpace; // normal data is linear, never sRGB
  applyTiling(normalMap, cover);
  tex = { map, normalMap };
  cache.set(style, tex);
  return tex;
}

const ktx2Cache = new Map<FloorStyle, FloorTex>();

/**
 * The loader boundary — M3d/D4. One conditional selecting an implementation,
 * both behind this same `FloorTex | null` shape, so the flag's eventual
 * removal is deleting the KTX2 branch and this wrapper, not untangling
 * `floorTexture` itself (unchanged above, still the WebP/procedural path).
 *
 * A hook, not a plain function — unlike `floorTexture`, the KTX2 branch is
 * genuinely async (`loaderKtx2.ts`'s header explains why the old
 * synchronous-placeholder trick doesn't apply to compressed textures), so
 * the "nothing to show yet" state has to be real React state, not a
 * borrowed reference. Returns `null` only during that window; the caller
 * (`FloorMesh.tsx`) renders a neutral placeholder material until it resolves.
 * When `ktx2FloorsEnabled` is off, or the style has no KTX2 registry entry
 * (the two floors dropped from that catalog — material-spec.md §2.2b — fall
 * through here exactly like an unrecognised id always has), this returns
 * `floorTexture(style)` directly: same function, same object, same
 * synchronous behaviour as before this flag existed.
 */
export function useFloorTexture(style: FloorStyle, gl: THREE.WebGLRenderer): FloorTex | null {
  const ktx2Material = ktx2FloorsEnabled ? getKtx2FloorMaterial(style) : undefined;
  // Tagged with the style it was resolved for, checked on read below — not
  // just set-and-trust. React runs this function body (with the previous
  // render's state) before the effect below has a chance to fire, so on the
  // very first render after `style` changes, naively returning the old
  // state would hand back one style's material with another's textures for
  // a frame. Tagging closes that window instead of accepting it.
  const [ktx2State, setKtx2State] = useState<{ style: FloorStyle; tex: FloorTex } | null>(null);

  useEffect(() => {
    if (!ktx2Material) return;
    const cached = ktx2Cache.get(style);
    if (cached) {
      setKtx2State({ style, tex: cached });
      return;
    }
    let cancelled = false;
    loadKtx2FloorTextures(ktx2Material, gl).then((set) => {
      if (cancelled) return;
      ktx2Cache.set(style, set);
      setKtx2State({ style, tex: set });
    });
    return () => {
      cancelled = true;
    };
  }, [style, ktx2Material, gl]);

  if (ktx2Material) return ktx2State?.style === style ? ktx2State.tex : null;
  return floorTexture(style);
}

/** Surface response for the procedural styles — tile is glossier than wood. */
const PROCEDURAL_ROUGHNESS: Record<ProceduralStyle, number> = {
  wood: 0.75,
  tile: 0.35,
  concrete: 0.9,
};

/** Base roughness for any floor style, catalog or procedural. */
export function floorRoughness(style: FloorStyle): number {
  if (!isProcedural(style)) {
    const r = floorMaterialRoughness(style);
    if (r !== null) return r;
  }
  return PROCEDURAL_ROUGHNESS[isProcedural(style) ? style : "wood"];
}
