/**
 * IKEA furniture pipeline — transparent catalog thumbnails (offline, one-time).
 *
 * ⚠️ PROTOTYPE / PERSONAL USE ONLY — see scripts/ikea/lib.ts header.
 *
 * IKEA product photos sit on a solid white background and their CDN sends no CORS
 * header, so the browser can't key them out at runtime. We do it offline: download
 * each MAIN photo (server-side, allowed), border-flood-fill the white away, and
 * write a small transparent PNG to public/furniture/ikea/thumb/<itemNo>.png. The
 * picker then shows the product floating on the dark tile.
 *
 * Border flood-fill (not a global threshold) so white/near-white pixels INSIDE the
 * product — a white bookcase — are kept; only background connected to the edge goes.
 *
 * Sequential + polite; skips PNGs already on disk. Run:
 *   npx tsx scripts/ikea/fetch-thumbnails.ts
 */

import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { USER_AGENT, COUNTRY, LANGUAGE } from "./lib";
import type { FurnitureItem } from "./catalog-schema";

const items: FurnitureItem[] = JSON.parse(
  readFileSync(path.resolve("data/furniture-ikea.json"), "utf8"),
);

const OUT_DIR = path.resolve("public/furniture/ikea/thumb");
const SIZE = 256;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A pixel counts as removable background if it's light and roughly neutral. Kept
 *  loose enough to eat soft drop-shadows that touch the edge, tight enough to
 *  preserve coloured product surfaces. */
function isBg(r: number, g: number, b: number): boolean {
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  return min >= 225 && max - min <= 16;
}

/** Flood-fill inward from every border pixel, clearing alpha on background. */
function keyOutBackground(data: Buffer, w: number, h: number): void {
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (seen[i]) return;
    seen[i] = 1;
    const p = i * 4;
    if (isBg(data[p], data[p + 1], data[p + 2])) {
      data[p + 3] = 0; // transparent
      stack.push(x, y);
    }
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const y = stack.pop()!, x = stack.pop()!;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
}

const MODEL_DIR = path.resolve("public/furniture/ikea");

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  // Only thumbnail items we'll actually ship: those with a real .glb already on
  // disk (fetch-models runs first). Avoids downloading photos for the thousands of
  // proxy-only items the wide catalog pull surfaces but build-catalog drops.
  const withImg = items.filter(
    (i) => i.imageMain && existsSync(path.join(MODEL_DIR, `${i.sourceItemId}.glb`)),
  );
  let done = 0, skipped = 0, failed = 0;
  const failures: string[] = [];

  console.log(`Making ${withImg.length} transparent thumbnails → ${OUT_DIR}`);

  for (const it of withImg) {
    const out = path.join(OUT_DIR, `${it.sourceItemId}.png`);
    if (existsSync(out)) { skipped++; continue; }
    await sleep(250 + Math.floor(Math.random() * 150));
    try {
      const res = await fetch(it.imageMain!, {
        headers: { "User-Agent": USER_AGENT, Referer: `https://www.ikea.com/${COUNTRY}/${LANGUAGE}/` },
      });
      if (!res.ok) { failed++; failures.push(`${it.sourceItemId} HTTP ${res.status}`); continue; }
      const src = Buffer.from(await res.arrayBuffer());

      const { data, info } = await sharp(src)
        .resize(SIZE, SIZE, { fit: "inside", withoutEnlargement: true })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      keyOutBackground(data, info.width, info.height);

      await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
        .png({ compressionLevel: 9 })
        .toBuffer()
        .then((png) => writeFileSync(out, png));

      done++;
      process.stdout.write(`\r[thumb] ${done} done, ${skipped} cached, ${failed} failed`);
    } catch (e) {
      failed++;
      failures.push(`${it.sourceItemId} ${String(e).slice(0, 60)}`);
    }
  }

  console.log(`\nDone. done=${done} cached=${skipped} failed=${failed}`);
  for (const f of failures.slice(0, 15)) console.log(`   • ${f}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
