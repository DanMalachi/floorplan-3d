// Loads pages in a real (headless) browser and lists every Content-Security-Policy
// violation the CURRENT policy reports, grouped by directive and blocked resource.
// Use it before flipping CSP from Report-Only to enforced: an enforced policy blocks
// exactly what this lists.
//
//   BASE_URL=http://localhost:3100 node scripts/security/csp-audit.mjs
import { chromium } from "playwright";

const BASE = (process.env.BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const PAGES = (process.env.PAGES ?? "/,/about,/faq,/pricing,/design,/legal/privacy,/he,/he/design,/v/7f3d2c1b-4a5e-4f60-9c8d-0e1f2a3b4c5d").split(",");

const browser = await chromium.launch();
const seen = new Map();
for (const path of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      window.__csp.push({ d: e.effectiveDirective, b: e.blockedURI, s: (e.sample || "").slice(0, 60), disp: e.disposition }),
    );
  });
  try {
    await page.goto(BASE + path, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(4000);
    const v = await page.evaluate(() => window.__csp);
    for (const x of v) {
      const key = `${x.d} | ${x.b === "inline" ? "inline" : x.b}`;
      const e = seen.get(key) ?? { n: 0, pages: new Set(), sample: x.s };
      e.n++;
      e.pages.add(path);
      seen.set(key, e);
    }
    console.log(`${path}: ${v.length} violation event(s)`);
  } catch (e) {
    console.log(`${path}: FAILED to load — ${e.message.split("\n")[0]}`);
  }
  await ctx.close();
}
await browser.close();
console.log("\nviolations by directive | blocked resource");
for (const [k, v] of [...seen].sort()) console.log(`  ${String(v.n).padStart(4)}x  ${k}   pages: ${[...v.pages].join(" ")}`);
if (!seen.size) console.log("  none");
