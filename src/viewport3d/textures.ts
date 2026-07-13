"use client";

// Procedural floor textures: stylized wood, tile and concrete drawn once to a
// canvas, plus a derived normal map so grain, grout and micro-relief catch the
// light. No image assets, no network, deterministic across sessions. Floors
// carry meter-scale UVs, so texture.repeat is set from the physical cover size.

import * as THREE from "three";
import type { FloorStyle } from "@/schema/scene";

interface FloorTex {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
}
const cache = new Map<FloorStyle, FloorTex>();

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
const NORMAL_STRENGTH: Record<FloorStyle, number> = {
  wood: 2.2,
  tile: 3.5,
  concrete: 1.2,
};

export function floorTexture(style: FloorStyle): FloorTex {
  let tex = cache.get(style);
  if (!tex) {
    const { canvas, cover } =
      style === "wood" ? woodCanvas() : style === "tile" ? tileCanvas() : concreteCanvas();
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    applyTiling(map, cover);
    const normalMap = new THREE.CanvasTexture(heightToNormal(canvas, NORMAL_STRENGTH[style]));
    normalMap.colorSpace = THREE.NoColorSpace; // normal data is linear, never sRGB
    applyTiling(normalMap, cover);
    tex = { map, normalMap };
    cache.set(style, tex);
  }
  return tex;
}

// --- Suburb lawn (F5.2) ------------------------------------------------------
// One procedural grass canvas + derived normal map, sized in meters like the
// floor textures. It has a single consumer (the suburb lawn), which sets
// `repeat` from its own ground size.

/** A lawn texture tile spans this many meters. */
export const GRASS_COVER = 3;

function grassCanvas(): HTMLCanvasElement {
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  const rnd = mulberry32(23);
  ctx.fillStyle = "#5c7a40"; // base lawn green
  ctx.fillRect(0, 0, S, S);
  // Broad, low-contrast tonal patches so the repeat doesn't read as a grid.
  for (let i = 0; i < 44; i++) {
    ctx.fillStyle =
      rnd() < 0.5
        ? `rgba(150, 178, 96, ${0.05 + rnd() * 0.06})`
        : `rgba(40, 62, 28, ${0.05 + rnd() * 0.06})`;
    ctx.beginPath();
    ctx.arc(rnd() * S, rnd() * S, 18 + rnd() * 54, 0, Math.PI * 2);
    ctx.fill();
  }
  // Fine blades: short near-vertical strokes, half dark half light.
  for (let i = 0; i < 1600; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const len = 2 + rnd() * 3;
    ctx.strokeStyle = rnd() < 0.5 ? "rgba(38, 60, 26, 0.30)" : "rgba(156, 190, 100, 0.30)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() * 2 - 1), y - len);
    ctx.stroke();
  }
  return c;
}

let grassCache: FloorTex | null = null;

/** Shared procedural lawn colour + normal map. Leaves `repeat` to the caller
 *  (set it from ground size ÷ GRASS_COVER). */
export function grassTexture(): FloorTex {
  if (!grassCache) {
    const canvas = grassCanvas();
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = 8;
    const normalMap = new THREE.CanvasTexture(heightToNormal(canvas, 1.4));
    normalMap.colorSpace = THREE.NoColorSpace;
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    normalMap.anisotropy = 8;
    grassCache = { map, normalMap };
  }
  return grassCache;
}

/** Surface response per style — tile is glossier than wood or concrete. */
export const FLOOR_ROUGHNESS: Record<FloorStyle, number> = {
  wood: 0.75,
  tile: 0.35,
  concrete: 0.9,
};
