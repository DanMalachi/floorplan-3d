// The single place that answers "what are this item's placement properties" —
// catalog items resolve through CATALOG_BY_ID as before; parametric items
// synthesize an equivalent FurnitureAsset from their spec's dims, so every
// collision/snap/inspector call site can stay catalog-shaped.

import { CATALOG_BY_ID, type FurnitureAsset } from "./catalog";
import type { ParametricSpec } from "@/schema/scene";
import { GENERATORS, elevationOf } from "@/parametric";

/** Minimal shape both FurnitureItem and ghost/probe literals satisfy. */
export interface ItemLike {
  assetId: string;
  parametric?: ParametricSpec;
}

/** Placement spec for any item, catalog or parametric. Returns undefined for
 *  unknown catalog ids (existing PlaceholderBox semantics stay intact). */
export function specOf(item: ItemLike): FurnitureAsset | undefined {
  if (item.parametric) {
    const g = GENERATORS[item.parametric.generator];
    // Per-spec, because one generator can mix mounting types — see elevationOf.
    const defaultElevation = elevationOf(item.parametric);
    return {
      assetId: item.assetId,
      name: g.label,
      category: g.category,
      footprint: { w: item.parametric.dims.w, d: item.parametric.dims.d },
      wallSnap: g.wallSnap,
      ...(defaultElevation !== undefined ? { defaultElevation } : {}),
      ...(g.noCollide !== undefined ? { noCollide: g.noCollide } : {}),
    };
  }
  return CATALOG_BY_ID.get(item.assetId);
}
