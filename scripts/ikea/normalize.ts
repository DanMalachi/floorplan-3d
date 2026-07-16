/**
 * IKEA furniture pipeline — Phase 2 normalization.
 *
 * Reads the raw per-item files (data/raw/ikea/item_*.json) produced by extract.ts
 * and maps each into the brand-agnostic FurnitureItem schema
 * (scripts/ikea/catalog-schema.ts), emitting a single committed static asset:
 *   data/furniture-ikea.json   — a bare FurnitureItem[] (mirrors tambour-colors.json)
 *
 * Pure/offline: no network, no caching needed. Deterministic.
 *
 * Run:  npx tsx scripts/ikea/normalize.ts            # print 3 samples, DON'T write
 *       npx tsx scripts/ikea/normalize.ts --write    # map all + write the asset
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { heBlock } from "./lib";
import type {
  FurnitureCategory,
  FurnitureColor,
  FurnitureItem,
} from "./catalog-schema";

const RAW_DIR = path.resolve("data/raw/ikea");
const OUT = path.resolve("data/furniture-ikea.json");

function langBlock(ingka: any, code: string): any {
  return (ingka?.localisedCommunications ?? []).find((l: any) => l.languageCode === code) ?? null;
}

/** Largest available variant (by pixel width) of the first media of a given type. */
function bestImage(ingka: any, typeName: string): string | null {
  const he = heBlock(ingka);
  const media = (he?.media ?? []).find((m: any) => m.typeName === typeName);
  const variants = (media?.variants ?? []).filter((v: any) => v.href);
  variants.sort((a: any, b: any) => (b.width ?? 0) - (a.width ?? 0));
  return variants[0]?.href ?? null;
}

/** Unique "<part>: <material>" lines for one language block. Combos repeat part
 *  groups across sub-articles, so we de-duplicate while preserving order. */
function materialLines(block: any): string[] {
  const lines = (block?.materials ?? [])
    .flatMap((g: any) => g.partMaterials ?? [])
    .map((p: any) => [p.partText, p.materialText].filter(Boolean).join(" ").trim())
    .filter(Boolean);
  return [...new Set<string>(lines)];
}

function normHex(hex: string | undefined): string {
  if (!hex) return "";
  const h = hex.replace(/^#/, "").toLowerCase();
  return /^[0-9a-f]{6}$/.test(h) ? `#${h}` : "";
}

/** Pick a usable 3D model: glTF-family only (React Three Fiber can't use IKEA's
 *  usdz/AR format), preferring IL-licensed and the smaller Draco variant. */
function pickModel(rotera: any): FurnitureItem["model3d"] {
  const glbs = (rotera?.models ?? []).filter((m: any) =>
    String(m.format).includes("glb"),
  );
  if (!glbs.length) return null;
  const il = glbs.filter((m: any) => (m.markets ?? []).includes("IL"));
  const pool = il.length ? il : glbs;
  const m = pool.find((x: any) => x.format === "glb_draco") ?? pool[0];
  return m?.url ? { format: m.format ?? "glb", url: m.url } : null;
}

function mapItem(raw: any): FurnitureItem {
  const he = langBlock(raw.ingka, "he");
  const en = langBlock(raw.ingka, "en");
  const dims = raw.dimensions_cm ?? {};
  const { source: dimSource, ...dimensions } = dims;

  const colors: FurnitureColor[] = (raw.search?.colors ?? [])
    .map((c: any) => ({ name: c.name ?? "", hex: normHex(c.hex) }))
    .filter((c: FurnitureColor) => c.name || c.hex);

  return {
    name: he?.productName ?? raw.search?.name ?? "",
    brand: "IKEA",
    category: raw.category as FurnitureCategory,
    subcategory: en?.productType?.name ?? "",
    subcategoryHe: he?.productType?.name ?? raw.search?.typeName ?? "",
    price: {
      value: raw.search?.salesPrice?.numeral ?? null,
      currency: raw.search?.salesPrice?.currencyCode ?? "ILS",
    },
    dimensions,
    dimensionsSource: dimSource ?? null,
    colors,
    materials: { he: materialLines(he), en: materialLines(en) },
    imageMain: bestImage(raw.ingka, "MAIN_PRODUCT_IMAGE"),
    imageContext: bestImage(raw.ingka, "CONTEXT_PRODUCT_IMAGE"),
    productUrl: raw.search?.pipUrl ?? "",
    model3d: pickModel(raw.rotera),
    styleTags: [], // Phase 3
    source: "ikea",
    sourceItemId: raw.itemNo,
    sourceItemType: raw.itemType,
    market: "IL",
  };
}

function main() {
  const files = readdirSync(RAW_DIR).filter((f) => f.startsWith("item_") && f.endsWith(".json"));
  const items = files.map((f) => mapItem(JSON.parse(readFileSync(path.join(RAW_DIR, f), "utf8"))));
  const write = process.argv.includes("--write");

  if (write) {
    writeFileSync(OUT, JSON.stringify(items, null, 2), "utf8");
    console.log(`Wrote ${items.length} normalized items → ${OUT}`);
    return;
  }

  // Sample mode: show 3 diverse entries (a sofa combo, a bookcase, a lamp) and STOP.
  const pick = (cat: string, pred?: (i: FurnitureItem) => boolean) =>
    items.find((i) => i.category === cat && (!pred || pred(i)));
  const samples = [
    pick("sofas", (i) => i.sourceItemType === "SPR"),
    pick("bookcases"),
    pick("lighting"),
  ].filter(Boolean);

  console.log(`Mapped ${items.length} items (NOT written — pass --write to emit the asset).\n`);
  console.log("3 normalized samples:\n" + JSON.stringify(samples, null, 2));
}

main();
