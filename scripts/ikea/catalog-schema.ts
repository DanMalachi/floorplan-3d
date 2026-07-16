/**
 * Furniture catalog SCHEMA for the offline IKEA pipeline (scripts/ikea/*).
 *
 * The pipeline maps raw IKEA data into these brand-agnostic types (extract.ts +
 * normalize.ts) and emits the committed static asset data/furniture-ikea.json.
 * The schema is intentionally brand-agnostic (`source`/`brand`) so future brand
 * pipelines can append to the same catalog.
 *
 * NOTE: this is NOT the app's runtime catalog — the app ships its own placement
 * catalog in src/furniture/catalog.ts (consumed from data/furniture-ikea.catalog.json).
 * This file is types-only and used exclusively by the build-time scripts.
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
