/**
 * Phase 2.5 eval harness — scoring (M4).
 *
 * Scores classified candidates against a hand-traced ground truth as a full
 * confusion matrix (tolerant geometric matching, per-plan report).
 *
 * Usage:
 *   npx tsx scripts/eval/score.ts <eval-out-dir> --gt <plan.gt.json> [--pred vlm|heuristic]
 *
 * The eval-out dir comes from gen-candidates.ts; --pred vlm additionally needs
 * vlm-labels.json in that dir (from classify.ts). Default: score both if
 * vlm-labels.json exists, else heuristic only.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Candidate } from "../../src/trace2d/candidates";
import type { GroundTruth } from "../../src/trace2d/exportGroundTruth";
import type { VlmResult } from "../../src/lib/vlmClassify";
import {
  scorePlan,
  heuristicPredictions,
  vlmPredictions,
  formatScore,
} from "./score-core";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const dir = process.argv[2];
const gtPath = arg("--gt");
if (!dir || !gtPath || !existsSync(join(dir, "candidates.json")) || !existsSync(gtPath)) {
  console.error("usage: npx tsx scripts/eval/score.ts <eval-out-dir> --gt <plan.gt.json> [--pred vlm|heuristic]");
  process.exit(1);
}

const candFile = JSON.parse(readFileSync(join(dir, "candidates.json"), "utf8")) as {
  sourcePdf: string;
  candidates: Candidate[];
};
const gt = JSON.parse(readFileSync(gtPath, "utf8")) as GroundTruth;
const vlmPath = join(dir, "vlm-labels.json");
const pred = arg("--pred");

console.log(`plan: ${candFile.sourcePdf}   gt: ${gtPath}`);

if (pred !== "vlm") {
  const s = scorePlan(candFile.candidates, heuristicPredictions(candFile.candidates), gt);
  console.log(formatScore("heuristic-only", s));
}
if (pred !== "heuristic") {
  if (!existsSync(vlmPath)) {
    if (pred === "vlm") {
      console.error(`missing ${vlmPath} — run classify.ts first`);
      process.exit(1);
    }
  } else {
    const vlm = JSON.parse(readFileSync(vlmPath, "utf8")) as VlmResult;
    const s = scorePlan(candFile.candidates, vlmPredictions(vlm), gt, vlm.missed);
    console.log(formatScore(`VLM-assisted (${vlm.model})`, s));
  }
}
