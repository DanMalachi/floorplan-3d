/**
 * Benchmark harness — score the whole corpus in one command.
 *
 * The rest of the eval scripts are one-plan-at-a-time; this drives them over a
 * manifest (`eval/corpus.jsonl`) and reports an aggregate scorecard so we
 * optimize GENERALIZATION, not a single plan. It reuses the real pipeline
 * (gen-candidates.ts) and the shared scorers (score-core.ts) unchanged — it
 * only orchestrates and aggregates.
 *
 * Default metric is FREE generator recall (the "eyes" ceiling, no VLM spend)
 * plus the heuristic wall-length F1. `--vlm` additionally runs the paid
 * classify pass (costs money — quote it before running).
 *
 * Usage:
 *   npx tsx scripts/eval/bench.ts                 # all plans, free metrics
 *   npx tsx scripts/eval/bench.ts --split benchmark
 *   npx tsx scripts/eval/bench.ts --only 732-graypoche
 *   npx tsx scripts/eval/bench.ts --reuse         # skip regen if candidates exist
 *   npx tsx scripts/eval/bench.ts --gate          # non-zero exit on regression
 *   npx tsx scripts/eval/bench.ts --vlm           # + paid VLM precision/F1
 *   npx tsx scripts/eval/bench.ts --check-firewall <train-manifest.jsonl>
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import {
  coveragePlan,
  scorePlan,
  heuristicPredictions,
  vlmPredictions,
  mean,
  type CoveragePlan,
} from "./score-core";
import type { Candidate } from "../../src/trace2d/candidates";
import type { GroundTruth } from "../../src/trace2d/exportGroundTruth";
import type { VlmResult } from "../../src/lib/vlmClassify";

// ---- manifest ------------------------------------------------------------
interface CorpusPlan {
  id: string;
  source: string;
  gt: string;
  mpp: number | null;
  style: string;
  split: "benchmark" | "dev";
  provenance?: string;
  rights?: string;
  trainable?: boolean;
  sha256?: string;
}

const MANIFEST = join("eval", "corpus.jsonl");
const HISTORY = join("eval", "bench-history.jsonl");

function loadManifest(): CorpusPlan[] {
  if (!existsSync(MANIFEST)) {
    console.error(`no manifest at ${MANIFEST}`);
    process.exit(1);
  }
  return readFileSync(MANIFEST, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as CorpusPlan);
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (flag: string) => process.argv.includes(flag);

// ---- firewall mode: benchmark data must never appear in training ---------
if (has("--check-firewall")) {
  const trainPath = arg("--check-firewall");
  if (!trainPath || !existsSync(trainPath)) {
    console.error("usage: --check-firewall <train-manifest.jsonl>");
    process.exit(1);
  }
  // The legal invariant: anything held out as benchmark, OR anything we lack
  // the rights to train on (trainable === false), must never enter a training
  // set. Both are protected by hash.
  const protectedHashes = new Set(
    loadManifest()
      .filter((p) => p.sha256 && (p.split === "benchmark" || p.trainable === false))
      .map((p) => p.sha256!),
  );
  const trainHashes = readFileSync(trainPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => (JSON.parse(l) as { sha256?: string }).sha256)
    .filter((h): h is string => !!h);
  const leaks = trainHashes.filter((h) => protectedHashes.has(h));
  if (leaks.length) {
    console.error(`FIREWALL BREACH: ${leaks.length} protected plan(s) present in ${trainPath}:`);
    for (const h of leaks) console.error(`  ${h}`);
    process.exit(1);
  }
  console.log(`firewall OK: no benchmark/non-trainable plan appears in ${trainPath}`);
  process.exit(0);
}

// ---- select plans --------------------------------------------------------
const split = arg("--split"); // benchmark | dev | undefined(=all)
const only = arg("--only");
const outRoot = arg("--out") ?? join("eval-out", "bench");
const doVlm = has("--vlm");
const reuse = has("--reuse");

let plans = loadManifest();
if (split) plans = plans.filter((p) => p.split === split);
if (only) plans = plans.filter((p) => p.id === only);
if (!plans.length) {
  console.error(`no plans match (split=${split ?? "all"}${only ? `, only=${only}` : ""})`);
  process.exit(1);
}
mkdirSync(outRoot, { recursive: true });

function sh(cmd: string): void {
  try {
    execSync(cmd, { stdio: ["ignore", "ignore", "pipe"], maxBuffer: 256 * 1024 * 1024 });
  } catch (e) {
    const err = e as { stderr?: Buffer };
    throw new Error(`command failed: ${cmd}\n${err.stderr?.toString() ?? ""}`);
  }
}

interface Row {
  plan: CorpusPlan;
  cov: CoveragePlan;
  wallLenF1H: number;
  vlm?: { wallLenF1: number; doorF1: number; windowF1: number; model: string };
}

const rows: Row[] = [];
for (const p of plans) {
  const outDir = join(outRoot, p.id);
  const candPath = join(outDir, "candidates.json");
  if (!(reuse && existsSync(candPath))) {
    const mppArg = p.mpp != null ? ` --mpp ${p.mpp}` : "";
    sh(`npx tsx "scripts/eval/gen-candidates.ts" "${p.source}"${mppArg} --out "${outDir}"`);
  }
  const candidates = (JSON.parse(readFileSync(candPath, "utf8")) as { candidates: Candidate[] })
    .candidates;
  const gt = JSON.parse(readFileSync(p.gt, "utf8")) as GroundTruth;

  const cov = coveragePlan(candidates, gt);
  const wallLenF1H = scorePlan(candidates, heuristicPredictions(candidates), gt).wallLength.f1;
  const row: Row = { plan: p, cov, wallLenF1H };

  if (doVlm) {
    const vlmPath = join(outDir, "vlm-labels.json");
    if (!(reuse && existsSync(vlmPath))) {
      sh(`npx tsx "scripts/eval/classify.ts" "${outDir}"`);
    }
    const vlm = JSON.parse(readFileSync(vlmPath, "utf8")) as VlmResult;
    const s = scorePlan(candidates, vlmPredictions(vlm), gt, vlm.missed);
    row.vlm = {
      wallLenF1: s.wallLength.f1,
      doorF1: s.perClass.door.f1,
      windowF1: s.perClass.window.f1,
      model: vlm.model,
    };
  }
  rows.push(row);
  const railStr = cov.rails.total ? `  rails ${cov.rails.hit}/${cov.rails.total}` : "";
  console.log(
    `· ${p.id.padEnd(16)} walls ${cov.walls.hit}/${cov.walls.total}${railStr}  doors ${cov.doors.hit}/${cov.doors.total}  windows ${cov.windows.hit}/${cov.windows.total}`,
  );
}

// ---- aggregate -----------------------------------------------------------
const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(0)}%` : "—");
const pool = (rs: Row[], k: "walls" | "rails" | "doors" | "windows") => {
  const hit = rs.reduce((s, r) => s + r.cov[k].hit, 0);
  const total = rs.reduce((s, r) => s + r.cov[k].total, 0);
  return { hit, total };
};

function block(title: string, rs: Row[]): string {
  const w = pool(rs, "walls");
  const rail = pool(rs, "rails");
  const d = pool(rs, "doors");
  const win = pool(rs, "windows");
  const wlen = mean(rs.map((r) => r.wallLenF1H));
  const railCol = rail.total ? `   rails ${`${rail.hit}/${rail.total}`.padEnd(7)} ${pct(rail.hit, rail.total).padStart(4)}` : "";
  let line = `${title.padEnd(18)} walls ${`${w.hit}/${w.total}`.padEnd(9)} ${pct(w.hit, w.total).padStart(4)}${railCol}   doors ${`${d.hit}/${d.total}`.padEnd(7)} ${pct(d.hit, d.total).padStart(4)}   windows ${`${win.hit}/${win.total}`.padEnd(7)} ${pct(win.hit, win.total).padStart(4)}   wallLenF1(H) ${(wlen * 100).toFixed(0)}%`;
  if (rs.some((r) => r.vlm)) {
    const vr = rs.filter((r) => r.vlm);
    line += `\n${" ".repeat(18)} VLM: wallLenF1 ${(mean(vr.map((r) => r.vlm!.wallLenF1)) * 100).toFixed(0)}%  doorF1 ${(mean(vr.map((r) => r.vlm!.doorF1)) * 100).toFixed(0)}%  windowF1 ${(mean(vr.map((r) => r.vlm!.windowF1)) * 100).toFixed(0)}%`;
  }
  return line;
}

let gitSha = "unknown";
try {
  gitSha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
} catch {
  /* not a repo / detached */
}

console.log(`\n════ FLOORPLAN BENCHMARK  (split=${split ?? "all"}, ${rows.length} plans, ${gitSha}) ════\n`);
console.log(block("OVERALL", rows));
const styles = [...new Set(rows.map((r) => r.plan.style))].sort();
if (styles.length > 1) {
  console.log("\nby style:");
  for (const st of styles) console.log("  " + block(st, rows.filter((r) => r.plan.style === st)));
}

// ---- history + gate ------------------------------------------------------
const overall = {
  wallRecall: pool(rows, "walls").hit / Math.max(1, pool(rows, "walls").total),
  railRecall: pool(rows, "rails").hit / Math.max(1, pool(rows, "rails").total),
  doorRecall: pool(rows, "doors").hit / Math.max(1, pool(rows, "doors").total),
  windowRecall: pool(rows, "windows").hit / Math.max(1, pool(rows, "windows").total),
  wallLenF1H: mean(rows.map((r) => r.wallLenF1H)),
};

// Read previous entry for the same split BEFORE appending this run.
let prev: typeof overall | undefined;
if (existsSync(HISTORY)) {
  const past = readFileSync(HISTORY, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as { split: string; overall: typeof overall });
  const sameSplit = past.filter((e) => e.split === (split ?? "all"));
  if (sameSplit.length) prev = sameSplit[sameSplit.length - 1].overall;
}

if (!has("--no-history")) {
  appendFileSync(
    HISTORY,
    JSON.stringify({
      ts: new Date().toISOString(),
      git: gitSha,
      split: split ?? "all",
      plans: rows.map((r) => r.plan.id),
      overall,
    }) + "\n",
  );
}

if (has("--gate")) {
  if (!prev) {
    console.log("\ngate: no prior run for this split — recorded baseline, passing.");
  } else {
    const EPS = 0.005;
    const drops: string[] = [];
    for (const k of ["wallRecall", "railRecall", "doorRecall", "windowRecall"] as const) {
      if (overall[k] < prev[k] - EPS) {
        drops.push(`${k} ${(prev[k] * 100).toFixed(0)}% → ${(overall[k] * 100).toFixed(0)}%`);
      }
    }
    if (drops.length) {
      console.error(`\nGATE FAILED — regression vs last run:\n  ${drops.join("\n  ")}`);
      process.exit(1);
    }
    console.log("\ngate: no regression vs last run. ✓");
  }
}
