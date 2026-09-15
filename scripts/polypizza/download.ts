/**
 * Poly Pizza download + measure + catalog pipeline — mirrors
 * scripts/sketchfab/download.ts's method and range tables exactly (same
 * bed-size-band / office-chair / dining-table / topper-category real-world
 * ranges from Dan's brief), adapted to Poly Pizza's simpler API:
 *
 *  1. GETs /v1.1/model/{id} for the CURRENT licence + download URL (never
 *     trusts the bulk /search cache — a fresh per-item read, same rule as
 *     the Sketchfab pass).
 *  2. Downloads the .glb directly (Poly Pizza serves a plain, non-expiring
 *     static URL — no signed-URL dance needed here).
 *  3. Measures the real glb with scripts/lib/glb-geom.ts's geomSize().
 *  4. Applies the category's real-world size range, auto-reject on fail.
 *
 * Auth: reads process.env.POLYPIZZA_API_KEY (never hardcode the key).
 * Run: POLYPIZZA_API_KEY=... npx tsx scripts/polypizza/download.ts bed:60
 */
import { writeFileSync, mkdirSync, unlinkSync, statSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { geomSize } from "../lib/glb-geom";
import { reviewRejection } from "../lib/review-rejections";

const KEY = process.env.POLYPIZZA_API_KEY;
if (!KEY) throw new Error("POLYPIZZA_API_KEY not set");

const OUT_DIR = path.resolve("public/furniture/polypizza");
const OUT_JSON = path.resolve("data/furniture-polypizza.catalog.json");
const REPORT_JSON = path.resolve("data/furniture-polypizza.audit.json");
mkdirSync(OUT_DIR, { recursive: true });

type Bucket =
  | "bed" | "officeChair" | "diningTable"
  | "sofa" | "armchair" | "diningChair" | "coffeeTable" | "storage" | "shelving";

interface Candidate {
  id: string;
  bucket: Bucket;
  category: "Seating" | "Tables" | "Beds" | "Storage";
  subtitle: string;
  rooms: string[];
  wallSnap?: boolean;
}

const RANGES: Record<
  Exclude<Bucket, "bed">,
  { h: [number, number]; w: [number, number]; d: [number, number] }
> = {
  officeChair: { h: [0.85, 1.3], w: [0.55, 0.75], d: [0.55, 0.75] },
  diningTable: { h: [0.68, 0.82], w: [0.55, 3.2], d: [0.55, 1.6] },
  sofa: { h: [0.55, 1.1], w: [1.3, 3.4], d: [0.7, 1.2] },
  armchair: { h: [0.6, 1.15], w: [0.55, 1.2], d: [0.55, 1.1] },
  diningChair: { h: [0.75, 1.1], w: [0.38, 0.7], d: [0.38, 0.7] },
  coffeeTable: { h: [0.28, 0.55], w: [0.35, 1.8], d: [0.3, 1.2] },
  storage: { h: [0.35, 2.3], w: [0.3, 2.6], d: [0.25, 0.8] },
  shelving: { h: [0.3, 2.6], w: [0.2, 2.2], d: [0.18, 0.6] },
};

const BED_H: [number, number] = [0.45, 0.75];
const BED_LEN: [number, number] = [1.9, 2.1];
const BED_WIDTH_BANDS: [number, number][] = [
  [0.9, 1.0], [1.35, 1.5], [1.5, 1.6], [1.8, 2.0],
];

const ACCEPTED_LICENCES = ["CC0 1.0", "CC-BY 3.0", "CC-BY 4.0"];

// Name-sanity gate: a keyword-matched search can surface something whose
// TAGS happened to include the search term (or a fuzzy/typo match) but
// which is clearly not the target furniture piece at all — caught in
// practice on this pass by "Landing Pad" and "Floor Dirt Small" both
// PASSING the bed dimension check (a ~2x2m flat platform reads as a
// bed-shaped box numerically). A real dimension pass is necessary but not
// sufficient; the item's own name must also say what it is.
const NAME_SANITY: Record<Bucket, RegExp> = {
  bed: /bed|mattress/i,
  officeChair: /chair/i,
  diningTable: /table/i,
  sofa: /sofa|couch|sectional/i,
  armchair: /chair|armchair|recliner|ottoman/i,
  diningChair: /chair/i,
  coffeeTable: /table/i,
  storage: /cabinet|dresser|drawer|sideboard|wardrobe|storage|chest/i,
  shelving: /shelf|shelving|bookcase|bookshelf|rack/i,
};

interface AuditRow {
  id: string;
  name: string;
  bucket: Bucket;
  licence: string | null;
  glbBytes: number | null;
  measuredXYZ: [number, number, number] | null;
  footprint: { w: number; d: number } | null;
  height: number | null;
  verdict: "PASS" | "FAIL";
  reason: string;
  httpDetailStatus: number;
  httpDownloadStatus: number | null;
}

async function fetchJSON<T>(url: string, retries = 4): Promise<{ status: number; body: T | null }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers: { "X-Auth-Token": KEY! } });
    if (res.status === 429 && attempt < retries) {
      const wait = 3000 * (attempt + 1);
      console.log(`  (429, backing off ${wait}ms)`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    const status = res.status;
    const body = (await res.json().catch(() => null)) as T | null;
    return { status, body };
  }
  return { status: 429, body: null };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function checkBed(x: number, y: number, z: number) {
  const length = Math.max(x, z);
  const width = Math.min(x, z);
  const failures: string[] = [];
  if (y < BED_H[0] || y > BED_H[1]) failures.push(`height ${y.toFixed(3)}m outside [${BED_H[0]},${BED_H[1]}]`);
  if (length < BED_LEN[0] || length > BED_LEN[1]) failures.push(`length ${length.toFixed(3)}m outside [${BED_LEN[0]},${BED_LEN[1]}]`);
  const inBand = BED_WIDTH_BANDS.some(([lo, hi]) => width >= lo && width <= hi);
  if (!inBand) failures.push(`width ${width.toFixed(3)}m not in any size band [${BED_WIDTH_BANDS.map((b) => b.join("-")).join(", ")}]`);
  return {
    pass: failures.length === 0,
    reason: failures.length ? failures.join("; ") : "within range",
    footprint: failures.length === 0 ? { w: Number(width.toFixed(3)), d: Number(length.toFixed(3)) } : null,
  };
}

function checkGeneric(bucket: Exclude<Bucket, "bed">, x: number, y: number, z: number) {
  const range = RANGES[bucket];
  const w = Math.max(x, z);
  const d = Math.min(x, z);
  const failures: string[] = [];
  if (y < range.h[0] || y > range.h[1]) failures.push(`height ${y.toFixed(3)}m outside [${range.h[0]},${range.h[1]}]`);
  if (w < range.w[0] || w > range.w[1]) failures.push(`width ${w.toFixed(3)}m outside [${range.w[0]},${range.w[1]}]`);
  if (d < range.d[0] || d > range.d[1]) failures.push(`depth ${d.toFixed(3)}m outside [${range.d[0]},${range.d[1]}]`);
  return {
    pass: failures.length === 0,
    reason: failures.length ? failures.join("; ") : "within range",
    footprint: failures.length === 0 ? { w: Number(w.toFixed(3)), d: Number(d.toFixed(3)) } : null,
  };
}

const CATEGORY_LABEL: Record<Bucket, string> = {
  bed: "bed", officeChair: "office chair", diningTable: "dining table",
  sofa: "sofa", armchair: "armchair", diningChair: "dining chair",
  coffeeTable: "coffee table", storage: "storage", shelving: "shelving",
};

// Explicit block: /table/i alone also matches non-dining furniture (a pool
// table caught "Pool Table" passing on this exact pass — see docs).
const NAME_BLOCKLIST: Partial<Record<Bucket, RegExp>> = {
  diningTable: /pool table|billiard|ping.?pong|foosball|ironing/i,
  coffeeTable: /pool table|billiard|ping.?pong|foosball|ironing/i,
};

async function processOne(c: Candidate): Promise<{ row: AuditRow; catalogEntry: any | null }> {
  const detail = await fetchJSON<any>(`https://api.poly.pizza/v1.1/model/${c.id}`);
  if (detail.status !== 200 || !detail.body) {
    return {
      row: {
        id: c.id, name: c.id, bucket: c.bucket, licence: null, glbBytes: null,
        measuredXYZ: null, footprint: null, height: null,
        verdict: "FAIL", reason: `detail fetch failed (HTTP ${detail.status})`,
        httpDetailStatus: detail.status, httpDownloadStatus: null,
      },
      catalogEntry: null,
    };
  }
  const info = detail.body;
  const licenceOk = ACCEPTED_LICENCES.includes(info.Licence);
  if (!licenceOk || !info.Download) {
    return {
      row: {
        id: c.id, name: info.Title, bucket: c.bucket, licence: info.Licence ?? null, glbBytes: null,
        measuredXYZ: null, footprint: null, height: null,
        verdict: "FAIL", reason: !licenceOk ? `licence not accepted: ${info.Licence}` : "no download url",
        httpDetailStatus: detail.status, httpDownloadStatus: null,
      },
      catalogEntry: null,
    };
  }

  const slug = `${slugify(info.Title)}-${c.id.slice(0, 8)}`;
  const outGlb = path.join(OUT_DIR, `${slug}.glb`);
  const res = await fetch(info.Download);
  if (!res.ok) {
    return {
      row: {
        id: c.id, name: info.Title, bucket: c.bucket, licence: info.Licence, glbBytes: null,
        measuredXYZ: null, footprint: null, height: null,
        verdict: "FAIL", reason: `glb download HTTP ${res.status}`,
        httpDetailStatus: detail.status, httpDownloadStatus: res.status,
      },
      catalogEntry: null,
    };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(outGlb, buf);
  const glbBytes = statSync(outGlb).size;

  const measured = geomSize(outGlb);
  if (!measured) {
    unlinkSync(outGlb);
    return {
      row: {
        id: c.id, name: info.Title, bucket: c.bucket, licence: info.Licence, glbBytes,
        measuredXYZ: null, footprint: null, height: null,
        verdict: "FAIL", reason: "unreadable glb / no POSITION bounds",
        httpDetailStatus: detail.status, httpDownloadStatus: res.status,
      },
      catalogEntry: null,
    };
  }

  const [gx, gy, gz] = measured;
  const dimCheck = c.bucket === "bed" ? checkBed(gx, gy, gz) : checkGeneric(c.bucket, gx, gy, gz);
  const nameOk = NAME_SANITY[c.bucket].test(info.Title) && !NAME_BLOCKLIST[c.bucket]?.test(info.Title);
  const check = {
    pass: dimCheck.pass && nameOk,
    footprint: dimCheck.pass && nameOk ? dimCheck.footprint : null,
    reason: !dimCheck.pass ? dimCheck.reason : !nameOk ? `name "${info.Title}" doesn't match expected ${CATEGORY_LABEL[c.bucket]} keyword (dims passed but this isn't really one)` : dimCheck.reason,
  };

  const row: AuditRow = {
    id: c.id, name: info.Title, bucket: c.bucket, licence: info.Licence, glbBytes,
    measuredXYZ: measured, footprint: check.footprint, height: gy,
    verdict: check.pass ? "PASS" : "FAIL", reason: check.reason,
    httpDetailStatus: detail.status, httpDownloadStatus: res.status,
  };

  if (!check.pass || !check.footprint) {
    unlinkSync(outGlb);
    return { row, catalogEntry: null };
  }

  const catalogEntry = {
    assetId: `polypizza:${c.id}`,
    name: info.Title,
    category: c.category,
    footprint: check.footprint,
    ...(c.wallSnap ? { wallSnap: true } : {}),
    realModel: `/furniture/polypizza/${slug}.glb`,
    thumbnail: info.Thumbnail,
    brand: "Poly Pizza",
    subtitle: c.subtitle,
    rooms: c.rooms,
  };

  return { row, catalogEntry };
}

// ── Shortlist ────────────────────────────────────────────────────────────
const SHORTLIST_PATH = path.join(__dirname, "shortlist.json");
const RAW_SHORTLIST: Record<string, any[]> = JSON.parse(readFileSync(SHORTLIST_PATH, "utf8"));
const BUCKET_TO_KEY: Record<string, string> = {
  bed: "beds", officeChair: "office_chairs", diningTable: "dining_tables",
  sofa: "sofas", armchair: "armchairs", diningChair: "dining_chairs",
  coffeeTable: "coffee_tables", storage: "storage", shelving: "shelving",
};

function parseArgs(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of process.argv.slice(2)) {
    const [bucket, n] = a.split(":");
    out[bucket] = n ? Number(n) : Infinity;
  }
  return out;
}

function buildCandidates(): Candidate[] {
  const args = parseArgs();
  const buckets = Object.keys(args).length ? Object.keys(args) : Object.keys(BUCKET_TO_KEY);
  const out: Candidate[] = [];
  for (const bucket of buckets) {
    const key = BUCKET_TO_KEY[bucket];
    if (!key) continue;
    const limit = args[bucket] ?? Infinity;
    const rows = (RAW_SHORTLIST[key] ?? []).slice(0, limit);
    for (const r of rows) {
      out.push({
        id: r.id, bucket: r.bucket, category: r.category,
        subtitle: r.subtitle, rooms: r.rooms, wallSnap: r.wallSnap,
      });
    }
  }
  return out;
}

const CANDIDATES: Candidate[] = buildCandidates();

let alreadyDone = new Set<string>();
if (existsSync(REPORT_JSON)) {
  try {
    const prior = JSON.parse(readFileSync(REPORT_JSON, "utf8")) as AuditRow[];
    alreadyDone = new Set(prior.filter((r) => r.reason && !/429|error:/.test(r.reason)).map((r) => r.id));
  } catch {
    /* ignore */
  }
}

async function main() {
  const priorRows: AuditRow[] = existsSync(REPORT_JSON) ? JSON.parse(readFileSync(REPORT_JSON, "utf8")) : [];
  const priorCatalog: any[] = existsSync(OUT_JSON) ? JSON.parse(readFileSync(OUT_JSON, "utf8")) : [];
  const rowsById = new Map<string, AuditRow>(priorRows.map((r) => [r.id, r]));
  const catalogByAssetId = new Map<string, any>(priorCatalog.map((c) => [c.assetId, c]));

  const todo = CANDIDATES.filter((c) => !alreadyDone.has(c.id));
  console.log(`${CANDIDATES.length} candidates selected, ${todo.length} not yet resolved, ${CANDIDATES.length - todo.length} skipped (already resolved).`);

  const tallies: Record<string, { pass: number; fail: number }> = {};
  for (const c of todo) {
    process.stdout.write(`Processing ${CATEGORY_LABEL[c.bucket]} ${c.id}... `);
    try {
      const { row, catalogEntry } = await processOne(c);
      rowsById.set(row.id, row);
      if (catalogEntry) catalogByAssetId.set(catalogEntry.assetId, catalogEntry);
      const t = (tallies[c.bucket] ??= { pass: 0, fail: 0 });
      if (row.verdict === "PASS") t.pass++;
      else t.fail++;
      console.log(`${row.verdict} (${row.reason})`);
    } catch (e) {
      console.log(`ERROR ${(e as Error).message}`);
      rowsById.set(c.id, {
        id: c.id, name: c.id, bucket: c.bucket, licence: null, glbBytes: null,
        measuredXYZ: null, footprint: null, height: null,
        verdict: "FAIL", reason: `error: ${(e as Error).message}`,
        httpDetailStatus: -1, httpDownloadStatus: null,
      });
      const t = (tallies[c.bucket] ??= { pass: 0, fail: 0 });
      t.fail++;
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  const rows = [...rowsById.values()];
  const catalog = [...catalogByAssetId.values()].filter((c) => !reviewRejection(c.assetId));

  writeFileSync(REPORT_JSON, JSON.stringify(rows, null, 2));
  writeFileSync(OUT_JSON, JSON.stringify(catalog, null, 2));

  console.log(`\n${catalog.length} total items in catalog so far (cumulative). This run: ${todo.length} processed.`);
  console.log("This run per bucket:", JSON.stringify(tallies, null, 2));
  console.log(`Wrote ${path.relative(process.cwd(), OUT_JSON)}`);
  console.log(`Wrote ${path.relative(process.cwd(), REPORT_JSON)}`);
}

main();
