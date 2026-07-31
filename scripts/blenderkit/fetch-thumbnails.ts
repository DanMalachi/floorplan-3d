/**
 * BlenderKit furniture pipeline, step 7 — pull the picker thumbnails local.
 *
 * BlenderKit renders a clean studio thumbnail for every asset, which beats
 * anything we'd render from the .glb ourselves, so there is no reason to
 * rasterise our own. What we do NOT want is the app hotlinking
 * public.blenderkit.com at runtime: that leaks users to a third party, breaks if
 * they reorganise their CDN, and puts their bandwidth in our critical path.
 * So the images are downloaded once and served from our own origin.
 *
 * Rewrites data/furniture-blenderkit.catalog.json in place so `thumbnail`
 * points at the local copy.
 *
 * Run (after build-catalog.ts):
 *   npx tsx scripts/blenderkit/fetch-thumbnails.ts
 */

import { mkdirSync, existsSync, writeFileSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { USER_AGENT, politeDelay } from "./lib";

const CATALOG = path.resolve("data/furniture-blenderkit.catalog.json");
const OUT_DIR = path.resolve("public/furniture/blenderkit/thumb");
const PUBLIC_BASE = "/furniture/blenderkit/thumb";

interface CatalogRow {
  assetId: string;
  name: string;
  thumbnail?: string;
  [k: string]: unknown;
}

/**
 * Identifies the image from its magic bytes rather than the URL extension.
 * BlenderKit's thumbnail URLs are not a reliable guide — the CDN path carries
 * whatever extension the uploader's source file had, so a chunk of them end in
 * `.png` and trusting `.jpg` silently rejected a third of the set.
 */
function imageExtension(buf: Buffer): "jpg" | "png" | "webp" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
  if (buf.toString("latin1", 1, 4) === "PNG") return "png";
  if (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "webp";
  return null;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const rows: CatalogRow[] = JSON.parse(readFileSync(CATALOG, "utf8"));

  let downloaded = 0;
  let cached = 0;
  let failed = 0;
  let bytes = 0;
  const failures: string[] = [];

  for (const row of rows) {
    const remote = row.thumbnail;
    // Already local from a previous run — nothing to do.
    if (!remote || remote.startsWith(PUBLIC_BASE)) {
      if (remote) cached++;
      continue;
    }

    const id = row.assetId.replace(/^blenderkit:/, "");

    // Re-use whichever extension a previous run landed on.
    const existing = (["jpg", "png", "webp"] as const).find((ext) =>
      existsSync(path.join(OUT_DIR, `${id}.${ext}`)),
    );
    if (existing) {
      cached++;
      bytes += statSync(path.join(OUT_DIR, `${id}.${existing}`)).size;
      row.thumbnail = `${PUBLIC_BASE}/${id}.${existing}`;
      continue;
    }

    await politeDelay();
    try {
      const res = await fetch(remote, { headers: { "User-Agent": USER_AGENT, Accept: "image/*" } });
      if (!res.ok) {
        failed++;
        failures.push(`${row.name} — HTTP ${res.status}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const ext = imageExtension(buf);
      if (!ext) {
        failed++;
        failures.push(`${row.name} — unrecognised image format (${buf.length}b)`);
        continue;
      }
      writeFileSync(path.join(OUT_DIR, `${id}.${ext}`), buf);
      row.thumbnail = `${PUBLIC_BASE}/${id}.${ext}`;
      downloaded++;
      bytes += buf.length;
      process.stdout.write(`\r[thumb] ${downloaded} downloaded · ${cached} cached · ${failed} failed`);
    } catch (err) {
      failed++;
      failures.push(`${row.name} — ${String(err).slice(0, 70)}`);
    }
  }

  writeFileSync(CATALOG, JSON.stringify(rows, null, 2));

  const missing = rows.filter((r) => !r.thumbnail).length;
  console.log(
    `\n\nDone. downloaded=${downloaded} cached=${cached} failed=${failed} · ` +
      `${(bytes / 1024).toFixed(0)} KB · ${missing} rows still without a thumbnail`,
  );
  for (const f of failures.slice(0, 15)) console.log(`   • ${f}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
