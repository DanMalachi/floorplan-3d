/**
 * BlenderKit furniture pipeline — map assets onto the app's catalog taxonomy.
 *
 * Two problems to solve:
 *
 *  1. BlenderKit's category slugs are inconsistent and partly useless. 12 of our
 *     76 assets sit in a catch-all literally named "furniture", and others are
 *     plainly miscategorised ("Projector Screen" is filed under office-chair).
 *     So the slug is only a first guess; a keyword pass over the display name
 *     overrides it, because the name is the more reliable signal.
 *
 *  2. Which items back against a wall. That drives `wallSnap` in the runtime
 *     catalog, and it follows from the resolved type, not from BlenderKit.
 */

import type { FurnitureCategory } from "../../src/furniture/catalog";

/** Finer-grained type than the app's 7 categories — needed to decide wallSnap
 *  and to sanity-check dimensions, which differ a lot within one category. */
export type FurnitureType =
  | "sofa" | "armchair" | "chair" | "stool" | "bench" | "pouf" | "lounger"
  | "dining-table" | "coffee-table" | "side-table" | "desk" | "console"
  | "bed"
  | "cabinet" | "shelving" | "nightstand" | "rack" | "dresser"
  | "appliance"
  | "bathroom"
  | "lamp" | "decor";

/** Name keywords → type. Ordered: the FIRST match wins, so more specific
 *  phrases must precede the generic words they contain ("coffee table" before
 *  "table", "day bed" before "bed"). */
const NAME_RULES: [RegExp, FurnitureType][] = [
  [/day\s*bed|daybed|chaise/i, "sofa"],
  [/sofa|settee|couch/i, "sofa"],
  [/lounge chair|armchair|arm chair/i, "armchair"],
  [/bar stool|barstool/i, "stool"],
  [/stool|scoop/i, "stool"],
  [/bench|picnic table/i, "bench"],
  [/pouf|ottoman/i, "pouf"],
  // Added 2026-09-15 for the gap-category pass. Each precedes the generic word
  // it contains ("bedside table" before "table"/"bed", "chest of drawers"
  // before "cabinet"). None of these phrases occurs in a pre-existing name, so
  // the 71 baseline items classify exactly as before (diffed).
  [/lounger|sun\s*bed|deck\s*chair/i, "lounger"],
  [/bed\s*side|night\s*table/i, "nightstand"],
  [/chest of drawers|dresser|commode|sideboard|drawer cabinet/i, "dresser"],
  [/book\s*(case|shel)/i, "shelving"],
  [/wardrobe/i, "cabinet"],
  [/desks*lamp|tables*lamp|floors*lamp/i, "lamp"],
  [/console/i, "console"],
  [/coffee table/i, "coffee-table"],
  [/dining table|dining/i, "dining-table"],
  [/desk/i, "desk"],
  [/night\s*stand|nightstand/i, "nightstand"],
  [/corner table|side table|wooden corner/i, "side-table"],
  [/rack/i, "rack"],
  [/shel(f|ves|ving)/i, "shelving"],
  [/cabinet|commode|cupboard/i, "cabinet"],
  [/\bbed\b/i, "bed"],
  [/lamp|light|kinkiet|chandelier/i, "lamp"],
  [/stove|oven|fridge|refrigerator|dishwasher|washing/i, "appliance"],
  [/chair/i, "chair"],
  [/table/i, "dining-table"],
  [/basket|screen|vase|clock/i, "decor"],
];

/** BlenderKit slug → type, used only when no name keyword matched. */
const SLUG_RULES: Record<string, FurnitureType> = {
  sofa: "sofa",
  chair: "chair",
  "regular-chair": "chair",
  "bar-chair": "stool",
  "office-chair": "chair",
  pouf: "pouf",
  table: "dining-table",
  "office-table": "desk",
  desk: "desk",
  bed: "bed",
  "kidsfurniture-bed": "bed",
  commode: "dresser",
  bookcase: "shelving",
  "tv-cabinets": "cabinet",
  wardrobe: "cabinet",
  bench: "bench",
  cabinets: "cabinet",
  shelving: "shelving",
  "office-storage": "cabinet",
  hall: "cabinet",
  "kitchen-appliance": "appliance",
  "kitchen-set": "cabinet",
  kitchen: "cabinet",
  "bathroomfurniture-furniture-set": "bathroom",
  "toilet-bidet": "bathroom",
  bathhub: "bathroom",
  "ceiling-light": "lamp",
  "wall-light": "lamp",
  "floor-lamp": "lamp",
  "table-lamps": "lamp",
  lighting: "lamp",
  "outdoor-light": "lamp",
  stationery: "decor",
  utility: "decor",
  interior: "decor",
};

/** Resolved type → the app's 7-way category union. */
const TYPE_TO_CATEGORY: Record<FurnitureType, FurnitureCategory> = {
  sofa: "Seating",
  armchair: "Seating",
  chair: "Seating",
  stool: "Seating",
  bench: "Seating",
  pouf: "Seating",
  lounger: "Seating",
  "dining-table": "Tables",
  "coffee-table": "Tables",
  "side-table": "Tables",
  desk: "Tables",
  console: "Tables",
  bed: "Beds",
  cabinet: "Storage",
  shelving: "Storage",
  nightstand: "Storage",
  rack: "Storage",
  dresser: "Storage",
  appliance: "Kitchen",
  bathroom: "Bathroom",
  lamp: "Decor",
  decor: "Decor",
};

/** Types that are normally pushed back against a wall. Free-standing seating and
 *  tables are deliberately absent — snapping a dining table to a wall is wrong. */
const WALL_SNAP_TYPES = new Set<FurnitureType>([
  "sofa", "bench", "bed", "cabinet", "shelving", "nightstand", "rack", "dresser",
  "console", "desk", "appliance", "bathroom",
]);

/** Slugs that carry no information — BlenderKit's dumping grounds. An asset
 *  landing here with no name keyword needs to be judged on its shape instead. */
const CATCH_ALL_SLUGS = new Set(["furniture", "interior", "living-room", "bedroom", "hall", "office", "utility"]);

/**
 * Last-resort classification from the bounding box, for assets whose slug is a
 * catch-all and whose name gives nothing away — designer pieces named after
 * their model number are the common case ("Carl-hansen-son 501", "Trecento
 * Sessanta", both armchairs that would otherwise be filed as decor).
 *
 * Deliberately conservative: it only claims the shapes that are unambiguous at
 * furniture scale, and falls back to decor rather than guessing wildly.
 * `w`/`d` are the plan footprint and `h` the height, all metres.
 */
function typeFromShape(w: number, d: number, h: number): FurnitureType {
  const extent = Math.max(w, d);

  // Seat-height object with a chair-sized footprint.
  if (extent <= 1.1 && h >= 0.6 && h <= 1.35) return extent >= 0.7 ? "armchair" : "chair";
  // Low and wide: a coffee table.
  if (extent > 1.1 && h < 0.6) return "coffee-table";
  // Table-height and broad.
  if (extent > 1.1 && h >= 0.6 && h <= 1.1) return "dining-table";
  // Tall and narrow-ish: storage.
  if (h > 1.35) return "shelving";
  // Low and small: a stool or footrest.
  if (extent <= 0.7 && h < 0.6) return "stool";
  return "decor";
}

/**
 * @param dims measured [w, h, d] in metres. Optional — without it, catch-all
 *             slugs fall through to decor as before.
 */
export function resolveType(
  displayName: string,
  slug: string,
  dims?: { w: number; h: number; d: number },
): FurnitureType {
  for (const [re, type] of NAME_RULES) {
    if (re.test(displayName)) return type;
  }
  const bySlug = SLUG_RULES[slug];
  if (bySlug) return bySlug;
  if (dims && CATCH_ALL_SLUGS.has(slug)) return typeFromShape(dims.w, dims.d, dims.h);
  return "decor";
}

/**
 * New-item refinement of the generic "…table" → dining-table guess, from the
 * MEASURED height: a 0.4 m "Table" is a coffee table, not an undersized dining
 * table. Used only for items outside the frozen baseline (build-catalog.ts),
 * so shipped items keep the type they shipped with.
 */
export function refineType(type: FurnitureType, displayName: string, dims: { w: number; h: number; d: number }): FurnitureType {
  if (type !== "dining-table" || /dining/i.test(displayName)) return type;
  const extent = Math.max(dims.w, dims.d);
  if (dims.h < 0.6) return extent < 0.8 ? "side-table" : "coffee-table";
  return type;
}

export function categoryFor(type: FurnitureType): FurnitureCategory {
  return TYPE_TO_CATEGORY[type];
}

export function wallSnapFor(type: FurnitureType): boolean {
  return WALL_SNAP_TYPES.has(type);
}

/**
 * Which picker room tabs each type appears under. The app browses by room
 * ("what goes in the bedroom"), not by taxonomy, so items deliberately appear in
 * more than one — a chair belongs in the dining room and the office both.
 *
 * Ids must match BASE_ROOMS in src/furniture/catalog.ts.
 */
const TYPE_TO_ROOMS: Record<FurnitureType, string[]> = {
  sofa: ["living"],
  armchair: ["living", "bedroom"],
  chair: ["dining", "office"],
  stool: ["kitchen", "dining"],
  bench: ["living", "dining"],
  pouf: ["living", "bedroom"],
  lounger: ["outdoors"],
  "dining-table": ["dining"],
  "coffee-table": ["living"],
  "side-table": ["living", "bedroom"],
  desk: ["office"],
  console: ["living"],
  bed: ["bedroom"],
  cabinet: ["living", "bedroom", "kitchen"],
  shelving: ["living", "office"],
  nightstand: ["bedroom"],
  rack: ["living", "office"],
  dresser: ["bedroom", "living"],
  appliance: ["kitchen"],
  bathroom: ["bathroom"],
  lamp: ["living", "bedroom"],
  decor: ["living"],
};

/** BlenderKit slugs that mean "this lives outside". Adds the Outdoors tab on
 *  top of the type's rooms (a garden bench is still a bench). */
const OUTDOOR_SLUGS = new Set(["outdoor-furniture", "bench"]);

export function roomsFor(type: FurnitureType, slug?: string): string[] {
  const rooms = [...TYPE_TO_ROOMS[type]];
  if (slug && OUTDOOR_SLUGS.has(slug) && !rooms.includes("outdoors")) rooms.push("outdoors");
  return rooms;
}

/**
 * Plausible real-world plan footprints per type, in metres, as [min, max] of the
 * LARGER horizontal dimension. Used to catch models authored at the wrong scale
 * — BlenderKit has several, e.g. a daybed modelled at 1.23 m.
 *
 * This matters because src/furniture/catalog.ts scales geometry so the plan
 * bounding box matches `footprint`: a wrong footprint means a wrong-sized model
 * in the scene, whereas a wrong modelled scale is harmless on its own.
 */
export const PLAUSIBLE_EXTENT: Record<FurnitureType, [number, number]> = {
  sofa: [1.4, 3.6],
  armchair: [0.6, 1.3],
  chair: [0.35, 0.9],
  stool: [0.25, 0.7],
  bench: [0.8, 3.2],
  pouf: [0.35, 1.0],
  lounger: [1.2, 2.3],
  "dining-table": [0.7, 3.2],
  "coffee-table": [0.6, 1.6],
  "side-table": [0.3, 0.8],
  desk: [0.9, 2.4],
  console: [0.8, 2.0],
  bed: [0.9, 2.4],
  cabinet: [0.4, 2.6],
  shelving: [0.3, 2.6],
  nightstand: [0.3, 0.8],
  rack: [0.4, 2.0],
  dresser: [0.6, 2.2],
  appliance: [0.4, 1.2],
  bathroom: [0.3, 1.8],
  lamp: [0.08, 1.2],
  decor: [0.05, 1.2],
};

/**
 * Plausible real-world HEIGHT per type, metres [min, max]. Added 2026-09-15 as
 * a hard gate for NEW items (build-catalog.ts): the plan-extent band alone let
 * a 0.46 m kettle pass as an "appliance". Unlike the extent band, a failure
 * here is a rejection, never a rescale — a model whose measured proportions do
 * not look like its type is the wrong model, not a mis-scaled right one.
 * Upper bounds allow for what really ships on the piece: bed headboards,
 * office-chair headrests, a desk with a hutch.
 */
export const PLAUSIBLE_HEIGHT: Record<FurnitureType, [number, number]> = {
  sofa: [0.55, 1.3],
  armchair: [0.6, 1.45],
  chair: [0.6, 1.45],
  stool: [0.35, 1.1],
  bench: [0.35, 1.1],
  pouf: [0.25, 0.6],
  lounger: [0.2, 1.1],
  "dining-table": [0.65, 1.0],
  "coffee-table": [0.25, 0.6],
  "side-table": [0.35, 0.8],
  desk: [0.65, 1.2],
  console: [0.6, 1.1],
  bed: [0.3, 1.6],
  cabinet: [0.4, 2.4],
  shelving: [0.3, 2.4],
  nightstand: [0.35, 0.85],
  rack: [0.4, 2.4],
  dresser: [0.6, 1.6],
  appliance: [0.6, 2.2],
  bathroom: [0.2, 2.2],
  lamp: [0.25, 2.1],
  decor: [0.05, 2.0],
};
