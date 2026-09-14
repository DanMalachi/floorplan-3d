/**
 * Sketchfab download + measure + catalog pipeline. Takes a curated shortlist
 * (hand-picked from scripts/sketchfab/search.ts + filter.ts output — single
 * furniture items only, no whole-room scenes or furniture "sets" whose bbox
 * would include other objects) and, per item:
 *
 *  1. GETs /v3/models/{uid} for the CURRENT license + downloadable flag —
 *     the per-item verification Dan's brief requires (never trust the bulk
 *     /search result's cached license label).
 *  2. GETs /v3/models/{uid}/download for a signed .glb URL (expires ~300s)
 *     and downloads it immediately.
 *  3. Measures the REAL glb with scripts/ikea/glb-geom.ts's geomSize() —
 *     Sketchfab's own "glb" export is already a single self-contained file,
 *     no gltf+bin repacking needed (unlike the Poly Haven pass).
 *  4. Applies the category's real-world size range (auto-reject, no
 *     exceptions) and only keeps files that pass.
 *
 * Auth: reads process.env.SKETCHFAB_API_TOKEN (never hardcode the token).
 * Run: SKETCHFAB_API_TOKEN=... npx tsx scripts/sketchfab/download.ts
 */
import { writeFileSync, mkdirSync, unlinkSync, statSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { geomSize } from "../ikea/glb-geom";

const TOKEN = process.env.SKETCHFAB_API_TOKEN;
if (!TOKEN) throw new Error("SKETCHFAB_API_TOKEN not set");

const OUT_DIR = path.resolve("public/furniture/sketchfab");
const OUT_JSON = path.resolve("data/furniture-sketchfab.catalog.json");
const REPORT_JSON = path.resolve("data/furniture-sketchfab.audit.json");
mkdirSync(OUT_DIR, { recursive: true });

type Bucket =
  | "bed" | "officeChair" | "diningTable"
  | "sofa" | "armchair" | "diningChair" | "coffeeTable" | "storage" | "shelving";

interface Candidate {
  uid: string;
  bucket: Bucket;
  category: "Seating" | "Tables" | "Beds" | "Storage";
  subtitle: string;
  rooms: string[];
  wallSnap?: boolean;
}

// ── Shortlist ────────────────────────────────────────────────────────────
// Loaded from scripts/sketchfab/shortlist.json (produced by shortlist.ts,
// itself derived from the license+style+downloadable-filtered search
// results). CLI args select which categories to run and how many of the
// shortlist to consume, so a single "find enough that pass" loop can widen
// the pool without a code edit:
//   npx tsx scripts/sketchfab/download.ts bed:40 officeChair:30
// With no args, runs everything in the shortlist.
const SHORTLIST_PATH = path.join(__dirname, "shortlist.json");
const RAW_SHORTLIST: Record<string, any[]> = JSON.parse(readFileSync(SHORTLIST_PATH, "utf8"));
const BUCKET_TO_KEY: Record<string, string> = {
  bed: "beds",
  officeChair: "office_chairs",
  diningTable: "dining_tables",
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
        uid: r.uid,
        bucket: r.bucket,
        category: r.category,
        subtitle: r.subtitle,
        rooms: r.rooms,
        wallSnap: r.wallSnap,
      });
    }
  }
  return out;
}

const CANDIDATES: Candidate[] = buildCandidates();
// Skip uids already resolved (PASS or a hard FAIL already on record) in a
// previous run of this script, so re-running to widen the pool doesn't
// re-spend API/rate-limit budget on the same items.
const PRIOR_REPORT = REPORT_JSON;
let alreadyDone = new Set<string>();
if (existsSync(PRIOR_REPORT)) {
  try {
    const prior = JSON.parse(readFileSync(PRIOR_REPORT, "utf8")) as AuditRow[];
    // A row is only "resolved" if it reflects a real API answer (license
    // check, dimension check) — not a transient 429/network error, which
    // should be retried, not treated as a permanent FAIL.
    alreadyDone = new Set(
      prior.filter((r) => r.reason && !/429|error:/.test(r.reason)).map((r) => r.uid),
    );
  } catch {
    /* ignore */
  }
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

// Bed-specific: height + length are fixed bands; width must land in one of
// the four size bands (gaps between bands are real gaps — a 1.2m-wide bed
// is neither a double nor a queen, and is rejected, not rounded).
const BED_H: [number, number] = [0.45, 0.75];
const BED_LEN: [number, number] = [1.9, 2.1];
const BED_WIDTH_BANDS: [number, number][] = [
  [0.9, 1.0], // single
  [1.35, 1.5], // double
  [1.5, 1.6], // queen
  [1.8, 2.0], // king
];

// Name-sanity gate: a keyword search can surface something whose tags
// happened to include the search term but which is clearly not the target
// furniture piece at all (confirmed in practice on the Poly Pizza pass —
// see scripts/polypizza/download.ts's NAME_SANITY comment for the "Landing
// Pad"/"Floor Dirt Small" false positives that passed the bed dimension
// check numerically). A dimension pass is necessary but not sufficient.
const NAME_SANITY: Record<Bucket, RegExp> = {
  bed: /bed|mattress/i,
  officeChair: /chair/i,
  diningTable: /table/i, // NOTE: also gated by NAME_BLOCKLIST below (pool/ping-pong tables etc. also match /table/i)
  sofa: /sofa|couch|sectional/i,
  armchair: /chair|armchair|recliner|ottoman/i,
  diningChair: /chair/i,
  coffeeTable: /table/i,
  storage: /cabinet|dresser|drawer|sideboard|wardrobe|storage|chest/i,
  shelving: /shelf|shelving|bookcase|bookshelf|rack/i,
};

interface AuditRow {
  uid: string;
  name: string;
  bucket: Bucket;
  license: { slug: string; label: string } | null;
  isDownloadable: boolean;
  faceCount: number | null;
  glbBytes: number | null;
  measuredXYZ: [number, number, number] | null; // [x, y(height), z]
  footprint: { w: number; d: number } | null;
  height: number | null;
  verdict: "PASS" | "FAIL";
  reason: string;
  httpDetailStatus: number;
  httpDownloadStatus: number | null;
}

async function fetchJSON<T>(url: string, retries = 4): Promise<{ status: number; body: T | null }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Token ${TOKEN}` } });
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

function checkBed(x: number, y: number, z: number): { pass: boolean; reason: string; footprint: { w: number; d: number } | null } {
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
  // Asymmetric ranges (w_max > d_max) mean "width" is the long/frontal
  // dimension — same real-furniture-listing convention as the Poly Haven
  // pass. Symmetric ranges (office/dining chairs) make the choice moot.
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
// table, ping-pong table, ironing board). Checked in addition to NAME_SANITY.
const NAME_BLOCKLIST: Partial<Record<Bucket, RegExp>> = {
  diningTable: /pool table|billiard|ping.?pong|foosball|ironing/i,
  coffeeTable: /pool table|billiard|ping.?pong|foosball|ironing/i,
};

async function processOne(c: Candidate): Promise<{ row: AuditRow; catalogEntry: any | null }> {
  const detail = await fetchJSON<any>(`https://api.sketchfab.com/v3/models/${c.uid}`);
  if (detail.status !== 200 || !detail.body) {
    return {
      row: {
        uid: c.uid, name: c.uid, bucket: c.bucket, license: null, isDownloadable: false,
        faceCount: null, glbBytes: null, measuredXYZ: null, footprint: null, height: null,
        verdict: "FAIL", reason: `detail fetch failed (HTTP ${detail.status})`,
        httpDetailStatus: detail.status, httpDownloadStatus: null,
      },
      catalogEntry: null,
    };
  }
  const info = detail.body;
  const license = info.license ? { slug: info.license.slug, label: info.license.label } : null;
  const licenseOk = license && ["cc0", "by"].includes(license.slug);
  if (!licenseOk || !info.isDownloadable) {
    return {
      row: {
        uid: c.uid, name: info.name, bucket: c.bucket, license, isDownloadable: !!info.isDownloadable,
        faceCount: info.faceCount ?? null, glbBytes: null, measuredXYZ: null, footprint: null, height: null,
        verdict: "FAIL", reason: !licenseOk ? `license not cc0/by: ${license?.slug}` : "not downloadable",
        httpDetailStatus: detail.status, httpDownloadStatus: null,
      },
      catalogEntry: null,
    };
  }

  const dl = await fetchJSON<any>(`https://api.sketchfab.com/v3/models/${c.uid}/download`);
  if (dl.status !== 200 || !dl.body?.glb?.url) {
    return {
      row: {
        uid: c.uid, name: info.name, bucket: c.bucket, license, isDownloadable: true,
        faceCount: info.faceCount ?? null, glbBytes: null, measuredXYZ: null, footprint: null, height: null,
        verdict: "FAIL", reason: `download fetch failed (HTTP ${dl.status}) or no glb url`,
        httpDetailStatus: detail.status, httpDownloadStatus: dl.status,
      },
      catalogEntry: null,
    };
  }

  const slug = `${slugify(info.name)}-${c.uid.slice(0, 8)}`;
  const outGlb = path.join(OUT_DIR, `${slug}.glb`);
  const res = await fetch(dl.body.glb.url);
  if (!res.ok) {
    return {
      row: {
        uid: c.uid, name: info.name, bucket: c.bucket, license, isDownloadable: true,
        faceCount: info.faceCount ?? null, glbBytes: null, measuredXYZ: null, footprint: null, height: null,
        verdict: "FAIL", reason: `glb download HTTP ${res.status}`,
        httpDetailStatus: detail.status, httpDownloadStatus: dl.status,
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
        uid: c.uid, name: info.name, bucket: c.bucket, license, isDownloadable: true,
        faceCount: info.faceCount ?? null, glbBytes, measuredXYZ: null, footprint: null, height: null,
        verdict: "FAIL", reason: "unreadable glb / no POSITION bounds",
        httpDetailStatus: detail.status, httpDownloadStatus: dl.status,
      },
      catalogEntry: null,
    };
  }

  const [gx, gy, gz] = measured; // glTF is Y-up by spec; Sketchfab's own glb export follows spec.
  const dimCheck = c.bucket === "bed" ? checkBed(gx, gy, gz) : checkGeneric(c.bucket, gx, gy, gz);
  const nameOk = NAME_SANITY[c.bucket].test(info.name) && !NAME_BLOCKLIST[c.bucket]?.test(info.name);
  const check = {
    pass: dimCheck.pass && nameOk,
    footprint: dimCheck.pass && nameOk ? dimCheck.footprint : null,
    reason: !dimCheck.pass ? dimCheck.reason : !nameOk ? `name "${info.name}" doesn't match expected ${CATEGORY_LABEL[c.bucket]} keyword (dims passed but this isn't really one)` : dimCheck.reason,
  };

  const row: AuditRow = {
    uid: c.uid, name: info.name, bucket: c.bucket, license, isDownloadable: true,
    faceCount: info.faceCount ?? null, glbBytes, measuredXYZ: measured,
    footprint: check.footprint, height: gy,
    verdict: check.pass ? "PASS" : "FAIL", reason: check.reason,
    httpDetailStatus: detail.status, httpDownloadStatus: dl.status,
  };

  if (!check.pass || !check.footprint) {
    unlinkSync(outGlb);
    return { row, catalogEntry: null };
  }

  const thumb =
    info.thumbnails?.images?.find((im: any) => im.width >= 400 && im.width <= 700)?.url ??
    info.thumbnails?.images?.[info.thumbnails.images.length - 1]?.url ??
    null;

  const catalogEntry = {
    assetId: `sketchfab:${c.uid}`,
    name: info.name,
    category: c.category,
    footprint: check.footprint,
    ...(c.wallSnap ? { wallSnap: true } : {}),
    realModel: `/furniture/sketchfab/${slug}.glb`,
    thumbnail: thumb,
    brand: "Sketchfab",
    subtitle: c.subtitle,
    rooms: c.rooms,
  };

  return { row, catalogEntry };
}

async function main() {
  // Cumulative across repeated invocations (widening the shortlist pool):
  // load whatever a prior run already resolved, skip re-processing those
  // uids, and merge new results in.
  const priorRows: AuditRow[] = existsSync(REPORT_JSON) ? JSON.parse(readFileSync(REPORT_JSON, "utf8")) : [];
  const priorCatalog: any[] = existsSync(OUT_JSON) ? JSON.parse(readFileSync(OUT_JSON, "utf8")) : [];
  const rowsByUid = new Map<string, AuditRow>(priorRows.map((r) => [r.uid, r]));
  const catalogByAssetId = new Map<string, any>(priorCatalog.map((c) => [c.assetId, c]));

  const todo = CANDIDATES.filter((c) => !alreadyDone.has(c.uid));
  console.log(`${CANDIDATES.length} candidates selected, ${todo.length} not yet resolved, ${CANDIDATES.length - todo.length} skipped (already resolved in a prior run).`);

  const tallies: Record<string, { pass: number; fail: number }> = {};
  for (const c of todo) {
    process.stdout.write(`Processing ${CATEGORY_LABEL[c.bucket]} ${c.uid}... `);
    try {
      const { row, catalogEntry } = await processOne(c);
      rowsByUid.set(row.uid, row);
      if (catalogEntry) catalogByAssetId.set(catalogEntry.assetId, catalogEntry);
      const t = (tallies[c.bucket] ??= { pass: 0, fail: 0 });
      if (row.verdict === "PASS") t.pass++;
      else t.fail++;
      console.log(`${row.verdict} (${row.reason})`);
    } catch (e) {
      console.log(`ERROR ${(e as Error).message}`);
      rowsByUid.set(c.uid, {
        uid: c.uid, name: c.uid, bucket: c.bucket, license: null, isDownloadable: false,
        faceCount: null, glbBytes: null, measuredXYZ: null, footprint: null, height: null,
        verdict: "FAIL", reason: `error: ${(e as Error).message}`,
        httpDetailStatus: -1, httpDownloadStatus: null,
      });
      const t = (tallies[c.bucket] ??= { pass: 0, fail: 0 });
      t.fail++;
    }
    await new Promise((r) => setTimeout(r, 350));
  }

  const rows = [...rowsByUid.values()];
  const catalog = [...catalogByAssetId.values()];

  writeFileSync(REPORT_JSON, JSON.stringify(rows, null, 2));
  writeFileSync(OUT_JSON, JSON.stringify(catalog, null, 2));

  console.log(`\n${catalog.length} total items in catalog so far (cumulative). This run: ${todo.length} processed.`);
  console.log("This run per bucket:", JSON.stringify(tallies, null, 2));
  console.log(`Wrote ${path.relative(process.cwd(), OUT_JSON)}`);
  console.log(`Wrote ${path.relative(process.cwd(), REPORT_JSON)}`);
}

main();
