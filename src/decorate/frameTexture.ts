"use client";

// Procedural micro-detail for the MATTE window/patio-door frame finish.
//
// Glossy frames keep the real ingested anodised-aluminium photo set
// (loaderWindows.ts) — a polished metal frame genuinely is a mirror with
// brush streaks in it, and a photo carries that better than anything drawn.
// Matte is not that material at all: a matte frame is powder-coated, and a
// powder coat is a fine bead-blast speckle over an opaque paint film, with
// almost no specular left. Rendering it as the same brushed-metal photo with
// the roughness dialled up gave a surface that still read as polished metal,
// and swallowed any colour tinted over it, since a metallic albedo multiplies
// the tint down towards black.
//
// So matte gets its own surface: no colour map at all (the tint IS the
// colour, same convention as wall paint), plus a grain that carries BOTH a
// normal and a matching roughness map — a flat fill with one of the two reads
// as printed vinyl rather than a coated metal.

import * as THREE from "three";
import { makeCanvas, mulberry32, heightToNormal, applyTiling } from "./proceduralTexture";

export interface FrameFinish {
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

// One repeat spans 6 cm — about the width of a frame member (buildJoinery's
// FRAME_W is 0.06), so the speckle lands at a believable physical size on the
// jamb rather than smearing into a gradient.
const GRAIN_COVER_M = 0.06;

// Powder coat is matte, but not dead flat: a shallow roughness swing is what
// separates "coated metal" from "matte plastic".
const ROUGH_BASE = 224; // ~0.88
const ROUGH_SWING = 14; // ~0.055

/**
 * Bead-blast speckle. Per-pixel noise softened by a second, coarser pass, so
 * the grain has two scales the way a real blasted surface does — pure
 * per-pixel noise aliases into a shimmer as soon as the camera moves.
 */
function grainCanvas(): HTMLCanvasElement {
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  const rnd = mulberry32(907);
  const img = ctx.createImageData(S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (rnd() - 0.5) * 90;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // Coarser mottling on top: slightly uneven coat thickness.
  for (let k = 0; k < 220; k++) {
    const r = 2 + rnd() * 5;
    ctx.fillStyle = `rgba(${rnd() > 0.5 ? 255 : 0},${rnd() > 0.5 ? 255 : 0},${rnd() > 0.5 ? 255 : 0},0.045)`;
    ctx.beginPath();
    ctx.arc(rnd() * S, rnd() * S, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

/** Roughness from the SAME grain, as its own untagged-colourspace canvas —
 *  normal and roughness maps are DATA, and reusing an sRGB texture object as a
 *  roughness map applies a gamma curve to numbers that aren't colours
 *  (material-spec's rule, same as doorTexture.ts's oak). */
function roughnessCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const S = src.width;
  const data = src.getContext("2d")!.getImageData(0, 0, S, S).data;
  const [out, octx] = makeCanvas(S);
  const img = octx.createImageData(S, S);
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 765;
    // Higher spots on the blast pattern catch marginally more light.
    const v = Math.round(THREE.MathUtils.clamp(ROUGH_BASE - (lum - 0.5) * 2 * ROUGH_SWING, 0, 255));
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  return out;
}

let cache: FrameFinish | null = null;

/** The matte (powder-coated) frame surface. Cached — every frame in the
 *  project shares one texture pair; only `material.color` differs. */
export function frameMatteFinish(): FrameFinish {
  if (cache) return cache;
  const grain = grainCanvas();

  const normalMap = new THREE.CanvasTexture(heightToNormal(grain, 1.6));
  normalMap.colorSpace = THREE.NoColorSpace;
  applyTiling(normalMap, GRAIN_COVER_M);

  const roughnessMap = new THREE.CanvasTexture(roughnessCanvas(grain));
  roughnessMap.colorSpace = THREE.NoColorSpace;
  applyTiling(roughnessMap, GRAIN_COVER_M);

  cache = { normalMap, roughnessMap };
  return cache;
}

/** Untinted matte reads as raw anodised grey rather than white — a frame
 *  nobody has chosen a colour for is still a metal frame. */
export const MATTE_NEUTRAL = "#b6b9bd";

/**
 * How matte reads, in one place — every number that decides "how much light
 * does this frame throw back" lives here rather than half here and half in the
 * renderer, so the finish is tuned by editing one block.
 *
 * `metalness` is the one that actually matters. A metal reflects its
 * surroundings no matter how rough it is, so dialling roughness up alone (the
 * old matte, at 0.55 against glossy's 0.15) left a frame that still read as
 * polished, just blurrier. Dropping metalness turns it into a coated surface,
 * and `envMapIntensity` takes the sky back out of what remains.
 */
export const MATTE_SHADING = {
  roughness: 0.92,
  metalness: 0.08,
  envMapIntensity: 0.25,
  /** Grain relief. Above ~0.8 the speckle starts to read as orange peel. */
  normalScale: 0.5,
} as const;

/** Polished anodised aluminium — a real mirror, unchanged. */
export const GLOSSY_SHADING = {
  roughness: 0.15,
  envMapIntensity: 1,
  normalScale: 1,
} as const;
