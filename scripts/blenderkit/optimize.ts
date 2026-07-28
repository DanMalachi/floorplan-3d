/**
 * BlenderKit furniture pipeline, step 5 — shrink the models for web delivery.
 *
 * The raw CC0 downloads are archviz assets built for offline rendering: 4K
 * textures, undecimated meshes, 279 MB across 76 files with a single 66 MB
 * sofa. Unusable in a furniture picker. gltf-transform's `optimize` brings that
 * down by ~99% (the 66 MB sofa lands at 445 KB) via dedup → join → weld →
 * simplify → prune → texture compress → Draco.
 *
 * Choices worth knowing:
 *  • WebP textures, not KTX2/Basis. KTX2 needs the external `toktx` binary; WebP
 *    ships inside gltf-transform and three r185's GLTFLoader reads
 *    EXT_texture_webp natively. Revisit if GPU memory ever beats download size
 *    as the constraint.
 *  • Draco geometry, because the app already serves a local decoder from
 *    public/draco for the IKEA models — no new runtime dependency.
 *  • Originals are kept. Optimized files go to a subdirectory so the lossy step
 *    is always re-runnable from source with different settings.
 *
 * Content-rejected assets (content-filter.ts) are skipped rather than optimized.
 *
 * Run:
 *   npx tsx scripts/blenderkit/optimize.ts
 * Then:
 *   npx tsx scripts/blenderkit/verify-optimized.ts
 */

import { mkdirSync, existsSync, statSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { loadIndex, select } from "./select";
import { isContentRejected } from "./content-filter";

const RAW_DIR = path.resolve("public/furniture/blenderkit");
const OUT_DIR = path.join(RAW_DIR, "opt");

/** Texture edge cap. 1K is plenty for furniture seen at room scale. */
const TEXTURE_SIZE = 1024;

/**
 * Per-asset escapes from the default pipeline, each earned by a measured
 * failure rather than added pre-emptively.
 *
 * `noJoin` — mesh merging drops geometry from this model. "Carl-hansen-son 501"
 * lost 17.7% of its height (0.921 m → 0.758 m); verify-optimized.ts caught it.
 * The pass was isolated by bisecting the pipeline: `--simplify false` changed
 * nothing (byte-identical output), while `--join false` restores the AABB
 * exactly. Disabling it costs nothing measurable — 1.199 MB vs 1.201 MB.
 *
 * `copyRaw` — ship the source file untouched because gltf-transform cannot read
 * it. Currently unused: the one asset that needed it ("Jiechen Table") turned
 * out to be unloadable by three.js as well, so it is content-rejected instead.
 * The escape hatch stays because a file the toolchain rejects is not
 * automatically a file the runtime rejects — that has to be checked in the app.
 */
const OVERRIDES: Record<string, { noJoin?: boolean; copyRaw?: boolean; why: string }> = {
  "0bfe4a6a-7c4a-49de-9b6b-a4e855dde193": {
    noJoin: true,
    why: "Carl-hansen-son 501 — join dropped geometry, height fell 17.7%",
  },
};

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const { kept } = select(loadIndex());

  const targets = kept.filter((e) => !isContentRejected(e.displayName || e.name));
  console.log(`Optimizing ${targets.length} models (${kept.length - targets.length} content-rejected)\n`);

  let done = 0;
  let skipped = 0;
  let failed = 0;
  let rawBytes = 0;
  let optBytes = 0;
  const failures: string[] = [];

  for (const e of targets) {
    const name = `${e.assetBaseId}.glb`;
    const src = path.join(RAW_DIR, name);
    const dst = path.join(OUT_DIR, name);
    if (!existsSync(src)) continue;

    if (existsSync(dst)) {
      skipped++;
      rawBytes += statSync(src).size;
      optBytes += statSync(dst).size;
      continue;
    }

    const override = OVERRIDES[e.assetBaseId];

    try {
      if (override?.copyRaw) {
        copyFileSync(src, dst);
      } else {
        const args = [
          "--yes",
          "@gltf-transform/cli@latest",
          "optimize",
          src,
          dst,
          "--compress", "draco",
          "--texture-compress", "webp",
          "--texture-size", String(TEXTURE_SIZE),
        ];
        if (override?.noJoin) args.push("--join", "false");
        execFileSync("npx", args, { stdio: "pipe", shell: true, timeout: 180_000 });
      }

      if (!existsSync(dst)) throw new Error("no output written");
      done++;
      rawBytes += statSync(src).size;
      optBytes += statSync(dst).size;
      process.stdout.write(
        `\r[opt] ${done} done · ${skipped} cached · ${failed} failed · ` +
          `${(rawBytes / 1048576).toFixed(0)}MB → ${(optBytes / 1048576).toFixed(1)}MB`,
      );
    } catch (err) {
      failed++;
      failures.push(`${e.displayName || e.name} — ${String(err).slice(0, 90)}`);
    }
  }

  console.log(
    `\n\nDone. optimized=${done} cached=${skipped} failed=${failed}\n` +
      `${(rawBytes / 1048576).toFixed(0)} MB → ${(optBytes / 1048576).toFixed(1)} MB ` +
      `(${(100 - (optBytes / rawBytes) * 100).toFixed(1)}% smaller)`,
  );
  for (const f of failures.slice(0, 20)) console.log(`   • ${f}`);
}

main();
