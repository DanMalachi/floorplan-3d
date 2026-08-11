// Headless: room re-tagging rules — the tags that decide which Plan Dock tab
// an item shows up in. Run: npx tsx src/furniture/roomRetag.test.ts

import { retagRooms } from "./roomRetag";
import { getItemsForRoom } from "./catalog";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const tags = (name: string, kind: string, rooms: string[], typeTags: string[] = []) =>
  retagRooms({ name, kind, rooms, typeTags });

console.log("\nadditive re-tagging (source room is kept)");
{
  const t = tags("ÄPPLARÖ", "table, outdoor", ["dining"]);
  check("outdoor dining table gains outdoors", t.includes("outdoors"), t.join("/"));
  check("outdoor dining table keeps dining", t.includes("dining"), t.join("/"));

  const w = tags("PAX", "wardrobe with 2 doors", ["bedroom", "living"]);
  check("wardrobe gains closet", w.includes("closet"), w.join("/"));
  check("wardrobe keeps bedroom", w.includes("bedroom"), w.join("/"));

  const s = tags("STÄLL", "shoe cabinet with 3 compartments", ["bedroom"]);
  check("shoe cabinet gains closet", s.includes("closet"), s.join("/"));

  const c = tags("SUNDVIK", "children's chair", ["dining", "office"]);
  check("children's chair gains kids", c.includes("kids"), c.join("/"));

  const l = tags("BAGGEBO", "cabinet for washing machine", ["bedroom", "living"]);
  check("washing-machine cabinet gains laundry", l.includes("laundry"), l.join("/"));

  const b = tags("BROR", "work bench with drawers", ["office"]);
  check("work bench gains garage", b.includes("garage"), b.join("/"));
}

console.log("\nexclusive outdoor (source room is dropped — absurd indoors)");
{
  const d = tags("RUNNEN", "floor decking, outdoor", ["living"]);
  check("decking leaves Living", !d.includes("living"), d.join("/"));
  check("decking is outdoors only", d.join("/") === "outdoors", d.join("/"));

  const p = tags("HÖGÖN", "parasol, hanging", ["living"]);
  check("parasol leaves Living", !p.includes("living"), p.join("/"));
}

console.log("\ntag-gated garage rule (BlenderKit tags are noisy on their own)");
{
  const rack = tags("Worn Metal Rack", "rack", ["living", "office"], ["metal", "workshop", "garage", "shed"]);
  check("workshop-tagged rack gains garage", rack.includes("garage"), rack.join("/"));

  // "Industrial Coffee Table" carries workshop+garage tags; a coffee table is
  // not garage stock, and the kind gate is what keeps it out.
  const table = tags("Industrial Coffee Table", "coffee table", ["living"], ["metal", "workshop", "garage"]);
  check("workshop-tagged coffee table stays out of garage", !table.includes("garage"), table.join("/"));

  const lamp = tags("Floor Lamp", "lamp", ["living", "bedroom"], ["modern", "industrial"]);
  check("industrial-tagged lamp stays out of garage", !lamp.includes("garage"), lamp.join("/"));
}

console.log("\nword-boundary matching (plain substring would misfire)");
{
  const stool = tags("Metal Stool 01", "stool", ["dining"], ["metal", "vintage", "industrial"]);
  check("bar stool is not a garage tool", !stool.includes("garage"), stool.join("/"));

  const rug = tags("TIPHEDE", "rug flatwoven, in/outdoor", ["living"]);
  check("in/outdoor rug gains outdoors", rug.includes("outdoors"), rug.join("/"));

  const sofa = tags("KIVIK", "3-seat sofa", ["living"]);
  check("plain sofa gains nothing", sofa.join("/") === "living", sofa.join("/"));
}

console.log("\nlive catalog: the five previously-empty tabs are populated");
for (const [room, min] of [
  ["outdoors", 30],
  ["closet", 15],
  ["kids", 5],
  ["garage", 3],
  ["laundry", 2],
] as const) {
  const n = getItemsForRoom(room).length;
  check(`${room} has >= ${min} items`, n >= min, `got ${n}`);
}

console.log("\nno room lost items to the re-tag");
for (const [room, min] of [
  ["living", 250],
  ["bedroom", 100],
  ["dining", 100],
  ["study", 190],
  ["kitchen", 11],
] as const) {
  const n = getItemsForRoom(room).length;
  check(`${room} still has >= ${min} items`, n >= min, `got ${n}`);
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
