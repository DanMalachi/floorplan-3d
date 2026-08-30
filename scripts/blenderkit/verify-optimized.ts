/**
 * BlenderKit furniture pipeline — post-optimization verification.
 *
 * gltf-transform's `optimize` runs `simplify`, which decimates meshes. That is
 * exactly the kind of step that can silently deform a model, so every optimized
 * file is measured against its original AABB. Drift beyond a small tolerance
 * means the footprint we derived during the audit no longer describes the file
 * the app will actually load.
 *
 * Always compares against RAW_DIR (the true original download), even when
 * checking a downstream directory like `opt-ktx2/` — that catches drift
 * accumulated across the WHOLE pipeline (raw → opt → opt-ktx2), not just
 * the last hop, which is a stricter check than comparing opt-ktx2/ to opt/
 * alone.
 *
 * Run:
 *   npx tsx scripts/blenderkit/verify-optimized.ts
 *   npx tsx scripts/blenderkit/verify-optimized.ts --dir opt-ktx2
 */

import { existsSync, statSync, readdirSync } from "node:fs";
import path from "node:path";
import { geomSize } from "../ikea/glb-geom";

const RAW_DIR = path.resolve("public/furniture/blenderkit");
const dirArg = process.argv.indexOf("--dir");
const OPT_SUBDIR = dirArg >= 0 ? process.argv[dirArg + 1] : "opt";
const OPT_DIR = path.resolve("public/furniture/blenderkit", OPT_SUBDIR);

/** Percent AABB drift we tolerate from mesh decimation. */
const MAX_DRIFT_PCT = 2.0;

function main() {
  if (!existsSync(OPT_DIR)) {
    console.error(`No optimized dir at ${OPT_DIR} — run optimize.ts first.`);
    process.exit(1);
  }

  const files = readdirSync(OPT_DIR).filter((f) => f.endsWith(".glb"));
  let ok = 0;
  let rawBytes = 0;
  let optBytes = 0;
  const problems: string[] = [];

  for (const f of files) {
    const raw = path.join(RAW_DIR, f);
    const opt = path.join(OPT_DIR, f);
    if (!existsSync(raw)) continue;

    rawBytes += statSync(raw).size;
    optBytes += statSync(opt).size;

    const a = geomSize(raw);
    const b = geomSize(opt);
    if (!a || !b) {
      problems.push(`${f} — unreadable after optimize`);
      continue;
    }

    const drift = a.map((v, i) => (v > 0 ? (Math.abs(v - b[i]) / v) * 100 : 0));
    const worst = Math.max(...drift);
    if (worst > MAX_DRIFT_PCT) {
      problems.push(`${f} — AABB drift ${worst.toFixed(1)}% (${a.map((n) => n.toFixed(2)).join("x")} → ${b.map((n) => n.toFixed(2)).join("x")})`);
    } else {
      ok++;
    }
  }

  console.log(`Verified ${files.length} optimized models`);
  console.log(`  within ${MAX_DRIFT_PCT}% AABB drift : ${ok}`);
  console.log(`  problems                  : ${problems.length}`);
  console.log(
    `\nSize: ${(rawBytes / 1024 / 1024).toFixed(0)} MB → ${(optBytes / 1024 / 1024).toFixed(1)} MB ` +
      `(${(100 - (optBytes / rawBytes) * 100).toFixed(1)}% smaller, avg ${(optBytes / files.length / 1024).toFixed(0)} KB/model)`,
  );
  for (const p of problems.slice(0, 20)) console.log(`   • ${p}`);
}

main();
