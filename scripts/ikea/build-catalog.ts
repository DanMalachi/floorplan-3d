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
import type { FurnitureItem } from "../../src/lib/furnitureCatalog";

const items: FurnitureItem[] = JSON.parse(
  readFileSync(path.resolve("data/furniture-ikea.json"), "utf8"),
);

// Nearest existing CC0 proxy GLB per catalog category (all exist in public/furniture).
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
};
const WALL_SNAP = new Set([
  "sofas",
  "storage-shelving",
  "bookcases",
  "cabinets",
  "wall-cabinets",
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
  const depthRaw = m(d.depth) ?? m(d.diameter) ?? 0.4;
  const footprint = isRound ? { w, d: w } : { w, d: clamp(depthRaw) };

  const model =
    isRound && it.category === "dining-tables" ? "tableRound" : PROXY[it.category];

  // Real IKEA .glb, only if we actually downloaded it (scripts/ikea/fetch-models.ts).
  // The app loads this local file with a Draco decoder and falls back to `model`.
  const realModel = existsSync(
    path.resolve(`public/furniture/ikea/${it.sourceItemId}.glb`),
  )
    ? `/furniture/ikea/${it.sourceItemId}.glb`
    : undefined;

  // Transparent thumbnail (white keyed out offline by fetch-thumbnails.ts); falls
  // back to the remote photo if it wasn't generated.
  const thumbnail = existsSync(
    path.resolve(`public/furniture/ikea/thumb/${it.sourceItemId}.png`),
  )
    ? `/furniture/ikea/thumb/${it.sourceItemId}.png`
    : it.imageMain;

  return {
    assetId: `ikea:${it.sourceItemId}`,
    name: it.name,
    subtitle: it.subcategoryHe, // Hebrew descriptor, shown as tile tooltip
    category: APP_CATEGORY[it.category] ?? "Decor",
    footprint,
    wallSnap: WALL_SNAP.has(it.category) || undefined,
    model, // proxy GLB basename in public/furniture/
    realModel, // real IKEA glb (local), preferred when present
    thumbnail, // local transparent PNG (white removed), or remote photo fallback
    brand: it.brand,
    price: it.price,
    rooms: ROOMS_OF[it.category] ?? ["living"],
  };
});
const withReal = assets.filter((a) => a.realModel).length;

const OUT = path.resolve("data/furniture-ikea.catalog.json");
writeFileSync(OUT, JSON.stringify(assets), "utf8");
console.log(
  `Wrote ${assets.length} placement assets → ${OUT} ` +
    `(${(readFileSync(OUT).length / 1024) | 0} KB; ${round} round → tableRound; ` +
    `${withReal} with real IKEA 3D model)`,
);
