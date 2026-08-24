"use client";

// Procedural door finishes for `Opening.doorMaterial`. "painted-white"/
// "painted-charcoal" reuse the same roller-grain canvas as wall paint
// (paintTexture.ts) — real doors get repainted with the same stuff walls do
// — but on independent Texture instances (`.clone()`): the door leaf is a
// plain BoxGeometry with default 0..1 UVs (buildJoinery.ts's pieces render
// via `<boxGeometry args={p.size}/>` in WallMesh.tsx, no baked physical UVs
// like wallGeometry.ts's walls have), so it needs its OWN `texture.repeat` —
// mutating the shared wall-paint singleton's repeat would also break every
// painted wall using that same texture object.
//
// "oak" is a second, lighter-toned procedural wood grain — a fresh canvas,
// not textures.ts's `woodCanvas` (that one isn't exported, and is tuned for
// floor-plank proportions, not a door leaf's).

import * as THREE from "three";
import { makeCanvas, mulberry32, heightToNormal, applyTiling } from "./proceduralTexture";
import { paintTexture } from "./paintTexture";

export interface DoorFinish {
  /** Absent for painted finishes — color comes from `material.color` alone,
   *  same convention as wall paint. */
  map?: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

/** How many times the paint grain tiles across one door leaf. */
const DOOR_PAINT_REPEAT = 3;

let paintedCache: DoorFinish | null = null;
function paintedFinish(): DoorFinish {
  if (paintedCache) return paintedCache;
  const { normalMap: n, roughnessMap: r } = paintTexture();
  const normalMap = n.clone();
  normalMap.repeat.set(DOOR_PAINT_REPEAT, DOOR_PAINT_REPEAT);
  const roughnessMap = r.clone();
  roughnessMap.repeat.set(DOOR_PAINT_REPEAT, DOOR_PAINT_REPEAT);
  paintedCache = { normalMap, roughnessMap };
  return paintedCache;
}

function oakColorCanvas(): HTMLCanvasElement {
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  const rnd = mulberry32(41);
  // Lighter, warmer base than the real walnut photo asset — a genuinely
  // distinct second wood option, vertical grain running the leaf's height.
  ctx.fillStyle = "rgb(214, 178, 130)";
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = "rgba(140, 100, 60, 0.16)";
  ctx.lineWidth = 1;
  for (let g = 0; g < 14; g++) {
    const x = rnd() * S;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + rnd() * 8 - 4, S * 0.33, x + rnd() * 8 - 4, S * 0.66, x + rnd() * 6 - 3, S);
    ctx.stroke();
  }
  return c;
}

/** Derived from the SAME color canvas — grain reads as a roughness cue too
 *  (open pores catch light differently) — but as its own untagged-colorspace
 *  canvas, never the sRGB color texture itself (material-spec's "normal and
 *  roughness maps are DATA" rule: reusing an sRGB texture object as a
 *  roughness map applies a gamma curve to numbers that aren't colors). */
function oakRoughnessCanvas(colorCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const S = colorCanvas.width;
  const data = colorCanvas.getContext("2d")!.getImageData(0, 0, S, S).data;
  const [out, octx] = makeCanvas(S);
  const img = octx.createImageData(S, S);
  const BASE = 176; // ~0.69 — satin/matte natural wood, not lacquered
  const SWING = 30;
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

let oakCache: DoorFinish | null = null;
function oakFinish(): DoorFinish {
  if (oakCache) return oakCache;
  const colorCanvas = oakColorCanvas();
  const cover = 0.9; // one repeat roughly spans one door leaf's height

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  applyTiling(map, cover);

  const normalMap = new THREE.CanvasTexture(heightToNormal(colorCanvas, 2));
  normalMap.colorSpace = THREE.NoColorSpace;
  applyTiling(normalMap, cover);

  const roughnessMap = new THREE.CanvasTexture(oakRoughnessCanvas(colorCanvas));
  roughnessMap.colorSpace = THREE.NoColorSpace;
  applyTiling(roughnessMap, cover);

  oakCache = { map, normalMap, roughnessMap };
  return oakCache;
}

export function doorProceduralFinish(kind: "painted-white" | "painted-charcoal" | "oak"): DoorFinish {
  return kind === "oak" ? oakFinish() : paintedFinish();
}
