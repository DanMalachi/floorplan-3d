// The furniture catalog: placement metadata for every asset the app ships.
// Real-model-only (IKEA + BlenderKit) — see IKEA_ASSETS / BLENDERKIT_ASSETS
// below. Geometry is normalized at load time (scaled so the model's plan
// bounding box matches `footprint`, floored at y=0), so footprints here are
// real-world meters and the single source of truth for collision and wall
// snapping.

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

  // ── Added by scripts/ikea/enrich-catalog.ts (Plan Dock P1) ───────────────
  /** Normalized English item-type ("3-seat sofa", "bookcase", ...) — what
   *  `searchText` actually keys on. `name` alone is a brand word (BILLY,
   *  KIVIK) that says nothing about what the item IS, which is why the
   *  hotspot/search match used to miss every imported IKEA/BlenderKit item. */
  kind?: string;
  /** Extra English search terms (raw category + BlenderKit tags) folded
   *  into `searchText`. No UI surfaces this list directly. */
  typeTags?: string[];
  /** True color/finish variants — IKEA only (BlenderKit's schema carries no
   *  colour data). Feeds the Phase 6 swatch row. */
  colors?: { name: string; hex: string }[];
  /** Groups literal color/finish variants of the same physical item
   *  (name + kind + exact W×D×H from the raw source) without merging
   *  genuine size variants (BILLY's 13 sizes each get their own key). */
  variantKey?: string;
}

/** Every English word `matchesHotspot`/search can match against — `name` is
 *  a brand word for imported catalogs (BILLY, KIVIK), so it's never enough
 *  on its own. Lowercased; callers do their own substring/keyword check. */
export const searchText = (a: FurnitureAsset): string =>
  [a.name, a.kind, ...(a.typeTags ?? [])].filter(Boolean).join(" ").toLowerCase();

/** Kenney low-poly kit removed (2026-08-05) — catalog is real-model-only now.
 *  Old projects that placed a Kenney item keep the reference; AssetModel in
 *  FurnitureLayer.tsx already falls back to a PlaceholderBox for any assetId
 *  no longer in CATALOG_BY_ID, so those items don't crash on load. */
export const CATALOG: FurnitureAsset[] = [];

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
  { id: "living", label: "Living", icon: "🛋", assetIds: [] },
  { id: "bedroom", label: "Bedroom", icon: "🛏", assetIds: [] },
  { id: "kitchen", label: "Kitchen", icon: "🍳", assetIds: [] },
  { id: "dining", label: "Dining", icon: "🍽", assetIds: [] },
  { id: "bathroom", label: "Bath", icon: "🛁", assetIds: [] },
  { id: "office", label: "Office", icon: "💻", assetIds: [] },
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
