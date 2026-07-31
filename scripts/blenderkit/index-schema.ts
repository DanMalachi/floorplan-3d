/**
 * Raw index SCHEMA for the BlenderKit pipeline (scripts/blenderkit/*).
 *
 * fetch-index.ts writes one of these per CC0 interior asset into
 * data/furniture-blenderkit.json. It is a faithful record of what the search
 * API reported — quality filtering happens downstream in audit.ts, so that the
 * filter thresholds can be re-tuned against the FULL population without
 * re-fetching. This file is types-only, used by the build-time scripts.
 *
 * NOT the app's runtime catalog — that's src/furniture/catalog.ts.
 */

/** BlenderKit's own free-form category slug ("chair", "sofa", "interior", …).
 *  Mapped onto the app's FurnitureCategory union later, in build-catalog.ts. */
export type BlenderKitCategory = string;

/** Everything the search API knows about an asset's geometry, WITHOUT having
 *  downloaded it. All lengths are metres, in Blender's Z-up frame — so for an
 *  upright object dimensionZ is its height and X/Y are its plan footprint.
 *  Whether the exported .glb is Y-up is a separate question, verified in the
 *  audit step against the actual file. */
export interface BlenderKitGeometry {
  dimensionX: number | null;
  dimensionY: number | null;
  dimensionZ: number | null;
  boundBoxMinZ: number | null;
  boundBoxMaxZ: number | null;
  /** Render-time triangle/face count — the main "will this kill the browser" signal. */
  faceCount: number | null;
  /** >1 usually means a set or a whole scene rather than one placeable item. */
  objectCount: number | null;
  textureResolutionMax: number | null;
  textureCount: number | null;
}

/** Author credit. CC0 requires no attribution, but we record it anyway and ship
 *  it in the manifest — crediting people who released work for free is cheap. */
export interface BlenderKitAuthor {
  id: number | null;
  name: string;
}

export interface BlenderKitIndexEntry {
  /** Stable identity across versions — use this as the catalog key. */
  assetBaseId: string;
  /** This specific version's id. */
  id: string;
  name: string;
  displayName: string;
  category: BlenderKitCategory;
  tags: string[];
  description: string;

  /** Always "cc_zero" — anything else is dropped at fetch time. */
  license: string;
  author: BlenderKitAuthor;

  geometry: BlenderKitGeometry;
  /** "realistic" | "lowpoly" | "stylized" | … as the uploader classified it. */
  modelStyle: string | null;
  /** "finished" | "template" | "rendered" — uploader's completeness claim. */
  productionLevel: string | null;

  /** Numeric file id for the glTF variant; feeds /downloads/<id>/. Null when the
   *  asset has no glTF export (blend-only), which makes it unusable to us. */
  gltfFileId: number | null;
  /** Byte size of all the asset's files combined — a rough weight signal only. */
  filesSize: number | null;

  thumbnailUrl: string | null;
  webUrl: string;

  ratingsAverage: number | null;
  ratingsCount: number | null;
}
