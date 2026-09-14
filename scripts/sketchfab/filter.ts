/**
 * Filter raw Sketchfab search candidates (scripts/sketchfab/search.ts output)
 * by: (1) license slug actually cc0/by (belt-and-suspenders — search already
 * filtered server-side, but re-check the field we got back), (2) style —
 * exclude vintage/gothic/antique/rustic/farmhouse/ornate/traditional/worn
 * anywhere in name/tags/categories, (3) isDownloadable true. Ranks survivors
 * by likeCount desc. Does NOT download anything or hit the network — pure
 * local filtering of the already-fetched JSON.
 *
 * Run: npx tsx scripts/sketchfab/filter.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DIR = path.resolve(
  "C:/Users/dandu/AppData/Local/Temp/claude/C--Users-dandu/12e01fd5-7c34-4516-89a9-c5630024de73/scratchpad/furn/sketchfab-search",
);

const STYLE_EXCLUDE = [
  "vintage", "gothic", "antique", "rustic", "farmhouse", "ornate", "traditional",
  "worn", "old", "weathered", "distressed", "victorian", "classic", "baroque",
  "medieval", "retro", "cartoon", "stylized", "low-poly-game", "fantasy",
];

const CATEGORIES = [
  "beds", "office_chairs", "dining_tables",
  "sofas", "armchairs", "dining_chairs", "coffee_tables", "storage", "shelving",
];

function isStyleOk(item: any): boolean {
  const haystack = [item.name, ...(item.tags ?? []), ...(item.categories ?? [])]
    .join(" ")
    .toLowerCase();
  return !STYLE_EXCLUDE.some((w) => haystack.includes(w));
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
    // NOTE: the /search endpoint's embedded `license` object only carries a
    // `label` ("CC Attribution" / "CC0 Public Domain"), not the `slug` the
    // /models/{uid} detail endpoint returns — and the search call itself
    // already server-side filtered to licenses=cc0,by, so every row here
    // already satisfies that. We still re-verify the license per item we
    // actually decide to download via the detail endpoint (download.ts),
    // per Dan's "verify per item, don't assume the set is uniform" rule —
    // this local filter only removes off-style / non-downloadable rows.
    const survivors = items
      .filter((it) => it.isDownloadable)
      .filter((it) => it.license && ["CC Attribution", "CC0 Public Domain"].includes(it.license.label))
      .filter(isStyleOk)
      .sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0));
    writeFileSync(path.join(DIR, `${cat}.filtered.json`), JSON.stringify(survivors, null, 2));
    console.log(`${cat}: ${items.length} -> ${survivors.length} after license+style+downloadable filter`);
  }
}

main();
