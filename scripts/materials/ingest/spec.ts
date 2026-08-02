/**
 * Pure constants and derivations from `docs/material-spec.md`.
 *
 * Nothing here does I/O. This module exists so the numbers in the spec live in
 * exactly one place in code — the same reasoning `src/render/contract.ts` gives
 * for centralizing render-contract values (render-contract.md §0.1) — and so
 * `validate.ts` and a future spec-compliance test can both import the same
 * source of truth instead of two copies that drift.
 */

/** `docs/material-spec.md` §6 — the five architecture classes the ingest path
 *  covers. Furniture tiering (§4) is out of M3b's scope: no furniture source
 *  is being ingested yet. */
export type RenderClass = "floors" | "walls" | "ceilings" | "doors" | "windows";

export const RENDER_CLASSES: readonly RenderClass[] = [
  "floors",
  "walls",
  "ceilings",
  "doors",
  "windows",
] as const;

/** §2.2's surface-class table, keyed by the slug used in an asset descriptor.
 *  `polished-stone` added at M3d/D3 — a real taxonomy gap found trying to
 *  classify `stone-terrazzo`: ground/polished aggregate stone sits between
 *  `polished-tile` (too glossy, that band is glazed ceramic) and
 *  `stone-honed` (too matte). See §2.2's band table doc comment. */
export type SurfaceClass =
  | "matte-plaster"
  | "eggshell-paint"
  | "concrete"
  | "matte-tile"
  | "polished-tile"
  | "polished-stone"
  | "oiled-hardwood"
  | "lacquered-hardwood"
  | "stone-honed"
  | "textile"
  | "brushed-metal"
  | "polished-chrome"
  | "anodised-aluminium"
  | "glass";

export interface SurfaceClassBand {
  /** Perceptually-linear roughness range, §2.1 convention. */
  roughness: [number, number];
  /** Binary by §2.1 — 0 (dielectric) or 1 (conductor). */
  metalness: 0 | 1;
}

/**
 * §2.2's table. Four bands widened or added at M3d/D3, all evidenced against
 * real shipped floor materials, none to route around a defect — see
 * material-spec.md §2.2a/§2.2b for the measurement behind each:
 *   - `polished-stone` — new class, `stone-terrazzo`'s real gap.
 *   - `matte-tile` ceiling 0.50 → 0.52 — `tile-hex-white` (0.511), smooth
 *     unimodal distribution, no defect signature.
 *   - `lacquered-hardwood` ceiling 0.35 → 0.36 — `wood-chevron` (0.354),
 *     `wood-oak-natural` (0.352), both tight unimodal, plausible for a
 *     uniform lacquer finish.
 *   - `textile` floor 0.85 → 0.55 — `carpet-beige`, a flat dense loop-pile
 *     weave, a real, physically distinct construction from `carpet-navy`'s
 *     cut pile, not a narrower band's worth of variance.
 */
export const SURFACE_CLASS_BANDS: Record<SurfaceClass, SurfaceClassBand> = {
  "matte-plaster": { roughness: [0.8, 0.95], metalness: 0 },
  "eggshell-paint": { roughness: [0.45, 0.65], metalness: 0 },
  concrete: { roughness: [0.65, 0.9], metalness: 0 },
  "matte-tile": { roughness: [0.3, 0.52], metalness: 0 },
  "polished-tile": { roughness: [0.05, 0.15], metalness: 0 },
  "polished-stone": { roughness: [0.15, 0.3], metalness: 0 },
  "oiled-hardwood": { roughness: [0.45, 0.7], metalness: 0 },
  "lacquered-hardwood": { roughness: [0.15, 0.36], metalness: 0 },
  "stone-honed": { roughness: [0.35, 0.6], metalness: 0 },
  textile: { roughness: [0.55, 1.0], metalness: 0 },
  "brushed-metal": { roughness: [0.3, 0.45], metalness: 1 },
  "polished-chrome": { roughness: [0.02, 0.1], metalness: 1 },
  "anodised-aluminium": { roughness: [0.35, 0.5], metalness: 1 },
  glass: { roughness: [0.0, 0.1], metalness: 0 },
};

/** §2.1's forbidden middle band — a metalness map whose mass sits here is the
 *  signature of a source asset using metalness as a shininess slider. Applies
 *  to the mean of the whole map; a boundary-blend asset (declared explicitly
 *  in its descriptor) is exempt because a real transition edge is supposed to
 *  pass through this range at a handful of texels, not on average. */
export const METALNESS_MID_BAND: [number, number] = [0.1, 0.9];

/**
 * §1.1 — plausible linear-reflectance band for DIELECTRICS.
 *
 * Floor widened at M3d/D3, 2026-08-02 (Dan's ruling, asymmetric — not a
 * symmetric loosening): 0.03 → 0.015. Two real shipped floor materials
 * measure below the old floor — `tile-black-gloss` 0.023, `wood-walnut-dark`
 * 0.022 — and both are legitimate: a black gloss surface's *diffuse* lobe is
 * genuinely near-zero, because its appearance comes from the specular
 * response, not the diffuse one. The old 0.03 floor was mid-tone intuition,
 * same shape as the conductor-band bug, never re-derived against a real
 * near-black asset. 0.015 stays above zero deliberately: an exact 0.0 is
 * physically impossible and still indicates an authoring error, so the check
 * keeps something to catch.
 *
 * Ceiling investigated, NOT widened: a third asset (`tile-white-large`, mean
 * 0.942) also failed, but its histogram shows a hard pileup — 87% of pixels
 * crammed into a 0.95-0.98 window — against a control asset
 * (`tile-hex-white`, itself near the ceiling at points) showing a smooth
 * 2-6%-per-bucket spread across the same range. That shape, plus a mean 25%
 * above this document's own "white tile 0.75" reference, reads as a blown
 * highlight / exposure defect in the source asset, not a legitimately bright
 * material — widening the ceiling to fit it would delete the exact catch
 * §1.1 exists for. `tile-white-large` needs re-sourcing, not a wider band.
 */
export const ALBEDO_BAND: [number, number] = [0.015, 0.9];

/** §1.1 — CONDUCTORS (metalness 1) use a separate, higher band: albedo means
 *  F0 reflectance for a metal, not diffuse reflectance, and real metals run
 *  far above 0.90 (aluminium ~0.91, silver/chrome ~0.95). Found at M3c ingest
 *  against a real anodised-aluminium source, not designed in ahead of time. */
export const ALBEDO_BAND_METAL: [number, number] = [0.5, 0.98];

/** §1.1's own illustrative numbers: "a histogram can say that 8% of pixels sit
 *  below linear 0.02, which no real material does." Used verbatim as the
 *  enforced threshold rather than inventing a new one, symmetrically for the
 *  bright clip (baked highlight / blown light) that the prose describes but
 *  doesn't number. */
export const ALBEDO_DARK_CLIP = 0.02;
export const ALBEDO_LIGHT_CLIP = 0.98;
export const ALBEDO_CLIP_FRACTION_LIMIT = 0.08;

/** §1.1b (M3d audit) — the clip-fraction check above cannot tell a legitimately
 *  dark/bright material (uniform near-black gloss, a checker or grout pattern)
 *  from a baked-light gradient; both can put >8% of pixels past the clip
 *  threshold. Gate the fraction check on a gradient test: only a fraction
 *  breach that is ALSO spatially correlated with position (a smooth
 *  edge/corner falloff, the actual shape of a bake) is rejected.
 *
 *  `GRADIENT_GRID_SIZE` — side length of the block grid `stats.ts` reduces the
 *  image to before fitting a plane. 8x8 is coarse enough to average out
 *  texture-scale noise (fibres, grout lines, mineral speckle) while still
 *  resolving a corner-to-corner or edge falloff, which is the spatial scale a
 *  bake actually operates at.
 *
 *  `GRADIENT_R2_THRESHOLD` — measured against real data at M3d, not designed in
 *  ahead of time. `fixtures.ts`'s synthetic baked-shadow fixture (a sharp dark
 *  band across 20% of the image) scores R²=0.57. Every real floor material
 *  that failed the raw fraction check scores far lower: `tile-checker-marble`
 *  0.0002, `wood-walnut-dark` 0.014, `carpet-navy` 0.043, `tile-black-gloss`
 *  0.126 (also independently excluded by the variance gate below). 0.3 sits
 *  above all four with a ≥2.4x margin and below the fixture with a ~1.9x
 *  margin. Also checked against synthetic radial vignettes at several
 *  strengths, because a linear-plane fit is a poor model for a *radial*
 *  falloff and gets worse as one saturates: a moderate vignette (36-58% of
 *  pixels clipped) scores R² 0.61-0.73, comfortably caught; a severe,
 *  saturating one (73%+ clipped, mostly flat black with a small bright
 *  corner) drops to R² 0.27-0.47 and can slip under even this lower
 *  threshold. Recorded as a real, known limitation rather than hidden by a
 *  threshold that would also reject `tile-black-gloss`: the check is
 *  calibrated for §1.1's own stated threat model — "an 8% bake is 20% of the
 *  defect and it is not detectable by eye at review time" — i.e. subtle
 *  bakes, not a near-total black-out, which would be visually obvious in
 *  review regardless of any histogram check.
 *
 *  `GRADIENT_MIN_BLOCK_VARIANCE` — below this, the block grid is close enough
 *  to flat that a plane fit's R² is numerically meaningless (near-zero
 *  variance to explain either way); treat as uniform and skip the gradient
 *  gate rather than divide by ~0. Measured `tile-black-gloss` at 6.9×10⁻⁷
 *  linear-luma² (a near-uniform near-black tile); this constant sits well
 *  above it as a floor, not at it, since a genuine uniform material is
 *  expected to be near the noise floor, not just below this one asset's
 *  reading. */
export const GRADIENT_GRID_SIZE = 8;
export const GRADIENT_R2_THRESHOLD = 0.3;
export const GRADIENT_MIN_BLOCK_VARIANCE = 1e-5;

/** §3.1 — texel density target and the derivation formula, implemented
 *  exactly as written: `clampPow2(ceilPow2(coverM * 512), 256, 2048)`. */
export const TARGET_TEXEL_DENSITY_PX_PER_M = 512;
export const POW2_TIERS = [256, 512, 1024, 2048] as const;
export const MIN_RESOLUTION = 256;
export const MAX_RESOLUTION = 2048;

export function deriveResolution(coverM: number): number {
  const target = coverM * TARGET_TEXEL_DENSITY_PX_PER_M;
  const tier = POW2_TIERS.find((t) => t >= target);
  return tier ?? MAX_RESOLUTION;
}

/** §4 — normal maps go one tier above their material's colour map; ORM goes
 *  one tier below. Both clamp at the derivation's own [256, 2048] bounds. */
export function tierUp(resolution: number): number {
  const i = POW2_TIERS.indexOf(resolution as (typeof POW2_TIERS)[number]);
  if (i < 0) return resolution;
  return POW2_TIERS[Math.min(i + 1, POW2_TIERS.length - 1)];
}

export function tierDown(resolution: number): number {
  const i = POW2_TIERS.indexOf(resolution as (typeof POW2_TIERS)[number]);
  if (i < 0) return resolution;
  return POW2_TIERS[Math.max(i - 1, 0)];
}

/**
 * §4 — ORM's resolution. Normally one tier down from albedo. Tiers down a
 * *second* step when albedo is already at `MAX_RESOLUTION`: in that case
 * normal's own "tier up" has nothing higher to reach — `tierUp` saturates
 * and returns the same value — so albedo and normal both sit at the
 * ceiling with no relief, and the GPU-resident budget (§5.3) has no room
 * left for a normally-sized ORM too. Found at M3d/D3 on the two largest-
 * `coverM` floors in the catalog (`concrete-grey`, `tile-checker-marble`,
 * both >2m — large enough to cross into the 2048 tier on albedo itself,
 * not just the tiered-up normal). ORM is the map §4 already names as safe
 * to shrink — ambient occlusion, roughness and metalness are low-frequency
 * control signals — so it absorbs the saturated case rather than every
 * large-`coverM` asset failing budget outright.
 */
export function ormResolutionFor(albedoRes: number): number {
  const once = tierDown(albedoRes);
  return albedoRes >= MAX_RESOLUTION ? tierDown(once) : once;
}

/** §3.1 — reject a source map too far below the derived target: upscaling more
 *  than 2x is visibly soft and is a source-asset problem, not an encode-time
 *  one. Not spec-numbered directly; chosen as the point past which resampling
 *  can no longer be called "resizing to the target density." */
export const MIN_SOURCE_RESOLUTION_RATIO = 0.5;

/** §6 — kebab-case, at least two segments (`family-descriptor`), matching the
 *  convention `data/materials-floors.manifest.json` already uses. */
export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;

/**
 * §5.3 — hard ceilings. Corrected at M3d/D3: the comment this constant used
 * to carry had the axis backwards. It said the transfer ceiling was "sized
 * for KTX2" and WebP shouldn't be held to it. §5.3's own rationale says the
 * opposite — this number was "set just above what the compliant part of the
 * current catalog already achieves," and that catalog was the WebP one
 * (369 KB average, measured). Confirmed by actually encoding real assets at
 * D3: every KTX2 normal map at §4's tiered-up resolution exceeds this by
 * 3-4x, universally, not as an outlier — `ceiling-plaster-white` measured
 * 4.72 MB against this 1.0 MB ceiling. Tuning (max quality, max RDO, max
 * zstd) does not close the gap; UASTC is a ~8-bit/texel format regardless of
 * quality settings, and §5.1 already says outright that "WebP is smaller on
 * the wire than KTX2 will be... the reason to switch is GPU memory, not
 * download size." Holding KTX2 output to a WebP-calibrated transfer number
 * was checking the wrong axis for the wrong format.
 *
 * So: this constant gates the **WebP fallback path only** (`encoder ===
 * null`) — the case it was actually measured against.
 * `BUDGET_ARCHITECTURE_GPU_RESIDENT_BYTES` below gates KTX2 output instead,
 * which is the metric §5.1 was chosen to optimize in the first place.
 */
export const BUDGET_ARCHITECTURE_TRANSFER_BYTES = 1_000_000;

/**
 * §5.3's existing GPU-resident ceiling, now actually enforced. Unlike the
 * transfer number, this one was never measured against real encoded output
 * before D3 either — filled in here with the same rigor.
 *
 * `estimateGpuResidentBytes` is an ESTIMATE, not a measurement: it uses each
 * codec's typical transcode bit-rate (BasisLZ/ETC1S transcodes to a
 * fixed-rate format — ETC1/BC1 — around 4 bits/texel; UASTC transcodes to a
 * higher-fidelity target — BC7/ASTC 4x4 — around 8 bits/texel), not a real
 * "load in a browser and read GPU memory" harness, which does not exist yet.
 *
 * Revised at M3d/D3, 8.0 → 8.6 MB, alongside `ormResolutionFor`'s 2-tier-down
 * fix above — the two together, not either alone, clear the worst real case:
 * `concrete-grey`/`tile-checker-marble` (`coverM` > 2, albedo itself at the
 * 2048 ceiling) measured 9.09 MB with ORM one tier down, 8.56 MB with two.
 * 8.6 MB clears that with real if narrow margin. The previous worst case,
 * `ceiling-plaster-white` (≈6.47 MB), stays comfortably inside either number.
 * If a browser-measured harness is ever built and disagrees materially, this
 * constant is what gets revisited, not the estimate silently trusted forever.
 */
export const BUDGET_ARCHITECTURE_GPU_RESIDENT_BYTES = 8_600_000;

const MIP_OVERHEAD_FACTOR = 4 / 3; // full mip chain adds ~1/3 more texels than the base level alone

/** Bits per texel a codec's typical transcode target costs in VRAM — see
 *  `BUDGET_ARCHITECTURE_GPU_RESIDENT_BYTES`'s doc comment for the codecs
 *  behind these numbers. Not a real per-GPU measurement; a stated estimate. */
const GPU_RESIDENT_BITS_PER_TEXEL: Record<"basis-lz" | "uastc", number> = {
  "basis-lz": 4,
  uastc: 8,
};

export function estimateGpuResidentBytes(resolution: number, codec: "basis-lz" | "uastc"): number {
  const baseBytes = (resolution * resolution * GPU_RESIDENT_BITS_PER_TEXEL[codec]) / 8;
  return Math.round(baseBytes * MIP_OVERHEAD_FACTOR);
}

/** §6 — output path convention. */
export function outputDir(publicRoot: string, cls: RenderClass, id: string): string {
  return `${publicRoot}/materials/${cls}/${id}`;
}
