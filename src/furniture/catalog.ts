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
  assetId: string; // also the glb filename
  name: string;
  category: FurnitureCategory;
  /** Plan-space size in meters: w along local X, d along local Z. */
  footprint: { w: number; d: number };
  /** Backs against walls: dragging near a wall aligns and flushes it. */
  wallSnap?: boolean;
  /** Flat items (rugs) that other furniture may overlap freely. */
  noCollide?: boolean;
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

export const CATALOG_BY_ID: ReadonlyMap<string, FurnitureAsset> = new Map(
  CATALOG.map((a) => [a.assetId, a]),
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
