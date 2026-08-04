/**
 * M3d/D3 — write `asset.json` for each `curated-floors-m3d.ts` entry into its
 * existing `.raw/<id>/` cache directory, ready for `ingest/run.ts`.
 *
 * Deliberately does NOT download anything: the raw color/normal/roughness
 * JPEGs are already in `scripts/materials/.raw/<id>/` from the legacy floor
 * pipeline (`npm run mat:fetch`, `scripts/materials/fetch-materials.ts`) —
 * same source, same files, this just points the new pipeline at them rather
 * than re-fetching. If a raw directory is missing, run `mat:fetch` first.
 *
 * Run:
 *   npx tsx scripts/materials/ingest/generate-floor-sources-m3d.ts
 */
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CURATED_FLOORS_M3D } from "./curated-floors-m3d";
import type { AssetSource } from "./types";

const RAW_DIR = path.resolve("scripts/materials/.raw");

function main() {
  const failures: string[] = [];

  for (const c of CURATED_FLOORS_M3D) {
    const dir = path.join(RAW_DIR, c.id);
    if (!existsSync(path.join(dir, "color.jpg")) || !existsSync(path.join(dir, "normal.jpg")) || !existsSync(path.join(dir, "roughness.jpg"))) {
      failures.push(`${c.id} — missing raw maps in ${dir} (run \`npm run mat:fetch\` first)`);
      continue;
    }

    const asset: AssetSource = {
      id: c.id,
      name: c.name,
      family: c.family,
      class: c.class,
      surfaceClass: c.surfaceClass,
      coverM: c.coverM,
      metalnessScalar: 0, // all 16 floors are dielectric
      license: c.license,
      source: `https://ambientcg.com/view?id=${c.assetId}`,
      maps: { albedo: "color.jpg", normal: "normal.jpg", roughness: "roughness.jpg" },
    };
    writeFileSync(path.join(dir, "asset.json"), JSON.stringify(asset, null, 2));
    console.log(`  wrote   ${c.id}/asset.json (${c.surfaceClass})`);
  }

  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  ${f}`);
    process.exitCode = 1;
  }
}

main();
