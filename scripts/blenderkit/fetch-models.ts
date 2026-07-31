/**
 * BlenderKit furniture pipeline, step 3 — download the selected .glb files.
 *
 * Two hops per asset: the download endpoint hands back a short-lived signed URL
 * on assets.blenderkit.com, which we then fetch. Sequential, jittered, and
 * resumable — an asset already on disk costs nothing, so re-runs are cheap and
 * a failed run can just be repeated.
 *
 * Also writes an attribution manifest. CC0 requires no credit; we ship it
 * anyway, because the people who released this work for free deserve the line
 * and because it is the record of WHY each file is legally in the repo.
 *
 * Run:
 *   npx tsx scripts/blenderkit/fetch-models.ts
 */

import { mkdirSync, existsSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import { API, USER_AGENT, SCENE_UUID, ALLOWED_LICENSE, politeDelay } from "./lib";
import { loadIndex, select } from "./select";
import type { BlenderKitIndexEntry } from "./index-schema";

const OUT_DIR = path.resolve("public/furniture/blenderkit");
const MANIFEST = path.join(OUT_DIR, "ATTRIBUTION.json");

/** Resolves the asset's glTF file id to a signed CDN URL. */
async function resolveDownloadUrl(fileId: number): Promise<string | null> {
  const res = await fetch(`${API}/downloads/${fileId}/?scene_uuid=${SCENE_UUID}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { filePath?: string };
  return body.filePath ?? null;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const { kept } = select(loadIndex());

  console.log(`Downloading ${kept.length} CC0 BlenderKit models → ${path.relative(process.cwd(), OUT_DIR)}\n`);

  let downloaded = 0;
  let cached = 0;
  let failed = 0;
  let bytes = 0;
  const failures: string[] = [];
  const manifest: Record<string, unknown>[] = [];

  for (const e of kept) {
    // Third and final license check, immediately before bytes hit the disk.
    if (e.license !== ALLOWED_LICENSE || e.gltfFileId === null) {
      failed++;
      failures.push(`${e.name} — unexpected license/file state`);
      continue;
    }

    const file = path.join(OUT_DIR, `${e.assetBaseId}.glb`);
    const record = {
      assetBaseId: e.assetBaseId,
      file: `${e.assetBaseId}.glb`,
      name: e.displayName || e.name,
      author: e.author.name || "unknown",
      license: "CC0 1.0 Universal (public domain dedication)",
      source: e.webUrl,
      retrieved: new Date().toISOString().slice(0, 10),
    };

    if (existsSync(file)) {
      cached++;
      bytes += statSync(file).size;
      manifest.push(record);
      continue;
    }

    await politeDelay();
    try {
      const url = await resolveDownloadUrl(e.gltfFileId);
      if (!url) {
        failed++;
        failures.push(`${e.name} — no signed URL returned`);
        continue;
      }

      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "*/*" } });
      if (!res.ok) {
        failed++;
        failures.push(`${e.name} — HTTP ${res.status}`);
        continue;
      }

      const buf = Buffer.from(await res.arrayBuffer());
      // glTF binary starts with the "glTF" magic; anything else is an error page.
      if (buf.length < 20 || buf.toString("ascii", 0, 4) !== "glTF") {
        failed++;
        failures.push(`${e.name} — not a glb (${buf.length}b)`);
        continue;
      }

      writeFileSync(file, buf);
      downloaded++;
      bytes += buf.length;
      manifest.push(record);
      process.stdout.write(`\r[dl] ${downloaded} downloaded · ${cached} cached · ${failed} failed`);
    } catch (err) {
      failed++;
      failures.push(`${e.name} — ${String(err).slice(0, 70)}`);
    }
  }

  writeFileSync(
    MANIFEST,
    JSON.stringify(
      {
        note: "Every model here is CC0 (public domain). Attribution is not required; it is recorded as provenance and as a courtesy to the authors.",
        source: "https://www.blenderkit.com/",
        assets: manifest,
      },
      null,
      2,
    ),
  );

  console.log(
    `\n\nDone. downloaded=${downloaded} cached=${cached} failed=${failed} · ` +
      `${(bytes / 1024 / 1024).toFixed(1)} MB on disk · manifest: ${manifest.length} entries`,
  );
  for (const f of failures.slice(0, 20)) console.log(`   • ${f}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
