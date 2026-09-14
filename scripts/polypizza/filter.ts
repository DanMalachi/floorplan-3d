/**
 * Filter raw Poly Pizza search candidates (scripts/polypizza/search.ts
 * output) by style (name/tags/category) and license label, same rule set
 * as scripts/sketchfab/filter.ts. Poly Pizza's entire corpus, empirically,
 * only carries "CC0 1.0" and "CC-BY 3.0" (checked across all 9 category
 * searches — see docs), both acceptable, but the check stays explicit here
 * rather than assumed.
 *
 * Run: npx tsx scripts/polypizza/filter.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DIR = path.resolve(
  "C:/Users/dandu/AppData/Local/Temp/claude/C--Users-dandu/12e01fd5-7c34-4516-89a9-c5630024de73/scratchpad/furn/polypizza-search",
);

const STYLE_EXCLUDE = [
  "vintage", "gothic", "antique", "rustic", "farmhouse", "ornate", "traditional",
  "worn", "old", "weathered", "distressed", "victorian", "classic", "baroque",
  "medieval", "retro", "cartoon", "stylized", "fantasy", "gaming", "gamer",
  "racing", "cyberpunk", "sci-fi", "scifi", "futuristic",
];

const ACCEPTED_LICENCES = ["CC0 1.0", "CC-BY 3.0", "CC-BY 4.0"];

const SCENE_WORDS = [
  "room", "bedroom", "house", "cabin", "apartment", "set", "pack", "scene",
  "interior", "kitchen -", "office -", "furniture pack",
];

const CATEGORIES = [
  "beds", "office_chairs", "dining_tables",
  "sofas", "armchairs", "dining_chairs", "coffee_tables", "storage", "shelving",
];

function isStyleOk(item: any): boolean {
  const haystack = [item.name, ...(item.tags ?? []), item.category].join(" ").toLowerCase();
  return !STYLE_EXCLUDE.some((w) => haystack.includes(w));
}

function looksLikeScene(name: string): boolean {
  const n = name.toLowerCase();
  return SCENE_WORDS.some((w) => n.includes(w));
}

function main() {
  for (const cat of CATEGORIES) {
    const file = path.join(DIR, `${cat}.json`);
    let items: any[];
    try {
      items = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      console.log(`${cat}: no file, skip`);
      continue;
    }
    const survivors = items
      .filter((it) => ACCEPTED_LICENCES.includes(it.licence))
      .filter(isStyleOk)
      .filter((it) => !looksLikeScene(it.name))
      .sort((a, b) => (b.triCount ?? 0) - (a.triCount ?? 0)); // no like-count field; triCount as a weak proxy for effort, not used for ranking decisions
    writeFileSync(path.join(DIR, `${cat}.filtered.json`), JSON.stringify(survivors, null, 2));
    console.log(`${cat}: ${items.length} -> ${survivors.length} after license+style+scene-name filter`);
  }
}

main();
