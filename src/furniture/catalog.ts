// The furniture catalog: placement metadata for every asset the app ships.
// Models are Kenney Furniture Kit (CC0) GLBs in public/furniture/ — see
// LICENSE-kenney-furniture-kit.txt there. Geometry is normalized at load time
// (scaled so the model's plan bounding box matches `footprint`, floored at
// y=0), so footprints here are real-world meters and the single source of
// truth for collision and wall snapping.

export type FurnitureCategory =
  | "Seating"
  | "Tables"
  | "Beds"
  | "Storage"
  | "Kitchen"
  | "Bathroom"
  | "Decor";

export interface FurnitureAsset {
  assetId: string; // also the glb filename, UNLESS `model` is set (see below)
  name: string;
  category: FurnitureCategory;
  /** Plan-space size in meters: w along local X, d along local Z. */
  footprint: { w: number; d: number };
  /** Backs against walls: dragging near a wall aligns and flushes it. */
  wallSnap?: boolean;
  /** Flat items (rugs) that other furniture may overlap freely. */
  noCollide?: boolean;

  // ── Optional, used by imported brand catalogs (e.g. IKEA) ────────────────
  /** GLB basename to render, when it differs from `assetId`. Lets a real branded
   *  item (assetId "ikea:99305691") render via a CC0 proxy model while keeping its
   *  own real footprint. Falls back to `assetId` when absent. */
  model?: string;
  /** Local path to the REAL branded GLB (e.g. "/furniture/ikea/99305691.glb"),
   *  preferred over `model` when present. May be Draco-compressed. Rendering falls
   *  back to `model` if it fails to load. */
  realModel?: string;
  /** Real product photo for the picker tile, instead of a rendered GLB thumbnail. */
  thumbnail?: string;
  brand?: string;
  /** Secondary caption (e.g. Hebrew product type). */
  subtitle?: string;
  price?: { value: number | null; currency: string };
}

export const CATALOG: FurnitureAsset[] = [
  // --- Seating ---
  { assetId: "loungeSofa", name: "Sofa", category: "Seating", footprint: { w: 2.1, d: 0.95 }, wallSnap: true },
  { assetId: "loungeChair", name: "Lounge chair", category: "Seating", footprint: { w: 0.9, d: 0.9 } },
  { assetId: "chairCushion", name: "Chair", category: "Seating", footprint: { w: 0.5, d: 0.55 } },
  { assetId: "stoolBar", name: "Bar stool", category: "Seating", footprint: { w: 0.4, d: 0.4 } },
  { assetId: "benchCushion", name: "Bench", category: "Seating", footprint: { w: 1.4, d: 0.5 }, wallSnap: true },
  // --- Tables ---
  { assetId: "table", name: "Dining table", category: "Tables", footprint: { w: 1.6, d: 0.9 } },
  { assetId: "tableRound", name: "Round table", category: "Tables", footprint: { w: 1.1, d: 1.1 } },
  { assetId: "tableCoffee", name: "Coffee table", category: "Tables", footprint: { w: 1.1, d: 0.6 } },
  { assetId: "desk", name: "Desk", category: "Tables", footprint: { w: 1.4, d: 0.7 }, wallSnap: true },
  { assetId: "sideTable", name: "Side table", category: "Tables", footprint: { w: 0.5, d: 0.45 } },
  // --- Beds ---
  { assetId: "bedDouble", name: "Double bed", category: "Beds", footprint: { w: 1.7, d: 2.1 }, wallSnap: true },
  { assetId: "bedSingle", name: "Single bed", category: "Beds", footprint: { w: 1.0, d: 2.1 }, wallSnap: true },
  // --- Storage ---
  { assetId: "bookcaseClosedWide", name: "Wide bookcase", category: "Storage", footprint: { w: 1.2, d: 0.35 }, wallSnap: true },
  { assetId: "bookcaseOpen", name: "Bookcase", category: "Storage", footprint: { w: 0.8, d: 0.35 }, wallSnap: true },
  { assetId: "cabinetTelevision", name: "TV cabinet", category: "Storage", footprint: { w: 1.6, d: 0.5 }, wallSnap: true },
  { assetId: "coatRackStanding", name: "Coat rack", category: "Storage", footprint: { w: 0.45, d: 0.45 } },
  // --- Kitchen ---
  { assetId: "kitchenFridge", name: "Fridge", category: "Kitchen", footprint: { w: 0.7, d: 0.75 }, wallSnap: true },
  { assetId: "kitchenStove", name: "Stove", category: "Kitchen", footprint: { w: 0.65, d: 0.7 }, wallSnap: true },
  { assetId: "kitchenCabinet", name: "Counter", category: "Kitchen", footprint: { w: 0.7, d: 0.65 }, wallSnap: true },
  { assetId: "kitchenSink", name: "Sink counter", category: "Kitchen", footprint: { w: 0.7, d: 0.65 }, wallSnap: true },
  { assetId: "kitchenBar", name: "Kitchen bar", category: "Kitchen", footprint: { w: 1.4, d: 0.7 } },
  // --- Bathroom ---
  { assetId: "toilet", name: "Toilet", category: "Bathroom", footprint: { w: 0.45, d: 0.7 }, wallSnap: true },
  { assetId: "bathtub", name: "Bathtub", category: "Bathroom", footprint: { w: 1.7, d: 0.8 }, wallSnap: true },
  { assetId: "bathroomSink", name: "Washbasin", category: "Bathroom", footprint: { w: 0.55, d: 0.5 }, wallSnap: true },
  { assetId: "shower", name: "Shower", category: "Bathroom", footprint: { w: 0.9, d: 0.9 }, wallSnap: true },
  { assetId: "washer", name: "Washer", category: "Bathroom", footprint: { w: 0.65, d: 0.65 }, wallSnap: true },
  // --- Decor ---
  { assetId: "pottedPlant", name: "Potted plant", category: "Decor", footprint: { w: 0.4, d: 0.4 } },
  { assetId: "lampRoundFloor", name: "Floor lamp", category: "Decor", footprint: { w: 0.4, d: 0.4 } },
  { assetId: "rugRectangle", name: "Rug", category: "Decor", footprint: { w: 2.0, d: 1.4 }, noCollide: true },
];

// IKEA placement catalog — 351 real items (IL market), each carrying its real
// footprint and a `model` proxy GLB. Generated by scripts/ikea/build-catalog.ts
// from data/furniture-ikea.json. Slim (placement-only) so the app bundle stays
// small; the full detail asset (materials, 3D urls, …) is loaded separately.
import ikeaRaw from "../../data/furniture-ikea.catalog.json";
type IkeaAsset = FurnitureAsset & { rooms: string[] };
export const IKEA_ASSETS = ikeaRaw as unknown as IkeaAsset[];

export const CATALOG_BY_ID: ReadonlyMap<string, FurnitureAsset> = new Map(
  [...CATALOG, ...IKEA_ASSETS].map((a) => [a.assetId, a]),
);

export const CATEGORIES: FurnitureCategory[] = [
  "Seating",
  "Tables",
  "Beds",
  "Storage",
  "Kitchen",
  "Bathroom",
  "Decor",
];

/** IKEA-style browsing: rooms, not furniture taxonomies. Items may appear in
 *  several rooms — people shop by "what goes in the bedroom". */
export interface RoomSection {
  id: string;
  label: string;
  icon: string; // emoji tab glyph
  assetIds: string[];
}

const BASE_ROOMS: RoomSection[] = [
  {
    id: "living",
    label: "Living",
    icon: "🛋",
    assetIds: [
      "loungeSofa", "loungeChair", "tableCoffee", "cabinetTelevision",
      "bookcaseOpen", "bookcaseClosedWide", "rugRectangle", "lampRoundFloor",
      "pottedPlant", "benchCushion",
    ],
  },
  {
    id: "bedroom",
    label: "Bedroom",
    icon: "🛏",
    assetIds: [
      "bedDouble", "bedSingle", "sideTable", "bookcaseClosedWide",
      "coatRackStanding", "lampRoundFloor", "rugRectangle",
    ],
  },
  {
    id: "kitchen",
    label: "Kitchen",
    icon: "🍳",
    assetIds: [
      "kitchenFridge", "kitchenStove", "kitchenCabinet", "kitchenSink",
      "kitchenBar", "stoolBar",
    ],
  },
  {
    id: "dining",
    label: "Dining",
    icon: "🍽",
    assetIds: ["table", "tableRound", "chairCushion", "benchCushion", "pottedPlant"],
  },
  {
    id: "bathroom",
    label: "Bath",
    icon: "🛁",
    assetIds: ["toilet", "bathtub", "shower", "bathroomSink", "washer"],
  },
  {
    id: "office",
    label: "Office",
    icon: "💻",
    assetIds: ["desk", "chairCushion", "bookcaseOpen", "lampRoundFloor", "pottedPlant"],
  },
];

// Final room sections: curated CC0 items first, then the IKEA items that map to
// each room appended after them (so real IKEA pieces show up in the same picker).
const ikeaByRoom: Record<string, string[]> = {};
for (const a of IKEA_ASSETS)
  for (const r of a.rooms) (ikeaByRoom[r] ??= []).push(a.assetId);

export const ROOMS: RoomSection[] = BASE_ROOMS.map((r) => ({
  ...r,
  assetIds: [...r.assetIds, ...(ikeaByRoom[r.id] ?? [])],
}));
