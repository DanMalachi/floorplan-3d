"use client";

// Procedural micro-texture for the three fixture bodies (pendant/sconce/
// flushDisc, FixtureLayer.tsx) — currently flat-shaded primitives with no
// maps at all. A small brushed-metal roughness/normal pair, tileable, using
// the same canvas + derived-normal-map technique as paintTexture.ts. Applied
// via `texture.repeat` (not baked into geometry, unlike wallGeometry.ts's
// walls): these primitives (cylinder/cone/box) already carry ordinary 0..1
// UVs and are individually tiny (6-20cm), so the floor/door convention of
// physically-scaled repeat is unnecessary here — a fixed repeat count reads
// fine at this size.

import * as THREE from "three";
import { makeCanvas, mulberry32, heightToNormal, applyTiling } from "@/decorate/proceduralTexture";

export interface FixtureFinish {
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

let cached: FixtureFinish | null = null;

/** Brushed-metal streaks: mostly-horizontal fine lines, not isotropic noise —
 *  unlike paint, brushed metal genuinely has a grain direction. */
function brushedCanvas(): HTMLCanvasElement {
  const S = 128;
  const [c, ctx] = makeCanvas(S);
  const rnd = mulberry32(53);
  ctx.fillStyle = "#b0b0b4";
  ctx.fillRect(0, 0, S, S);
  ctx.lineWidth = 1;
  for (let i = 0; i < 220; i++) {
    const y = rnd() * S;
    const v = 150 + Math.floor(rnd() * 70);
    ctx.strokeStyle = `rgba(${v}, ${v}, ${v + 2}, 0.10)`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(S, y + (rnd() * 4 - 2));
    ctx.stroke();
  }
  return c;
}

/** Derived from the same brushed canvas, remapped into a controlled
 *  roughness band as its own untagged-colorspace canvas — never the source
 *  canvas reused directly (that one is drawn as if it were a color, and
 *  reusing it as roughness DATA would apply sRGB gamma to numbers that
 *  aren't colors, same rule paintTexture.ts/doorTexture.ts already follow). */
function brushedRoughnessCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const S = src.width;
  const data = src.getContext("2d")!.getImageData(0, 0, S, S).data;
  const [out, octx] = makeCanvas(S);
  const img = octx.createImageData(S, S);
  const BASE = 140; // ~0.55 — satin brushed metal, not mirror-polished
  const SWING = 28;
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

export function fixtureTexture(): FixtureFinish {
  if (cached) return cached;
  const canvas = brushedCanvas();

  const normalMap = new THREE.CanvasTexture(heightToNormal(canvas, 1.6));
  normalMap.colorSpace = THREE.NoColorSpace;
  applyTiling(normalMap, 0.06); // several repeats across a ~15-20cm housing

  const roughnessMap = new THREE.CanvasTexture(brushedRoughnessCanvas(canvas));
  roughnessMap.colorSpace = THREE.NoColorSpace;
  applyTiling(roughnessMap, 0.06);

  cached = { normalMap, roughnessMap };
  return cached;
}
