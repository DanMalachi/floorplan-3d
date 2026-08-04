/**
 * M3's own exit criterion: "a new material can be added end to end without
 * touching any file in the lighting or render-contract modules." This checks
 * it mechanically against the working tree rather than asking someone to eyeball
 * a diff — the same reasoning material-spec.md §7 step 5 gives for gating
 * conformance on a `git diff`, applied to the repo as a whole.
 *
 * Run:
 *   npx tsx scripts/materials/ingest/no-lighting-diff.ts [--base <ref>]
 *
 * Compares the working tree (staged + unstaged) against `--base` (default:
 * HEAD) and fails if any changed file matches the forbidden list below.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/**
 * Lighting / render-contract files, per `docs/render-contract.md` §0.1's own
 * governance list plus the protected-paths files it names. NOT the same list
 * as `docs/PROTECTED_PATHS.md` — that list is broader (all of `src/viewport3d/`
 * and the scene schema) and this milestone's own exit criterion is scoped
 * narrower, to lighting/render-contract specifically. `src/render/materialClass.ts`
 * is deliberately excluded: it's the shadow-CLASS system, referenced by class
 * name, not a lighting value — the same distinction render-contract.md §6
 * draws.
 */
const FORBIDDEN_PATTERNS: RegExp[] = [
  /^src\/render\/contract\.ts$/,
  /^src\/render\/lightPresets\.ts$/,
  /^src\/render\/roomLighting\.ts$/,
  /^src\/render\/RoomLights\.tsx$/,
  /^src\/render\/RenderContractCheck\.tsx$/,
  /^src\/viewport3d\/Viewport\.tsx$/,
  /^src\/viewport3d\/environment\//,
  /^docs\/render-contract\.md$/,
  /^docs\/calibration\//,
];

export function changedFiles(base = "HEAD"): string[] {
  const staged = execFileSync("git", ["diff", "--name-only", "--cached", base], { encoding: "utf8" });
  const unstaged = execFileSync("git", ["diff", "--name-only", base], { encoding: "utf8" });
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { encoding: "utf8" });
  const all = new Set(
    [...staged.split("\n"), ...unstaged.split("\n"), ...untracked.split("\n")]
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return [...all];
}

export function findLightingTouches(files: string[]): string[] {
  return files.filter((f) => FORBIDDEN_PATTERNS.some((re) => re.test(f)));
}

function main() {
  const args = process.argv.slice(2);
  const baseIdx = args.indexOf("--base");
  const base = baseIdx >= 0 ? args[baseIdx + 1] : "HEAD";

  const files = changedFiles(base);
  const touches = findLightingTouches(files);

  if (touches.length > 0) {
    console.log(`FAIL: changes touch lighting/render-contract files vs ${base}:`);
    for (const f of touches) console.log(`  ${f}`);
    process.exit(1);
  }
  console.log(`PASS: no lighting/render-contract file changed vs ${base} (${files.length} file(s) changed total)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
