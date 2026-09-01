/**
 * IKEA furniture pipeline — transparent catalog thumbnails (offline, one-time).
 *
 * ⚠️ PROTOTYPE / PERSONAL USE ONLY — see scripts/ikea/lib.ts header.
 *
 * IKEA product photos sit on a solid white background and their CDN sends no CORS
 * header, so the browser can't key them out at runtime. We do it offline: download
 * each MAIN photo (server-side, allowed), remove the white, and write a small
 * transparent PNG to public/furniture/ikea/thumb/<itemNo>.png. The picker then shows
 * the product floating on the dark tile.
 *
 * ## How background is identified, and why it is NOT a border flood fill
 *
 * The first version filled inward from the image border. That was wrong twice, and
 * both faults shipped for six weeks (fixed 2026-09-01):
 *
 *   1. TRAPPED BACKGROUND. White the product encloses — between table legs, inside a
 *      frame, under a tabletop — is not reachable from the border, so it survived as
 *      an opaque slab. 244 of 637 thumbnails carried one; on the worst it was 43% of
 *      the tile, larger than the border-connected background itself.
 *   2. EATEN PRODUCT. The test accepted anything above min 225, which also matches
 *      white PRODUCT surfaces. Wherever a white product touched the background the
 *      fill leaked in and ate it (GRÖNSTA's shell lost its back and armrest).
 *
 * So connectivity to the border is not what makes a pixel background. Flatness is:
 * a studio sweep is optically flat, a real surface never is, however white it looks.
 * Measured across the catalog, backdrop sits at std 0.25-0.9 and every product
 * surface above it. Hence: take candidates near the backdrop's own level, group them,
 * and clear a group when it is flat. Trapped white goes because flatness does not
 * care about connectivity; white products survive because their shaded surfaces sit
 * too far below the backdrop to be candidates.
 *
 * EVERY THRESHOLD HERE IS RELATIVE TO THE MEASURED BACKDROP, and that is not a
 * refinement — it is the difference between working and not. IKEA's sweep is not one
 * colour: it runs 243 to 255 across the catalog, and even a photo with 255 corners
 * can average 249 across the frame. A first pass used an absolute `mean >= 250`,
 * tuned on twelve photos that all happened to be bright, and left 260 of 637
 * thumbnails completely unkeyed — worse than the bug it was fixing.
 *
 * Three details carry more weight than they look:
 *
 *   - MEASURE THE ERODED CORE, not the whole group. A trapped region is hemmed in by
 *     product edges, and JPEG ringing along them inflates its std past any sane
 *     threshold (1.5-2.5 against a 0.25 backdrop). Strip 3px and you measure the
 *     surface instead of the ringing.
 *   - GROUP THROUGH A CLOSING before judging. A wire shelf's gaps are one background
 *     separated by wires a few pixels wide. Judged separately they split across the
 *     size floor and the mesh comes out moth-eaten. Closed first, they get a single
 *     verdict. Clearing still touches only original candidate pixels.
 *
 * The size floor exists to protect specular highlights, which are small, flat and
 * white. A highlight sits mid-surface; a leftover speck sits against cleared
 * background — so the adjacency sweep at the end takes the second and never the
 * first.
 *
 * Keying runs at FULL resolution and downscales after, so edges feather instead of
 * leaving the hard white rim the old resize-then-key order produced.
 *
 * Sequential + polite. Skips PNGs already on disk unless --force. Run:
 *   npx tsx scripts/ikea/fetch-thumbnails.ts [--force]
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
const FORCE = process.argv.includes("--force");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** How far below the measured backdrop a pixel may sit and still be a candidate.
 *  Relative, never absolute: IKEA's sweep is not one colour across the catalog — it
 *  runs from 243 to 255, and a fixed threshold tuned on the bright end rejects the
 *  dim end outright. (It did: an absolute `mean >= 250` left 260 of 637 thumbnails
 *  completely unkeyed, worse than the bug it replaced. Measured, not guessed.)
 *  10 below backdrop is tighter than the 15 that protected white products before. */
const CAND_BELOW = 7;
/** How far below the backdrop a group's median may sit and still be called backdrop.
 *  A group reaching the frame edge IS the sweep, so it gets room for vignetting. An
 *  enclosed one has to match the sweep's level almost exactly, because that is the
 *  only thing separating trapped backdrop (same sweep, same level) from a flat white
 *  product panel (a different surface, and always a few levels darker). A white
 *  cabinet door at median 247 under a 255 sweep was being cleared as background at 6;
 *  at 2 it is kept, and real trapped backdrop — which measures within a level of the
 *  sweep — still goes. */
const MEDIAN_BELOW_BORDER = 6;
const MEDIAN_BELOW_ENCLOSED = 2;
const SPREAD = 12;
/** Backdrop this dark means the photo is not on a studio sweep at all — leave it be
 *  rather than key something we have not understood. */
const MIN_BACKDROP = 225;
/** A group is background if its core is this flat. */
const CORE_STD = 2.0;
/** Groups smaller than this keep their pixels — see the specular-highlight note above. */
const FLOOR = 25;
/** Closing radius: bridges any barrier thinner than ~2*CLOSE px when grouping. */
const CLOSE = 2;

/** Binary dilation, separable: horizontal pass then vertical. */
function dilate(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let d = -r; d <= r; d++) {
        const nx = x + d;
        if (nx >= 0 && nx < w && src[y * w + nx]) { v = 1; break; }
      }
      tmp[y * w + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let d = -r; d <= r; d++) {
        const ny = y + d;
        if (ny >= 0 && ny < h && tmp[ny * w + x]) { v = 1; break; }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

/** Binary erosion = dilation of the complement. */
function erode(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) inv[i] = src[i] ? 0 : 1;
  const d = dilate(inv, w, h, r);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = d[i] ? 0 : 1;
  return out;
}

/**
 * Std of the group's luminance after eroding `passes` pixels off its rim, or null if
 * the group is too thin to have a core (thin near-white slivers enclosed by product
 * are backdrop in every catalog photo we have, so the caller treats null as flat).
 */
function coreStd(members: number[], data: Buffer, w: number, h: number, passes: number): number | null {
  const mem = new Uint8Array(w * h);
  for (const i of members) mem[i] = 1;
  let core = members;
  for (let p = 0; p < passes && core.length; p++) {
    const next: number[] = [];
    for (const i of core) {
      const x = i % w, y = (i / w) | 0;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) continue;
      if (mem[i - 1] && mem[i + 1] && mem[i - w] && mem[i + w]) next.push(i);
    }
    for (const i of core) mem[i] = 0;
    for (const i of next) mem[i] = 1;
    core = next;
  }
  if (core.length < 12) return null;
  let sum = 0, sum2 = 0;
  for (const i of core) { const L = data[i * 4]; sum += L; sum2 += L * L; }
  const mean = sum / core.length;
  return Math.sqrt(Math.max(0, sum2 / core.length - mean * mean));
}

/**
 * The backdrop's own luminance, read off the outer ring. The ring is the sweep in
 * every catalog photo, so its median is the level everything else is judged against.
 */
function backdropLevel(data: Buffer, w: number, h: number): number {
  const ring: number[] = [];
  for (let x = 0; x < w; x++) { ring.push(data[x * 4]); ring.push(data[((h - 1) * w + x) * 4]); }
  for (let y = 0; y < h; y++) { ring.push(data[y * w * 4]); ring.push(data[(y * w + w - 1) * 4]); }
  ring.sort((a, b) => a - b);
  return ring[ring.length >> 1];
}

/** Clear alpha on every pixel that belongs to the studio backdrop. Mutates `data`. */
function keyOutBackground(data: Buffer, w: number, h: number): boolean {
  const N = w * h;
  const bg = backdropLevel(data, w, h);
  if (bg < MIN_BACKDROP) return false; // not a studio sweep — leave the photo alone
  const MIN = bg - CAND_BELOW;

  const cand = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const p = i * 4;
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
    if (mn >= MIN && mx - mn <= SPREAD) cand[i] = 1;
  }

  // Group through a closing so gaps separated by thin barriers share one verdict.
  const group = erode(dilate(cand, w, h, CLOSE), w, h, CLOSE);
  for (let i = 0; i < N; i++) if (cand[i]) group[i] = 1; // closing must never drop a candidate

  const seen = new Uint8Array(N);
  const survivors: number[][] = [];
  for (let s = 0; s < N; s++) {
    if (!group[s] || seen[s]) continue;
    const stack = [s];
    seen[s] = 1;
    const members: number[] = [];
    let border = false;
    while (stack.length) {
      const i = stack.pop()!;
      if (cand[i]) members.push(i);
      const x = i % w, y = (i / w) | 0;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
      if (x + 1 < w && group[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
      if (x > 0 && group[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
      if (y + 1 < h && group[i + w] && !seen[i + w]) { seen[i + w] = 1; stack.push(i + w); }
      if (y > 0 && group[i - w] && !seen[i - w]) { seen[i - w] = 1; stack.push(i - w); }
    }
    if (!members.length) continue;

    let isBg = false;
    if (members.length >= FLOOR) {
      // MEDIAN, not mean: a sweep vignettes, and its darkest corner drags a mean down
      // far enough to fail the gate on a group that is plainly backdrop. One photo
      // cleared by 0.3 of a luminance level on the mean; on the median it clears by 6.
      const hist = new Uint32Array(256);
      for (const i of members) hist[data[i * 4]]++;
      let seenCount = 0, median = 0;
      for (let v = 0; v < 256; v++) {
        seenCount += hist[v];
        if (seenCount * 2 >= members.length) { median = v; break; }
      }
      if (median >= bg - (border ? MEDIAN_BELOW_BORDER : MEDIAN_BELOW_ENCLOSED)) {
        // A group reaching the frame edge is the sweep itself — no core test needed.
        const std = border ? null : coreStd(members, data, w, h, 3);
        isBg = border || std === null || std <= CORE_STD;
      }
    }
    if (isBg) for (const i of members) data[i * 4 + 3] = 0;
    else survivors.push(members);
  }

  // Adjacency sweep: a leftover SPECK touching cleared background is background too.
  // Strictly small groups only — the size floor is the whole point. Without that
  // bound this ate a white cabinet: its door panels are flat, bright and adjacent to
  // the cleared sweep, and only their size told them apart from backdrop.
  for (let round = 0; round < 6; round++) {
    let changed = false;
    for (let k = 0; k < survivors.length; k++) {
      const m = survivors[k];
      if (!m || m.length >= FLOOR) continue;
      let touches = false;
      for (const i of m) {
        const x = i % w, y = (i / w) | 0;
        if ((x + 1 < w && data[(i + 1) * 4 + 3] === 0) ||
            (x > 0 && data[(i - 1) * 4 + 3] === 0) ||
            (y + 1 < h && data[(i + w) * 4 + 3] === 0) ||
            (y > 0 && data[(i - w) * 4 + 3] === 0)) { touches = true; break; }
      }
      if (touches) {
        for (const i of m) data[i * 4 + 3] = 0;
        survivors[k] = null as unknown as number[];
        changed = true;
      }
    }
    if (!changed) break;
  }

  return true;
}

const MODEL_DIR = path.resolve("public/furniture/ikea");

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  // Thumbnail what we'll actually ship: items with a real .glb already on disk
  // (fetch-models runs first). Avoids downloading photos for the thousands of
  // proxy-only items the wide catalog pull surfaces but build-catalog drops. Items
  // that already HAVE a thumbnail stay in the set too, so a --force re-key covers
  // everything on disk rather than silently shrinking the shipped set.
  const withImg = items.filter(
    (i) =>
      i.imageMain &&
      (existsSync(path.join(MODEL_DIR, `${i.sourceItemId}.glb`)) ||
        existsSync(path.join(OUT_DIR, `${i.sourceItemId}.png`))),
  );
  let done = 0, skipped = 0, failed = 0, notSweep = 0;
  const failures: string[] = [];

  console.log(
    `Making ${withImg.length} transparent thumbnails → ${OUT_DIR}${FORCE ? " (--force: re-keying existing)" : ""}`,
  );

  for (const it of withImg) {
    const out = path.join(OUT_DIR, `${it.sourceItemId}.png`);
    if (existsSync(out) && !FORCE) { skipped++; continue; }
    await sleep(250 + Math.floor(Math.random() * 150));
    try {
      const res = await fetch(it.imageMain!, {
        headers: { "User-Agent": USER_AGENT, Referer: `https://www.ikea.com/${COUNTRY}/${LANGUAGE}/` },
      });
      if (!res.ok) { failed++; failures.push(`${it.sourceItemId} HTTP ${res.status}`); continue; }
      const src = Buffer.from(await res.arrayBuffer());

      // Key at FULL resolution, downscale after — the reverse order pre-blends the
      // product edge with white and leaves a rim no threshold can remove.
      const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

      if (!keyOutBackground(data, info.width, info.height)) {
        notSweep++;
        failures.push(`${it.sourceItemId} backdrop too dark to key — shipped opaque`);
      }

      await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
        .resize(SIZE, SIZE, { fit: "inside", withoutEnlargement: true })
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

// Exported so the keyer can be exercised against cached photos without re-running the
// whole fetch; `main` only fires when this file is the entry point.
export { keyOutBackground, backdropLevel };

const entry = (process.argv[1] ?? "").replace(/\\/g, "/");
if (entry.endsWith("scripts/ikea/fetch-thumbnails.ts")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
