/**
 * M3d/D3 — re-ingesting the 16 pre-M3 floors (`scripts/materials/curated.ts`)
 * through the real M3b/M3c pipeline (`ingest/run.ts`), for real KTX2 output
 * and a real manifest entry instead of the legacy WebP-only path.
 *
 * Unlike `curated-m3c.ts`'s four assets, floors keep their real roughness
 * MAP rather than a curated scalar — `validateDescriptor` (§2.1) forbids a
 * roughness scalar alongside a map, so `roughnessScalar` is omitted here and
 * the map's own measured mean becomes the shipped roughness. That is a
 * deliberate difference from M3c, not an inconsistency: a floor's roughness
 * map carries real spatial detail (grout lines, grain) worth keeping,
 * `curated.ts`'s four M3c surfaces were curated specifically because their
 * source maps' means weren't trusted to land in band.
 *
 * `surfaceClass` was assigned per material-spec.md §2.2a's reclassification
 * pass — on each asset's own physical merits (finish, product convention),
 * checked BEFORE running it against any band, never chosen to make a band
 * pass. Full per-asset reasoning is in that section, not repeated here.
 *
 * Only the 9 that resolved cleanly are listed below. Seven floors are NOT
 * here, on purpose — recorded in `UNRESOLVED_M3D` so the gap is visible
 * rather than silent:
 *   - `carpet-beige`, `stone-terrazzo` — no surface class fits (§2.2a: no
 *     "polished stone" class exists for terrazzo; `carpet-beige`'s measured
 *     roughness misses `textile`'s band with no reclassification available).
 *   - `stone-travertine` — roughness map confirmed genuinely defective at
 *     the source (re-fetched, byte-identical, not a corrupted transfer);
 *     needs a source swap or hand-authored value, Dan's call.
 *   - `tile-white-large` — roughness now correctly `polished-tile`, but the
 *     albedo has a confirmed blown-highlight defect; needs re-sourcing.
 *   - `tile-hex-white` — correctly classed `matte-tile`; roughness misses
 *     the band ceiling by 0.011, left as a real (if narrow) miss.
 *   - `wood-chevron`, `wood-oak-natural` — ambiguous between the two wood
 *     classes on measurement, and `wood-oak-natural`'s name points the
 *     opposite way from its measurement. Left unclassified rather than
 *     forced across a boundary (§2.2a's own forbid).
 *
 * Two of the nine below (`concrete-grey`, `tile-checker-marble`) validate
 * and encode cleanly but are separately blocked by the GPU-resident budget
 * (material-spec.md §5.3) — their `coverM` is large enough to push albedo
 * itself to the 2048 resolution tier, not just the tiered-up normal. Listed
 * here anyway since the classification is correct and settled; the budget
 * question is unrelated and tracked separately.
 */
import type { RenderClass, SurfaceClass } from "./spec";

export interface CuratedFloorM3d {
  /** ambientCG asset id — matches curated.ts, for the source URL only. The
   *  raw maps themselves are read from the existing `.raw/<id>/` cache
   *  (`npm run mat:fetch`), not re-downloaded. */
  assetId: string;
  id: string;
  name: string;
  family: string;
  class: RenderClass;
  surfaceClass: SurfaceClass;
  coverM: number;
  license: string;
}

export const CURATED_FLOORS_M3D: CuratedFloorM3d[] = [
  { assetId: "Carpet012", id: "carpet-navy", name: "Navy cut pile", family: "carpet", class: "floors", surfaceClass: "textile", coverM: 2, license: "CC0 1.0 Universal (public domain dedication)" },
  { assetId: "Concrete031", id: "concrete-grey", name: "Grey screed", family: "concrete", class: "floors", surfaceClass: "concrete", coverM: 2.5, license: "CC0 1.0 Universal (public domain dedication)" },
  { assetId: "Concrete034", id: "concrete-light", name: "Polished concrete", family: "concrete", class: "floors", surfaceClass: "stone-honed", coverM: 1.1, license: "CC0 1.0 Universal (public domain dedication)" },
  { assetId: "Tiles108", id: "tile-black-gloss", name: "Black gloss", family: "tile", class: "floors", surfaceClass: "polished-tile", coverM: 1, license: "CC0 1.0 Universal (public domain dedication)" },
  { assetId: "Tiles074", id: "tile-checker-marble", name: "Marble checkerboard", family: "tile", class: "floors", surfaceClass: "polished-tile", coverM: 2.1, license: "CC0 1.0 Universal (public domain dedication)" },
  { assetId: "WoodFloor034", id: "wood-basketweave", name: "Basketweave parquet", family: "wood", class: "floors", surfaceClass: "oiled-hardwood", coverM: 1.9, license: "CC0 1.0 Universal (public domain dedication)" },
  { assetId: "WoodFloor048", id: "wood-walnut-dark", name: "Dark walnut", family: "wood", class: "floors", surfaceClass: "lacquered-hardwood", coverM: 1.3, license: "CC0 1.0 Universal (public domain dedication)" },
  { assetId: "WoodFloor039", id: "wood-plank-pale", name: "Pale wide plank", family: "wood", class: "floors", surfaceClass: "oiled-hardwood", coverM: 1.9, license: "CC0 1.0 Universal (public domain dedication)" },
  { assetId: "WoodFloor041", id: "wood-grey-weathered", name: "Weathered grey", family: "wood", class: "floors", surfaceClass: "oiled-hardwood", coverM: 1.9, license: "CC0 1.0 Universal (public domain dedication)" },
];

/** Not a data structure anything reads — a durable, committed pointer to the
 *  seven floors still pending a decision, so the gap survives past this
 *  session. See this file's header comment for why each one is here. */
export const UNRESOLVED_M3D_IDS = [
  "carpet-beige",
  "stone-terrazzo",
  "stone-travertine",
  "tile-white-large",
  "tile-hex-white",
  "wood-chevron",
  "wood-oak-natural",
] as const;
