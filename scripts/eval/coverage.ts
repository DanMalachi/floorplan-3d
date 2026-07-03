/**
 * Free generator-coverage check (no VLM spend): for every hand-traced GT
 * element, is there ANY candidate that matches it — regardless of what the
 * heuristic guessed? Classification can't recover an element no candidate
 * covers, so this is the recall ceiling of the whole pipeline. Run it on M2
 * output BEFORE paying for a classify run.
 *
 * Usage: npx tsx scripts/eval/coverage.ts <eval-out-dir> --gt <plan.gt.json>
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { matchCandidate } from "./score-core";
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

const wallHits = new Set<number>();
const openHits = new Set<number>();
for (const c of candidates) {
  const m = matchCandidate(c, gt);
  if (m.gtIndex < 0) continue;
  if (m.truth === "wall") wallHits.add(m.gtIndex);
  else openHits.add(m.gtIndex);
}

const mid = (l: { x0: number; y0: number; x1: number; y1: number }) =>
  `(${Math.round((l.x0 + l.x1) / 2)},${Math.round((l.y0 + l.y1) / 2)})`;
const lenOf = (l: { x0: number; y0: number; x1: number; y1: number }) =>
  Math.hypot(l.x1 - l.x0, l.y1 - l.y0);

const doors = gt.resolvedOpenings.filter((o) => o.type === "door");
const windows = gt.resolvedOpenings.filter((o) => o.type === "window");

let doorN = 0;
let winN = 0;
gt.resolvedOpenings.forEach((o, i) => {
  if (!openHits.has(i)) return;
  if (o.type === "door") doorN++;
  else winN++;
});

console.log(`coverage vs ${gtPath} (${candidates.length} candidates)`);
console.log(`  walls    ${wallHits.size}/${gt.walls.length}`);
console.log(`  doors    ${doorN}/${doors.length}`);
console.log(`  windows  ${winN}/${windows.length}`);

const missedWalls = gt.walls.map((w, i) => ({ w, i })).filter(({ i }) => !wallHits.has(i));
if (missedWalls.length) {
  console.log(`  missed walls (midpoint, length px):`);
  for (const { w } of missedWalls) console.log(`    ${mid(w)}  ${Math.round(lenOf(w))}px`);
}
const missedOpen = gt.resolvedOpenings.map((o, i) => ({ o, i })).filter(({ i }) => !openHits.has(i));
if (missedOpen.length) {
  console.log(`  missed openings:`);
  for (const { o } of missedOpen) console.log(`    ${o.type} ${mid(o)}  ${Math.round(lenOf(o))}px`);
}
