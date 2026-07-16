/**
 * IKEA furniture pipeline — upload real 3D models to Vercel Blob.
 *
 * The real .glb models (public/furniture/ikea/*.glb) total ~400 MB — too heavy to
 * commit to git or bundle into the deploy. Instead we host them on Vercel Blob and
 * reference them by URL from the catalog. This runs ONCE after fetch-models (and
 * again only when new models are added).
 *
 * Idempotent + resumable: each glb is uploaded to a STABLE pathname
 * (furniture/ikea/<itemNo>.glb, no random suffix) and its public URL recorded in
 * data/furniture-ikea.blob.json. Items already in the manifest are skipped unless
 * --force is passed. build-catalog.ts then rewrites each item's realModel to the
 * Blob URL when this manifest is present.
 *
 * Requires a Vercel Blob store connected to the project — set BLOB_READ_WRITE_TOKEN
 * (Vercel dashboard → Storage → Blob → .env, or `vercel env pull`).
 *
 * Run:  BLOB_READ_WRITE_TOKEN=… npx tsx scripts/ikea/upload-blob.ts [--force]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { put } from "@vercel/blob";

const MODEL_DIR = path.resolve("public/furniture/ikea");
const MANIFEST = path.resolve("data/furniture-ikea.blob.json");
const CONCURRENCY = 8;
const force = process.argv.includes("--force");

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  console.error(
    "✗ BLOB_READ_WRITE_TOKEN is not set.\n" +
      "  Create a Blob store (Vercel dashboard → Storage → Blob, linked to floorplan-3d),\n" +
      "  then `vercel env pull .env.local` or export the token, and re-run.",
  );
  process.exit(1);
}

async function main() {
  const manifest: Record<string, string> = existsSync(MANIFEST)
    ? JSON.parse(readFileSync(MANIFEST, "utf8"))
    : {};

  const glbs = readdirSync(MODEL_DIR).filter((f) => f.endsWith(".glb"));
  const todo = glbs.filter((f) => force || !manifest[f.replace(/\.glb$/, "")]);
  console.log(
    `${glbs.length} models on disk · ${glbs.length - todo.length} already uploaded · ${todo.length} to upload`,
  );

  let done = 0,
    failed = 0;
  const failures: string[] = [];

  // Simple fixed-size worker pool over the queue.
  let cursor = 0;
  async function worker() {
    while (cursor < todo.length) {
      const file = todo[cursor++];
      const itemNo = file.replace(/\.glb$/, "");
      try {
        const body = readFileSync(path.join(MODEL_DIR, file));
        const res = await put(`furniture/ikea/${file}`, body, {
          access: "public",
          token,
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: "model/gltf-binary",
        });
        manifest[itemNo] = res.url;
        done++;
        if (done % 20 === 0 || done === todo.length)
          process.stdout.write(`\r[blob] ${done}/${todo.length} uploaded`);
      } catch (e) {
        failed++;
        failures.push(`${itemNo}: ${String(e).slice(0, 80)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), "utf8");
  console.log(
    `\nDone. uploaded=${done} failed=${failed} · manifest has ${Object.keys(manifest).length} URLs → ${MANIFEST}`,
  );
  for (const f of failures.slice(0, 15)) console.log(`   • ${f}`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
