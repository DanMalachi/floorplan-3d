/**
 * Material pipeline, step 1 — index the CC0 floor materials (offline).
 *
 * Records every candidate from the floor-relevant ambientCG categories into
 * data/materials-floors.json. Nothing is downloaded: the API already reports
 * each material's PHYSICAL TILE SIZE, which is the single most important field
 * in this whole pipeline.
 *
 * ── Why physical size matters more than anything else ───────────────────────
 * src/viewport3d/textures.ts tiles floors with `repeat.set(1/cover, 1/cover)`,
 * where `cover` is how many metres one repeat spans. Get it wrong and a floor
 * looks like doll's-house parquet or a single stretched smear — the most common
 * way real-world texturing goes wrong. ambientCG publishes `dimensionX/Y` in
 * CENTIMETRES, so a 180×180 wood floor becomes cover = 1.8 m and the plank
 * width lands life-size without anyone eyeballing it.
 *
 * Run:
 *   npx tsx scripts/materials/fetch-index.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { API, USER_AGENT, FLOOR_CATEGORIES, politeDelay } from "./lib";

const OUT = path.resolve("data/materials-floors.json");

export interface MaterialIndexEntry {
  assetId: string;
  category: string;
  tags: string[];
  /** Physical tile size in METRES, converted from ambientCG's centimetres.
   *  Null when unpublished — such materials can't be scaled correctly and are
   *  dropped at curation time rather than guessed at. */
  physicalSizeM: { x: number; y: number } | null;
  downloadCount: number | null;
  zipUrl: string;
  webUrl: string;
}

interface AcgAsset {
  assetId: string;
  category: string | null;
  tags?: string[];
  dimensionX?: number;
  dimensionY?: number;
  downloadCount?: number;
}

async function fetchCategory(category: string): Promise<MaterialIndexEntry[]> {
  const url =
    `${API}/full_json?type=Material&category=${category}` +
    `&limit=500&include=dimensionsData,tagData,statisticsData`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${category}: HTTP ${res.status}`);
  const data = (await res.json()) as { foundAssets: AcgAsset[] };

  return (data.foundAssets ?? []).map((a) => {
    // cm → m. Both axes must be present and positive to be usable.
    const usable =
      typeof a.dimensionX === "number" &&
      typeof a.dimensionY === "number" &&
      a.dimensionX > 0 &&
      a.dimensionY > 0;
    return {
      assetId: a.assetId,
      category,
      tags: a.tags ?? [],
      physicalSizeM: usable ? { x: a.dimensionX! / 100, y: a.dimensionY! / 100 } : null,
      downloadCount: a.downloadCount ?? null,
      zipUrl: `https://ambientcg.com/get?file=${a.assetId}_1K-JPG.zip`,
      webUrl: `https://ambientcg.com/view?id=${a.assetId}`,
    };
  });
}

async function main() {
  const all: MaterialIndexEntry[] = [];

  for (const category of FLOOR_CATEGORIES) {
    const entries = await fetchCategory(category);
    all.push(...entries);
    const sized = entries.filter((e) => e.physicalSizeM).length;
    console.log(`${category.padEnd(12)} ${String(entries.length).padStart(4)} materials · ${sized} with physical size`);
    await politeDelay();
  }

  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(all, null, 2));

  const sized = all.filter((e) => e.physicalSizeM);
  const sizes = sized.map((e) => Math.max(e.physicalSizeM!.x, e.physicalSizeM!.y)).sort((a, b) => a - b);
  const q = (p: number) => sizes[Math.floor(sizes.length * p)].toFixed(2);

  console.log(`\nWrote ${all.length} materials → ${path.relative(process.cwd(), OUT)}`);
  console.log(`  with physical size: ${sized.length} (${((sized.length / all.length) * 100).toFixed(0)}%)`);
  console.log(`  tile extent (m): p10 ${q(0.1)} · median ${q(0.5)} · p90 ${q(0.9)} · max ${sizes[sizes.length - 1].toFixed(2)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
