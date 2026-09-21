// Headless: every done-furniture-factory item must be reachable from its room's illustrated
// hotspot in the Plan Dock. BottomDock filters a hotspot's cards with
// `hotspot.keywords.some(k => searchText(item).includes(k))` and searchText is name + kind +
// typeTags only (never the subtitle), so an item whose name lacks the keyword ("Grey Chaise
// Sectional") shipped but was missing from Living > Sofas.
// Run: npx tsx src/furniture/factoryCatalog.test.ts

import { existsSync } from "node:fs";
import path from "node:path";
import { FACTORY_ASSETS, searchText } from "./catalog";
import { LIVING_HOTSPOTS } from "../ui/planDock/LivingScene";
import { BEDROOM_HOTSPOTS } from "../ui/planDock/BedroomScene";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const HOTSPOTS: Record<string, { id: string; keywords: string[] }[]> = {
  living: LIVING_HOTSPOTS,
  bedroom: BEDROOM_HOTSPOTS,
};

console.log("\nfactory catalog: every item is reachable from a hotspot in each of its rooms");
for (const a of FACTORY_ASSETS) {
  const text = searchText(a);
  for (const room of a.roomTags ?? []) {
    const hotspots = HOTSPOTS[room];
    if (!hotspots) continue; // no illustrated scene checked for this room here
    const hit = hotspots.filter((h) => h.keywords.some((k) => text.includes(k)));
    check(`${a.assetId} reachable in ${room}`, hit.length > 0, `search text "${text}" matches no ${room} hotspot`);
  }
  check(`${a.assetId} has a kind`, !!a.kind);
}

console.log("\nfactory catalog: named cases");
const hot = (room: string, id: string) => HOTSPOTS[room].find((h) => h.id === id)!;
const matches = (assetId: string, room: string, hotspotId: string) => {
  const a = FACTORY_ASSETS.find((x) => x.assetId === assetId)!;
  return hot(room, hotspotId).keywords.some((k) => searchText(a).includes(k));
};
check("grey chaise sectional is under Living > Sofa", matches("factory:grey-chaise-sectional", "living", "sofa"));
check("upholstered queen bed is under Bedroom > Bed", matches("factory:upholstered-queen-bed", "bedroom", "bed"));
check("oak platform bed is under Bedroom > Bed", matches("factory:oak-platform-bed", "bedroom", "bed"));

console.log("\nfactory catalog: files exist");
for (const a of FACTORY_ASSETS) {
  for (const f of [a.realModel, a.thumbnail]) {
    if (!f) continue;
    check(`${a.assetId} ${f}`, existsSync(path.join(process.cwd(), "public", f)));
  }
}

if (failures) {
  console.log(`\n${failures} FAILED`);
  process.exit(1);
}
console.log("\nall ok");
