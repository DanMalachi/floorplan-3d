/**
 * Decode a source map into the numbers the validator needs. Isolated from
 * `validate.ts` so the validation rules stay pure functions over plain numbers
 * — easy to unit-test without a filesystem or `sharp` in the loop — and this
 * file carries all the I/O and colour-space math instead.
 */
import sharp from "sharp";
import { GRADIENT_GRID_SIZE } from "./spec";

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
  /** material-spec.md §1.1b (M3d audit) — R² of a best-fit plane over an 8x8
   *  grid of block-mean luma. High means the image's darkest/brightest region
   *  is a smooth, spatially-correlated gradient (a corner or edge falloff) —
   *  the actual signature of baked light/shadow. Low means the extreme pixels
   *  are scattered or patterned (checker squares, grout lines, fibre noise),
   *  which a flat clip-fraction count can't tell apart from a bake but a
   *  gradient fit can. See `validate.ts`'s use of this against
   *  `GRADIENT_R2_THRESHOLD`. */
  gradientR2: number;
  /** Variance of the same 8x8 block-mean grid. Near zero means the material
   *  is uniform edge-to-edge (e.g. a near-black gloss tile) — in that case a
   *  high clip fraction has nothing to be a gradient of, so the gradient
   *  check is skipped entirely rather than dividing by ~0 variance. */
  blockVariance: number;
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

/** Reduce a per-pixel luma buffer to a `grid`×`grid` array of block means, with
 *  each block's normalised (0..1) center position — material-spec.md §1.1b. */
function blockMeans(
  luma: Float32Array,
  width: number,
  height: number,
  grid: number,
): { means: number[]; xs: number[]; ys: number[] } {
  const means: number[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  for (let gy = 0; gy < grid; gy++) {
    const y0 = Math.floor((gy * height) / grid);
    const y1 = Math.floor(((gy + 1) * height) / grid);
    for (let gx = 0; gx < grid; gx++) {
      const x0 = Math.floor((gx * width) / grid);
      const x1 = Math.floor(((gx + 1) * width) / grid);
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        const row = y * width;
        for (let x = x0; x < x1; x++) {
          sum += luma[row + x];
          n++;
        }
      }
      means.push(n > 0 ? sum / n : 0);
      xs.push((gx + 0.5) / grid);
      ys.push((gy + 0.5) / grid);
    }
  }
  return { means, xs, ys };
}

/**
 * R² of the best-fit plane `v = a*x + b*y + c` over the block grid, plus the
 * grid's own variance. `xs`/`ys` come from a regular grid (see `blockMeans`),
 * which makes x and y uncorrelated by construction (for every x value, y
 * ranges over the identical, symmetric set of values) — so the two marginal
 * single-variable regressions below equal the true multi-variable OLS
 * solution, without needing a matrix inversion for what is otherwise a
 * 3-parameter fit.
 */
function planarFit(xs: number[], ys: number[], vs: number[]): { r2: number; variance: number } {
  const n = vs.length;
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const xBar = mean(xs);
  const yBar = mean(ys);
  const vBar = mean(vs);
  let sxx = 0;
  let syy = 0;
  let sxv = 0;
  let syv = 0;
  let svv = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xBar;
    const dy = ys[i] - yBar;
    const dv = vs[i] - vBar;
    sxx += dx * dx;
    syy += dy * dy;
    sxv += dx * dv;
    syv += dy * dv;
    svv += dv * dv;
  }
  const variance = svv / n;
  if (svv <= 0) return { r2: 0, variance };
  const a = sxx > 0 ? sxv / sxx : 0;
  const b = syy > 0 ? syv / syy : 0;
  const c = vBar - a * xBar - b * yBar;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const pred = a * xs[i] + b * ys[i] + c;
    const e = vs[i] - pred;
    ssRes += e * e;
  }
  return { r2: Math.max(0, 1 - ssRes / svv), variance };
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
  const { means, xs, ys } = blockMeans(luma, width, height, GRADIENT_GRID_SIZE);
  const { r2, variance } = planarFit(xs, ys, means);
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
    gradientR2: r2,
    blockVariance: variance,
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
