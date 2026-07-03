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

const openHits = new Set<number>();
for (const c of candidates) {
  const m = matchCandidate(c, gt);
  if (m.gtIndex < 0) continue;
  if (m.truth !== "wall") openHits.add(m.gtIndex);
}

// Walls are matched GT-centric: a GT wall counts as covered when candidates
// on its line (scorer angle/perp tolerances) cover ≥50% of ITS length.
// matchCandidate's candidate-centric overlap rule under-reports here — one
// long unbroken raster centerline legitimately covers several short GT wall
// pieces (GT is split at every traced junction; skeletons often aren't).
const angleOf = (l: { x0: number; y0: number; x1: number; y1: number }) => {
  let a = (Math.atan2(l.y1 - l.y0, l.x1 - l.x0) * 180) / Math.PI;
  if (a < 0) a += 180;
  return a;
};
const angleDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % 180;
  return Math.min(d, 180 - d);
};
const wallHits = new Set<number>();
gt.walls.forEach((w, i) => {
  const wl = Math.hypot(w.x1 - w.x0, w.y1 - w.y0);
  if (wl < 1) return;
  const dx = (w.x1 - w.x0) / wl;
  const dy = (w.y1 - w.y0) / wl;
  const iv: [number, number][] = [];
  for (const c of candidates) {
    if (c.kind !== "wall") continue;
    const cl = { x0: c.px[0], y0: c.px[1], x1: c.px[2], y1: c.px[3] };
    if (angleDiff(angleOf(w), angleOf(cl)) > 8) continue;
    const perp0 = Math.abs((cl.x0 - w.x0) * -dy + (cl.y0 - w.y0) * dx);
    const perp1 = Math.abs((cl.x1 - w.x0) * -dy + (cl.y1 - w.y0) * dx);
    if ((perp0 + perp1) / 2 > 14) continue;
    const s0 = (cl.x0 - w.x0) * dx + (cl.y0 - w.y0) * dy;
    const s1 = (cl.x1 - w.x0) * dx + (cl.y1 - w.y0) * dy;
    const lo = Math.max(0, Math.min(s0, s1));
    const hi = Math.min(wl, Math.max(s0, s1));
    if (hi > lo) iv.push([lo, hi]);
  }
  iv.sort((a, b) => a[0] - b[0]);
  let cov = 0;
  let cur: [number, number] | null = null;
  for (const [lo, hi] of iv) {
    if (!cur || lo > cur[1]) {
      if (cur) cov += cur[1] - cur[0];
      cur = [lo, hi];
    } else {
      cur[1] = Math.max(cur[1], hi);
    }
  }
  if (cur) cov += cur[1] - cur[0];
  if (cov / wl >= 0.5) wallHits.add(i);
});

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
