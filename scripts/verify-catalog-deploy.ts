/**
 * Deploy guard for the furniture catalogs.
 *
 * Every root-relative asset path in `data/*.catalog.json` is served out of
 * `public/`. This script answers one question offline: would each of them
 * actually be there in production?
 *
 * The predicate that governs THIS repo is `.vercelignore`, not `.gitignore`.
 * Deploys ship with `vercel --prod --yes --scope dans-projects7`, and the CLI
 * uploads the working tree minus `.vercelignore`. One asset class sits in git's
 * blind spot and ships anyway: the held-back KTX2 models, which `.vercelignore`
 * excludes in any case. A guard that equated "in the commit" with "in
 * production" would report it as broken and be wrong.
 *
 * The IKEA picker thumbnails USED to be a second such class, ignored by git and
 * shipped by the CLI. That made a `git push origin main` — a Git-integration
 * deploy, which has only the commit — 404 all 280 of them on production, on
 * 2026-08-31. They are committed as of 2026-09-01, so the WARN below should now
 * be silent, and a WARN is a finding rather than expected noise.
 *
 * So there are two findings, and they are NOT the same severity:
 *
 *   FAIL - the file is missing from disk, or `.vercelignore` excludes it. It
 *          would 404 in production. A deploy blocker.
 *   WARN - it ships from this working tree but is not in git, so a clean
 *          checkout, another machine, CI, or a Vercel Git-integration deploy
 *          would not have it. No asset class is exempt from this any more:
 *          treat every line as something to commit or to justify.
 *
 * Absolute URLs are skipped. The IKEA models live on Vercel Blob and are not in
 * this repo at all, so neither predicate has anything to say about them; proving
 * those resolve is a live network check, a different job.
 *
 * Run: npx tsx scripts/verify-catalog-deploy.ts   (npm run furniture:verify-deploy)
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve("data");

/**
 * The `.vercelignore` subset this repo actually uses, matched faithfully.
 *
 * Deliberately NOT a full gitignore implementation. It recognises three forms
 * and THROWS on anything else, because a matcher that silently skips a pattern
 * it cannot parse under-reports - the same class of failure as the bug this file
 * exists to catch, wearing a different hat. If `.vercelignore` grows a negation
 * or a `**`, this stops and says so rather than quietly passing.
 */
function compileIgnore(text: string): (repoRelPath: string) => boolean {
  const dirPrefixes: string[] = [];
  const anchoredGlobs: RegExp[] = [];
  const basenameGlobs: RegExp[] = [];

  // `*` matches within one path segment, as in gitignore.
  const globToRe = (glob: string, anchored: boolean) => {
    const body = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
    return new RegExp(anchored ? `^${body}$` : `(^|/)${body}$`);
  };

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (/[!?[\]]|\*\*/.test(line)) {
      throw new Error(
        `.vercelignore pattern "${line}" uses a form this matcher does not implement ` +
          `(negation, **, ? or a character class). Extend compileIgnore rather than ` +
          `letting it under-report.`,
      );
    }
    const pattern = line.replace(/^\//, "");
    if (pattern.endsWith("/")) dirPrefixes.push(pattern);
    else if (pattern.includes("/")) anchoredGlobs.push(globToRe(pattern, true));
    else basenameGlobs.push(globToRe(pattern, false));
  }

  return (p: string) =>
    dirPrefixes.some((d) => p === d.slice(0, -1) || p.startsWith(d)) ||
    anchoredGlobs.some((re) => re.test(p)) ||
    basenameGlobs.some((re) => re.test(p));
}

/** Self-test: a guard whose own matcher is untested certifies whatever it is fed. */
function assertMatcherIsHonest(isIgnored: (p: string) => boolean) {
  const cases: [string, boolean][] = [
    // The distinction the whole BLOCKER-1 question turns on: the `*.glb` glob
    // stops at the directory boundary, so raw top-level GLBs are excluded and
    // the optimized subdirectories are not.
    ["public/furniture/blenderkit/raw.glb", true],
    ["public/furniture/blenderkit/opt/x.glb", false],
    // opt-ktx2 is excluded by its OWN rule, not by the glob above — added when
    // KTX2 was held back, and the rule to delete when it ships. If MODEL_BASE
    // is flipped without deleting it, this script fails on all 75.
    ["public/furniture/blenderkit/opt-ktx2/x.glb", true],
    ["public/furniture/ikea/00069768.glb", true],
    ["public/furniture/ikea/thumb/00069768.png", false],
    ["docs/PERFORMANCE.md", true],
    ["scripts/verify-catalog-deploy.ts", true],
    ["data/raw/anything.json", true],
    ["data/furniture-ikea.catalog.json", false],
    ["src/app/page.tsx", false],
  ];
  const wrong = cases.filter(([p, want]) => isIgnored(p) !== want);
  if (wrong.length) {
    console.log("  FAIL .vercelignore matcher is wrong about:");
    for (const [p, want] of wrong) console.log(`         ${p} - expected ignored=${want}`);
    process.exit(1);
  }
  console.log(`  ok   .vercelignore matcher agrees on ${cases.length} known cases`);
}

const isIgnored = compileIgnore(readFileSync(path.resolve(".vercelignore"), "utf8"));
assertMatcherIsHonest(isIgnored);

const tracked = new Set(
  execFileSync("git", ["ls-files", "--", "public"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .filter(Boolean),
);

/**
 * Every root-relative string anywhere in a row, whatever the field is called.
 * Matching on the VALUE rather than on a list of known keys means a catalog that
 * grows a new asset field is covered the day it is added, not the day someone
 * remembers to update this.
 */
function rootRelativeRefs(node: unknown): string[] {
  if (typeof node === "string") return node.startsWith("/") ? [node] : [];
  if (Array.isArray(node)) return node.flatMap(rootRelativeRefs);
  if (node && typeof node === "object") return Object.values(node).flatMap(rootRelativeRefs);
  return [];
}

let failures = 0;
const warnings: { dir: string; count: number }[] = [];

const catalogs = readdirSync(DATA_DIR)
  .filter((f) => f.endsWith(".catalog.json"))
  .sort();

for (const file of catalogs) {
  const rows = JSON.parse(readFileSync(path.join(DATA_DIR, file), "utf8")) as unknown[];
  const refs = [...new Set(rootRelativeRefs(rows))];

  const absent: string[] = [];
  const excluded: string[] = [];
  const untracked: string[] = [];

  for (const ref of refs) {
    const rel = `public${ref}`;
    if (!existsSync(path.resolve(rel))) absent.push(ref);
    else if (isIgnored(rel)) excluded.push(ref);
    else if (!tracked.has(rel)) untracked.push(ref);
  }

  const bad = absent.length + excluded.length;
  failures += bad;
  console.log(
    `  ${bad === 0 ? "ok  " : "FAIL"} ${file} - ${refs.length} root-relative refs, ` +
      `${refs.length - bad} would be uploaded`,
  );

  const detail = (label: string, list: string[]) => {
    if (!list.length) return;
    const dirs = [...new Set(list.map((r) => path.posix.dirname(r)))];
    console.log(`         ${list.length} ${label}: ${dirs.slice(0, 2).join(", ")}`);
    for (const ref of list.slice(0, 2)) console.log(`           ${ref}`);
  };
  detail("MISSING FROM DISK", absent);
  detail("EXCLUDED BY .vercelignore - would 404", excluded);

  for (const dir of new Set(untracked.map((r) => path.posix.dirname(r)))) {
    warnings.push({ dir, count: untracked.filter((r) => path.posix.dirname(r) === dir).length });
  }
}

if (warnings.length) {
  console.log("\n  Ships from this working tree, but is NOT in git:");
  for (const w of warnings) console.log(`    ${String(w.count).padStart(4)}  ${w.dir}`);
  console.log(
    "    A `vercel --prod` from this machine serves these. A clean checkout,\n" +
      "    another machine, CI or a Git-integration deploy would not. Nothing is\n" +
      "    expected here now that the IKEA thumbnails are committed: add these to\n" +
      "    git, or record why they are exempt.",
  );
}

console.log(
  failures === 0
    ? "\nevery root-relative catalog reference would be uploaded by `vercel --prod`\n"
    : `\n${failures} FAILED - these would 404 in production.\n`,
);
process.exit(failures === 0 ? 0 : 1);
