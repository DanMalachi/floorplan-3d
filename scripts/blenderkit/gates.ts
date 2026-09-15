/**
 * BlenderKit furniture pipeline — ship gates for items NOT in the frozen
 * baseline (baseline.ts). Added 2026-09-15 with the gap-category pass (beds,
 * nightstands, dressers, desks, bookcases, lamps, outdoor).
 *
 * Split in two because they run at different times:
 *
 *  • `metadataGate` needs only the index entry, so fetch-models.ts and
 *    convert-blend.ts run it BEFORE spending a download (and, for blend-only
 *    assets, a Blender conversion) on something that could never ship.
 *
 *  • `geometryGate` needs the MEASURED glb AABB from audit.ts. Dimensions are
 *    never taken from BlenderKit's metadata — the licence audit found one asset
 *    whose reported height was 5x its real height. A measured size outside the
 *    type's real-world band is a rejection, not a rescale: build-catalog.ts's
 *    old rescale-into-band behaviour survives for the baseline only.
 *
 * Every gate is a hard reject (Dan's standing rule — no ship-with-caveat).
 */

import { brandHit, isContentRejected } from "./content-filter";
import { PLAUSIBLE_EXTENT, PLAUSIBLE_HEIGHT, refineType, resolveType, type FurnitureType } from "./classify";
import type { BlenderKitIndexEntry } from "./index-schema";

/** Lights that mount on a wall or hang from a ceiling. The picker places every
 *  item on the floor, so these would stand on the floor at full height. Floor
 *  and table lamps (slugs floor-lamp / table-lamps) are what the catalog needs. */
const MOUNTED_LIGHT_SLUGS = new Set(["ceiling-light", "wall-light", "industrial-light", "ies-light", "outdoor-light"]);
const MOUNTED_LIGHT_NAME = /chandelier|sconce|pendant|hanging|ceiling|wall\s*(lamp|light)|spot\s*light|lantern|torch|flashlight|searchlight/i;

/** Slugs whose contents are props, not furniture, whatever their name says. */
const PROP_SLUGS = new Set(["stationery", "toy", "handtools", "food-drink", "tableware-set", "shopping-retail"]);

/** Reason string when the asset must not ship, null when it may proceed. */
export function metadataGate(e: BlenderKitIndexEntry): string | null {
  const display = e.displayName || e.name;
  if (e.license !== "cc_zero") return "licence: not cc_zero";
  const content = isContentRejected(display);
  if (content) return `content: ${content}`;
  const brand = brandHit(e);
  if (brand) return `brand/named product: "${brand}"`;
  if (PROP_SLUGS.has(e.category)) return `prop (slug ${e.category})`;
  if (MOUNTED_LIGHT_SLUGS.has(e.category) || MOUNTED_LIGHT_NAME.test(display))
    return "wall/ceiling-mounted light (picker places on the floor)";
  return null;
}

/** Types a new item may NOT resolve to, and why. `decor` is the classifier's
 *  fallback for "could not tell" — in this index, kettles, blackboards, boxes.
 *  Sofas, bathroom fixtures and kitchen appliances are covered by the app's
 *  parametric generators, so imported models there add weight, not coverage. */
const EXCLUDED_NEW_TYPES: Partial<Record<FurnitureType, string>> = {
  decor: "not furniture (unclassifiable → decor/prop)",
  sofa: "sofa — covered by the parametric sofa generator",
  bathroom: "bathroom fixture — covered by the parametric bathroom generator",
  appliance: "kitchen appliance — covered by the parametric kitchen generator",
};

/**
 * What the downloaders use: `metadataGate`, plus the type exclusions when the
 * name or slug alone already decides the type (a "Cotton Sofa" is a sofa at
 * any size). Catch-all slugs resolve to decor without dimensions, so they are
 * NOT excluded here — their type waits for the measured geometry.
 */
export function preDownloadGate(e: BlenderKitIndexEntry): string | null {
  const meta = metadataGate(e);
  if (meta) return meta;
  const type = resolveType(e.displayName || e.name, e.category);
  if (type !== "decor" && EXCLUDED_NEW_TYPES[type]) return EXCLUDED_NEW_TYPES[type]!;
  return null;
}

export function geometryGate(
  e: BlenderKitIndexEntry,
  glbSize: [number, number, number],
): { type: FurnitureType; reason: string | null } {
  const display = e.displayName || e.name;
  // y-up: the measured AABB is [width, height, depth].
  const [w, h, d] = glbSize;
  const type = refineType(resolveType(display, e.category, { w, h, d }), display, { w, h, d });
  const excluded = EXCLUDED_NEW_TYPES[type];
  if (excluded) return { type, reason: excluded };
  const extent = Math.max(w, d);
  const [emin, emax] = PLAUSIBLE_EXTENT[type];
  if (extent < emin || extent > emax)
    return { type, reason: `measured plan extent ${extent.toFixed(2)} m outside ${type} band [${emin}, ${emax}]` };
  const [hmin, hmax] = PLAUSIBLE_HEIGHT[type];
  if (h < hmin || h > hmax)
    return { type, reason: `measured height ${h.toFixed(2)} m outside ${type} band [${hmin}, ${hmax}]` };
  return { type, reason: null };
}
