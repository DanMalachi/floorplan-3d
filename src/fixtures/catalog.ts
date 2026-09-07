// The lighting-fixture catalog: placement metadata for ceiling fixtures.
// Deliberately a SEPARATE map from src/furniture/catalog.ts's CATALOG_BY_ID
// (not merged into it) so the two asset-id namespaces stay disjoint by
// construction — every fixture id is "fx:"-prefixed, the same convention the
// furniture catalog already uses for "ikea:"-prefixed items.
//
// MVP visuals are plain procedural THREE primitives keyed by `shape`, not
// downloaded GLBs — "basic ceiling lights that can later be changed." A real
// branded/CC0 fixture catalog (mirroring the IKEA/BlenderKit furniture
// pipelines) is later work, once there's more than one shape to choose from.

export type FixtureCategory = "Ceiling" | "Wall";
export type FixtureShape = "flushDisc" | "pendant" | "sconce";

export interface FixtureAsset {
  assetId: string; // "fx:flushDisc", "fx:pendant", "fx:sconce"
  /** English, and the fallback. Kept so existing consumers keep working
   *  unchanged — including `src/viewport3d/FixtureCatalog.tsx`, which still
   *  renders this. */
  name: string;
  /** The translatable one, under `editor.inspector.fixture.names`. Render sites
   *  prefer it; `name` is the fallback.
   *
   *  These three ARE translatable, unlike an IKEA model name, because they are
   *  generic descriptions of what the thing is rather than proper nouns — the
   *  same line `FurnitureAsset` draws between `name` and `nameKey`, and the
   *  same line Dan's 2026-09-06 decision draws between furniture `kind` values
   *  (translate) and BlenderKit asset titles (do not). Added rather than
   *  swapped for exactly the reason that split exists: one field meaning both
   *  is how a raw key reaches a user's screen. */
  nameKey: string;
  category: FixtureCategory;
  shape: FixtureShape; // discriminant for the procedural mesh in FixtureLayer.tsx
}

export const FIXTURE_CATALOG: FixtureAsset[] = [
  { assetId: "fx:flushDisc", name: "Flush ceiling light", nameKey: "flushDisc", category: "Ceiling", shape: "flushDisc" },
  { assetId: "fx:pendant", name: "Pendant light", nameKey: "pendant", category: "Ceiling", shape: "pendant" },
  { assetId: "fx:sconce", name: "Wall light", nameKey: "sconce", category: "Wall", shape: "sconce" },
];

export const FIXTURE_CATALOG_BY_ID: ReadonlyMap<string, FixtureAsset> = new Map(
  FIXTURE_CATALOG.map((a) => [a.assetId, a]),
);

/** The default fixture `seedRoomFixtures` places in every newly-lit room. */
export const DEFAULT_FIXTURE_ASSET_ID = "fx:flushDisc";

/** Mount height for a newly-placed wall fixture — typical sconce eye level. */
export const WALL_FIXTURE_SILL_M = 1.8;
