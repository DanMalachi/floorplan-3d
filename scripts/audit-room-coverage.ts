/**
 * Room-tab coverage audit: how many pickable items each Plan Dock hotspot
 * actually surfaces, using the SAME logic the dock uses (`getItemsForRoom`
 * + `matchesHotspot` + the variant collapse). Run after any catalog or
 * room-retag change:
 *
 *   npx tsx scripts/audit-room-coverage.ts
 *
 * Flags every hotspot under 3 options — the bar Dan set for "a category the
 * user can actually choose from".
 */

import { getItemsForRoom, searchText, type RoomType, type FurnitureAsset } from "../src/furniture/catalog";
import { BATHROOM_HOTSPOTS } from "../src/ui/planDock/BathroomScene";
import { BEDROOM_HOTSPOTS } from "../src/ui/planDock/BedroomScene";
import { CLOSET_HOTSPOTS } from "../src/ui/planDock/ClosetScene";
import { DINING_HOTSPOTS } from "../src/ui/planDock/DiningScene";
import { GARAGE_HOTSPOTS } from "../src/ui/planDock/GarageScene";
import { KIDS_HOTSPOTS } from "../src/ui/planDock/KidsScene";
import { KITCHEN_HOTSPOTS, type RoomHotspot } from "../src/ui/planDock/KitchenScene";
import { LAUNDRY_HOTSPOTS } from "../src/ui/planDock/LaundryScene";
import { LIVING_HOTSPOTS } from "../src/ui/planDock/LivingScene";
import { OUTDOORS_HOTSPOTS } from "../src/ui/planDock/OutdoorsScene";
import { STUDY_HOTSPOTS } from "../src/ui/planDock/StudyScene";
import { GENERATORS } from "../src/parametric";

const HOTSPOTS: Record<RoomType, RoomHotspot[]> = {
  kitchen: KITCHEN_HOTSPOTS,
  bathroom: BATHROOM_HOTSPOTS,
  bedroom: BEDROOM_HOTSPOTS,
  living: LIVING_HOTSPOTS,
  dining: DINING_HOTSPOTS,
  study: STUDY_HOTSPOTS,
  laundry: LAUNDRY_HOTSPOTS,
  closet: CLOSET_HOTSPOTS,
  kids: KIDS_HOTSPOTS,
  garage: GARAGE_HOTSPOTS,
  outdoors: OUTDOORS_HOTSPOTS,
};

// Mirrors BottomDock's collapse of colour/finish variant groups to one card.
const collapse = (items: FurnitureAsset[]): FurnitureAsset[] => {
  const seen = new Set<string>();
  return items.filter((i) => {
    if (!i.variantKey) return true;
    if (seen.has(i.variantKey)) return false;
    seen.add(i.variantKey);
    return true;
  });
};

const BAR = 3;
let below = 0;

for (const room of Object.keys(HOTSPOTS) as RoomType[]) {
  const items = collapse(getItemsForRoom(room));
  const gens = Object.values(GENERATORS)
    .filter((g) => (g.rooms as string[]).includes(room))
    .map((g) => g.id);
  console.log(`\n### ${room.toUpperCase()} — ${items.length} items${gens.length ? `, generators: ${gens.join(", ")}` : ""}`);

  for (const h of HOTSPOTS[room]) {
    const hits = items.filter((i) => h.keywords.some((k) => searchText(i).includes(k)));
    if (hits.length < BAR) below++;
    const kinds = [...new Set(hits.map((x) => x.kind ?? x.name))].slice(0, 6).join(", ");
    const flag = hits.length === 0 ? "EMPTY" : hits.length < BAR ? "THIN " : "ok   ";
    console.log(`  ${flag} ${h.label.padEnd(20)} ${String(hits.length).padStart(3)}  ${kinds}`);
  }
}

console.log(`\n${below} hotspot(s) below ${BAR} options.`);
console.log(
  "Counts are CATALOG items only. Parametric generators (listed per room above)\n" +
    "are pinned Custom cards in the dock and are not hotspot-filtered, so they show\n" +
    "in their room regardless of which hotspot is active.",
);
