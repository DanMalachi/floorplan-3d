/**
 * IKEA furniture pipeline — Phase 1a proof of concept.
 *
 * ⚠️ PROTOTYPE / PERSONAL USE ONLY.
 * This calls IKEA's *internal, unpublished* JSON APIs (the same ones their own
 * website and planner tools use). It is deliberately low-volume, sequential, and
 * rate-limited, and it caches every raw response to disk so re-runs during
 * development never re-hit IKEA's servers. It is NOT a production data source.
 * A production build would use IKEA's affiliate program or a licensed data
 * provider instead of these endpoints.
 *
 * Endpoint shapes are reimplemented in TS from the documentation in
 * https://github.com/vrslev/ikea-api-client (read for reference only — no Python
 * dependency is pulled in).
 *
 * Run:  npx tsx scripts/ikea/poc.ts
 *
 * Phase 1a scope (STOPS after this):
 *   1. one category (sofas), Israel market
 *   2. search + fetch full item detail for 5 products
 *   3. dump the full raw JSON of ONE item so we can see every available field
 *   4. try the Rotera endpoint for those item codes and report what it returns
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

// ── Market / config ─────────────────────────────────────────────────────────
// Israel is a *franchise* market. Its data is served under language `he`, NOT
// `en` (verified: il/en → 404, il/he → 200). So product names/descriptions come
// back in Hebrew — fine, and consistent with the rest of this project's domain.
const COUNTRY = "il";
const LANGUAGE = "he";

// Search query for the "sofas" category, in Hebrew ("ספה").
const SOFA_QUERY = "ספה";

// Browser UA lifted from the reference client — these endpoints reject obvious bots.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/14.0.3 Safari/605.1.15";

// Politeness: sequential requests only, with a randomized pause between each.
const MIN_DELAY_MS = 300;
const MAX_DELAY_MS = 500;

const RAW_DIR = path.resolve("data/raw/ikea");
const CACHE_DIR = path.join(RAW_DIR, "_cache");

// ── Tiny helpers ─────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () =>
  MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));

/**
 * Fetch JSON with an on-disk cache keyed by URL. A cached hit does NOT touch the
 * network and does NOT incur the politeness delay. Returns `{ ok, status, json }`
 * so callers can report 404s (e.g. Rotera misses) instead of throwing.
 */
async function cachedGetJson(
  url: string,
  extraHeaders: Record<string, string> = {},
): Promise<{ ok: boolean; status: number; json: unknown; cached: boolean }> {
  const key = createHash("sha1").update(url).digest("hex").slice(0, 16);
  const cacheFile = path.join(CACHE_DIR, `${key}.json`);

  if (existsSync(cacheFile)) {
    const cached = JSON.parse(await readFile(cacheFile, "utf8"));
    return { ...cached, cached: true };
  }

  // Live request — pause first so bursts never happen.
  await sleep(jitter());
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "*/*",
      "Accept-Language": LANGUAGE,
    },
    ...extraHeaders,
  });

  let json: unknown = null;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _nonJsonBody: text.slice(0, 500) };
  }

  const record = { ok: res.ok, status: res.status, json };
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cacheFile, JSON.stringify(record, null, 2), "utf8");
  return { ...record, cached: false };
}

// ── Endpoints (reimplemented from the reference client) ─────────────────────
// 1. Search — auth-free. Returns rich per-hit product data already.
function searchUrl(query: string, size: number): string {
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

// 2. PIP item detail — auth-free public product JSON. URL uses the last 3 digits
//    of the item code as a folder, and an `s` prefix for combinations (SPR).
function pipUrl(itemNo: string, itemType: string): string {
  const isCombination = itemType === "SPR";
  const folder = itemNo.slice(5);
  const file = `${isCombination ? "s" : ""}${itemNo}`;
  return `https://www.ikea.com/${COUNTRY}/${LANGUAGE}/products/${folder}/${file}.json`;
}

// 3. Rotera — the endpoint IKEA's planner uses. Auth-free. We want to know if it
//    yields a usable 3D/model reference or just proprietary planner metadata.
function roteraUrl(itemNo: string): string {
  return `https://www.ikea.com/global/assets/rotera/resources/${itemNo}.json`;
}

// ── Types (only the fields we read off search) ──────────────────────────────
interface SearchProduct {
  name: string;
  itemNo: string;
  itemType: string; // "ART" (article) | "SPR" (combination)
  salesPrice?: { numeral?: number; currencyCode?: string };
  pipUrl?: string;
  categoryPath?: { name: string; key: string }[];
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  await mkdir(RAW_DIR, { recursive: true });

  console.log("=".repeat(72));
  console.log(`IKEA Phase 1a POC — market=${COUNTRY}/${LANGUAGE}, category=sofas`);
  console.log("=".repeat(72));

  // 1. Search the sofas category.
  const sUrl = searchUrl(SOFA_QUERY, 5);
  console.log(`\n[search] ${sUrl}`);
  const search = await cachedGetJson(sUrl);
  if (!search.ok) {
    console.error(`[search] FAILED status=${search.status}. Stopping.`);
    process.exit(1);
  }
  const items: { product: SearchProduct }[] =
    (search.json as any)?.searchResultPage?.products?.main?.items ?? [];
  console.log(`[search] ${items.length} products (cached=${search.cached})`);

  const products = items.map((i) => i.product).slice(0, 5);
  for (const p of products) {
    console.log(
      `   • ${p.name.padEnd(14)} itemNo=${p.itemNo} type=${p.itemType} ` +
        `${p.salesPrice?.numeral} ${p.salesPrice?.currencyCode}`,
    );
  }

  // 2. Fetch full PIP detail for each of the 5, saving raw JSON per item.
  const pipResults: { p: SearchProduct; ok: boolean; status: number; json: unknown }[] =
    [];
  for (const p of products) {
    const url = pipUrl(p.itemNo, p.itemType);
    const r = await cachedGetJson(url);
    console.log(
      `\n[pip] ${p.name} → status=${r.status} cached=${r.cached}\n      ${url}`,
    );
    if (r.ok) {
      await writeFile(
        path.join(RAW_DIR, `pip_${p.itemNo}.json`),
        JSON.stringify(r.json, null, 2),
        "utf8",
      );
    }
    pipResults.push({ p, ok: r.ok, status: r.status, json: r.json });
  }

  // 3. Dump the FULL raw JSON of one successful item so we can see every field.
  const sample = pipResults.find((r) => r.ok);
  console.log("\n" + "=".repeat(72));
  if (sample) {
    console.log(`FULL RAW PIP JSON — ${sample.p.name} (${sample.p.itemNo})`);
    console.log("=".repeat(72));
    console.log(JSON.stringify(sample.json, null, 2));
    // Also print just the top-level keys as a quick field map.
    console.log("\n--- top-level keys of the PIP payload ---");
    console.log(Object.keys(sample.json as object).join(", "));
  } else {
    console.log("No PIP item fetched successfully — cannot dump a sample.");
    console.log("Statuses:", pipResults.map((r) => `${r.p.itemNo}:${r.status}`).join(" "));
  }

  // 4. Try Rotera for each of the 5 item codes; report what comes back.
  console.log("\n" + "=".repeat(72));
  console.log("ROTERA probe (3D/planner reference?)");
  console.log("=".repeat(72));
  for (const p of products) {
    const url = roteraUrl(p.itemNo);
    const r = await cachedGetJson(url);
    if (r.ok) {
      const keys = r.json && typeof r.json === "object"
        ? Object.keys(r.json as object)
        : [];
      console.log(`   ✓ ${p.itemNo} (${p.name}) HIT — top keys: ${keys.join(", ")}`);
      await writeFile(
        path.join(RAW_DIR, `rotera_${p.itemNo}.json`),
        JSON.stringify(r.json, null, 2),
        "utf8",
      );
    } else {
      console.log(`   ✗ ${p.itemNo} (${p.name}) status=${r.status}`);
    }
  }

  console.log("\nDone. Raw responses cached under data/raw/ikea/_cache/.");
  console.log("STOP — Phase 1a. Review field names before the full extraction script.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
