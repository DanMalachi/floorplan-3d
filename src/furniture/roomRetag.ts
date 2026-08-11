// Room re-tagging rules.
//
// The imported catalogs carry a `rooms` array that came from the SOURCE's own
// taxonomy: IKEA's IL site only files products under living/bedroom/kitchen/
// dining/office, and BlenderKit's tags are free-form. Neither source knows
// about the Plan Dock's laundry/closet/kids/garage/outdoors tabs, so those
// tabs shipped empty even though the catalog already contains the items —
// 50-odd outdoor pieces sat in "Living", every wardrobe sat in "Bedroom".
//
// These rules re-derive room tags from what each item actually IS (`kind`,
// the normalized English item-type added by scripts/ikea/enrich-catalog.ts),
// and are applied in catalog.ts at build time. They deliberately live in code
// rather than being baked into data/*.catalog.json: those files are generated
// by scripts/ikea/build-catalog.ts, so a hand-edit there is lost on the next
// regeneration.
//
// ADDITIVE by default — an outdoor dining table stays in the Dining tab and
// also appears in Outdoors, matching catalog.ts's existing cross-listing rule
// ("an item may legitimately appear in more than one — not a bug to dedupe").
// Only the `exclusive` rule below removes source tags, for items that are
// nonsense indoors (floor decking, a parasol).

import type { RoomType } from "./catalog";

/** Word-boundary-ish containment. Plain `String.includes` is what the dock's
 *  hotspot filter uses, and it produces false hits ("flatwoven" contains
 *  "oven"); tagging is a build-time decision that gets baked into every
 *  tab, so it uses the stricter test. */
const hasPhrase = (text: string, phrase: string): boolean =>
  new RegExp(`(^|[^a-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(text);

const anyPhrase = (text: string, phrases: string[]): boolean =>
  phrases.some((p) => hasPhrase(text, p));

export interface RetagRule {
  room: RoomType;
  /** Matched against `kind` + `name` — the item's own identity. */
  kind?: string[];
  /** Matched against `typeTags` only, AND-ed with `kindGate` when present.
   *  BlenderKit tags are noisy ("industrial" is on a floor lamp and a sofa),
   *  so a tag alone never tags a room — the item type has to agree. */
  tags?: string[];
  /** Item kinds a `tags` match is allowed to apply to. */
  kindGate?: string[];
}

export const RETAG_RULES: RetagRule[] = [
  // Outdoor: IKEA suffixes the type itself (", outdoor" / ", in/outdoor"),
  // which is why `kind` alone is a reliable signal here.
  {
    room: "outdoors",
    kind: ["outdoor", "in/outdoor", "patio", "garden", "parasol", "sun lounger", "decking", "privacy screen"],
  },
  {
    room: "closet",
    kind: ["wardrobe", "shoe", "coat rack", "clothes rail", "clothes rack", "closet"],
  },
  {
    room: "kids",
    kind: ["child", "children", "children's", "junior", "highchair", "crib", "cot", "toddler", "bunk", "toy"],
  },
  {
    room: "garage",
    kind: ["workbench", "work bench", "tool"],
  },
  {
    // Metal/workshop storage and seating is the only garage-appropriate stock
    // the catalog actually has; gated on kind so "industrial" on a floor lamp
    // or a chaise longue doesn't drag it into the Garage tab.
    room: "garage",
    tags: ["workshop", "garage", "shed", "heavyduty"],
    kindGate: ["rack", "shelving", "shelf", "stool", "desk", "workbench", "cabinet"],
  },
  {
    room: "laundry",
    kind: ["laundry", "washing machine", "drying rack", "ironing", "utility"],
  },
];

/** Items that are absurd in the room the source filed them under — a floor
 *  decking strip or a hanging parasol has no business in the Living tab.
 *  Matched on `kind` + `name`; when one matches, the source rooms are
 *  dropped and only the re-tagged room(s) remain. */
const EXCLUSIVE_OUTDOOR = ["decking", "parasol", "sun lounger", "privacy screen"];

/** The text a rule matches `kind` against. `name` is included because the
 *  curated (non-imported) entries have no `kind` at all. */
const identityText = (name: string, kind?: string): string =>
  [name, kind].filter(Boolean).join(" ").toLowerCase();

/**
 * Final room tags for one catalog item: its source `rooms` plus every rule
 * that fires, minus the source rooms when an exclusive-outdoor item matched.
 * Order is preserved and duplicates removed, so the dock's per-room ordering
 * (BlenderKit ahead of IKEA) is unchanged for items no rule touches.
 */
export function retagRooms(item: { name: string; kind?: string; typeTags?: string[]; rooms: string[] }): string[] {
  const identity = identityText(item.name, item.kind);
  const tagText = (item.typeTags ?? []).join(" ").toLowerCase();

  const added: string[] = [];
  for (const rule of RETAG_RULES) {
    const byKind = rule.kind ? anyPhrase(identity, rule.kind) : false;
    const byTag = rule.tags
      ? anyPhrase(tagText, rule.tags) && (!rule.kindGate || anyPhrase(identity, rule.kindGate))
      : false;
    if (byKind || byTag) added.push(rule.room);
  }

  const exclusive = anyPhrase(identity, EXCLUSIVE_OUTDOOR);
  const base = exclusive ? [] : item.rooms;
  return [...new Set([...base, ...added])];
}
