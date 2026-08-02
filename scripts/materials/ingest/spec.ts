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

/** §2.2's surface-class table, keyed by the slug used in an asset descriptor. */
export type SurfaceClass =
  | "matte-plaster"
  | "eggshell-paint"
  | "concrete"
  | "matte-tile"
  | "polished-tile"
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

/** §2.2's table, verbatim. */
export const SURFACE_CLASS_BANDS: Record<SurfaceClass, SurfaceClassBand> = {
  "matte-plaster": { roughness: [0.8, 0.95], metalness: 0 },
  "eggshell-paint": { roughness: [0.45, 0.65], metalness: 0 },
  concrete: { roughness: [0.65, 0.9], metalness: 0 },
  "matte-tile": { roughness: [0.3, 0.5], metalness: 0 },
  "polished-tile": { roughness: [0.05, 0.15], metalness: 0 },
  "oiled-hardwood": { roughness: [0.45, 0.7], metalness: 0 },
  "lacquered-hardwood": { roughness: [0.15, 0.35], metalness: 0 },
  "stone-honed": { roughness: [0.35, 0.6], metalness: 0 },
  textile: { roughness: [0.85, 1.0], metalness: 0 },
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

/** §1.1 — plausible linear-reflectance band for DIELECTRICS. Nothing in a home
 *  is darker than charcoal or brighter than fresh snow. */
export const ALBEDO_BAND: [number, number] = [0.03, 0.9];

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

/** §3.1 — reject a source map too far below the derived target: upscaling more
 *  than 2x is visibly soft and is a source-asset problem, not an encode-time
 *  one. Not spec-numbered directly; chosen as the point past which resampling
 *  can no longer be called "resizing to the target density." */
export const MIN_SOURCE_RESOLUTION_RATIO = 0.5;

/** §6 — kebab-case, at least two segments (`family-descriptor`), matching the
 *  convention `data/materials-floors.manifest.json` already uses. */
export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;

/** §5.3 — hard ceilings, enforced only once an asset is actually KTX2-encoded
 *  (see `encoder.ts`). An unencoded WebP fallback is measured but not gated
 *  against this table, because §5.1 is explicit that WebP's problem is GPU
 *  memory, not transfer size, and a byte comparison against a table sized for
 *  KTX2 would be comparing the wrong axis. */
export const BUDGET_ARCHITECTURE_TRANSFER_BYTES = 1_000_000;

/** §6 — output path convention. */
export function outputDir(publicRoot: string, cls: RenderClass, id: string): string {
  return `${publicRoot}/materials/${cls}/${id}`;
}
