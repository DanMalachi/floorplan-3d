/**
 * BlenderKit furniture pipeline, step 3c — convert blend-only assets to .glb.
 *
 * ~235 CC0 assets in the index have no glTF export, only a native .blend
 * (docs/FURNITURE_LICENSE_AUDIT.md, "58 of the 62 approved rows"). This
 * downloads each .blend through the same anonymous download endpoint
 * fetch-models.ts uses (fileType `blend` instead of `gltf`), exports it with a
 * portable headless Blender (convert-blend.py does the Blender side), and
 * writes the result to the SAME raw path a glTF download lands at — so
 * audit.ts, optimize.ts, verify-optimized.ts, fetch-thumbnails.ts and
 * build-catalog.ts need no idea where a file came from.
 *
 * Only assets that can still ship are converted: the licence is re-checked
 * before download, and `preDownloadGate` (gates.ts: brand, props, mounted
 * lights, generator-covered types) runs first. Measured-dimension gates run
 * later, in build-catalog.ts, against the exported geometry.
 *
 * Disk: the .blend is deleted as soon as it is converted — they run to
 * hundreds of MB and the raw .glb is all later steps need. Outcomes (ok or the
 * failure reason) are recorded in data/furniture-blenderkit.convert.json, so a
 * re-run skips both successes and known failures; pass --retry-failed to try
 * the failures again.
 *
 * Blender: portable 4.5 LTS zip (no installer, no admin) at
 * C:\Users\dandu\tools\blender\. Override with BLENDER=<path to blender.exe>.
 *
 * Run (after fetch-index.ts; before audit.ts):
 *   npx tsx scripts/blenderkit/convert-blend.ts [--limit N] [--retry-failed]
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { API, USER_AGENT, SCENE_UUID, ALLOWED_LICENSE, politeDelay } from "./lib";
import { loadIndex, select, sourceFormat } from "./select";
import { preDownloadGate } from "./gates";
import type { BlenderKitIndexEntry } from "./index-schema";

const RAW_DIR = path.resolve("public/furniture/blenderkit");
const CACHE = path.resolve("scripts/blenderkit/.scratch/blend-convert");
const LOG = path.resolve("data/furniture-blenderkit.convert.json");
const PY = path.resolve("scripts/blenderkit/convert-blend.py");
const BLENDER = process.env.BLENDER ?? "C:/Users/dandu/tools/blender/blender-4.5.14-windows-x64/blender.exe";

/** Skip .blend downloads above this. filesSize covers every file of the asset
 *  (all texture resolutions too), so this only drops true outliers. */
const MAX_FILES_BYTES = 450 * 1024 * 1024;
const CONVERT_TIMEOUT_MS = 6 * 60_000;

/** Categories the catalog most needs are converted first, so a time-boxed run
 *  still fills the gaps. Lower = earlier. */
const PRIORITY: [RegExp, number][] = [
  [/\bbed\b|bedside|nightstand|night table/i, 0],
  [/dresser|drawers|commode|sideboard/i, 1],
  [/desk/i, 2],
  [/book|shel/i, 3],
  [/lamp/i, 4],
  [/outdoor|lounger|beach|garden|bench/i, 5],
  [/table|chair|stool/i, 6],
];
const priority = (e: BlenderKitIndexEntry) =>
  PRIORITY.find(([re]) => re.test(`${e.displayName} ${e.category}`))?.[1] ?? 9;

interface LogRow {
  name: string;
  ok: boolean;
  reason?: string;
  blendBytes?: number;
  glbBytes?: number;
  objects?: number;
  excluded?: string[];
  date: string;
}

async function download(fileId: number, dest: string): Promise<string | null> {
  const res = await fetch(`${API}/downloads/${fileId}/?scene_uuid=${SCENE_UUID}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) return `download endpoint HTTP ${res.status}`;
  const { filePath } = (await res.json()) as { filePath?: string };
  if (!filePath) return "no signed URL returned";
  const file = await fetch(filePath, { headers: { "User-Agent": USER_AGENT, Accept: "*/*" } });
  if (!file.ok) return `blend HTTP ${file.status}`;
  const buf = Buffer.from(await file.arrayBuffer());
  // Plain .blend starts "BLENDER"; compressed ones carry the zstd (3.0+) or
  // gzip (pre-3.0) magic, both of which Blender opens directly.
  const zstd = buf.length > 4 && buf.readUInt32LE(0) === 0xfd2fb528;
  const gzip = buf[0] === 0x1f && buf[1] === 0x8b;
  if (buf.toString("ascii", 0, 7) !== "BLENDER" && !zstd && !gzip)
    return `not a .blend (${buf.length}b, magic ${buf.subarray(0, 4).toString("hex")})`;
  writeFileSync(dest, buf);
  return null;
}

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;
  const retryFailed = process.argv.includes("--retry-failed");
  if (!existsSync(BLENDER)) throw new Error(`Blender not found at ${BLENDER} (set BLENDER=...)`);
  mkdirSync(CACHE, { recursive: true });

  const log: Record<string, LogRow> = existsSync(LOG) ? JSON.parse(readFileSync(LOG, "utf8")) : {};
  const save = () =>
    writeFileSync(LOG, JSON.stringify(Object.fromEntries(Object.entries(log).sort()), null, 2));

  const targets = select(loadIndex())
    .kept.filter((e) => sourceFormat(e) === "blend")
    .filter((e) => preDownloadGate(e) === null)
    .sort((a, b) => priority(a) - priority(b) || a.displayName.localeCompare(b.displayName));

  let converted = 0;
  let attempted = 0;
  for (const e of targets) {
    const name = e.displayName || e.name;
    const glb = path.join(RAW_DIR, `${e.assetBaseId}.glb`);
    const prior = log[e.assetBaseId];
    if (existsSync(glb) || (prior && (prior.ok || !retryFailed))) continue;
    if (attempted >= limit) break;
    attempted++;

    const row: LogRow = { name, ok: false, date: new Date().toISOString().slice(0, 10) };
    log[e.assetBaseId] = row;
    // Licence re-checked immediately before bytes move (lib.ts policy).
    if (e.license !== ALLOWED_LICENSE || e.blendFileId == null) {
      row.reason = "licence/file state changed";
      save();
      continue;
    }
    if ((e.filesSize ?? 0) > MAX_FILES_BYTES) {
      row.reason = `asset files ${(e.filesSize! / 1e6).toFixed(0)} MB exceed download cap`;
      save();
      continue;
    }

    const blend = path.join(CACHE, `${e.assetBaseId}.blend`);
    const report = path.join(CACHE, `${e.assetBaseId}.report.json`);
    process.stdout.write(`[${attempted}] ${name.slice(0, 40).padEnd(40)} `);
    try {
      await politeDelay();
      const err = await download(e.blendFileId, blend);
      if (err) throw new Error(err);
      row.blendBytes = statSync(blend).size;

      rmSync(report, { force: true });
      try {
        execFileSync(BLENDER, ["-b", "--factory-startup", blend, "--python", PY, "--", glb, report], {
          stdio: "pipe",
          timeout: CONVERT_TIMEOUT_MS,
          maxBuffer: 64 * 1024 * 1024,
        });
      } catch (runErr) {
        // Blender can exit nonzero after a successful export (addon teardown
        // noise); the report file is the source of truth.
        if (!existsSync(report)) throw new Error(`blender: ${String(runErr).slice(0, 160)}`);
      }
      const r = JSON.parse(readFileSync(report, "utf8")) as {
        ok: boolean; error?: string; objects: number; excluded: string[]; missing?: string[];
      };
      row.objects = r.objects;
      if (r.excluded.length) row.excluded = r.excluded.slice(0, 20);
      if (!r.ok) throw new Error(r.error ?? "export failed");
      if (r.missing?.length) {
        rmSync(glb, { force: true });
        throw new Error(`${r.missing.length} texture(s) not packed in the .blend`);
      }
      const buf = readFileSync(glb);
      if (buf.toString("ascii", 0, 4) !== "glTF") {
        rmSync(glb, { force: true });
        throw new Error("export is not a glb");
      }
      row.ok = true;
      row.glbBytes = buf.length;
      converted++;
      console.log(`ok  ${(buf.length / 1e6).toFixed(1)} MB, ${r.objects} objects`);
    } catch (err) {
      row.reason = String((err as Error).message ?? err).slice(0, 200);
      console.log(`FAIL ${row.reason}`);
    } finally {
      rmSync(blend, { force: true });
      // Blender writes .blend1 backups only on save, but clear any sidecars.
      rmSync(`${blend}1`, { force: true });
      save();
    }
  }

  const rows = Object.values(log);
  console.log(
    `\nThis run: ${converted}/${attempted} converted. Log totals: ` +
      `${rows.filter((r) => r.ok).length} ok, ${rows.filter((r) => !r.ok).length} failed (${path.relative(process.cwd(), LOG)})`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
