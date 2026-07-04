"use client";

// Procedural floor textures: stylized wood, tile and concrete drawn once to a
// canvas — no image assets, no network, and they stay crisp because floors
// carry meter-scale UVs (texture.repeat is set so a tile = real meters).

import * as THREE from "three";
import type { FloorStyle } from "@/schema/scene";

const cache = new Map<FloorStyle, THREE.CanvasTexture>();

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

function woodTexture(): THREE.CanvasTexture {
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
  const tex = new THREE.CanvasTexture(c);
  finish(tex, 2.4); // texture covers 2.4m x 2.4m
  return tex;
}

function tileTexture(): THREE.CanvasTexture {
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
  const tex = new THREE.CanvasTexture(c);
  finish(tex, 1.2);
  return tex;
}

function concreteTexture(): THREE.CanvasTexture {
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
  const tex = new THREE.CanvasTexture(c);
  finish(tex, 1.6);
  return tex;
}

function finish(tex: THREE.CanvasTexture, coverMeters: number) {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // Floor UVs are in meters: one repeat should span coverMeters.
  tex.repeat.set(1 / coverMeters, 1 / coverMeters);
}

export function floorTexture(style: FloorStyle): THREE.CanvasTexture {
  let tex = cache.get(style);
  if (!tex) {
    tex = style === "wood" ? woodTexture() : style === "tile" ? tileTexture() : concreteTexture();
    cache.set(style, tex);
  }
  return tex;
}

/** Surface response per style — tile is glossier than wood or concrete. */
export const FLOOR_ROUGHNESS: Record<FloorStyle, number> = {
  wood: 0.75,
  tile: 0.35,
  concrete: 0.9,
};
