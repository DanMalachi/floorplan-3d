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
 * 14 of 16 floors ship. Two do not, on purpose — dropped, not deferred
 * pending a decision (Dan's ruling, M3d/D3: don't chase broken sources when
 * the catalog will grow a lot more later anyway):
 *   - `stone-travertine` — checked all 14 ambientCG `Travertine` variants;
 *     11 of 14 (including this one) share the same broken near-black
 *     roughness map. Systemic, not a bad fetch. Re-add later against a
 *     working source (e.g. `Marble007`/`Marble014` — beige, correctly
 *     authored, checked as viable replacements — would need a product
 *     rename since they're marble, not travertine).
 *   - `tile-white-large` — its albedo is a blown highlight (87% of pixels
 *     piled into a narrow 0.95-0.98 window, confirmed against a smooth
 *     control distribution). Checked an alternate "clean white tile"
 *     (`Tiles105`) expecting an easy swap; it shows the same pileup, which
 *     means this reads as a systemic ambientCG "clean white tile"
 *     photography style, not one bad asset. Re-add later either against a
 *     different source or after delighting (material-spec.md §1.3).
 *
 * Four bands were widened/added to ship the rest, all evidenced against real
 * measurements, all recorded in material-spec.md §2.2a/§2.2b — see `spec.ts`'s
 * `SURFACE_CLASS_BANDS` doc comment for the summary.
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
  { assetId: "Carpet016", id: "carpet-beige", name: "Beige loop pile", family: "carpet", class: "floors", surfaceClass: "textile", coverM: 1.7, license: "CC0 1.0 Universal (public domain dedication)" },
  { assetId: "Carpet012", id: "carpet-navy", name: "Navy cut pile", family: "carpet", class: "floors", surfaceClass: "textile", coverM: 2, license: "CC0 1.0 Universal (public domain dedication)" },
  { assetId: "Concrete031", id: "concrete-grey", name: "Grey screed", family: "concrete", class: "floors", surfaceClass: "concrete", coverM: 2.5, license: "CC0 1.0 Universal (public domain dedication)" },
  { assetId: "Concrete034", id: "concrete-light", name: "Polished concrete", family: "concrete", class: "floors", surfaceClass: "stone-honed", coverM: 1.1, license: "CC0 1.0 Universal (public domain dedication)" },
  { assetId: "Terrazzo013", id: "stone-terrazzo", name: "Colourful terrazzo", family: "stone", class: "floors", surfaceClass: "polished-stone", coverM: 1.5, license: "CC0 1.0 Universal (public domain dedication)" },
  { assetId: "Tiles108", id: "tile-black-gloss", name: "Black gloss", family: "tile", class: "floors", surfaceClass: "polished-tile", coverM: 1, license: "CC0 1.0 Universal (public domain dedication)" },
  { assetId: "Tiles074", id: "tile-checker-marble", name: "Marble checkerboard", family: "tile", class: "floors", surfaceClass: "polished-tile", coverM: 2.1, license: "CC0 1.0 Universal (public domain dedication)" },
  { assetId: "Tiles071", id: "tile-hex-white", name: "White hexagon", family: "tile", class: "floors", surfaceClass: "matte-tile", coverM: 0.45, license: "CC0 1.0 Universal (public domain dedication)" },
  { assetId: "WoodFloor034", id: "wood-basketweave", name: "Basketweave parquet", family: "wood", class: "floors", surfaceClass: "oiled-hardwood", coverM: 1.9, license: "CC0 1.0 Universal (public domain dedication)" },
  { assetId: "WoodFloor052", id: "wood-chevron", name: "Chevron parquet", family: "wood", class: "floors", surfaceClass: "lacquered-hardwood", coverM: 1.8, license: "CC0 1.0 Universal (public domain dedication)" },
  { assetId: "WoodFloor048", id: "wood-walnut-dark", name: "Dark walnut", family: "wood", class: "floors", surfaceClass: "lacquered-hardwood", coverM: 1.3, license: "CC0 1.0 Universal (public domain dedication)" },
  { assetId: "WoodFloor051", id: "wood-oak-natural", name: "Natural oak", family: "wood", class: "floors", surfaceClass: "lacquered-hardwood", coverM: 1.8, license: "CC0 1.0 Universal (public domain dedication)" },
  { assetId: "WoodFloor039", id: "wood-plank-pale", name: "Pale wide plank", family: "wood", class: "floors", surfaceClass: "oiled-hardwood", coverM: 1.9, license: "CC0 1.0 Universal (public domain dedication)" },
  { assetId: "WoodFloor041", id: "wood-grey-weathered", name: "Weathered grey", family: "wood", class: "floors", surfaceClass: "oiled-hardwood", coverM: 1.9, license: "CC0 1.0 Universal (public domain dedication)" },
];

/** Not a data structure anything reads — a durable, committed pointer to the
 *  two floors dropped this round, so the gap survives past this session and
 *  the next attempt starts from what's already been checked rather than
 *  re-discovering it. See this file's header comment for the detail. */
export const DROPPED_M3D_IDS = ["stone-travertine", "tile-white-large"] as const;
