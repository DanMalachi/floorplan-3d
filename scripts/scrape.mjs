// @ts-nocheck
/**
 * Tambour fan-deck scraper — one-time extraction of the 1651-shade fan.
 *
 * Two independent extraction paths run on every invocation; Path A wins if it
 * yields rows. Nothing here relies on hardcoded CSS selectors, because the
 * `moveo-theme` will rename them out from under us.
 *
 *   Path A (preferred): intercept every JSON response the page makes, deep-walk
 *     each payload, and find any array of objects where a field matches the
 *     shade-code format \d{4}[A-Z] (0077A, 0719D, 1097T). Field roles
 *     (code / hex / nameEn / nameHe / family) are then INFERRED by scoring each
 *     key against the values it holds — so it works no matter what Tambour named
 *     the fields.
 *   Path B (fallback): read computed background-color off every swatch-shaped
 *     element in the DOM.
 *
 * Usage:
 *   node scripts/scrape.mjs --url="https://…" [--headed]
 *   TAMBOUR_URL="https://…" node scripts/scrape.mjs --headed
 *
 * Outputs (all under out/, which is gitignored):
 *   out/network-captures.json  every JSON payload the page fetched
 *   out/dom-candidates.json     Path B swatch candidates
 *   out/raw-rows.json           merged winning rows — the input to normalize.mjs
 *   out/report.txt              human-readable summary + "JSON endpoints seen"
 */

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(ROOT, "out");

// ── args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const HEADED = argv.includes("--headed");
const urlArg = argv.find((a) => a.startsWith("--url="))?.slice("--url=".length);
const URL = urlArg || process.env.TAMBOUR_URL;

if (!URL) {
  console.error(
    [
      "✗ No target URL.",
      "  The Tambour fan-deck page URL is not baked in on purpose — supply it:",
      '    node scripts/scrape.mjs --url="https://www.tambour.co.il/…"',
      "  or:",
      '    TAMBOUR_URL="https://…" node scripts/scrape.mjs',
    ].join("\n"),
  );
  process.exit(2);
}

// ── shade-code + value predicates ─────────────────────────────────────────────
// A shade code is: 4-digit + letter (1564T), an off-white OWnnP (OW524P/OW11P),
// or a bare 3-digit (101/202). It's the last digit-bearing token of a title.
const CODE_RE = /\b(?:[A-Z]{1,3}\d{2,4}[A-Z]?|\d{3,4}[A-Z]?)\b/;
const HEX_RE = /^#?[0-9a-fA-F]{6}$/;
const RGB_RE = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/;
const HEBREW_RE = /[֐-׿]/;

const isStr = (v) => typeof v === "string";
// Guard against hex ("#AEA298") and rgb() being misread as a code — both would
// otherwise satisfy the broadened CODE_RE.
const looksLikeHex = (v) => isStr(v) && (HEX_RE.test(v.trim()) || RGB_RE.test(v.trim()));
const looksLikeCode = (v) => isStr(v) && !looksLikeHex(v) && CODE_RE.test(v.trim());
const hasHebrew = (v) => isStr(v) && HEBREW_RE.test(v);
const looksLatinName = (v) =>
  isStr(v) &&
  !hasHebrew(v) &&
  !looksLikeHex(v) &&
  /[A-Za-z]{2,}/.test(v) &&
  v.trim().length <= 48;
const isNumericStr = (v) =>
  typeof v === "number" || (isStr(v) && /^-?\d+(\.\d+)?$/.test(v.trim()));

/** The shade code is the last whitespace token containing a digit, e.g.
 *  "A Thousand Years 1564T" → "1564T"; "SWAN WING OW11P" → "OW11P". */
function extractCode(s) {
  const toks = String(s).trim().split(/\s+/);
  for (let i = toks.length - 1; i >= 0; i--) {
    if (/\d/.test(toks[i])) {
      const m = toks[i].match(CODE_RE);
      if (m) return m[0];
    }
  }
  const m = String(s).match(CODE_RE);
  return m ? m[0] : null;
}

// Canonical family tokens (EN + HE) so we can recognise a "family"/"group" field.
const FAMILY_TOKENS = [
  "white", "לבנים", "red", "אדומים", "orange", "כתומים", "yellow", "צהובים",
  "green", "ירוקים", "blue", "כחולים", "purple", "סגולים", "neutral", "נייטרלים",
];
const looksLikeFamily = (v) =>
  isStr(v) && FAMILY_TOKENS.some((t) => v.toLowerCase().includes(t.toLowerCase()));

// ── deep-walk helpers ─────────────────────────────────────────────────────────

/** Yield every array found anywhere in `node` whose elements are mostly objects. */
function* candidateArrays(node, path = "$", seen = new Set()) {
  if (!node || typeof node !== "object") return;
  if (seen.has(node)) return;
  seen.add(node);

  if (Array.isArray(node)) {
    const objs = node.filter((e) => e && typeof e === "object" && !Array.isArray(e));
    if (objs.length >= 3 && objs.length / node.length >= 0.5) {
      yield { path, arr: objs };
    }
    for (let i = 0; i < node.length; i++) {
      yield* candidateArrays(node[i], `${path}[${i}]`, seen);
    }
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    yield* candidateArrays(v, `${path}.${k}`, seen);
  }
}

/** Flatten one nesting level so `{color:{hex:"#.."}}` exposes `color.hex`. */
function flattenRow(row) {
  const flat = {};
  for (const [k, v] of Object.entries(row)) {
    if (v == null) continue;
    if (typeof v === "object" && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v)) {
        if (v2 != null && typeof v2 !== "object") flat[`${k}.${k2}`] = v2;
      }
    } else if (typeof v !== "object") {
      flat[k] = v;
    }
  }
  return flat;
}

/** Fraction of rows for which key `k` satisfies `pred`. */
function score(rows, k, pred) {
  let hits = 0;
  for (const r of rows) if (pred(r[k])) hits++;
  return hits / rows.length;
}

/** Argmax key by predicate score, above `min`; `exclude` skips already-claimed keys. */
function bestKey(rows, keys, pred, min, exclude = new Set()) {
  let best = null;
  let bestScore = min;
  for (const k of keys) {
    if (exclude.has(k)) continue;
    const s = score(rows, k, pred);
    if (s > bestScore) {
      bestScore = s;
      best = k;
    }
  }
  return best;
}

/**
 * Given a candidate array of objects, decide whether it's a shade list and,
 * if so, map each row to {code, hex, nameEn, nameHe, family}. Returns null when
 * no key reads as a shade code across the rows.
 */
function extractRows(objs, endpoint) {
  const rows = objs.map(flattenRow);
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];

  const codeKey = bestKey(rows, keys, looksLikeCode, 0.5);
  if (!codeKey) return null; // not a shade list

  const claimed = new Set([codeKey]);
  const hexKey = bestKey(rows, keys, looksLikeHex, 0.4, claimed);
  if (hexKey) claimed.add(hexKey);
  // A second colour field (e.g. rgb_value) — fallback when the primary hex is
  // corrupt in the feed (Tambour ships a few "#2.36E+100" / dropped-digit hexes).
  const hexAltKey = bestKey(rows, keys, looksLikeHex, 0.4, claimed);
  if (hexAltKey) claimed.add(hexAltKey);
  const heKey = bestKey(rows, keys, hasHebrew, 0.3, claimed);
  if (heKey) claimed.add(heKey);
  const enKey = bestKey(rows, keys, looksLatinName, 0.3, claimed);
  if (enKey) claimed.add(enKey);
  const famKey = bestKey(rows, keys, looksLikeFamily, 0.3, claimed);
  // Ordering field (the fan "position"): a numeric field that lets normalize
  // recover Tambour's families even when no family field is present.
  const posKey = keys.find(
    (k) =>
      /(^|[._])(position|order|sort|seq|index|pos)([._]|$)/i.test(k) &&
      !claimed.has(k) &&
      score(rows, k, isNumericStr) >= 0.8,
  );

  const mapping = { codeKey, hexKey, hexAltKey, enKey, heKey, famKey, posKey: posKey || null };
  const out = [];
  for (const r of rows) {
    const rawCode = String(r[codeKey] ?? "");
    const code = extractCode(rawCode);
    if (!code) continue;
    // Prefer a dedicated latin-name field; otherwise the code field itself is
    // "Name CODE" (e.g. "Fine Day OW524P"), so strip the code to get the name.
    const nameEn = enKey
      ? String(r[enKey]).trim()
      : rawCode.replace(code, "").replace(/\s+/g, " ").trim();
    out.push({
      code,
      hex: hexKey ? String(r[hexKey]).trim() : null,
      hexAlt: hexAltKey ? String(r[hexAltKey]).trim() : null,
      nameEn: nameEn || null,
      nameHe: heKey ? String(r[heKey]).trim() : null,
      family: famKey ? String(r[famKey]).trim() : null,
      position: posKey && isNumericStr(r[posKey]) ? Number(r[posKey]) : null,
      _endpoint: endpoint,
      _source: "A",
    });
  }
  return out.length ? { rows: out, mapping } : null;
}

// ── accordion / lazy-content coaxing ──────────────────────────────────────────
/**
 * Best-effort: open every collapsed section so all families load (and fire the
 * XHRs Path A listens for). Theme-agnostic — we click anything that reads like
 * an expandable header rather than trusting a selector.
 */
async function openEverything(page) {
  for (let pass = 0; pass < 4; pass++) {
    // Native <details>
    await page.evaluate(() => {
      document.querySelectorAll("details:not([open])").forEach((d) => (d.open = true));
    });
    // Collapsed ARIA / family-labelled headers
    const clickables = page.locator(
      '[aria-expanded="false"], summary, [role="button"], button, a',
    );
    const n = await clickables.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const el = clickables.nth(i);
      const txt = ((await el.innerText().catch(() => "")) || "").trim();
      const expanded = await el.getAttribute("aria-expanded").catch(() => null);
      if (expanded === "false" || looksLikeFamily(txt)) {
        await el.click({ timeout: 800 }).catch(() => {});
      }
    }
    // Nudge lazy loaders
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(700);
  }
}

// ── Path B: DOM swatches ──────────────────────────────────────────────────────
async function domSwatches(page) {
  return page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      const bg = cs.backgroundColor;
      if (!bg || bg === "transparent") continue;
      const m = bg.match(/rgba?\(([^)]+)\)/);
      if (!m) continue;
      const [r, g, b, a = "1"] = m[1].split(",").map((s) => s.trim());
      if (Number(a) === 0) continue;
      const rect = el.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      // swatch-shaped: smallish and roughly square
      if (w < 12 || w > 140 || h < 12 || h > 140) continue;
      if (Math.abs(w - h) > Math.max(w, h) * 0.6) continue;
      const text = (
        el.getAttribute("aria-label") ||
        el.getAttribute("title") ||
        el.textContent ||
        ""
      )
        .trim()
        .slice(0, 80);
      out.push({ rgb: [Number(r), Number(g), Number(b)], text });
    }
    return out;
  });
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  await mkdir(OUT, { recursive: true });

  const captures = []; // { url, status, contentType, json }
  const endpointsSeen = new Set();

  const browser = await chromium.launch({ headless: !HEADED });
  const ctx = await browser.newContext({ locale: "he-IL" });
  const page = await ctx.newPage();

  page.on("response", async (res) => {
    try {
      const url = res.url();
      const ct = res.headers()["content-type"] || "";
      if (!/json/i.test(ct) && !/\.json(\?|$)/i.test(url)) return;
      endpointsSeen.add(url.split("?")[0]);
      const json = await res.json();
      captures.push({ url, status: res.status(), contentType: ct, json });
    } catch {
      /* non-JSON / opaque / nonce-locked — ignore, Path B has us covered */
    }
  });

  console.log(`→ navigating ${URL} (${HEADED ? "headed" : "headless"})`);
  await page.goto(URL, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
  await openEverything(page);
  await page.waitForTimeout(1500);

  // ── Path A ──────────────────────────────────────────────────────────────────
  const pathAByEndpoint = [];
  let winningRows = [];
  const mappingsLog = [];
  for (const cap of captures) {
    for (const { path, arr } of candidateArrays(cap.json)) {
      const res = extractRows(arr, cap.url);
      if (res) {
        pathAByEndpoint.push({ endpoint: cap.url, path, count: res.rows.length });
        mappingsLog.push({ endpoint: cap.url, path, mapping: res.mapping, count: res.rows.length });
        winningRows.push(...res.rows);
      }
    }
  }

  // ── Path B ──────────────────────────────────────────────────────────────────
  const domCandidates = await domSwatches(page).catch(() => []);

  await browser.close();

  // Path A wins if it produced anything.
  const pathUsed = winningRows.length ? "A" : "B";
  if (pathUsed === "B") {
    // Shape Path B into the same row schema (no reliable codes/names).
    winningRows = domCandidates.map((c) => {
      const codeMatch = c.text.match(CODE_RE);
      return {
        code: codeMatch ? codeMatch[0] : null,
        hex: `rgb(${c.rgb.join(",")})`,
        hexAlt: null,
        nameEn: null,
        nameHe: hasHebrew(c.text) ? c.text : null,
        family: null,
        position: null,
        _endpoint: null,
        _source: "B",
      };
    });
  }

  // ── write outputs ─────────────────────────────────────────────────────────────
  await writeFile(resolve(OUT, "network-captures.json"), JSON.stringify(captures, null, 2));
  await writeFile(resolve(OUT, "dom-candidates.json"), JSON.stringify(domCandidates, null, 2));
  await writeFile(resolve(OUT, "raw-rows.json"), JSON.stringify(winningRows, null, 2));

  const report = [];
  report.push("Tambour fan-deck scrape report");
  report.push("=".repeat(60));
  report.push(`url:          ${URL}`);
  report.push(`mode:         ${HEADED ? "headed" : "headless"}`);
  report.push(`path used:    ${pathUsed}${pathUsed === "B" ? "  (⚠ fallback — Path A found no shade list)" : ""}`);
  report.push(`rows found:   ${winningRows.length}  (expected 1651)`);
  report.push(`json payloads captured: ${captures.length}`);
  report.push("");
  report.push("Path A qualifying arrays:");
  if (pathAByEndpoint.length === 0) report.push("  (none)");
  for (const e of pathAByEndpoint) report.push(`  ${e.count} rows  ${e.path}  ← ${e.endpoint}`);
  report.push("");
  report.push("Inferred field mappings:");
  for (const m of mappingsLog) {
    report.push(`  ${m.endpoint}`);
    report.push(`    ${JSON.stringify(m.mapping)}  (${m.count} rows)`);
  }
  report.push("");
  report.push(`Path B swatch candidates: ${domCandidates.length}`);
  report.push("");
  report.push("JSON endpoints seen:");
  for (const ep of [...endpointsSeen].sort()) report.push(`  ${ep}`);
  report.push("");
  const reportText = report.join("\n");
  await writeFile(resolve(OUT, "report.txt"), reportText);

  console.log("\n" + reportText);
  console.log(`\n✓ wrote out/raw-rows.json (${winningRows.length} rows). Next: node scripts/normalize.mjs`);
  // The feed carries a few off-fan extras on top of the 1651 fan shades, so
  // ≥1651 is healthy; normalize trims to exactly 1651 and prints the checksum.
  if (winningRows.length < 1651) {
    console.log(`⚠ only ${winningRows.length} rows (< 1651) — scrape likely incomplete; see out/report.txt.`);
  }
}

main().catch((err) => {
  console.error("scrape failed:", err);
  process.exit(1);
});
