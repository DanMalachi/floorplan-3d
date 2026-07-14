/**
 * IKEA furniture pipeline — download real 3D models (offline, one-time).
 *
 * ⚠️ PROTOTYPE / PERSONAL USE ONLY — see scripts/ikea/lib.ts header.
 *
 * The Rotera .glb URLs 403 without a browser UA+Referer and send no CORS header,
 * so they can't be loaded from the browser at runtime. Consistent with the rest of
 * the pipeline (static assets, no runtime fetching), we fetch them ONCE here — with
 * the right headers — into public/furniture/ikea/<itemNo>.glb and serve them
 * locally. Draco-compressed models are kept as-is; the app ships a local Draco
 * decoder (public/draco) to decode them.
 *
 * Sequential + polite; skips files already on disk. Run:
 *   npx tsx scripts/ikea/fetch-models.ts
 */

import { mkdirSync, existsSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import { USER_AGENT, COUNTRY, LANGUAGE } from "./lib";
import type { FurnitureItem } from "../../src/lib/furnitureCatalog";
import { readFileSync } from "node:fs";

const items: FurnitureItem[] = JSON.parse(
  readFileSync(path.resolve("data/furniture-ikea.json"), "utf8"),
);

const OUT_DIR = path.resolve("public/furniture/ikea");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const withModel = items.filter((i) => i.model3d?.url);
  let downloaded = 0, skipped = 0, failed = 0, bytes = 0;
  const failures: string[] = [];

  console.log(`Downloading ${withModel.length} real IKEA .glb models → ${OUT_DIR}`);

  for (const it of withModel) {
    const file = path.join(OUT_DIR, `${it.sourceItemId}.glb`);
    if (existsSync(file)) {
      skipped++;
      bytes += statSync(file).size;
      continue;
    }
    await sleep(300 + Math.floor(Math.random() * 200));
    try {
      const res = await fetch(it.model3d!.url, {
        headers: {
          "User-Agent": USER_AGENT,
          Referer: `https://www.ikea.com/${COUNTRY}/${LANGUAGE}/`,
          Accept: "*/*",
        },
      });
      if (!res.ok) {
        failed++;
        failures.push(`${it.sourceItemId} HTTP ${res.status}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      // Sanity: glTF binary starts with the "glTF" magic.
      if (buf.length < 20 || buf.toString("ascii", 0, 4) !== "glTF") {
        failed++;
        failures.push(`${it.sourceItemId} not a glb (${buf.length}b)`);
        continue;
      }
      writeFileSync(file, buf);
      downloaded++;
      bytes += buf.length;
      process.stdout.write(`\r[dl] ${downloaded} downloaded, ${skipped} cached, ${failed} failed`);
    } catch (e) {
      failed++;
      failures.push(`${it.sourceItemId} ${String(e).slice(0, 60)}`);
    }
  }

  console.log(
    `\nDone. downloaded=${downloaded} cached=${skipped} failed=${failed} · ` +
      `total ${(bytes / 1024 / 1024).toFixed(1)} MB on disk`,
  );
  for (const f of failures.slice(0, 15)) console.log(`   • ${f}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
