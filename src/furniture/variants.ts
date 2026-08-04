// Color/finish variant grouping (Plan Dock P6). Groups CATALOG_BY_ID entries
// that are the SAME physical item in different colors — verified against the
// raw IKEA data: variantKey = `${name}|${kind}|${WxDxH}`, so VIKHAMMER white/
// black (identical dims) collapse into one group while BILLY's 13 different
// sizes (13 different WxDxH strings) correctly stay 13 separate items rather
// than being mistaken for "variants" of each other. Only IKEA carries real
// color data (`colors[]`) — BlenderKit/base-catalog items get a `variantKey`
// from enrich-catalog.ts too, but with no siblings they never form a group.
//
// Deliberately its own module rather than folded into catalog.ts: this is
// UI-facing derived data (which cards collapse, which dots to draw), not
// placement metadata.

import { CATALOG_BY_ID, type FurnitureAsset } from "./catalog";

/** variantKey -> every sibling sharing it, ONLY for keys with 2+ members — a
 *  lone item with a variantKey (no real color siblings) is not a group. */
export const VARIANT_GROUPS: ReadonlyMap<string, FurnitureAsset[]> = (() => {
  const byKey = new Map<string, FurnitureAsset[]>();
  for (const a of CATALOG_BY_ID.values()) {
    if (!a.variantKey) continue;
    const list = byKey.get(a.variantKey);
    if (list) list.push(a);
    else byKey.set(a.variantKey, [a]);
  }
  for (const [k, v] of byKey) if (v.length < 2) byKey.delete(k);
  return byKey;
})();

/** assetId -> its group (all members, including itself), for any asset that
 *  belongs to a real 2+ member variant group. */
export const VARIANT_GROUP_BY_ASSET_ID: ReadonlyMap<string, FurnitureAsset[]> = (() => {
  const out = new Map<string, FurnitureAsset[]>();
  for (const group of VARIANT_GROUPS.values()) {
    for (const a of group) out.set(a.assetId, group);
  }
  return out;
})();

/** The full sibling group (including `assetId` itself) if it has real color
 *  variants, else null. Callers branch on null to skip swatch UI entirely. */
export function variantGroupFor(assetId: string): FurnitureAsset[] | null {
  return VARIANT_GROUP_BY_ASSET_ID.get(assetId) ?? null;
}
