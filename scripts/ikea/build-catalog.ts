/**
 * IKEA → app placement catalog.
 *
 * Turns the rich data/furniture-ikea.json into a SLIM catalog the app's furniture
 * placement system can consume synchronously (data/furniture-ikea.catalog.json).
 * Each item becomes a FurnitureAsset carrying its REAL footprint (meters) plus a
 * `model` pointing at an existing CC0 proxy GLB — so IKEA pieces render as real 3D
 * at true real-world scale today; swapping in the real IKEA .glb is a later upgrade.
 *
 * Only placement-relevant fields are emitted (name, footprint, proxy, thumbnail,
 * price, rooms) so the app doesn't pull the 600 KB detail file into its bundle.
 *
 * Run:  npx tsx scripts/ikea/build-catalog.ts
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { FurnitureItem, FurnitureDimensions } from "../../src/lib/furnitureCatalog";
import { geomSize } from "./glb-geom";

// Two dimensions "match" within an absolute OR relative tolerance. The absolute
// floor (3 cm) keeps thin parts (a 4 cm panel measured as 7 cm in the mesh) from
// blowing up the relative error; the relative term (15%) handles larger dims.
const near = (a?: number | null, b?: number | null) =>
  a != null && b != null && a > 0 && b > 0 &&
  Math.abs(a - b) <= Math.max(0.03, 0.15 * Math.max(a, b));

const PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

/** Decide a corrective stand-up rotation for a mis-oriented model, or flag it broken.
 *  Jointly assigns the glb's three geometry axes to IKEA's real (W, D, H): among the
 *  6 assignments, keep the lowest-error one where ALL three axes match. The axis that
 *  ends up as HEIGHT is the model's true up-axis — if it isn't Y, the model was
 *  authored lying down and we rotate it upright. If no assignment matches all three
 *  (ambiguous/odd proportions), we leave the model exactly as authored. */
function orientation(
  glbPath: string,
  d: FurnitureDimensions,
): { modelRotation?: [number, number, number]; broken?: boolean } {
  const size = geomSize(glbPath);
  if (!size) return {};
  if (Math.max(...size) > 5) return { broken: true }; // e.g. LÄCKÖ ~22 m — corrupt scale
  const h = d.height != null ? d.height / 100 : null;
  const w = d.width != null ? d.width / 100 : null;
  const dep = d.depth != null ? d.depth / 100 : null;
  if (h == null || w == null || dep == null) return {}; // need all 3 to assign confidently

  const real = [w, dep, h]; // dim index 2 === height
  let best: { perm: number[]; err: number } | null = null;
  for (const perm of PERMS) {
    let ok = true;
    let err = 0;
    for (let ax = 0; ax < 3; ax++) {
      const rv = real[perm[ax]];
      if (!near(size[ax], rv)) { ok = false; break; }
      err += Math.abs(size[ax] - rv) / Math.max(size[ax], rv);
    }
    // Prior: a lying-down model was almost always authored Z-up (CAD convention), so
    // height-on-Z is far more likely than height-on-X. When W≈H the two fit the bbox
    // nearly equally; this bias breaks the tie toward the physically-correct Z case.
    if (perm.indexOf(2) === 0) err += 0.05; // penalize height-on-X
    if (ok && (!best || err < best.err)) best = { perm, err };
  }
  if (!best) return {}; // no confident fit — don't risk a rotation
  const heightAxis = best.perm.indexOf(2); // which glb axis carries the real height
  if (heightAxis === 1) return {}; // height already on Y → upright
  if (heightAxis === 2) return { modelRotation: [-Math.PI / 2, 0, 0] }; // height on Z → stand up
  return { modelRotation: [0, 0, Math.PI / 2] }; // height on X → stand up
}

const items: FurnitureItem[] = JSON.parse(
  readFileSync(path.resolve("data/furniture-ikea.json"), "utf8"),
);

// Blob URL manifest (scripts/ikea/upload-blob.ts). When present, real models are
// served from Vercel Blob instead of committed local files — so the ~400 MB of glbs
// never enters git or the deploy bundle. Absent (pre-upload) → local paths are used.
const BLOB_MANIFEST = path.resolve("data/furniture-ikea.blob.json");
const blobUrls: Record<string, string> = existsSync(BLOB_MANIFEST)
  ? JSON.parse(readFileSync(BLOB_MANIFEST, "utf8"))
  : {};

// Nearest existing CC0 proxy GLB per catalog category (all exist in public/furniture).
// NOTE: only a runtime fallback now — every shipped item has a real IKEA .glb, so
// this is used only if that real model ever fails to load.
const PROXY: Record<string, string> = {
  sofas: "loungeSofa",
  armchairs: "loungeChair",
  "coffee-tables": "tableCoffee",
  "dining-tables": "table", // round variants overridden below
  "storage-shelving": "bookcaseOpen",
  bookcases: "bookcaseClosedWide",
  cabinets: "cabinetTelevision",
  "wall-cabinets": "cabinetTelevision",
  lighting: "lampRoundFloor",
  beds: "bedDouble",
  desks: "desk",
  chairs: "chairCushion",
  wardrobes: "bookcaseClosedWide",
  "tv-units": "cabinetTelevision",
  sideboards: "cabinetTelevision",
  nightstands: "sideTable",
  dressers: "bookcaseClosedWide",
  benches: "benchCushion",
  outdoor: "pottedPlant",
};
// App-side coarse category (FurnitureAsset.category union).
const APP_CATEGORY: Record<string, string> = {
  sofas: "Seating",
  armchairs: "Seating",
  "coffee-tables": "Tables",
  "dining-tables": "Tables",
  "storage-shelving": "Storage",
  bookcases: "Storage",
  cabinets: "Storage",
  "wall-cabinets": "Storage",
  lighting: "Decor",
  beds: "Beds",
  desks: "Tables",
  chairs: "Seating",
  wardrobes: "Storage",
  "tv-units": "Storage",
  sideboards: "Storage",
  nightstands: "Storage",
  dressers: "Storage",
  benches: "Seating",
  outdoor: "Decor",
};
// Which existing room tab(s) each category shows under.
const ROOMS_OF: Record<string, string[]> = {
  sofas: ["living"],
  armchairs: ["living"],
  "coffee-tables": ["living"],
  "dining-tables": ["dining"],
  "storage-shelving": ["living", "office"],
  bookcases: ["living", "office"],
  cabinets: ["bedroom", "living"],
  "wall-cabinets": ["living"],
  lighting: ["living", "bedroom", "office"],
  beds: ["bedroom"],
  desks: ["office"],
  chairs: ["dining", "office"],
  wardrobes: ["bedroom"],
  "tv-units": ["living"],
  sideboards: ["living", "dining"],
  nightstands: ["bedroom"],
  dressers: ["bedroom"],
  benches: ["living", "dining"],
  outdoor: ["living"],
};
const WALL_SNAP = new Set([
  "sofas",
  "storage-shelving",
  "bookcases",
  "cabinets",
  "wall-cabinets",
  "beds",
  "desks",
  "wardrobes",
  "tv-units",
  "sideboards",
  "dressers",
]);

const m = (cm: number | undefined) => (cm != null ? cm / 100 : undefined);
const clamp = (v: number) => Math.max(0.2, Math.round(v * 100) / 100);

let round = 0;
const assets = items.map((it) => {
  const d = it.dimensions;
  const isRound = d.diameter != null && d.width == null;
  if (isRound) round++;

  // Footprint in meters, with sensible fallbacks so every item is placeable.
  const w = clamp(m(d.width) ?? m(d.length) ?? m(d.diameter) ?? 0.5);
  // Second floor axis. Beds/tables/benches publish LENGTH (~2 m), not depth — if
  // width was given, length is the other floor dimension (otherwise length already
  // became `w`). Without this, a bed reads as a thin 0.4 m slab and, because
  // normalize() scales by the largest footprint dim, the whole model shrinks.
  const depthRaw =
    m(d.depth) ?? (d.width != null ? m(d.length) : undefined) ?? m(d.diameter) ?? 0.4;
  const footprint = isRound ? { w, d: w } : { w, d: clamp(depthRaw) };
  // No published horizontal dimension → we can't place it at a trustworthy real
  // size (it renders as a fallback box; e.g. a "sofa cover" whose model is a full
  // sofa shrinks to a tiny sofa). Trust-the-dimensions principle: drop it.
  const noSize = d.width == null && d.length == null && d.diameter == null;

  const model =
    isRound && it.category === "dining-tables" ? "tableRound" : PROXY[it.category];

  // Real IKEA .glb. Prefer the Blob-hosted URL (production) when uploaded; else the
  // local file if we downloaded it (scripts/ikea/fetch-models.ts). The app loads it
  // with a Draco decoder and falls back to `model` on error.
  const realModel =
    blobUrls[it.sourceItemId] ??
    (existsSync(path.resolve(`public/furniture/ikea/${it.sourceItemId}.glb`))
      ? `/furniture/ikea/${it.sourceItemId}.glb`
      : undefined);

  // Transparent thumbnail (white keyed out offline by fetch-thumbnails.ts); falls
  // back to the remote photo if it wasn't generated.
  const thumbnail = existsSync(
    path.resolve(`public/furniture/ikea/thumb/${it.sourceItemId}.png`),
  )
    ? `/furniture/ikea/thumb/${it.sourceItemId}.png`
    : it.imageMain;

  // Orientation: some IKEA models are authored lying down (up-axis on X/Z). Bake a
  // stand-up rotation the app applies at load; flag corrupt-scale models to drop.
  const localGlb = path.resolve(`public/furniture/ikea/${it.sourceItemId}.glb`);
  const ori = realModel && existsSync(localGlb) ? orientation(localGlb, d) : {};

  return {
    assetId: `ikea:${it.sourceItemId}`,
    name: it.name,
    subtitle: it.subcategoryHe, // Hebrew descriptor, shown as tile tooltip
    category: APP_CATEGORY[it.category] ?? "Decor",
    footprint,
    wallSnap: WALL_SNAP.has(it.category) || undefined,
    model, // proxy GLB basename in public/furniture/
    realModel, // real IKEA glb (local), preferred when present
    ...(ori.modelRotation ? { modelRotation: ori.modelRotation } : {}),
    thumbnail, // local transparent PNG (white removed), or remote photo fallback
    brand: it.brand,
    price: it.price,
    rooms: ROOMS_OF[it.category] ?? ["living"],
    broken: ori.broken, // internal — filtered out below, never serialized
    noSize, // internal — filtered out below (no real footprint → can't size)
  };
});
// SHIP ONLY WHAT WORKS: keep items with a real loadable glb, minus corrupt-scale
// and un-sizeable ones. Drop the internal flags from the emitted records.
const rotated = assets.filter((a) => a.modelRotation).length;
const brokenCount = assets.filter((a) => a.broken).length;
const noSizeCount = assets.filter((a) => a.realModel && !a.broken && a.noSize).length;
const shippable = assets
  .filter((a) => a.realModel && !a.broken && !a.noSize)
  .map(({ broken, noSize, ...a }) => a);
const dropped = assets.length - shippable.length;

const OUT = path.resolve("data/furniture-ikea.catalog.json");
writeFileSync(OUT, JSON.stringify(shippable), "utf8");
const viaBlob = shippable.filter((a) => a.realModel!.startsWith("http")).length;
console.log(
  `Wrote ${shippable.length} placement assets → ${OUT} ` +
    `(${(readFileSync(OUT).length / 1024) | 0} KB; all with a real IKEA 3D model — ` +
    `${viaBlob} via Blob, ${shippable.length - viaBlob} local; ` +
    `stood up ${rotated} lying-down models; dropped ${dropped} of ${assets.length} ` +
    `(${brokenCount} corrupt-scale, ${noSizeCount} no-real-size, ` +
    `${dropped - brokenCount - noSizeCount} proxy-only).`,
);
