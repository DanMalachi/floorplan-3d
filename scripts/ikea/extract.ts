/**
 * IKEA furniture pipeline — Phase 1b full extraction.
 *
 * ⚠️ PROTOTYPE / PERSONAL USE ONLY — see scripts/ikea/lib.ts header.
 *
 * Walks the furniture categories on the IKEA Israel (il/he) market and, for every
 * unique product, gathers raw layers and writes ONE raw file per item to
 * data/raw/ikea/item_<itemNo>.json:
 *   • search       — discovery data (price, currency, url, category path, color)
 *   • ingka        — IngkaItems detail (measurements, materials, media, description)
 *   • childDetails — for combos (SPR) that carry no own measurements: the Ingka
 *                    detail of each child article, so a footprint can be derived
 *   • rotera       — planner asset (Draco glTF .glb + measurements) when it exists
 *   • dimensions_cm— derived canonical bounding box in cm (+ which source it came
 *                    from), so measurements are guaranteed present and comparable
 *
 * PIP (products/*.json) is intentionally NOT called: IngkaItems supersedes it and
 * search already carries price/url/category. (Verified combos have no measurements
 * in PIP either, so it adds nothing.)
 *
 * Everything is disk-cached (data/raw/ikea/_cache), so re-runs are instant and hit
 * IKEA zero times. Requests are sequential with a 300–500ms pause; IngkaItems is
 * batched to keep the footprint small and polite.
 *
 * Run:   npx tsx scripts/ikea/extract.ts
 * Tune:  IKEA_CAP=40 npx tsx scripts/ikea/extract.ts   (max items per category)
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  RAW_DIR,
  cachedGetJson,
  searchUrl,
  searchItems,
  ingkaUrl,
  ingkaHeaders,
  indexIngka,
  roteraUrl,
  heBlock,
  dimsFromDetailed,
  maxDims,
  fillDims,
  type Dimensions,
  type SearchProduct,
} from "./lib";

// Category → Hebrew search term. Free-text search is what the reference exposes and
// what the spec calls for; the browse/PLP endpoint needs an undocumented rolling API
// version, so we don't rely on it. Each item keeps IKEA's own categoryPath too.
const CATEGORIES: { key: string; query: string }[] = [
  { key: "sofas", query: "ספה" },
  { key: "armchairs", query: "כורסה" },
  { key: "coffee-tables", query: "שולחן סלון" },
  { key: "dining-tables", query: "שולחן אוכל" },
  { key: "storage-shelving", query: "מדף" }, // wall & freestanding shelves
  { key: "bookcases", query: "כוננית" }, // shelf units / bookcases (BILLY-type)
  { key: "cabinets", query: "ארון" }, // cabinets / wardrobes
  { key: "wall-cabinets", query: "ארונית קיר" }, // wall-mounted cabinets
  { key: "lighting", query: "מנורה" },
  { key: "beds", query: "מיטה" }, // beds
  { key: "desks", query: "שולחן עבודה" }, // desks / work tables
  { key: "chairs", query: "כיסא" }, // dining/office chairs
  { key: "wardrobes", query: "ארון בגדים" }, // wardrobes / closets
  { key: "tv-units", query: "רהיט טלוויזיה" }, // TV benches / media units
  { key: "sideboards", query: "מזנון" }, // sideboards / buffets
  { key: "nightstands", query: "שידת לילה" }, // nightstands / bedside tables
  { key: "dressers", query: "שידת מגירות" }, // chests of drawers
  { key: "benches", query: "ספסל" }, // benches
  { key: "outdoor", query: "רהיטי גן" }, // garden / outdoor furniture
];

// Full-catalog pull: take everything the search endpoint returns per category
// (size=200 below). Only items with a real, loadable 3D model are shipped, so the
// wide net just maximizes the real-model set — build-catalog.ts does the filtering.
const CAP = Number(process.env.IKEA_CAP ?? 200);
const INGKA_BATCH = 20;

// Rotera reports structured mm under English labels — a clean measurement fallback.
const ROTERA_DIM: Record<string, keyof Dimensions> = {
  width: "width",
  depth: "depth",
  height: "height",
  length: "length",
  diameter: "diameter",
};
function roteraDims(rotera: any): Dimensions {
  const out: Dimensions = {};
  for (const m of rotera?.measurements ?? []) {
    const key = ROTERA_DIM[m.measurementType];
    if (key) out[key] = Math.max(out[key] ?? 0, Math.round(m.value / 10)); // mm → cm
  }
  return out;
}
const hasFootprint = (d: Dimensions) =>
  d.width != null || d.length != null || d.diameter != null;

interface RawItem {
  itemNo: string;
  itemType: string;
  category: string;
  discoveredIn: string[];
  search: SearchProduct;
  ingka: unknown | null;
  childDetails: unknown[] | null;
  rotera: unknown | null;
  dimensions_cm: (Dimensions & { source: string }) | null;
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  const t0 = Date.now();

  console.log("=".repeat(72));
  console.log(`IKEA Phase 1b extraction — il/he — cap=${CAP}/category`);
  console.log("=".repeat(72));

  // ── 1. Discovery ──────────────────────────────────────────────────────────
  const byItem = new Map<string, RawItem>();
  const perCategoryFound: Record<string, number> = {};
  const failures: string[] = [];

  for (const cat of CATEGORIES) {
    const res = await cachedGetJson(searchUrl(cat.query, 200));
    if (!res.ok) {
      failures.push(`search:${cat.key} status=${res.status}`);
      console.log(`[search] ${cat.key.padEnd(16)} FAILED status=${res.status}`);
      continue;
    }
    const products = searchItems(res.json).slice(0, CAP);
    perCategoryFound[cat.key] = products.length;
    console.log(`[search] ${cat.key.padEnd(16)} ${String(products.length).padStart(3)} items (cached=${res.cached})`);
    for (const p of products) {
      const existing = byItem.get(p.itemNo);
      if (existing) existing.discoveredIn.push(cat.key);
      else
        byItem.set(p.itemNo, {
          itemNo: p.itemNo, itemType: p.itemType, category: cat.key,
          discoveredIn: [cat.key], search: p,
          ingka: null, childDetails: null, rotera: null, dimensions_cm: null,
        });
    }
  }
  const items = [...byItem.values()];
  console.log(`\n[dedupe] ${items.length} unique items across ${CATEGORIES.length} categories`);

  // ── 2. Detail: IngkaItems, batched ────────────────────────────────────────
  let ingkaHit = 0;
  for (let i = 0; i < items.length; i += INGKA_BATCH) {
    const batch = items.slice(i, i + INGKA_BATCH);
    const res = await cachedGetJson(ingkaUrl(batch.map((b) => b.itemNo)), ingkaHeaders);
    if (!res.ok) { failures.push(`ingka:batch@${i} status=${res.status}`); continue; }
    const idx = indexIngka(res.json);
    for (const it of batch) { it.ingka = idx.get(it.itemNo) ?? null; if (it.ingka) ingkaHit++; }
    process.stdout.write(`\r[ingka]  ${Math.min(i + INGKA_BATCH, items.length)}/${items.length}`);
  }
  console.log(`\n[ingka]  ${ingkaHit}/${items.length} items have detail`);

  // ── 2b. Combo children: for SPR items whose own detail carries no footprint,
  //         fetch every child article once (batched) so we can derive dimensions.
  const needKids = items.filter((it) => {
    const he = heBlock(it.ingka);
    return !hasFootprint(dimsFromDetailed(he?.measurements?.detailedMeasurements)) &&
      Array.isArray((it.ingka as any)?.childItems);
  });
  const childNos = new Set<string>();
  for (const it of needKids)
    for (const c of (it.ingka as any).childItems) childNos.add(c.itemKey.itemNo);
  const childIdx = new Map<string, any>();
  const childList = [...childNos];
  for (let i = 0; i < childList.length; i += INGKA_BATCH) {
    const batch = childList.slice(i, i + INGKA_BATCH);
    const res = await cachedGetJson(ingkaUrl(batch), ingkaHeaders);
    if (!res.ok) { failures.push(`ingka-children:batch@${i} status=${res.status}`); continue; }
    for (const [no, v] of indexIngka(res.json)) childIdx.set(no, v);
  }
  for (const it of needKids) {
    it.childDetails = (it.ingka as any).childItems
      .map((c: any) => childIdx.get(c.itemKey.itemNo))
      .filter(Boolean);
  }
  console.log(`[ingka]  fetched children for ${needKids.length} combos (${childList.length} articles)`);

  // ── 3. Rotera per item ────────────────────────────────────────────────────
  let roteraHit = 0;
  for (let i = 0; i < items.length; i++) {
    const res = await cachedGetJson(roteraUrl(items[i].itemNo));
    if (res.ok) { items[i].rotera = res.json; roteraHit++; }
    else if (res.status !== 404) failures.push(`rotera:${items[i].itemNo} status=${res.status}`);
    process.stdout.write(`\r[rotera] ${i + 1}/${items.length} (${roteraHit} hits)`);
  }
  console.log("");

  // ── 4. Derive canonical dimensions, MERGING sources so each is only used to
  //         fill axes still missing: Ingka own → combo children → Rotera. ──────
  let dimHit = 0;
  for (const it of items) {
    const he = heBlock(it.ingka);
    const dims: Dimensions = dimsFromDetailed(he?.measurements?.detailedMeasurements);
    const sources: string[] = hasFootprint(dims) || dims.height != null ? ["ingka"] : [];
    if (!hasFootprint(dims) && it.childDetails?.length) {
      const kids = maxDims(it.childDetails.map((c) => dimsFromDetailed(heBlock(c)?.measurements?.detailedMeasurements)));
      if (hasFootprint(kids)) { fillDims(dims, kids); sources.push("ingka-children"); }
    }
    if (!hasFootprint(dims) && it.rotera) {
      const rd = roteraDims(it.rotera);
      if (hasFootprint(rd) || rd.height != null) { fillDims(dims, rd); sources.push("rotera"); }
    }
    it.dimensions_cm = sources.length ? { ...dims, source: sources.join("+") } : null;
    if (it.dimensions_cm) dimHit++;
  }

  // ── 5. Persist ────────────────────────────────────────────────────────────
  for (const it of items)
    await writeFile(path.join(RAW_DIR, `item_${it.itemNo}.json`), JSON.stringify(it, null, 2), "utf8");

  // ── Summary ───────────────────────────────────────────────────────────────
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("\n" + "=".repeat(72) + "\nSUMMARY\n" + "=".repeat(72));
  console.log(`Total unique items fetched : ${items.length}`);
  console.log(`Elapsed                    : ${secs}s`);
  console.log("\nItems per category (post-cap, pre-dedupe):");
  for (const cat of CATEGORIES) console.log(`   ${cat.key.padEnd(18)} ${perCategoryFound[cat.key] ?? 0}`);
  console.log(`\nItems found in >1 category  : ${items.filter((i) => i.discoveredIn.length > 1).length}`);
  console.log(`Items with IngkaItems detail: ${ingkaHit}/${items.length}`);
  console.log(`Items with a usable Rotera 3D reference (.glb): ${roteraHit}/${items.length} (${((roteraHit / items.length) * 100).toFixed(0)}%)`);
  console.log(`Items with derived dimensions: ${dimHit}/${items.length} (${((dimHit / items.length) * 100).toFixed(0)}%)`);
  const bySrc: Record<string, number> = {};
  for (const it of items) if (it.dimensions_cm) bySrc[it.dimensions_cm.source] = (bySrc[it.dimensions_cm.source] ?? 0) + 1;
  console.log(`   dimension source split   : ${JSON.stringify(bySrc)}`);
  console.log(`Failures / timeouts         : ${failures.length}`);
  for (const f of failures.slice(0, 20)) console.log(`   • ${f}`);
  console.log(`\nRaw files written to ${RAW_DIR}\\item_*.json`);
  console.log("STOP — Phase 1b. Review this summary before normalization (Phase 2).");
}

main().catch((e) => { console.error(e); process.exit(1); });
