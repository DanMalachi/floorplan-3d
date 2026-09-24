/**
 * The curated floor set — 16 materials, chosen by eye.
 *
 * Selection was made from rendered contact sheets (scripts/materials/
 * contact-sheet.ts), not from tag strings. Tags will happily hand you sixteen
 * near-identical brown floors; the sheets are what caught that most of
 * ambientCG's `Tiles` category is medieval paving and broken outdoor stone,
 * wrong for an interior-design app however good the texture is.
 *
 * The set is deliberately spread across tone (near-white → near-black) and
 * pattern (plank, chevron, basketweave, hexagon, checker), because a picker of
 * sixteen similar mid-brown floors is functionally a picker of one.
 *
 * ── A 17th entry lives outside this list ────────────────────────────────────
 * `wood-smoked-walnut` was hand-curated from Poly Haven (`laminate_floor_02`)
 * instead of ambientCG, because nothing in ambientCG's WoodFloor/Planks
 * categories reads as a modern matte wide-plank floor at that tone (checked
 * ~15 candidates — everything was either narrow-strip parquet, glossy, or
 * warm honey-oak). The colour map went through two grading rounds against a
 * reference photo before Dan approved it (2026-09-24):
 *   - round 1 graded darker/redder (`brightness 0.8, saturation 1.0, hue -5`)
 *     — too orange/yellow.
 *   - round 1 follow-up (`{a,b,c,d}`) pushed hue further negative to fix that,
 *     which was backwards: rotating negative from the source's ~31° orange
 *     hue moves TOWARD red (0°), not away from it, so "D" (the closest of
 *     that batch) still read red despite being desaturated.
 *   - round 2 (`{e,f,g,h}`) rotated toward 0/positive (grey/green-grey)
 *     instead and raised brightness (pale = lighter, not darker). "E" was
 *     approved and is what `color.jpg` now is; `{f,g,h}` are gone.
 * `thumb.webp` is graded a step darker/less saturated than `color.jpg`
 * (`brightness 0.83, saturation 0.9`, done once by hand, not part of
 * repack.ts's shared per-material thumb crop) — flat sRGB swatch crops read
 * paler than the same matte material under real scene lighting, which is why
 * the plain crop didn't look "close enough" to the applied floor.
 *
 * This entry was appended directly to `data/materials-floors.resolved.json`,
 * not to CURATED below — this file only drives the ambientCG fetch. Rerunning
 * fetch-materials.ts rebuilds resolved.json from CURATED alone and will drop
 * it; re-append by hand (raw maps kept at
 * scripts/materials/.raw/wood-smoked-walnut/) if that ever happens, then
 * rerun repack.ts and redo the thumb grade above (repack.ts will otherwise
 * regenerate a plain, too-pale crop).
 *
 * ── Structured vs scale-free, and why only some need a real size ────────────
 * A floor's tiling scale is only perceptible when the material has a feature
 * whose real size people know: plank width, tile grid, hexagon pitch. Those are
 * STRUCTURED, and their `physicalSizeM` must come from ambientCG's published
 * dimensions — guessing produces doll's-house parquet.
 *
 * Carpet, concrete and terrazzo are SCALE-FREE: they're stochastic, with no
 * feature that betrays the repeat distance. ambientCG often doesn't publish
 * dimensions for them at all (Marble: zero of 26). For those three we set a
 * sensible default here, and nobody can tell — which is why the pipeline
 * doesn't need to reject them for missing metadata.
 */

export type FloorFamily = "wood" | "tile" | "stone" | "carpet" | "concrete";

export interface CuratedMaterial {
  /** ambientCG asset id — also the download key. */
  assetId: string;
  /** Stable id used by the app + saved projects. Kebab-case, source-agnostic
   *  so a material could later be re-sourced without invalidating projects. */
  id: string;
  name: string;
  family: FloorFamily;
  /** Set ONLY for scale-free materials with no published dimensions. Structured
   *  materials must take their size from the API, never from here. */
  fallbackSizeM?: number;
  /** Base roughness when the material ships no roughness map, and a sanity
   *  reference for how glossy the surface should read overall. */
  roughness: number;
}

export const CURATED: CuratedMaterial[] = [
  // ── Wood (6): warm → pale → grey → near-black, plus two pattern floors ────
  { assetId: "WoodFloor051", id: "wood-oak-natural", name: "Natural oak", family: "wood", roughness: 0.7 },
  { assetId: "WoodFloor039", id: "wood-plank-pale", name: "Pale wide plank", family: "wood", roughness: 0.75 },
  { assetId: "WoodFloor041", id: "wood-grey-weathered", name: "Weathered grey", family: "wood", roughness: 0.85 },
  { assetId: "WoodFloor048", id: "wood-walnut-dark", name: "Dark walnut", family: "wood", roughness: 0.6 },
  { assetId: "WoodFloor052", id: "wood-chevron", name: "Chevron parquet", family: "wood", roughness: 0.65 },
  { assetId: "WoodFloor034", id: "wood-basketweave", name: "Basketweave parquet", family: "wood", roughness: 0.7 },

  // ── Tile (4) ─────────────────────────────────────────────────────────────
  { assetId: "Tiles107", id: "tile-white-large", name: "White large-format", family: "tile", roughness: 0.3 },
  { assetId: "Tiles108", id: "tile-black-gloss", name: "Black gloss", family: "tile", roughness: 0.2 },
  { assetId: "Tiles071", id: "tile-hex-white", name: "White hexagon", family: "tile", roughness: 0.35 },
  { assetId: "Tiles074", id: "tile-checker-marble", name: "Marble checkerboard", family: "tile", roughness: 0.25 },

  // ── Stone (2) ────────────────────────────────────────────────────────────
  { assetId: "Travertine009", id: "stone-travertine", name: "Light travertine", family: "stone", roughness: 0.45 },
  // Terrazzo publishes no dimensions; the chip scatter is stochastic, so a 1.5 m
  // repeat is indistinguishable from any other and reads correctly underfoot.
  { assetId: "Terrazzo013", id: "stone-terrazzo", name: "Colourful terrazzo", family: "stone", fallbackSizeM: 1.5, roughness: 0.3 },

  // ── Carpet (2) ───────────────────────────────────────────────────────────
  { assetId: "Carpet016", id: "carpet-beige", name: "Beige loop pile", family: "carpet", roughness: 0.95 },
  { assetId: "Carpet012", id: "carpet-navy", name: "Navy cut pile", family: "carpet", fallbackSizeM: 2.0, roughness: 0.95 },

  // ── Concrete (2) ─────────────────────────────────────────────────────────
  { assetId: "Concrete034", id: "concrete-light", name: "Polished concrete", family: "concrete", roughness: 0.65 },
  { assetId: "Concrete031", id: "concrete-grey", name: "Grey screed", family: "concrete", fallbackSizeM: 2.5, roughness: 0.8 },
];

/** Families whose tiling scale is perceptible — these MUST use published
 *  dimensions and are a hard error if the API has none. */
export const STRUCTURED_FAMILIES = new Set<FloorFamily>(["wood", "tile"]);
