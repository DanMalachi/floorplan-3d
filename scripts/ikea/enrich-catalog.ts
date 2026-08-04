/**
 * Catalog matching fix (Plan Dock P1).
 *
 * `matchesHotspot`/search in BottomDock.tsx only ever matched `item.name` —
 * fine for the curated CC0 catalog (names like "Sofa", "Dining table"), but
 * IKEA/BlenderKit names are BRAND WORDS ("BILLY", "KIVIK") that say nothing
 * about what the item is. Result: the Living tab's Sofa hotspot surfaced 0
 * of the 245 IKEA living items.
 *
 * This script does NOT rerun `build-catalog.ts` (that needs the local GLBs,
 * which now live only on Vercel Blob — CLAUDE.md rule). It's merge-only:
 * reads the SLIM catalogs already on disk (`data/furniture-ikea.catalog.json`,
 * `data/furniture-blenderkit.catalog.json`) and the RICH raw sources
 * (`data/furniture-ikea.json`, `data/furniture-blenderkit.json`), joins on
 * the id already shared between them, and adds four new fields per item:
 *
 *   - kind        English item-type ("3-seat sofa", "bookcase", ...) — what
 *                  `searchText()` (src/furniture/catalog.ts) actually keys on.
 *   - typeTags    extra English search terms (raw category + BlenderKit tags).
 *   - colors      [{name, hex}] — IKEA only; feeds Phase 6's swatches.
 *   - variantKey  name|kind|WxDxH (cm, from RAW dimensions) — groups true
 *                  color/finish variants (VIKHAMMER white/black) without
 *                  merging genuine size variants (BILLY's 13 sizes).
 *
 * Every existing field is left untouched. Run: npx tsx scripts/ikea/enrich-catalog.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const dataPath = (f: string) => path.join(ROOT, "data", f);

interface Color {
  name: string;
  hex: string;
}

interface CatalogItem {
  assetId: string;
  name: string;
  subtitle?: string;
  [key: string]: unknown;
  // Enriched fields (added below):
  kind?: string;
  typeTags?: string[];
  colors?: Color[];
  variantKey?: string;
}

const dimsKey = (w?: number | null, d?: number | null, h?: number | null) =>
  `${Math.round(w ?? 0)}x${Math.round(d ?? 0)}x${Math.round(h ?? 0)}`;

// --- IKEA --------------------------------------------------------------

interface IkeaRaw {
  name: string;
  category: string;
  subcategory: string;
  colors?: Color[];
  dimensions?: { width?: number; depth?: number; height?: number };
  sourceItemId: string;
}

function enrichIkea() {
  const catalog: CatalogItem[] = JSON.parse(readFileSync(dataPath("furniture-ikea.catalog.json"), "utf8"));
  const raw: IkeaRaw[] = JSON.parse(readFileSync(dataPath("furniture-ikea.json"), "utf8"));
  const rawById = new Map(raw.map((r) => [r.sourceItemId, r]));

  let joined = 0;
  for (const item of catalog) {
    const suffix = item.assetId.split(":").slice(1).join(":");
    const r = rawById.get(suffix);
    if (!r) continue; // merge-only: leave unenriched rather than guess
    joined++;
    item.kind = r.subcategory || r.category;
    item.typeTags = [r.category, r.subcategory].filter(Boolean) as string[];
    item.colors = r.colors ?? [];
    item.variantKey = `${item.name}|${item.kind}|${dimsKey(r.dimensions?.width, r.dimensions?.depth, r.dimensions?.height)}`;
  }

  writeFileSync(dataPath("furniture-ikea.catalog.json"), JSON.stringify(catalog, null, 2) + "\n");
  return { total: catalog.length, joined };
}

// --- BlenderKit ----------------------------------------------------------

interface BlenderKitRaw {
  assetBaseId: string;
  category?: string;
  tags?: string[];
}

function enrichBlenderKit() {
  const catalog: CatalogItem[] = JSON.parse(readFileSync(dataPath("furniture-blenderkit.catalog.json"), "utf8"));
  const raw: BlenderKitRaw[] = JSON.parse(readFileSync(dataPath("furniture-blenderkit.json"), "utf8"));
  const rawById = new Map(raw.map((r) => [r.assetBaseId, r]));

  let joined = 0;
  for (const item of catalog) {
    const suffix = item.assetId.split(":").slice(1).join(":");
    const r = rawById.get(suffix);
    if (!r) continue;
    joined++;
    // BlenderKit's own build-catalog.ts already derived `subtitle` as an
    // English slug of raw.category (e.g. "bed", "lamp") — that IS the kind.
    item.kind = item.subtitle || r.category;
    item.typeTags = [r.category, ...(r.tags ?? [])].filter(Boolean) as string[];
    item.colors = []; // BlenderKit's schema carries no colour/finish data
    // No reliable raw W/D/H (geometry.dimension* is frequently null in this
    // source) — key on footprint alone, still enough to separate distinct
    // physical models sharing a name.
    const fp = item.footprint as { w: number; d: number } | undefined;
    item.variantKey = `${item.name}|${item.kind}|${dimsKey(fp?.w, fp?.d, undefined)}`;
  }

  writeFileSync(dataPath("furniture-blenderkit.catalog.json"), JSON.stringify(catalog, null, 2) + "\n");
  return { total: catalog.length, joined };
}

// --- Sanity check: the Living/Sofa hotspot regression this phase fixes -----

const SOFA_KEYWORDS = ["sofa", "couch", "lounge chair", "bench"];
const searchTextOf = (item: CatalogItem) =>
  [item.name, item.kind, ...(item.typeTags ?? [])].filter(Boolean).join(" ").toLowerCase();

function sofaHotspotCounts() {
  const ikea: CatalogItem[] = JSON.parse(readFileSync(dataPath("furniture-ikea.catalog.json"), "utf8"));
  const bk: CatalogItem[] = JSON.parse(readFileSync(dataPath("furniture-blenderkit.catalog.json"), "utf8"));
  const all = [...ikea, ...bk];
  const byNameOnly = all.filter((i) => SOFA_KEYWORDS.some((k) => i.name.toLowerCase().includes(k))).length;
  const bySearchText = all.filter((i) => SOFA_KEYWORDS.some((k) => searchTextOf(i).includes(k))).length;
  return { byNameOnly, bySearchText, ikeaOnlyBySearchText: ikea.filter((i) => SOFA_KEYWORDS.some((k) => searchTextOf(i).includes(k))).length };
}

const ikeaResult = enrichIkea();
const bkResult = enrichBlenderKit();
const sofa = sofaHotspotCounts();

console.log(`IKEA:        ${ikeaResult.joined}/${ikeaResult.total} joined`);
console.log(`BlenderKit:  ${bkResult.joined}/${bkResult.total} joined`);
console.log(`Sofa hotspot (name-only match, old behavior): ${sofa.byNameOnly} items`);
console.log(`Sofa hotspot (searchText match, new behavior): ${sofa.bySearchText} items (${sofa.ikeaOnlyBySearchText} IKEA)`);
