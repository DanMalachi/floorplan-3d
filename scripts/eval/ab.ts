/**
 * Phase 2.5 eval harness — A/B comparison (M5).
 *
 * Runs heuristic-only vs VLM-assisted classification against the same plans
 * and prints per-plan + aggregate results side by side. This is the loop for
 * iterating on the VLM prompt: change prompt → classify.ts → ab.ts → compare.
 *
 * Usage (repeat --plan per plan; each takes the eval-out dir then the gt file):
 *   npx tsx scripts/eval/ab.ts --plan eval-out/planA planA.gt.json --plan eval-out/planB planB.gt.json
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Candidate, CandidateClass } from "../../src/trace2d/candidates";
import type { GroundTruth } from "../../src/trace2d/exportGroundTruth";
import type { VlmResult } from "../../src/lib/vlmClassify";
import {
  scorePlan,
  heuristicPredictions,
  vlmPredictions,
  formatScore,
  type PlanScore,
} from "./score-core";

const plans: { dir: string; gt: string }[] = [];
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--plan") {
    plans.push({ dir: process.argv[++i], gt: process.argv[++i] });
  }
}
if (plans.length === 0 || plans.some((p) => !p.dir || !p.gt)) {
  console.error("usage: npx tsx scripts/eval/ab.ts --plan <eval-out-dir> <plan.gt.json> [--plan ...]");
  process.exit(1);
}

interface Agg {
  f1: Record<string, number[]>;
  coverage: number[];
  wallLenF1: number[];
}
const agg: Record<"heuristic" | "vlm", Agg> = {
  heuristic: { f1: { wall: [], door: [], window: [] }, coverage: [], wallLenF1: [] },
  vlm: { f1: { wall: [], door: [], window: [] }, coverage: [], wallLenF1: [] },
};

const collect = (side: "heuristic" | "vlm", s: PlanScore) => {
  for (const cls of ["wall", "door", "window"]) agg[side].f1[cls].push(s.perClass[cls].f1);
  agg[side].coverage.push(s.wallCoverage);
  agg[side].wallLenF1.push(s.wallLength.f1);
};

for (const { dir, gt: gtPath } of plans) {
  const candFile = JSON.parse(readFileSync(join(dir, "candidates.json"), "utf8")) as {
    sourcePdf: string;
    candidates: Candidate[];
  };
  const gt = JSON.parse(readFileSync(gtPath, "utf8")) as GroundTruth;
  console.log(`\n══ ${candFile.sourcePdf} ══`);

  const hs = scorePlan(candFile.candidates, heuristicPredictions(candFile.candidates), gt);
  console.log(formatScore("A: heuristic-only", hs));
  collect("heuristic", hs);

  const vlmPath = join(dir, "vlm-labels.json");
  if (!existsSync(vlmPath)) {
    console.log(`B: VLM — skipped (no ${vlmPath}; run classify.ts)`);
    continue;
  }
  const vlm = JSON.parse(readFileSync(vlmPath, "utf8")) as VlmResult;
  const vs = scorePlan(candFile.candidates, vlmPredictions(vlm), gt, vlm.missed);
  console.log(formatScore(`B: VLM-assisted (${vlm.model})`, vs));
  collect("vlm", vs);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
console.log(`\n══ AGGREGATE (${plans.length} plan${plans.length > 1 ? "s" : ""}) ══`);
console.log("metric      heuristic     VLM");
for (const cls of ["wall", "door", "window"]) {
  const h = mean(agg.heuristic.f1[cls]);
  const v = mean(agg.vlm.f1[cls]);
  console.log(
    `${(cls + " F1").padEnd(11)} ${(h * 100).toFixed(0).padStart(6)}%   ${isNaN(v) ? "   n/a" : (v * 100).toFixed(0).padStart(6) + "%"}`,
  );
}
const hl = mean(agg.heuristic.wallLenF1);
const vl = mean(agg.vlm.wallLenF1);
console.log(
  `${"wallLEN F1".padEnd(11)} ${(hl * 100).toFixed(0).padStart(6)}%   ${isNaN(vl) ? "   n/a" : (vl * 100).toFixed(0).padStart(6) + "%"}   <- honest wall metric`,
);
const hc = mean(agg.heuristic.coverage);
const vc = mean(agg.vlm.coverage);
console.log(
  `${"wall cover".padEnd(11)} ${(hc * 100).toFixed(0).padStart(6)}%   ${isNaN(vc) ? "   n/a" : (vc * 100).toFixed(0).padStart(6) + "%"}`,
);
