/**
 * M3c's first real material set outside floors — one asset per new class
 * (walls, ceilings, doors, windows). Floors already ship 16 materials
 * (`data/materials-floors.manifest.json`, pre-M3); this set is not a floors
 * re-ingest, it is what the other four classes have never had.
 *
 * Same source as the floor pipeline (ambientCG, CC0) and the same curation
 * shape as `scripts/materials/curated.ts`: a hand-picked `assetId`, a stable
 * product `id`, and — for the scale-free finishes here (paint, plaster) — a
 * curated fallback size, because these materials have no feature of known
 * size for ambientCG to publish a dimension for (the same reasoning
 * `curated.ts` already gives carpet/concrete/terrazzo).
 */
import type { RenderClass, SurfaceClass } from "./spec";

export interface CuratedM3c {
  assetId: string;
  id: string;
  name: string;
  family: string;
  class: RenderClass;
  surfaceClass: SurfaceClass;
  /** Metres one texture repeat spans (material-spec.md §3.1). ambientCG
   *  publishes a real dimension for `door-walnut-lacquered` (80x80cm,
   *  verified against the API before curating); the other three are
   *  scale-free finishes (paint, plaster, brushed metal) with no repeating
   *  feature of known size, so the value is a curated choice — same
   *  reasoning `curated.ts` already gives carpet/concrete/terrazzo. */
  coverM: number;
  /** Curated, not taken verbatim from the source map — same reasoning
   *  `curated.ts` already applies to floors: a hand-picked value inside the
   *  surface class's band (material-spec.md §2.2) is a considered choice, the
   *  source map is a starting point, not an authority. */
  roughness: number;
  metalness: number;
  license: string;
}

export const CURATED_M3C: CuratedM3c[] = [
  {
    assetId: "PaintedPlaster017",
    id: "wall-paint-white-clean",
    name: "Clean white paint",
    family: "paint",
    class: "walls",
    surfaceClass: "matte-plaster",
    coverM: 2.0, // scale-free — no repeating feature of known size
    roughness: 0.88,
    metalness: 0,
    license: "CC0 1.0 Universal (public domain dedication)",
  },
  {
    assetId: "Plaster004",
    id: "ceiling-plaster-white",
    name: "White plaster",
    family: "plaster",
    class: "ceilings",
    surfaceClass: "matte-plaster",
    coverM: 2.0,
    roughness: 0.85,
    metalness: 0,
    license: "CC0 1.0 Universal (public domain dedication)",
  },
  {
    assetId: "Wood051",
    id: "door-walnut-lacquered",
    name: "Lacquered dark walnut",
    family: "wood",
    class: "doors",
    surfaceClass: "lacquered-hardwood",
    coverM: 0.8, // ambientCG publishes 80x80cm for this asset
    roughness: 0.25,
    metalness: 0,
    license: "CC0 1.0 Universal (public domain dedication)",
  },
  {
    assetId: "Metal049A",
    id: "window-aluminium-anodised",
    name: "Anodised aluminium",
    family: "metal",
    class: "windows",
    surfaceClass: "anodised-aluminium",
    coverM: 0.5, // brushed-metal grain, no repeating unit ambientCG can measure
    roughness: 0.42,
    metalness: 1,
    license: "CC0 1.0 Universal (public domain dedication)",
  },
];
