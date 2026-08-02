/**
 * Pure validation rules from `docs/material-spec.md`. Every function here
 * takes plain numbers/descriptors and returns `Violation[]` — no filesystem,
 * no `sharp` — so the rules themselves are unit-testable independent of
 * decoding (`stats.ts` does the decoding, `run.ts` wires the two together).
 *
 * Each violation names the clause it failed. That is the M3 exit bar: "a
 * validation step that rejects non-conforming inputs with a specific reason,"
 * not just "invalid."
 */
import {
  ALBEDO_BAND,
  ALBEDO_BAND_METAL,
  ALBEDO_CLIP_FRACTION_LIMIT,
  ALBEDO_DARK_CLIP,
  ALBEDO_LIGHT_CLIP,
  ID_PATTERN,
  METALNESS_MID_BAND,
  MIN_SOURCE_RESOLUTION_RATIO,
  RENDER_CLASSES,
  SURFACE_CLASS_BANDS,
  deriveResolution,
  type SurfaceClass,
} from "./spec";
import type { AssetSource, Violation } from "./types";
import type { ImageStats, ScalarMapStats } from "./stats";

/** §6 — naming and required fields, checkable before any pixel is decoded. */
export function validateDescriptor(a: AssetSource): Violation[] {
  const v: Violation[] = [];
  if (!ID_PATTERN.test(a.id)) {
    v.push({
      clause: "§6",
      message: `id "${a.id}" is not kebab-case family-descriptor (e.g. "wood-oak-natural")`,
    });
  }
  if (!RENDER_CLASSES.includes(a.class)) {
    v.push({ clause: "§6", message: `class "${a.class}" is not one of ${RENDER_CLASSES.join(" | ")}` });
  }
  if (!(a.surfaceClass in SURFACE_CLASS_BANDS)) {
    v.push({ clause: "§2.2", message: `unknown surfaceClass "${a.surfaceClass}"` });
  }
  if (!(a.coverM > 0)) {
    v.push({ clause: "§3.1", message: `coverM must be > 0, got ${a.coverM}` });
  }
  if (a.maps.roughness && a.roughnessScalar !== undefined && a.roughnessScalar !== 1) {
    v.push({
      clause: "§2.1",
      message:
        "roughnessScalar must be omitted or exactly 1.0 when a roughness map is present " +
        "— a scalar tuning a map is the defect this clause forbids",
    });
  }
  if (!a.maps.roughness && a.roughnessScalar === undefined) {
    v.push({ clause: "§2.1", message: "roughnessScalar is required when no roughness map is provided" });
  }
  if (a.maps.metalness && a.metalnessScalar !== undefined && a.metalnessScalar !== 1) {
    v.push({
      clause: "§2.1",
      message: "metalnessScalar must be omitted or exactly 1.0 when a metalness map is present",
    });
  }
  return v;
}

/** §1.1 — the load-bearing clause. Rejects baked lighting/shadow/AO by its
 *  statistical signature rather than by inspection.
 *
 *  `isConductor` selects the band: a conductor's "albedo" is F0 reflectance,
 *  not diffuse reflectance, and real metals run far brighter than any real
 *  paint or wood (aluminium ~0.91, silver/chrome ~0.95) — found against a
 *  real anodised-aluminium source at M3c ingest, not designed in ahead of
 *  time. The light-clip check is skipped for conductors: a uniformly bright
 *  frame is the correct reading of a polished metal, not a baked highlight.
 *  The dark-clip check still applies to both — a baked shadow reads dark
 *  regardless of what the surface is made of. */
export function validateAlbedo(stats: ImageStats, isConductor = false): Violation[] {
  const v: Violation[] = [];
  const [lo, hi] = isConductor ? ALBEDO_BAND_METAL : ALBEDO_BAND;
  if (stats.linearMean < lo || stats.linearMean > hi) {
    v.push({
      clause: "§1.1",
      message: `mean linear albedo ${stats.linearMean.toFixed(3)} is outside the plausible ${isConductor ? "conductor F0" : "dielectric reflectance"} band [${lo}, ${hi}]`,
    });
  }
  const darkFrac = stats.fractionBelow(ALBEDO_DARK_CLIP);
  if (darkFrac > ALBEDO_CLIP_FRACTION_LIMIT) {
    v.push({
      clause: "§1.1",
      message:
        `${(darkFrac * 100).toFixed(1)}% of pixels sit below linear ${ALBEDO_DARK_CLIP} ` +
        `(limit ${(ALBEDO_CLIP_FRACTION_LIMIT * 100).toFixed(0)}%) — baked shadow or AO, no real material reads this dark this often`,
    });
  }
  if (!isConductor) {
    const lightFrac = stats.fractionAbove(ALBEDO_LIGHT_CLIP);
    if (lightFrac > ALBEDO_CLIP_FRACTION_LIMIT) {
      v.push({
        clause: "§1.1",
        message:
          `${(lightFrac * 100).toFixed(1)}% of pixels sit above linear ${ALBEDO_LIGHT_CLIP} ` +
          `(limit ${(ALBEDO_CLIP_FRACTION_LIMIT * 100).toFixed(0)}%) — baked highlight or light, not reflectance`,
      });
    }
  }
  return v;
}

/** §2.1/§2.2 — roughness and metalness against the surface class's band. */
export function validateRoughnessMetalness(
  surfaceClass: SurfaceClass,
  roughnessMean: number,
  metalnessMean: number,
  boundaryBlend: boolean | undefined,
): Violation[] {
  const v: Violation[] = [];
  const band = SURFACE_CLASS_BANDS[surfaceClass];
  const [rLo, rHi] = band.roughness;
  if (roughnessMean < rLo || roughnessMean > rHi) {
    v.push({
      clause: "§2.2",
      message: `roughness ${roughnessMean.toFixed(3)} is outside "${surfaceClass}"'s band [${rLo}, ${rHi}]`,
    });
  }
  const [midLo, midHi] = METALNESS_MID_BAND;
  if (!boundaryBlend && metalnessMean > midLo && metalnessMean < midHi) {
    v.push({
      clause: "§2.1",
      message:
        `metalness ${metalnessMean.toFixed(3)} sits in the forbidden middle band (${midLo}, ${midHi}) ` +
        "with no boundaryBlend declared — a mid-value metalness is the signature of a shininess slider, not a real metal/dielectric split",
    });
  }
  const wantMetal = band.metalness === 1;
  if (wantMetal && metalnessMean <= midHi) {
    v.push({
      clause: "§2.2",
      message: `"${surfaceClass}" is a conductor class (metalness 1) but measured ${metalnessMean.toFixed(3)}`,
    });
  }
  if (!wantMetal && metalnessMean >= midLo) {
    v.push({
      clause: "§2.2",
      message: `"${surfaceClass}" is a dielectric class (metalness 0) but measured ${metalnessMean.toFixed(3)}`,
    });
  }
  return v;
}

/** §3.1 — the source has to carry enough resolution to reach the derived
 *  target without upscaling past the point resizing stops being honest. */
export function validateSourceResolution(coverM: number, sourceWidth: number, sourceHeight: number): Violation[] {
  const v: Violation[] = [];
  const target = deriveResolution(coverM);
  const min = Math.min(sourceWidth, sourceHeight);
  if (min < target * MIN_SOURCE_RESOLUTION_RATIO) {
    v.push({
      clause: "§3.1",
      message:
        `source resolution ${sourceWidth}x${sourceHeight} is more than 2x below the derived target ` +
        `${target}px (coverM=${coverM} -> ${target}px at 512 px/m) — upscaling this far is not "resizing to density"`,
    });
  }
  return v;
}

/** §6 — plausibility only. GL-vs-DX handedness is NOT verifiable from pixel
 *  statistics alone (both conventions keep +Z/blue pointing out of the
 *  surface); this catches "wrong map entirely" (a colour or roughness map
 *  passed as normal), not a flipped green channel. That limitation is
 *  intentional and recorded here rather than pretending the check is
 *  stronger than it is. */
export function validateNormal(stats: { blueMean: number }): Violation[] {
  const v: Violation[] = [];
  if (stats.blueMean < 0.5) {
    v.push({
      clause: "§6",
      message: `normal map's blue-channel mean (${stats.blueMean.toFixed(3)}) is too low for a tangent-space normal map — check this is actually a normal map, not a colour or data map ingested under the wrong slot`,
    });
  }
  return v;
}

export function scalarMean(stats: ScalarMapStats): number {
  return stats.mean;
}
