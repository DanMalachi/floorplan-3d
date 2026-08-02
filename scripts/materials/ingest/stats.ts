/**
 * Decode a source map into the numbers the validator needs. Isolated from
 * `validate.ts` so the validation rules stay pure functions over plain numbers
 * — easy to unit-test without a filesystem or `sharp` in the loop — and this
 * file carries all the I/O and colour-space math instead.
 */
import sharp from "sharp";

export interface ImageStats {
  width: number;
  height: number;
  /** Fraction of pixels below / above the clip thresholds, and the mean —
   *  all in LINEAR light, computed by decoding the file as sRGB and applying
   *  the standard transfer function. Only meaningful for colour (albedo)
   *  maps; data maps (roughness/metalness/AO/normal) are never sRGB-decoded
   *  (material-spec.md §1.2, restated from render-contract.md §1.2). */
  linearMean: number;
  fractionBelow: (threshold: number) => number;
  fractionAbove: (threshold: number) => number;
}

export interface ScalarMapStats {
  width: number;
  height: number;
  /** Mean of the raw channel value, 0..1, NOT gamma-decoded — these are data
   *  channels, and the pixel value already is the scalar. */
  mean: number;
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Albedo: decode as sRGB, return per-pixel linear luma stats. */
export async function albedoStats(path: string): Promise<ImageStats> {
  const img = sharp(path);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const n = width * height;
  const luma = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * channels;
    const r = srgbToLinear(data[o]);
    const g = srgbToLinear(data[o + 1]);
    const b = srgbToLinear(data[o + 2]);
    luma[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  let sum = 0;
  for (let i = 0; i < n; i++) sum += luma[i];
  return {
    width,
    height,
    linearMean: sum / n,
    fractionBelow: (t) => {
      let c = 0;
      for (let i = 0; i < n; i++) if (luma[i] < t) c++;
      return c / n;
    },
    fractionAbove: (t) => {
      let c = 0;
      for (let i = 0; i < n; i++) if (luma[i] > t) c++;
      return c / n;
    },
  };
}

/** Roughness / metalness / AO: single-channel data, no gamma decode. Accepts
 *  either a genuinely single-channel source or an RGB one (averages the
 *  channels — a common export mistake this at least doesn't crash on). */
export async function scalarMapStats(path: string): Promise<ScalarMapStats> {
  const img = sharp(path).greyscale();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const n = width * height;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += data[i] / 255;
  return { width, height, mean: sum / n };
}

/** Normal map plausibility only — see `validate.ts` for why GL-vs-DX handedness
 *  cannot be verified from pixel statistics alone. */
export async function normalMapStats(
  path: string,
): Promise<{ width: number; height: number; blueMean: number }> {
  const img = sharp(path);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const n = width * height;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += data[i * channels + 2] / 255;
  return { width, height, blueMean: sum / n };
}
