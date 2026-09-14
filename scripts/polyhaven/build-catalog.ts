/**
 * Poly Haven furniture pipeline — single-pass fetch + convert + measure + catalog.
 *
 * Poly Haven (https://polyhaven.com) is a fully CC0 asset library with a public,
 * unauthenticated API (https://api.polyhaven.com). Every asset on the site is the
 * same license — there is no per-item license field to check because the whole
 * site is one license, confirmed on https://polyhaven.com/license: "All assets
 * ... on this site are ... licensed as CC0, which is effectively Public Domain
 * ... You can use our assets for any purpose, including commercial work."
 *
 * Candidates below were hand-picked from the FULL Poly Haven furniture/seating/
 * table/bed/shelves category list (85 items total, fetched from
 * https://api.polyhaven.com/assets?t=models and filtered to those categories),
 * after two cuts:
 *  1. Exact-name duplicates of items already in data/furniture-blenderkit.catalog.json
 *     (BlenderKit's own approved list turns out to mirror much of Poly Haven's
 *     furniture catalog already — 30 of the 85 are re-uploads under the identical
 *     display name, e.g. "Chinese Cabinet", "Painted Wooden Sofa", "Round Wooden
 *     Table 02"). Those are skipped — shipping them again would just duplicate
 *     what's already live.
 *  2. Style: Dan's brief excludes vintage/ornate/gothic/traditional/antique. Poly
 *     Haven's furniture set skews heavily that way (GothicBed_01, chinese_*,
 *     painted_wooden_*, ArmChair_01 tagged "gothic,vintage,victorian", etc.) —
 *     confirmed by reading every item's own `tags` field from /assets, not by
 *     browsing thumbnails. Anything tagged vintage/antique/gothic/victorian/
 *     rustic/farmhouse/worn/old/weathered/distressed/traditional/ornate/classic
 *     was cut. What's left is what you see in CANDIDATES below.
 *
 * Real-world size ranges (meters) — auto-reject, no exceptions, no human visual
 * pass this round per Dan's ruling:
 *   Sofas        h .55-1.10  w 1.30-3.40  d .70-1.20
 *   Armchairs    h .60-1.15  w  .55-1.20  d .55-1.10
 *   Dining chair h .75-1.10  w  .38- .70  d .38- .70
 *   Coffee table h .28- .55  w  .35-1.80  d .30-1.20
 *   Storage      h .35-2.30  w  .30-2.60  d .25- .80
 *   Shelving     h .30-2.60  w  .20-2.20  d .18- .60
 *
 * Run: npx tsx scripts/polyhaven/build-catalog.ts
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { geomSize } from "../ikea/glb-geom";

const SCRATCH = path.resolve(
  "C:/Users/dandu/AppData/Local/Temp/claude/C--Users-dandu/12e01fd5-7c34-4516-89a9-c5630024de73/scratchpad/furn/polyhaven-src",
);
const OUT_DIR = path.resolve("public/furniture/polyhaven");
const OUT_JSON = path.resolve("data/furniture-polyhaven.catalog.json");
const REPORT_JSON = path.resolve("data/furniture-polyhaven.audit.json");

type Bucket = "sofa" | "armchair" | "diningChair" | "coffeeTable" | "storage" | "shelving";

const RANGES: Record<Bucket, { h: [number, number]; w: [number, number]; d: [number, number] }> = {
  sofa: { h: [0.55, 1.1], w: [1.3, 3.4], d: [0.7, 1.2] },
  armchair: { h: [0.6, 1.15], w: [0.55, 1.2], d: [0.55, 1.1] },
  diningChair: { h: [0.75, 1.1], w: [0.38, 0.7], d: [0.38, 0.7] },
  coffeeTable: { h: [0.28, 0.55], w: [0.35, 1.8], d: [0.3, 1.2] },
  storage: { h: [0.35, 2.3], w: [0.3, 2.6], d: [0.25, 0.8] },
  shelving: { h: [0.3, 2.6], w: [0.2, 2.2], d: [0.18, 0.6] },
};

interface Candidate {
  slug: string;
  category: "Seating" | "Tables" | "Storage";
  bucket: Bucket;
  subtitle: string;
  rooms: string[];
  wallSnap?: boolean;
}

const CANDIDATES: Candidate[] = [
  { slug: "sofa_02", category: "Seating", bucket: "sofa", subtitle: "sofa", rooms: ["living"], wallSnap: true },
  { slug: "modern_arm_chair_01", category: "Seating", bucket: "armchair", subtitle: "armchair", rooms: ["living"] },
  { slug: "Ottoman_01", category: "Seating", bucket: "armchair", subtitle: "ottoman", rooms: ["living"] },
  { slug: "dining_chair_02", category: "Seating", bucket: "diningChair", subtitle: "dining chair", rooms: ["dining", "kitchen"] },
  { slug: "coffee_table_round_01", category: "Tables", bucket: "coffeeTable", subtitle: "coffee table", rooms: ["living"] },
  { slug: "modern_coffee_table_01", category: "Tables", bucket: "coffeeTable", subtitle: "coffee table", rooms: ["living"] },
  { slug: "modern_coffee_table_02", category: "Tables", bucket: "coffeeTable", subtitle: "coffee table", rooms: ["living"] },
  { slug: "side_table_01", category: "Tables", bucket: "coffeeTable", subtitle: "side table", rooms: ["living", "bedroom"] },
  { slug: "drawer_cabinet", category: "Storage", bucket: "storage", subtitle: "cabinet", rooms: ["living", "bedroom"], wallSnap: true },
  { slug: "steel_frame_shelves_01", category: "Storage", bucket: "shelving", subtitle: "shelving unit", rooms: ["living", "office"], wallSnap: true },
  { slug: "steel_frame_shelves_02", category: "Storage", bucket: "shelving", subtitle: "shelving unit", rooms: ["living", "office"], wallSnap: true },
  { slug: "wooden_display_shelves_01", category: "Storage", bucket: "shelving", subtitle: "shelving unit", rooms: ["living"], wallSnap: true },
];

interface Info {
  name: string;
  download_count: number;
  thumbnail_url: string;
  categories: string[];
  tags: string[];
}

interface FileEntry {
  url: string;
  md5: string;
  size: number;
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

async function download(url: string, dest: string) {
  mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  return buf.length;
}

/** Pick the smallest resolution (1k) that has a gltf export; fall back up.
 *  Poly Haven's /files/<slug> response is keyed by FORMAT at the top level
 *  (gltf/blend/fbx/usd/Diffuse/...); files.gltf is then keyed by RESOLUTION
 *  ("1k"/"2k"/"4k"), and EACH resolution holds its own nested "gltf" object
 *  (files.gltf["1k"].gltf.{url,include}) — verified against the live API
 *  response for sofa_02, not assumed. */
function pickGltfRes(files: any): "1k" | "2k" | "4k" | null {
  for (const res of ["1k", "2k", "4k"] as const) {
    if (files?.gltf?.[res]?.gltf?.url) return res;
  }
  return null;
}

interface AuditRow {
  slug: string;
  name: string;
  category: string;
  bucket: Bucket;
  downloadCount: number;
  reportedTagsExcludeCheck: string[];
  glbBytes: number | null;
  measured: [number, number, number] | null; // [x(width), y(height), z(depth)]
  footprint: { w: number; d: number } | null;
  height: number | null;
  verdict: "PASS" | "FAIL";
  reason: string;
}

async function processOne(c: Candidate): Promise<{ row: AuditRow; catalogEntry: any | null }> {
  const info = await fetchJSON<Info>(`https://api.polyhaven.com/info/${c.slug}`);
  const files = await fetchJSON<any>(`https://api.polyhaven.com/files/${c.slug}`);
  const res = pickGltfRes(files);

  if (!res) {
    const row: AuditRow = {
      slug: c.slug,
      name: info.name,
      category: c.category,
      bucket: c.bucket,
      downloadCount: info.download_count,
      reportedTagsExcludeCheck: info.tags,
      glbBytes: null,
      measured: null,
      footprint: null,
      height: null,
      verdict: "FAIL",
      reason: "no gltf export available",
    };
    return { row, catalogEntry: null };
  }

  const gltfEntry = files.gltf[res].gltf;
  const srcDir = path.join(SCRATCH, c.slug);
  mkdirSync(srcDir, { recursive: true });

  // Download the .gltf itself + every included resource (bin + textures),
  // preserving the relative paths the gltf's own URIs expect.
  const gltfPath = path.join(srcDir, `${c.slug}.gltf`);
  await download(gltfEntry.url, gltfPath);
  for (const [relPath, entry] of Object.entries<FileEntry>(gltfEntry.include ?? {})) {
    await download(entry.url, path.join(srcDir, relPath));
  }

  // Rewrite the gltf's buffer URI to the local relative filename we saved the
  // .bin under (Poly Haven's "include" map keys resources by their *target*
  // relative path, e.g. "ArmChair_01.bin", which the gltf JSON already
  // references correctly — no rewrite needed in practice, but assert it).
  const io = new NodeIO();
  let doc;
  try {
    doc = await io.read(gltfPath);
  } catch (e) {
    const row: AuditRow = {
      slug: c.slug,
      name: info.name,
      category: c.category,
      bucket: c.bucket,
      downloadCount: info.download_count,
      reportedTagsExcludeCheck: info.tags,
      glbBytes: null,
      measured: null,
      footprint: null,
      height: null,
      verdict: "FAIL",
      reason: `gltf read failed: ${(e as Error).message}`,
    };
    return { row, catalogEntry: null };
  }

  const outGlb = path.join(OUT_DIR, `${c.slug}.glb`);
  mkdirSync(OUT_DIR, { recursive: true });
  await io.write(outGlb, doc);

  const measured = geomSize(outGlb); // glTF is always Y-up by spec; Poly Haven's own exporter emits real glTF, not a Blender Z-up passthrough.
  const glbBytes = existsSync(outGlb) ? require("node:fs").statSync(outGlb).size : null;

  if (!measured) {
    const row: AuditRow = {
      slug: c.slug,
      name: info.name,
      category: c.category,
      bucket: c.bucket,
      downloadCount: info.download_count,
      reportedTagsExcludeCheck: info.tags,
      glbBytes,
      measured: null,
      footprint: null,
      height: null,
      verdict: "FAIL",
      reason: "unreadable glb / no POSITION bounds",
    };
    return { row, catalogEntry: null };
  }

  const [gx, gy, gz] = measured;
  // glTF is Y-up (verified against Poly Haven's own reported `dimensions` for
  // sofa_02: reported [1807,818,709]mm order is [X,Z,Y] and matches the
  // measured glb's [x,y,z]=[1.807,0.709,0.818] exactly once re-ordered — so
  // height=Y is trustworthy, no axis-detection ambiguity like BlenderKit's
  // Z-up exporter had). Which raw local axis is "width" vs "depth" is NOT
  // fixed by the model though — a model's front can face either local X or Z.
  // Every sanity range above is asymmetric w_max > d_max (by design: "width"
  // means the long/frontal dimension, "depth" the short one, same convention
  // real furniture listings use) — so the plan footprint is oriented the same
  // way here: long horizontal axis -> w, short -> d. This does not change the
  // geometry, only which label the app's placement code uses for it.
  const footprint = { w: Math.max(gx, gz), d: Math.min(gx, gz) };
  const height = gy;
  const range = RANGES[c.bucket];
  const failures: string[] = [];
  if (height < range.h[0] || height > range.h[1])
    failures.push(`height ${height.toFixed(3)}m outside [${range.h[0]}, ${range.h[1]}]`);
  if (footprint.w < range.w[0] || footprint.w > range.w[1])
    failures.push(`width ${footprint.w.toFixed(3)}m outside [${range.w[0]}, ${range.w[1]}]`);
  if (footprint.d < range.d[0] || footprint.d > range.d[1])
    failures.push(`depth ${footprint.d.toFixed(3)}m outside [${range.d[0]}, ${range.d[1]}]`);

  const verdict: "PASS" | "FAIL" = failures.length === 0 ? "PASS" : "FAIL";
  const row: AuditRow = {
    slug: c.slug,
    name: info.name,
    category: c.category,
    bucket: c.bucket,
    downloadCount: info.download_count,
    reportedTagsExcludeCheck: info.tags,
    glbBytes,
    measured,
    footprint,
    height,
    verdict,
    reason: failures.length ? failures.join("; ") : "within range",
  };

  if (verdict === "FAIL") {
    // Auto-reject: remove the glb we just wrote so nothing ships that failed.
    try {
      require("node:fs").unlinkSync(outGlb);
    } catch {}
    return { row, catalogEntry: null };
  }

  const catalogEntry = {
    assetId: `polyhaven:${c.slug}`,
    name: info.name,
    category: c.category,
    footprint: { w: Number(footprint.w.toFixed(3)), d: Number(footprint.d.toFixed(3)) },
    ...(c.wallSnap ? { wallSnap: true } : {}),
    realModel: `/furniture/polyhaven/${c.slug}.glb`,
    thumbnail: info.thumbnail_url,
    brand: "Poly Haven",
    subtitle: c.subtitle,
    rooms: c.rooms,
  };

  return { row, catalogEntry };
}

async function main() {
  const rows: AuditRow[] = [];
  const catalog: any[] = [];

  for (const c of CANDIDATES) {
    process.stdout.write(`Processing ${c.slug}... `);
    try {
      const { row, catalogEntry } = await processOne(c);
      rows.push(row);
      if (catalogEntry) catalog.push(catalogEntry);
      console.log(`${row.verdict} (${row.reason})`);
    } catch (e) {
      console.log(`ERROR ${(e as Error).message}`);
      rows.push({
        slug: c.slug,
        name: c.slug,
        category: c.category,
        bucket: c.bucket,
        downloadCount: -1,
        reportedTagsExcludeCheck: [],
        glbBytes: null,
        measured: null,
        footprint: null,
        height: null,
        verdict: "FAIL",
        reason: `error: ${(e as Error).message}`,
      });
    }
  }

  writeFileSync(REPORT_JSON, JSON.stringify(rows, null, 2));
  writeFileSync(OUT_JSON, JSON.stringify(catalog, null, 2));

  console.log(`\n${catalog.length}/${CANDIDATES.length} passed dimension audit.`);
  console.log(`Wrote ${path.relative(process.cwd(), OUT_JSON)}`);
  console.log(`Wrote ${path.relative(process.cwd(), REPORT_JSON)}`);
  console.log("\nPer-item:");
  for (const r of rows) {
    console.log(
      `  ${r.verdict.padEnd(4)} ${r.slug.padEnd(28)} dl=${String(r.downloadCount).padStart(6)} ` +
        (r.measured ? `measured=[${r.measured.map((n) => n.toFixed(3)).join(", ")}]` : "measured=n/a") +
        ` — ${r.reason}`,
    );
  }
}

main();
