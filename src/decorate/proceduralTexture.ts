"use client";

// Shared canvas-texture helpers for procedurally-drawn material micro-detail
// (paint grain, door/window finishes, fixture bodies — see paintTexture.ts and
// siblings). Deliberately a standalone copy of the pattern already used by the
// protected src/viewport3d/textures.ts (floor textures), not an import from
// it — textures.ts's helpers aren't exported, and duplicating ~20 lines here
// keeps every consumer of this pattern out of that protected file entirely.

import * as THREE from "three";

export function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return [c, c.getContext("2d")!];
}

/** Small deterministic PRNG so textures are identical across sessions. */
export function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Derive a tiling normal map from a colour canvas: darker pixels read as
 * lower, so speckle/grain becomes micro-relief. Central-difference gradient,
 * edge-wrapped so the result tiles seamlessly like the colour map.
 */
export function heightToNormal(src: HTMLCanvasElement, strength: number): HTMLCanvasElement {
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
export function applyTiling(tex: THREE.Texture, cover: number): void {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.repeat.set(1 / cover, 1 / cover);
}
