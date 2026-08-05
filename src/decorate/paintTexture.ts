"use client";

// Wall-paint micro-detail: real painted plaster is never perfectly flat — the
// pigment and the roller both leave a faint, non-directional stipple. This is
// universal micro-detail (every painted wall gets it, regardless of color),
// not a per-wall choice — the paint's hue stays `wall.paintA`/`paintB` (set as
// `material.color`, WallMesh.tsx), this only contributes roughness variation
// and a subtle normal bump on top of it.
//
// wallGeometry.ts bakes real-meter UVs into the wall body geometry itself
// (paint tiles differently per wall-piece size, sharing one material across a
// whole wall's pieces — texture.repeat can't do that, only per-vertex UV can),
// so unlike textures.ts's floor textures this does NOT also divide by a cover
// size via texture.repeat — that would double-apply the scale baked into the
// UVs. Only RepeatWrapping is set here.

import * as THREE from "three";
import { makeCanvas, mulberry32, heightToNormal } from "./proceduralTexture";

export interface PaintTexture {
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

let cached: PaintTexture | null = null;

/** Non-directional luminance noise at TWO scales — no grain lines, no seams
 *  (paint isn't wood or stone; roller stipple is isotropic).
 *
 *  A single fine-dot layer alone (sub-mm real-world radius at this tile's
 *  physical size) reads as perfectly flat from any real viewing distance:
 *  the GPU's mipmap minification averages high-frequency noise down to a
 *  uniform grey the moment a texel maps to less than a screen pixel — only
 *  low-frequency structure survives that. So the macro layer below (soft
 *  blotches sized like real roller lap-marks) carries the visible-at-a-glance
 *  variation; the fine layer only matters up close. */
function stippleCanvas(): HTMLCanvasElement {
  const S = 128;
  const [c, ctx] = makeCanvas(S);
  const rnd = mulberry32(29);
  ctx.fillStyle = "#c8c8c8";
  ctx.fillRect(0, 0, S, S);

  // Macro: broad, soft lap-mark blotches — real-world ~5-12cm at
  // PAINT_TILE_M's physical scale (large enough to survive minification).
  for (let i = 0; i < 22; i++) {
    const v = 195 + Math.floor(rnd() * 45);
    ctx.fillStyle = `rgba(${v}, ${v}, ${v}, 0.06)`;
    const r = 16 + rnd() * 22;
    ctx.beginPath();
    ctx.arc(rnd() * S, rnd() * S, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fine: close-up roller/pigment grain.
  for (let i = 0; i < 1800; i++) {
    const v = 178 + Math.floor(rnd() * 60);
    ctx.fillStyle = `rgba(${v}, ${v}, ${v}, 0.10)`;
    const r = 0.6 + rnd() * 1.1;
    ctx.beginPath();
    ctx.arc(rnd() * S, rnd() * S, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

/** Roughness reads the SAME stipple: a roller's high points catch light
 *  slightly differently than its low points, so light/dark correlates with
 *  smooth/rough — same physical cause, so the same source canvas is right. */
function roughnessFromStipple(src: HTMLCanvasElement): HTMLCanvasElement {
  const S = src.width;
  const data = src.getContext("2d")!.getImageData(0, 0, S, S).data;
  const [out, octx] = makeCanvas(S);
  const img = octx.createImageData(S, S);
  const BASE = 214; // ~0.84 mid-roughness, matte plaster
  const SWING = 34; // subtle but visible — enough to read as "not perfectly flat" without looking like stucco
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 765;
    const v = Math.round(THREE.MathUtils.clamp(BASE + (lum - 0.5) * 2 * SWING, 0, 255));
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  return out;
}

export function paintTexture(): PaintTexture {
  if (cached) return cached;
  const stipple = stippleCanvas();

  const normalMap = new THREE.CanvasTexture(heightToNormal(stipple, 4));
  normalMap.colorSpace = THREE.NoColorSpace;
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;

  const roughnessMap = new THREE.CanvasTexture(roughnessFromStipple(stipple));
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;

  cached = { normalMap, roughnessMap };
  return cached;
}
