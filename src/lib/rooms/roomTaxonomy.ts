// Building Knowledge Layer — room taxonomy hints.
//
// `type` in the schema is an OPEN vocabulary (any string). These lists are only
// hints: the rule classifier picks from KNOWN_ROOM_TYPES, the VLM may return
// anything, and the UI falls back gracefully on unknown labels. Adding a new
// room kind here never requires a schema change.

export const KNOWN_ROOM_TYPES = [
  "bedroom",
  "master_bedroom",
  "bathroom",
  "kitchen",
  "living",
  "dining",
  "hall",
  "closet",
  "office",
  "laundry",
  "garage",
  "entry",
  "balcony",
  "unknown",
] as const;

export type KnownRoomType = (typeof KNOWN_ROOM_TYPES)[number];

// A room's FUNCTION is more stable than its name — a tatami room and a bedroom
// share the function "sleeping", which is what auto-furnishing actually needs.
// Open vocabulary; this map only covers the known types.
const FUNCTION_BY_TYPE: Record<string, string> = {
  bedroom: "sleeping",
  master_bedroom: "sleeping",
  bathroom: "hygiene",
  kitchen: "food_prep",
  living: "gathering",
  dining: "dining",
  hall: "circulation",
  closet: "storage",
  office: "work",
  laundry: "utility",
  garage: "vehicle_storage",
  entry: "circulation",
  balcony: "outdoor",
};

/** Best-known function for a room type, or undefined for an unknown type. */
export function functionForType(type: string): string | undefined {
  return FUNCTION_BY_TYPE[type];
}

/** Human-friendly display label for a type slug. */
export function displayRoomType(type: string): string {
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
