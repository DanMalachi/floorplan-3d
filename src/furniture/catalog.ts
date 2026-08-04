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

/** Illustrated-scene room types (Plan Dock v2). "study" is the renamed
 *  successor of the older "office" RoomSection id — both ids resolve to the
 *  same tag via `resolveRoomType` below. "laundry"/"closet"/"kids"/"garage"/
 *  "outdoors" are taxonomy-only: tagged with catalog items (real or
 *  placeholder-rendered) so the room exists as a browsable tab, but none has
 *  hotspot scene art yet — `BottomDock`'s `ROOM_SCENE_COMPONENT` falls back
 *  to "scene not built yet" for any RoomType missing a Scene component. */
export type RoomType =
  | "kitchen"
  | "bathroom"
  | "bedroom"
  | "living"
  | "dining"
  | "study"
  | "laundry"
  | "closet"
  | "kids"
  | "garage"
  | "outdoors";

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
  /** Every room-scene this item is valid in; an item may legitimately appear
   *  in more than one (e.g. a rug tagged living+bedroom) — not a bug to dedupe.
   *  Derived from `ROOMS`/IKEA+BlenderKit `rooms` at catalog build time. */
  roomTags?: RoomType[];
  /** Reserved for the fire-alarm/smoke-detector/misc-catchall phase (Plan Dock
   *  v2 Phase E, not yet scoped). No UI reads this field this round. */
  overflowCategory?: string;
  /** Meters above floor a fresh placement starts at, for items that mount high
   *  on a wall (shower head, range hood, towel rack) rather than sitting on
   *  the floor. Read once by `placeFurniture` at click-to-place time; the
   *  placed item then carries it as `FurnitureItem.elevation` like any other
   *  item — there's no separate wall-mount concept in the scene schema. */
  defaultElevation?: number;

  // ── Optional, used by imported brand catalogs (e.g. IKEA) ────────────────
  /** GLB basename to render, when it differs from `assetId`. Lets a real branded
   *  item (assetId "ikea:99305691") render via a CC0 proxy model while keeping its
   *  own real footprint. Falls back to `assetId` when absent. */
  model?: string;
  /** Local path to the REAL branded GLB (e.g. "/furniture/ikea/99305691.glb"),
   *  preferred over `model` when present. May be Draco-compressed. Rendering falls
   *  back to `model` if it fails to load. */
  realModel?: string;
  /** Corrective [x,y,z] Euler (radians) applied before normalizing, for models
   *  authored lying down (up-axis on X/Z). Baked by scripts/ikea/build-catalog.ts. */
  modelRotation?: [number, number, number];
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

  // --- Bathroom extras (no shipped model yet — render as a neutral
  // placeholder box until one is sourced; see PlaceholderBox in
  // FurnitureLayer.tsx. Wall-mounted items get a defaultElevation so a fresh
  // placement starts at a believable height instead of on the floor. ---
  { assetId: "showerHead", name: "Shower head", category: "Bathroom", footprint: { w: 0.12, d: 0.12 }, wallSnap: true, defaultElevation: 1.95, roomTags: ["bathroom"] },
  { assetId: "towelRack", name: "Towel rack", category: "Bathroom", footprint: { w: 0.5, d: 0.08 }, wallSnap: true, defaultElevation: 1.1, roomTags: ["bathroom"] },
  { assetId: "bathroomMirror", name: "Bathroom mirror", category: "Bathroom", footprint: { w: 0.6, d: 0.05 }, wallSnap: true, defaultElevation: 1.2, roomTags: ["bathroom"] },
  { assetId: "bathroomTrashBin", name: "Trash bin", category: "Bathroom", footprint: { w: 0.25, d: 0.25 }, roomTags: ["bathroom"] },

  // --- Kitchen extras ---
  { assetId: "kitchenDishwasher", name: "Dishwasher", category: "Kitchen", footprint: { w: 0.6, d: 0.6 }, wallSnap: true, roomTags: ["kitchen"] },
  { assetId: "kitchenRangeHood", name: "Range hood", category: "Kitchen", footprint: { w: 0.6, d: 0.5 }, wallSnap: true, defaultElevation: 1.6, roomTags: ["kitchen"] },
  { assetId: "kitchenIsland", name: "Kitchen island", category: "Kitchen", footprint: { w: 1.2, d: 0.8 }, roomTags: ["kitchen"] },
  { assetId: "kitchenMicrowave", name: "Microwave", category: "Kitchen", footprint: { w: 0.5, d: 0.35 }, wallSnap: true, roomTags: ["kitchen"] },
  { assetId: "kitchenTrashBin", name: "Trash bin", category: "Kitchen", footprint: { w: 0.3, d: 0.3 }, roomTags: ["kitchen"] },

  // --- Bedroom extras ---
  { assetId: "wardrobe", name: "Wardrobe", category: "Storage", footprint: { w: 1.0, d: 0.6 }, wallSnap: true, roomTags: ["bedroom", "closet"] },

  // --- Laundry (taxonomy-only: no scene art yet, see RoomType comment) ---
  { assetId: "dryer", name: "Dryer", category: "Bathroom", footprint: { w: 0.65, d: 0.65 }, wallSnap: true, roomTags: ["laundry"] },
  { assetId: "laundrySink", name: "Laundry sink", category: "Bathroom", footprint: { w: 0.55, d: 0.5 }, wallSnap: true, roomTags: ["laundry"] },
  { assetId: "dryingRack", name: "Drying rack", category: "Storage", footprint: { w: 0.6, d: 0.5 }, roomTags: ["laundry"] },
  { assetId: "ironingBoard", name: "Ironing board", category: "Storage", footprint: { w: 1.2, d: 0.4 }, roomTags: ["laundry"] },

  // --- Closet ---
  { assetId: "shoeRack", name: "Shoe rack", category: "Storage", footprint: { w: 0.8, d: 0.3 }, wallSnap: true, roomTags: ["closet"] },

  // --- Kids room ---
  { assetId: "crib", name: "Crib", category: "Beds", footprint: { w: 0.7, d: 1.3 }, wallSnap: true, roomTags: ["kids"] },
  { assetId: "toyStorage", name: "Toy storage", category: "Storage", footprint: { w: 0.9, d: 0.4 }, wallSnap: true, roomTags: ["kids"] },
  { assetId: "changingTable", name: "Changing table", category: "Storage", footprint: { w: 0.8, d: 0.5 }, wallSnap: true, roomTags: ["kids"] },

  // --- Garage ---
  { assetId: "workbench", name: "Workbench", category: "Tables", footprint: { w: 1.4, d: 0.6 }, wallSnap: true, roomTags: ["garage"] },
  { assetId: "toolRack", name: "Tool rack", category: "Storage", footprint: { w: 1.0, d: 0.15 }, wallSnap: true, roomTags: ["garage"] },
  { assetId: "garageShelf", name: "Garage shelving", category: "Storage", footprint: { w: 0.9, d: 0.45 }, wallSnap: true, roomTags: ["garage"] },

  // --- Outdoors ---
  { assetId: "patioTable", name: "Patio table", category: "Tables", footprint: { w: 1.2, d: 0.8 }, roomTags: ["outdoors"] },
  { assetId: "patioChair", name: "Patio chair", category: "Seating", footprint: { w: 0.55, d: 0.55 }, roomTags: ["outdoors"] },
  { assetId: "bbqGrill", name: "BBQ grill", category: "Kitchen", footprint: { w: 0.6, d: 0.5 }, roomTags: ["outdoors"] },
  { assetId: "outdoorBench", name: "Outdoor bench", category: "Seating", footprint: { w: 1.3, d: 0.45 }, roomTags: ["outdoors"] },
  { assetId: "planterBox", name: "Planter box", category: "Decor", footprint: { w: 0.6, d: 0.3 }, roomTags: ["outdoors"] },
];

// IKEA placement catalog (IL market) — every item ships a real, downloaded IKEA
// .glb (proxy-only items are dropped by build-catalog.ts), carrying its real
// footprint. Generated by scripts/ikea/build-catalog.ts from data/furniture-ikea.json.
// Slim (placement-only) so the app bundle stays small; the full detail asset
// (materials, 3D urls, …) is loaded separately.
import ikeaRaw from "../../data/furniture-ikea.catalog.json";
type IkeaAsset = FurnitureAsset & { rooms: string[] };
export const IKEA_ASSETS = ikeaRaw as unknown as IkeaAsset[];

// BlenderKit placement catalog — 76 archviz-grade CC0 models, the realistic tier
// between Kenney's low-poly kit and the real IKEA products. Every item is public
// domain (see public/furniture/blenderkit/ATTRIBUTION.json); the Royalty-Free
// half of BlenderKit's library is deliberately excluded, because serving a .glb
// to a browser is redistribution and that licence forbids it.
// Generated by scripts/blenderkit/build-catalog.ts.
import blenderkitRaw from "../../data/furniture-blenderkit.catalog.json";
export const BLENDERKIT_ASSETS = blenderkitRaw as unknown as IkeaAsset[];

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

// Final room sections: curated CC0 items first, then the realistic BlenderKit
// models, then the IKEA items that map to each room (so real IKEA pieces show up
// in the same picker). BlenderKit sits ahead of IKEA because those models are
// the better-looking default when someone is just dressing a room; IKEA is what
// you reach for when you want a specific product.
const byRoom = (assets: IkeaAsset[]): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  for (const a of assets) for (const r of a.rooms) (out[r] ??= []).push(a.assetId);
  return out;
};

const ikeaByRoom = byRoom(IKEA_ASSETS);
const blenderkitByRoom = byRoom(BLENDERKIT_ASSETS);

export const ROOMS: RoomSection[] = BASE_ROOMS.map((r) => ({
  ...r,
  assetIds: [...r.assetIds, ...(blenderkitByRoom[r.id] ?? []), ...(ikeaByRoom[r.id] ?? [])],
}));

/** "office" is the legacy RoomSection id; Plan Dock v2 renamed the scene to
 *  "study" — both resolve to the same RoomType tag. */
const resolveRoomType = (id: string): RoomType | null =>
  id === "office"
    ? "study"
    : (
          [
            "kitchen", "bathroom", "bedroom", "living", "dining", "study",
            "laundry", "closet", "kids", "garage", "outdoors",
          ] as const
        ).includes(id as RoomType)
      ? (id as RoomType)
      : null;

const roomTagsByAssetId: Record<string, RoomType[]> = {};
for (const section of ROOMS) {
  const tag = resolveRoomType(section.id);
  if (!tag) continue;
  for (const id of section.assetIds) (roomTagsByAssetId[id] ??= []).push(tag);
}

const withRoomTags = <T extends FurnitureAsset>(a: T): T => {
  const tags = roomTagsByAssetId[a.assetId];
  return tags ? { ...a, roomTags: [...new Set(tags)] } : a;
};
Object.assign(CATALOG, CATALOG.map(withRoomTags));
Object.assign(IKEA_ASSETS, IKEA_ASSETS.map(withRoomTags));
Object.assign(BLENDERKIT_ASSETS, BLENDERKIT_ASSETS.map(withRoomTags));

export const CATALOG_BY_ID: ReadonlyMap<string, FurnitureAsset> = new Map(
  [...CATALOG, ...IKEA_ASSETS, ...BLENDERKIT_ASSETS].map((a) => [a.assetId, a]),
);

/** Cross-listing filter: every item tagged for `room`, from every source
 *  catalog (base + IKEA + BlenderKit). An item with multiple roomTags (e.g.
 *  a rug tagged living+bedroom) appears in each room's results — by design. */
export const getItemsForRoom = (room: RoomType): FurnitureAsset[] =>
  [...CATALOG_BY_ID.values()].filter((a) => a.roomTags?.includes(room));
