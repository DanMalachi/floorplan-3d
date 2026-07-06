/**
 * Free generator-coverage check (no VLM spend): for every hand-traced GT
 * element, is there ANY candidate that matches it — regardless of what the
 * heuristic guessed? Classification can't recover an element no candidate
 * covers, so this is the recall ceiling of the whole pipeline. Run it on M2
 * output BEFORE paying for a classify run.
 *
 * The actual matching lives in `coveragePlan` (score-core.ts) so this CLI and
 * the batch harness (bench.ts) can never drift.
 *
 * Usage: npx tsx scripts/eval/coverage.ts <eval-out-dir> --gt <plan.gt.json>
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { coveragePlan } from "./score-core";
import type { Candidate } from "../../src/trace2d/candidates";
import type { GroundTruth } from "../../src/trace2d/exportGroundTruth";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const dir = process.argv[2];
const gtPath = arg("--gt");
if (!dir || !gtPath || !existsSync(join(dir, "candidates.json")) || !existsSync(gtPath)) {
  console.error("usage: npx tsx scripts/eval/coverage.ts <eval-out-dir> --gt <plan.gt.json>");
  process.exit(1);
}

const { candidates } = JSON.parse(readFileSync(join(dir, "candidates.json"), "utf8")) as {
  candidates: Candidate[];
};
const gt = JSON.parse(readFileSync(gtPath, "utf8")) as GroundTruth;

const cov = coveragePlan(candidates, gt);

console.log(`coverage vs ${gtPath} (${candidates.length} candidates)`);
console.log(`  walls    ${cov.walls.hit}/${cov.walls.total}`);
console.log(`  doors    ${cov.doors.hit}/${cov.doors.total}`);
console.log(`  windows  ${cov.windows.hit}/${cov.windows.total}`);

const missedWalls = cov.missed.filter((m) => m.type === "wall");
if (missedWalls.length) {
  console.log(`  missed walls (midpoint, length px):`);
  for (const m of missedWalls) console.log(`    (${m.x},${m.y})  ${m.len}px`);
}
const missedOpen = cov.missed.filter((m) => m.type !== "wall");
if (missedOpen.length) {
  console.log(`  missed openings:`);
  for (const m of missedOpen) console.log(`    ${m.type} (${m.x},${m.y})  ${m.len}px`);
}
