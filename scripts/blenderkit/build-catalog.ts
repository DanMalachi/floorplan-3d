/**
 * BlenderKit furniture pipeline, step 6 — emit the runtime catalog rows.
 *
 * Produces data/furniture-blenderkit.catalog.json in the shape of
 * `FurnitureAsset` from src/furniture/catalog.ts, so the app can concatenate it
 * alongside the Kenney and IKEA entries without any renderer change.
 *
 * Footprints come from the MEASURED glb AABB (audit.ts), not from BlenderKit's
 * reported dimensions — several assets have stale metadata, and the file is what
 * the app actually loads. Everything is y-up: 84 of 85 files measured that way
 * and forcing it produced zero implausible heights, so glb = [w, h, d].
 *
 * Assets modelled at the wrong absolute scale are rescaled to a plausible real
 * size for their resolved type. That is safe precisely because the app scales
 * geometry to `footprint` at load time — only the aspect ratio comes from the
 * file.
 *
 * Run:
 *   npx tsx scripts/blenderkit/build-catalog.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadIndex, select } from "./select";
import { isContentRejected } from "./content-filter";
import { resolveType, categoryFor, wallSnapFor, roomsFor, PLAUSIBLE_EXTENT, type FurnitureType } from "./classify";
import type { AuditRow } from "./audit";

const AUDIT = path.resolve("data/furniture-blenderkit.audit.json");
const OUT = path.resolve("data/furniture-blenderkit.catalog.json");

/** Public path the app serves the optimized models from.
 *
 * `opt-ktx2` (KTX2/UASTC textures, `scripts/blenderkit/optimize-ktx2.ts`)
 * rather than `opt` (WebP) — the ~4x GPU-resident win Phase 3's texture-
 * memory bar needs. Every id here must have a matching file in
 * `public/furniture/blenderkit/opt-ktx2/`; `optimize-ktx2.ts` processes the
 * exact same `select()` + `isContentRejected()` set this script does, so the
 * two are kept in lockstep by construction, not by a manual list. */
/**
 * HELD AT `opt` FOR PRODUCTION, 2026-08-31. The KTX2 pipeline is built,
 * measured (869 MB -> 232 MB scene textures, 3.74x) and wired end to end, and
 * `perf-integrated-gpu` carries it pointed at `opt-ktx2`. It is deliberately
 * NOT what production serves yet, for three reasons that are about evidence,
 * not about the code:
 *
 *  - Nobody has LOOKED at it. The five visual checks that cleared the rest of
 *    that branch were wall paint, joinery, door collision, the kitchen colour
 *    wheel and cutaway fade. None of them was "do the BlenderKit models still
 *    look right", and KTX2 re-encoded the textures on all 75.
 *  - Its justification is unmeasured on the machine it is FOR. The M2 has had
 *    no reading with any of this work on it; that reading is the one thing that
 *    would prove KTX2 fixes the ~1.5 s load freeze.
 *  - Its cost is certain while its benefit is not: UASTC trades download for
 *    VRAM, 20 MB -> 123.5 MB on the wire, and that lands on first load — the
 *    exact moment that already stalls.
 *
 * `opt` is the WebP set that has been in production since 2026-07-28, and it is
 * tracked in git (75 files, ~20 MB), so a deploy of it is reproducible from a
 * clean checkout — which `opt-ktx2` is not, being untracked.
 *
 * To ship KTX2 once it has been looked at: change this one constant back to
 * `/furniture/blenderkit/opt-ktx2`, re-run `npm run bk:catalog`, and check
 * `npm run furniture:verify-deploy` before deploying. Nothing else moves — the
 * loader wiring in `src/render/ktx2.ts` stays registered either way and is a
 * documented no-op for any GLB that does not declare `KHR_texture_basisu`.
 */
const MODEL_BASE = "/furniture/blenderkit/opt";

interface CatalogRow {
  assetId: string;
  name: string;
  category: string;
  footprint: { w: number; d: number };
  wallSnap?: boolean;
  realModel: string;
  thumbnail?: string;
  brand: string;
  subtitle?: string;
  /** Picker room tabs — same contract as the IKEA catalog's `rooms`. */
  rooms: string[];
}

/** Rescales an implausibly-sized footprint to the middle of its type's range,
 *  preserving aspect ratio. Returns null when no rescale is needed. */
function rescale(
  w: number,
  d: number,
  type: FurnitureType,
): { w: number; d: number } | null {
  const [min, max] = PLAUSIBLE_EXTENT[type];
  const extent = Math.max(w, d);
  if (extent >= min && extent <= max) return null;

  // Target the nearest edge of the plausible band rather than the midpoint, so
  // a slightly-off model moves as little as possible.
  const target = extent < min ? min : max;
  const k = target / extent;
  return { w: round(w * k), d: round(d * k) };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

function main() {
  const audit: AuditRow[] = JSON.parse(readFileSync(AUDIT, "utf8"));
  const byId = new Map(audit.map((r) => [r.assetBaseId, r]));
  const { kept } = select(loadIndex());

  const rows: CatalogRow[] = [];
  const rescaled: string[] = [];
  const skipped: string[] = [];

  for (const e of kept) {
    const display = e.displayName || e.name;
    if (isContentRejected(display)) continue;

    const a = byId.get(e.assetBaseId);
    if (!a?.glbSize) {
      skipped.push(`${display} — no measured geometry`);
      continue;
    }

    // y-up throughout: the measured AABB is [width, height, depth].
    const [w0, h0, d0] = a.glbSize;
    const type = resolveType(display, e.category, { w: w0, h: h0, d: d0 });

    const fixed = rescale(w0, d0, type);
    if (fixed) {
      rescaled.push(
        `${display} (${type}): ${w0.toFixed(2)}x${d0.toFixed(2)} → ${fixed.w.toFixed(2)}x${fixed.d.toFixed(2)}`,
      );
    }
    const footprint = fixed ?? { w: round(w0), d: round(d0) };

    rows.push({
      assetId: `blenderkit:${e.assetBaseId}`,
      name: display,
      category: categoryFor(type),
      footprint,
      ...(wallSnapFor(type) ? { wallSnap: true } : {}),
      realModel: `${MODEL_BASE}/${e.assetBaseId}.glb`,
      ...(e.thumbnailUrl ? { thumbnail: e.thumbnailUrl } : {}),
      brand: "BlenderKit",
      subtitle: type.replace(/-/g, " "),
      rooms: roomsFor(type),
    });
  }

  rows.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  writeFileSync(OUT, JSON.stringify(rows, null, 2));

  const byCat = new Map<string, number>();
  for (const r of rows) byCat.set(r.category, (byCat.get(r.category) ?? 0) + 1);

  console.log(`Wrote ${rows.length} catalog rows → ${path.relative(process.cwd(), OUT)}\n`);
  console.log("By app category:");
  for (const [c, n] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${c}`);
  }
  console.log(`\nwallSnap: ${rows.filter((r) => r.wallSnap).length}`);
  console.log(`\nRescaled ${rescaled.length} implausibly-sized models:`);
  for (const r of rescaled) console.log(`   • ${r}`);
  if (skipped.length) {
    console.log(`\nSkipped ${skipped.length}:`);
    for (const s of skipped) console.log(`   • ${s}`);
  }
}

main();
