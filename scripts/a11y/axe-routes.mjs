// Accessibility gate: axe-core over the public routes and the editor, in
// English and Hebrew, dark and light. Fails on any WCAG 2.0/2.1 A or AA
// violation (IS 5568 is WCAG 2.0 AA; 2.1 is checked too because it is cheap).
//
//   npm run build && npx next start -p 3100 &
//   BASE=http://localhost:3100 node scripts/a11y/axe-routes.mjs
//
// Runs in nextjs-ci against `next start`. What axe cannot see (the 3D canvas,
// a screen reader's actual speech, focus order that is legal but unhelpful)
// is in docs/ACCESSIBILITY.md; this only stops the machine-checkable part from
// sliding back.
//
// axe-core (MPL-2.0) comes in through eslint-config-next's jsx-a11y plugin and
// is injected into the page under test only; it never ships to visitors.

import { createRequire } from "node:module";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const AXE = require.resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3100";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const ROUTES = ["/", "/legal/accessibility", "/report", "/design"];
const LOCALES = ["", "/he"];
const THEMES = ["dark", "light"];

const browser = await chromium.launch({
  // The editor draws with WebGL; software GL keeps it from failing headless.
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

let failed = 0;
async function check(page, label) {
  if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ path: AXE });
  const violations = await page.evaluate(async (tags) => {
    const r = await window.axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] });
    return r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 5).map((n) => n.target.join(" ")),
      count: v.nodes.length,
    }));
  }, TAGS);
  if (!violations.length) {
    console.log(`ok    ${label}`);
    return;
  }
  failed += violations.length;
  console.log(`FAIL  ${label}`);
  for (const v of violations) {
    console.log(`      ${v.impact} ${v.id} (${v.count}): ${v.help}`);
    for (const n of v.nodes) console.log(`        ${n}`);
  }
}

for (const theme of THEMES) {
  for (const loc of LOCALES) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    // The site and the editor both read their theme from here.
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem("planDock:theme", t);
      } catch {}
    }, theme);
    const page = await ctx.newPage();
    for (const route of ROUTES) {
      const url = `${BASE}${loc}${route === "/" && loc ? "" : route}`;
      const label = `${loc || "/en"}${route} (${theme})`;
      await page.goto(url, { waitUntil: "load" });
      if (route === "/design") {
        // A fresh visitor gets the welcome dialog: check it, then the editor.
        await page.waitForSelector('[role="dialog"][aria-modal="true"]', { timeout: 90_000 });
        await page.waitForTimeout(800);
        await check(page, `${label} welcome`);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);
        await check(page, `${label} editor`);
        await page.click('[data-guide="help-button"]');
        await page.waitForSelector('aside[role="dialog"]');
        await check(page, `${label} help panel`);
      } else {
        await page.waitForTimeout(800);
        await check(page, label);
      }
    }
    await ctx.close();
  }
}

await browser.close();
if (failed) {
  console.log(`\n${failed} violation group(s).`);
  process.exit(1);
}
console.log("\nNo WCAG A/AA violations found by axe.");
