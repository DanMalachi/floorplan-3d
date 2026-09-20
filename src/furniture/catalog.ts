// The furniture catalog: placement metadata for every asset the app ships.
// Real-model-only (BlenderKit + Poly Haven + Sketchfab + Poly Pizza) — see
// BLENDERKIT_ASSETS / POLYHAVEN_ASSETS / SKETCHFAB_ASSETS / POLYPIZZA_ASSETS
// below. Geometry is normalized at load time (scaled so the model's plan
// bounding box matches `footprint`, floored at y=0), so footprints here are
// real-world meters and the single source of truth for collision and wall
// snapping.
//
// IKEA was removed entirely (2026-09-15, legal): no IKEA models, data, or
// replicas ship. Old saved plans holding an "ikea:*" assetId render as a
// placeholder box, because FurnitureLayer falls back for any id missing from
// CATALOG_BY_ID.

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
  /** A real model name — e.g. BlenderKit's asset title. NEVER
   *  translated: these are proper nouns. Parametric items have no product name
   *  and set `nameKey` instead; exactly one of the two is meaningful. */
  name: string;
  /** Set only by `specOf` for PARAMETRIC items: a key into
   *  `editor.parametric`, because a generator's name ("Alcove bath") is a
   *  generic description and does translate. Render sites must prefer this over
   *  `name` when it is present. */
  nameKey?: string;
  category: FurnitureCategory;
  /** Plan-space size in meters: w along local X, d along local Z. */
  footprint: { w: number; d: number };
  /** Backs against walls: dragging near a wall aligns and flushes it. */
  wallSnap?: boolean;
  /** Flat items (rugs) that other furniture may overlap freely. */
  noCollide?: boolean;
  /** Every room-scene this item is valid in; an item may legitimately appear
   *  in more than one (e.g. a rug tagged living+bedroom) — not a bug to dedupe.
   *  Derived from `ROOMS`/each source's `rooms` at catalog build time. */
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

  // ── Optional, used by imported model catalogs ────────────────────────────
  /** GLB basename to render, when it differs from `assetId`. Falls back to
   *  `assetId` when absent. */
  model?: string;
  /** Path to the real GLB (e.g. "/furniture/polyhaven/sofa_02.glb"),
   *  preferred over `model` when present. May be Draco-compressed. Rendering falls
   *  back to `model` if it fails to load. */
  realModel?: string;
  /** Corrective [x,y,z] Euler (radians) applied before normalizing, for models
   *  authored lying down (up-axis on X/Z). */
  modelRotation?: [number, number, number];
  /** Real product photo for the picker tile, instead of a rendered GLB thumbnail. */
  thumbnail?: string;
  brand?: string;
  /** Secondary caption (e.g. Hebrew product type). */
  subtitle?: string;
  price?: { value: number | null; currency: string };

  // ── Search/variant enrichment (Plan Dock P1) ─────────────────────────────
  /** Normalized English item-type ("3-seat sofa", "bookcase", ...) — what
   *  `searchText` actually keys on, since `name` alone may not say what the
   *  item IS. */
  kind?: string;
  /** Extra English search terms (raw category + BlenderKit tags) folded
   *  into `searchText`. No UI surfaces this list directly. */
  typeTags?: string[];
  /** True color/finish variants. No current source carries colour data, so
   *  the Phase 6 swatch row renders for nothing today. */
  colors?: { name: string; hex: string }[];
  /** Groups literal color/finish variants of the same physical item
   *  (name + kind + exact W×D×H from the raw source) without merging
   *  genuine size variants. */
  variantKey?: string;
}

/** Every English word `matchesHotspot`/search can match against — `name` is
 *  often a product word that says nothing about the item type, so it's never
 *  enough on its own. Lowercased; callers do their own substring/keyword check. */
export const searchText = (a: FurnitureAsset): string =>
  [a.name, a.kind, ...(a.typeTags ?? [])].filter(Boolean).join(" ").toLowerCase();

/** Kenney low-poly kit removed (2026-08-05) — catalog is real-model-only now.
 *  Old projects that placed a Kenney item keep the reference; AssetModel in
 *  FurnitureLayer.tsx already falls back to a PlaceholderBox for any assetId
 *  no longer in CATALOG_BY_ID, so those items don't crash on load. */
export const CATALOG: FurnitureAsset[] = [];

type SourcedAsset = FurnitureAsset & { rooms: string[] };

// BlenderKit placement catalog — 71 archviz-grade CC0 models. Every item is public
// domain (see public/furniture/blenderkit/ATTRIBUTION.json); the Royalty-Free
// half of BlenderKit's library is deliberately excluded, because serving a .glb
// to a browser is redistribution and that licence forbids it.
// Generated by scripts/blenderkit/build-catalog.ts.
import blenderkitRaw from "../../data/furniture-blenderkit.catalog.json";
export const BLENDERKIT_ASSETS = blenderkitRaw as unknown as SourcedAsset[];

// Poly Haven placement catalog — CC0 (site-wide, https://polyhaven.com/license),
// no-auth public API. Compensates the 2026-09-14 BlenderKit-58-blend-only gap;
// see docs/FURNITURE_LICENSE_AUDIT.md (2026-09-14, second pass) for the full
// sourcing/measurement writeup. Generated by scripts/polyhaven/build-catalog.ts.
import polyhavenRaw from "../../data/furniture-polyhaven.catalog.json";
export const POLYHAVEN_ASSETS = polyhavenRaw as unknown as SourcedAsset[];

// Sketchfab placement catalog — fills the Beds/Office-chairs/Dining-tables
// gap Poly Haven's 85-item furniture set couldn't (zero office chairs, zero
// non-vintage dining tables, zero beds at all — see docs/FURNITURE_LICENSE_
// AUDIT.md, 2026-09-14 third pass). Every shipped item here is licensed CC
// Attribution (Sketchfab's search/download API has no CC0 stock in these
// categories) — commercial use is allowed, but unlike the CC0 sets above,
// attribution IS legally required; see public/furniture/sketchfab/
// ATTRIBUTION.json for the per-item author credit. Beds: 0 shipped — every
// candidate (~292 tried across Sketchfab + Poly Pizza combined) failed
// measured real-world dimensions. Generated by scripts/sketchfab/download.ts.
import sketchfabRaw from "../../data/furniture-sketchfab.catalog.json";
export const SKETCHFAB_ASSETS = sketchfabRaw as unknown as SourcedAsset[];

// Poly Pizza placement catalog — second aggregator run alongside Sketchfab
// in the same third pass, same size-range/measurement method (see
// docs/FURNITURE_LICENSE_AUDIT.md). Mixed CC0/CC Attribution per item; CC-BY
// items carry their attribution string in public/furniture/polypizza/
// ATTRIBUTION.json. Generated by scripts/polypizza/download.ts.
import polypizzaRaw from "../../data/furniture-polypizza.catalog.json";
export const POLYPIZZA_ASSETS = polypizzaRaw as unknown as SourcedAsset[];

// Done-original "factory" catalog — furniture authored in-house with the
// done-furniture-factory skill (.agents/skills/done-furniture-factory): original geometry, CC0
// Poly Haven textures, owner-approved per candidate hash. Nothing third-party is redistributed
// beyond CC0 textures; see public/furniture/factory/ATTRIBUTION.json and docs/DATA_RIGHTS.md.
import factoryRaw from "../../data/furniture-factory.catalog.json";
export const FACTORY_ASSETS = factoryRaw as unknown as SourcedAsset[];

import { retagRooms } from "./roomRetag";

export const CATEGORIES: FurnitureCategory[] = [
  "Seating",
  "Tables",
  "Beds",
  "Storage",
  "Kitchen",
  "Bathroom",
  "Decor",
];

/** Showroom-style browsing: rooms, not furniture taxonomies. Items may appear in
 *  several rooms — people shop by "what goes in the bedroom". */
export interface RoomSection {
  id: string;
  label: string;
  assetIds: string[];
}

// Every RoomType the Plan Dock shows a tab for needs a section here, or
// `roomTagsByAssetId` below never tags anything for it and the tab renders
// empty no matter what the catalog contains — which is exactly why laundry/
// closet/kids/garage/outdoors shipped empty.
//
// There used to be an `icon` field here carrying an emoji per room. It was dead:
// the dock's tabs moved to the drawn `ROOM_ICON` set (src/ui/planDock/icons.tsx)
// and nothing read `.icon` afterwards. `ROOMS` below is consumed at exactly one
// place — `roomTagsByAssetId` — so the array itself stays.
const BASE_ROOMS: RoomSection[] = [
  { id: "living", label: "Living", assetIds: [] },
  { id: "bedroom", label: "Bedroom", assetIds: [] },
  { id: "kitchen", label: "Kitchen", assetIds: [] },
  { id: "dining", label: "Dining", assetIds: [] },
  { id: "bathroom", label: "Bath", assetIds: [] },
  { id: "office", label: "Office", assetIds: [] },
  { id: "laundry", label: "Laundry", assetIds: [] },
  { id: "closet", label: "Closet", assetIds: [] },
  { id: "kids", label: "Kids", assetIds: [] },
  { id: "garage", label: "Garage", assetIds: [] },
  { id: "outdoors", label: "Outdoors", assetIds: [] },
];

// Final room sections: BlenderKit first, then Poly Haven, Sketchfab, Poly Pizza.
// `retagRooms` widens each item's source `rooms` to the dock's own taxonomy
// (see roomRetag.ts): the sources only file products under living/bedroom/
// kitchen/dining/office, so an outdoor lounger arrived tagged "living" and a
// wardrobe tagged "bedroom" with nothing pointing at Outdoors or Closet.
const byRoom = (assets: SourcedAsset[]): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  for (const a of assets) for (const r of retagRooms(a)) (out[r] ??= []).push(a.assetId);
  return out;
};

const factoryByRoom = byRoom(FACTORY_ASSETS);
const blenderkitByRoom = byRoom(BLENDERKIT_ASSETS);
const polyhavenByRoom = byRoom(POLYHAVEN_ASSETS);
const sketchfabByRoom = byRoom(SKETCHFAB_ASSETS);
const polypizzaByRoom = byRoom(POLYPIZZA_ASSETS);

export const ROOMS: RoomSection[] = BASE_ROOMS.map((r) => ({
  ...r,
  assetIds: [
    ...r.assetIds,
    ...(factoryByRoom[r.id] ?? []),
    ...(blenderkitByRoom[r.id] ?? []),
    ...(polyhavenByRoom[r.id] ?? []),
    ...(sketchfabByRoom[r.id] ?? []),
    ...(polypizzaByRoom[r.id] ?? []),
  ],
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
Object.assign(FACTORY_ASSETS, FACTORY_ASSETS.map(withRoomTags));
Object.assign(BLENDERKIT_ASSETS, BLENDERKIT_ASSETS.map(withRoomTags));
Object.assign(POLYHAVEN_ASSETS, POLYHAVEN_ASSETS.map(withRoomTags));
Object.assign(SKETCHFAB_ASSETS, SKETCHFAB_ASSETS.map(withRoomTags));
Object.assign(POLYPIZZA_ASSETS, POLYPIZZA_ASSETS.map(withRoomTags));

export const CATALOG_BY_ID: ReadonlyMap<string, FurnitureAsset> = new Map(
  [...CATALOG, ...FACTORY_ASSETS, ...BLENDERKIT_ASSETS, ...POLYHAVEN_ASSETS, ...SKETCHFAB_ASSETS, ...POLYPIZZA_ASSETS].map(
    (a) => [a.assetId, a],
  ),
);

/** Cross-listing filter: every item tagged for `room`, from every source
 *  catalog. An item with multiple roomTags (e.g.
 *  a rug tagged living+bedroom) appears in each room's results — by design. */
export const getItemsForRoom = (room: RoomType): FurnitureAsset[] =>
  [...CATALOG_BY_ID.values()].filter((a) => a.roomTags?.includes(room));
