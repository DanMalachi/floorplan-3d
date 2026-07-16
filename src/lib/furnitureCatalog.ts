/**
 * Typed, lazy accessor for the furniture catalog.
 *
 * The dataset is produced offline by scripts/ikea/extract.ts + normalize.ts and
 * committed as data/furniture-ikea.json. Until the extraction has been run it is
 * an empty array, so the app degrades to "no furniture" rather than a build error.
 *
 * Same shape/loading pattern as the Tambour colour deck (src/lib/tambourColors.ts):
 * a flat record array, code-split out of the main bundle and fetched on first use.
 * The schema is intentionally brand-agnostic (`source`/`brand`) so future brand
 * pipelines can append to the same catalog.
 */

export type FurnitureCategory =
  | "sofas"
  | "armchairs"
  | "coffee-tables"
  | "dining-tables"
  | "storage-shelving"
  | "bookcases"
  | "cabinets"
  | "wall-cabinets"
  | "lighting"
  | "beds"
  | "desks"
  | "chairs"
  | "wardrobes"
  | "tv-units"
  | "sideboards"
  | "nightstands"
  | "dressers"
  | "benches"
  | "outdoor";

/** All dimensions in centimetres. Fields are optional because not every product
 *  has every axis (a lamp may be height-only; a round table uses `diameter`). */
export interface FurnitureDimensions {
  width?: number;
  depth?: number;
  height?: number;
  length?: number;
  diameter?: number;
}

/** Raw material descriptions, kept per language for later keyword tagging. Each
 *  entry is one "<part>: <material>" line as IKEA publishes it. */
export interface FurnitureMaterials {
  he: string[];
  en: string[];
}

export interface FurnitureColor {
  /** IKEA's marketing colour name (localized). Inconsistent by design — the
   *  authoritative signal is Phase-3b's image-derived dominant colour. */
  name: string;
  /** Normalized 6-digit hex, e.g. "#814820". */
  hex: string;
}

/** A usable 3D model reference (React Three Fiber can load Draco glTF directly). */
export interface FurnitureModel3D {
  format: string; // e.g. "glb_draco"
  url: string;
}

export interface FurnitureItem {
  // identity
  name: string; // model name, e.g. "SÖDERHAMN"
  brand: string; // "IKEA"
  category: FurnitureCategory;
  subcategory: string; // IKEA product type, English — "3-seat sofa"
  subcategoryHe: string; // "ספה תלת-מושבית"

  // commercial — raw price value + ISO currency code, unconverted
  price: { value: number | null; currency: string };

  // physical
  dimensions: FurnitureDimensions;
  dimensionsSource: string | null; // "ingka" | "ingka-children" | "rotera" | combos

  // appearance
  colors: FurnitureColor[];
  materials: FurnitureMaterials;

  // media
  imageMain: string | null; // largest MAIN_PRODUCT_IMAGE
  imageContext: string | null; // largest CONTEXT (room) image, or null
  productUrl: string;

  // 3D (present for a subset of items)
  model3d: FurnitureModel3D | null;

  // tagging — filled by Phase 3 (dominantColor, materialTags, roomTypes,
  // priceTier, styleScores get merged in later). Ships empty here.
  styleTags: string[];

  // provenance
  source: string; // "ikea"
  sourceItemId: string; // itemNo
  sourceItemType: string; // "ART" | "SPR"
  market: string; // "IL"
}

let cache: FurnitureItem[] | null = null;

/** Load (and memoize) the full furniture catalog. Safe to call repeatedly. */
export async function loadFurniture(): Promise<FurnitureItem[]> {
  if (cache) return cache;
  const mod = await import("../../data/furniture-ikea.json");
  cache = mod.default as FurnitureItem[];
  return cache;
}

/** Group the catalog by category. */
export function groupByCategory(
  items: FurnitureItem[],
): Record<string, FurnitureItem[]> {
  const out: Record<string, FurnitureItem[]> = {};
  for (const it of items) (out[it.category] ??= []).push(it);
  return out;
}
