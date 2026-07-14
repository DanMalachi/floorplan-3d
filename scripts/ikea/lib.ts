/**
 * IKEA furniture pipeline — shared endpoint + fetch layer.
 *
 * ⚠️ PROTOTYPE / PERSONAL USE ONLY. Calls IKEA's internal, unpublished JSON APIs
 * (the same ones their website/planner use). Deliberately low-volume, sequential,
 * rate-limited, and disk-cached so dev re-runs never re-hit IKEA. NOT a production
 * data source — a real build would use IKEA's affiliate program or a licensed feed.
 *
 * Endpoint shapes reimplemented in TS from https://github.com/vrslev/ikea-api-client
 * (read for reference only — no Python dependency). Verified against the IL market.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

// ── Market ───────────────────────────────────────────────────────────────────
// IKEA Israel is a franchise market but IS served by the global APIs — only under
// language `he`, not `en` (verified: il/en → 404, il/he → 200). Product text comes
// back in Hebrew (IngkaItems additionally carries he/en/ar side by side).
export const COUNTRY = "il";
export const LANGUAGE = "he";

// Browser UA from the reference client — these endpoints reject obvious bots.
export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/14.0.3 Safari/605.1.15";

// Public web-app client id required by the IngkaItems (salesitem) endpoint. Not a
// secret — it ships in IKEA's own front-end. Same disclaimer as the file header.
export const INGKA_CLIENT_ID = "c4faceb6-0598-44a2-bae4-2c02f4019d06";

// Politeness: sequential only, randomized pause before every LIVE request.
const MIN_DELAY_MS = 300;
const MAX_DELAY_MS = 500;

export const RAW_DIR = path.resolve("data/raw/ikea");
export const CACHE_DIR = path.join(RAW_DIR, "_cache");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () =>
  MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));

export interface FetchResult {
  ok: boolean;
  status: number;
  json: unknown;
  cached: boolean;
}

/**
 * GET JSON with an on-disk cache keyed by URL+headers. A cache hit touches neither
 * the network nor the politeness delay. Never throws on HTTP errors — returns the
 * status so callers can treat e.g. a Rotera 404 as "no model" rather than a crash.
 */
export async function cachedGetJson(
  url: string,
  headers: Record<string, string> = {},
): Promise<FetchResult> {
  const key = createHash("sha1")
    .update(url + JSON.stringify(headers))
    .digest("hex")
    .slice(0, 16);
  const cacheFile = path.join(CACHE_DIR, `${key}.json`);

  if (existsSync(cacheFile)) {
    return { ...JSON.parse(await readFile(cacheFile, "utf8")), cached: true };
  }

  await sleep(jitter()); // pause BEFORE the live call so bursts never happen
  let record: { ok: boolean; status: number; json: unknown };
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "*/*",
        "Accept-Language": LANGUAGE,
        ...headers,
      },
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { _nonJsonBody: text.slice(0, 500) };
    }
    record = { ok: res.ok, status: res.status, json };
  } catch (err) {
    // Network error / timeout — record it so re-runs retry, don't cache it.
    return { ok: false, status: 0, json: { _error: String(err) }, cached: false };
  }

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cacheFile, JSON.stringify(record, null, 2), "utf8");
  return { ...record, cached: false };
}

// ── Endpoints ────────────────────────────────────────────────────────────────

/** Search — auth-free. Discovery layer: itemNo, price, url, category path, color. */
export function searchUrl(query: string, size: number): string {
  const params = new URLSearchParams({
    q: query,
    types: "PRODUCT",
    size: String(size),
    c: "sr",
    v: "20210322",
    autocorrect: "true",
    "subcategories-style": "tree-navigation",
  });
  return `https://sik.search.blue.cdtapps.com/${COUNTRY}/${LANGUAGE}/search-result-page?${params}`;
}

/**
 * IngkaItems (salesitem) — needs INGKA_CLIENT_ID. Detail layer: structured
 * measurements, materials, typed media, designers, description. Accepts a BATCH of
 * bare 8-digit item numbers (no ART/SPR prefix). Path uses classUnitType/code:
 * `RU/il` = retail unit Israel (NOT a country/lang pair — the reference's "ru" was
 * the classUnitType, not "Russia").
 */
export function ingkaUrl(itemNos: string[]): string {
  const params = new URLSearchParams({ itemNos: itemNos.join(","), languages: LANGUAGE });
  return `https://api.ingka.ikea.com/salesitem/communications/RU/${COUNTRY}?${params}`;
}
export const ingkaHeaders = {
  "X-Client-Id": INGKA_CLIENT_ID,
  Referer: `https://www.ikea.com/${COUNTRY}/${LANGUAGE}/order/delivery/`,
};

/**
 * Rotera — auth-free planner asset endpoint. Returns a Draco-compressed glTF (.glb)
 * 3D model (usable directly in React Three Fiber) plus structured measurements, when
 * a model exists for the item. Coverage is partial — many items 404 here.
 */
export function roteraUrl(itemNo: string): string {
  return `https://www.ikea.com/global/assets/rotera/resources/${itemNo}.json`;
}

// ── Minimal shapes we read (endpoints return far more) ──────────────────────
export interface SearchProduct {
  name: string;
  itemNo: string;
  itemNoGlobal?: string;
  itemType: string; // "ART" (single article) | "SPR" (combination)
  typeName?: string;
  salesPrice?: { numeral?: number; currencyCode?: string };
  mainImageUrl?: string;
  contextualImageUrl?: string;
  pipUrl?: string;
  colors?: { name: string; id: string; hex: string }[];
  itemMeasureReferenceText?: string;
  categoryPath?: { name: string; key: string }[];
}

export function searchItems(json: unknown): SearchProduct[] {
  const items = (json as any)?.searchResultPage?.products?.main?.items ?? [];
  return items.map((i: any) => i.product).filter(Boolean);
}

/** Index a batched IngkaItems response by bare item number. */
export function indexIngka(json: unknown): Map<string, any> {
  const arr: any[] = Array.isArray(json) ? json : (json as any)?.data ?? [];
  const map = new Map<string, any>();
  for (const it of arr) {
    const no = it?.itemKey?.itemNo ?? it?.itemKeyGlobal?.itemNo;
    if (no) map.set(String(no), it);
  }
  return map;
}

// ── Measurements ─────────────────────────────────────────────────────────────
// IngkaItems reports dimensions only as localized text ("214 ס\"מ"), mixed with
// non-length facts ("53 וואט"). The `type` code, however, is stable and
// language-independent, and aligns 1:1 with Rotera's English labels (verified by
// value-matching across the corpus). So we map by CODE, parse the numeric value,
// and normalize every length to cm — a "2 m" bed then reads as 200.
export const DIMENSION_CODES: Record<string, keyof Dimensions> = {
  "00047": "width",
  "00044": "depth",
  "00041": "height",
  "00040": "height", // min height (adjustable) — max() keeps the tallest
  "00082": "height", // max height (adjustable)
  "00414": "height", // height incl. back cushions — the true overall height
  "00001": "length",
  "00003": "length", // max length (extendable tables)
  "00029": "length", // bed length
  "00042": "diameter",
  "00116": "width", // frame width (KALLAX/BILLY-style shelf units)
  "00117": "depth", // frame depth
  "00118": "height", // frame height
  "00126": "width", // table width
  "00127": "height", // table height
  "00128": "length", // table length
};
// Codes we deliberately DON'T fold into the bounding box (seat/part/accessory
// dimensions), kept in `all` for reference but never used as the footprint.
export const SECONDARY_CODES: Record<string, string> = {
  "00039": "seat_height",
  "00036": "seat_depth",
  "00037": "seat_width",
  "00413": "backrest_height",
  "00242": "free_height",
  "00035": "thickness",
  "00026": "cord_length",
  "00027": "shade_diameter",
  "00028": "base_diameter",
};

const CM = 'ס"מ', MM = 'מ"מ', M_A = "מטר", M_B = "מ'";
const LEN_RE = new RegExp(`([\\d.,]+)\\s*(${CM}|${MM}|${M_A}|${M_B})`);

/** Parse a localized measurement string to centimetres, or null if not a length. */
export function parseCm(textMetric: string): number | null {
  const m = textMetric?.match(LEN_RE);
  if (!m) return null; // not a length (watts, litres, kg, …) → excluded
  let v = parseFloat(m[1].replace(/,/g, ""));
  if (!isFinite(v)) return null;
  if (m[2] === MM) v /= 10;
  if (m[2] === M_A || m[2] === M_B) v *= 100;
  return Math.round(v * 10) / 10;
}

export interface Dimensions {
  width?: number;
  depth?: number;
  height?: number;
  length?: number;
  diameter?: number;
}

// Part-qualifier words: a length labelled with one of these describes a sub-part
// (seat, armrest, shade, base, cord, cavity, drawer, door…), never the footprint.
const PART_WORDS = /מושב|משענת|אהיל|בסיס|כבל|חלל|ריפוד|כרית|נורה|מגירה|דלת|תווית|חבל/;

/** Infer a bounding-box axis from a Hebrew measurement label, or null. Used only
 *  for measurements whose numeric `type` code we don't explicitly recognise — lets
 *  new/product-specific codes (frame, table, …) still land on the right axis. */
export function axisFromName(name: string | undefined): keyof Dimensions | null {
  const n = name ?? "";
  if (PART_WORDS.test(n)) return null;
  if (/רוחב/.test(n)) return "width"; // width
  if (/עומק/.test(n)) return "depth"; // depth
  if (/גובה/.test(n)) return "height"; // height
  if (/אורך/.test(n)) return "length"; // length
  if (/קוטר/.test(n)) return "diameter"; // diameter
  return null;
}

/** Reduce a detailedMeasurements array to canonical cm dims (max on collision).
 *  Known codes win; unknown length codes fall back to Hebrew-label inference. */
export function dimsFromDetailed(detailed: any[] | undefined): Dimensions {
  const out: Record<string, number> = {};
  for (const m of detailed ?? []) {
    if (m?.type in SECONDARY_CODES) continue; // seat/part dim — never footprint
    const key = DIMENSION_CODES[m?.type] ?? axisFromName(m?.typeName);
    if (!key) continue;
    const cm = parseCm(m.textMetric);
    if (cm == null) continue;
    out[key] = Math.max(out[key] ?? 0, cm);
  }
  return out;
}

/** Fill only the axes missing from `target` using `source` (non-destructive merge). */
export function fillDims(target: Dimensions, source: Dimensions): Dimensions {
  for (const k of ["width", "depth", "height", "length", "diameter"] as const)
    if (target[k] == null && source[k] != null) target[k] = source[k];
  return target;
}

/** Element-wise max of several dimension sets — how a combo's footprint is built
 *  from its child articles (the main frame drives each axis; covers are smaller). */
export function maxDims(sets: Dimensions[]): Dimensions {
  const keys = ["width", "depth", "height", "length", "diameter"] as const;
  const out: Dimensions = {};
  for (const k of keys) {
    const vals = sets.map((s) => s[k]).filter((v): v is number => v != null);
    if (vals.length) out[k] = Math.max(...vals);
  }
  return out;
}

/** Pull the Hebrew (fallback first-available) localised block from an Ingka item. */
export function heBlock(ingka: any): any {
  const lc = ingka?.localisedCommunications ?? [];
  return lc.find((l: any) => l.languageCode === LANGUAGE) ?? lc[0] ?? null;
}
