/**
 * Phase 2.5 eval harness — VLM classification (M3).
 *
 * Takes a gen-candidates output dir (candidates.json + plan.png + overlay.png)
 * and runs the one-call-per-plan VLM classification, writing vlm-labels.json
 * and a re-colored overlay of the VLM's verdicts.
 *
 * Usage:
 *   npx tsx scripts/eval/classify.ts eval-out/20x45-Model [--model claude-opus-4-8] [--hint "3 bed 2 bath..."] [--out vlm-labels.json]
 *
 * Auth: ANTHROPIC_API_KEY env var (or .env.local — loaded manually below).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { classifyCandidates } from "../../src/lib/vlmClassify";
import type { Candidate } from "../../src/trace2d/candidates";

// Pick up .env.local the same way the dev server would.
if (!process.env.ANTHROPIC_API_KEY && existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const PY =
  process.env.PYTHON_EXE ??
  "C:\\Users\\dandu\\AppData\\Local\\Programs\\Python\\Python311\\python.exe";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const dir = process.argv[2];
if (!dir || !existsSync(join(dir, "candidates.json"))) {
  console.error("usage: npx tsx scripts/eval/classify.ts <eval-out-dir> [--model id]");
  process.exit(1);
}

const candFile = JSON.parse(readFileSync(join(dir, "candidates.json"), "utf8")) as {
  metersPerPixel: number | null;
  candidates: Candidate[];
};
const overlay = readFileSync(join(dir, "overlay.png")).toString("base64");

async function main() {
  const t0 = Date.now();
  const result = await classifyCandidates({
    imageBase64: overlay,
    candidates: candFile.candidates,
    metersPerPixel: candFile.metersPerPixel,
    planHint: arg("--hint") ?? null,
    model: arg("--model"),
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  // --out lets an A/B keep both hinted and unhinted labels side by side.
  const outName = arg("--out") ?? "vlm-labels.json";
  writeFileSync(join(dir, outName), JSON.stringify(result, null, 2));

  // Report.
  const byLabel: Record<string, number> = {};
  for (const l of result.labels) byLabel[l.label] = (byLabel[l.label] ?? 0) + 1;
  console.log(`model: ${result.model}  (${secs}s, ${result.usage.inputTokens} in / ${result.usage.outputTokens} out tokens)`);
  console.log(`labeled ${result.labels.length}/${candFile.candidates.length} candidates:`);
  for (const [g, n] of Object.entries(byLabel).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${g.padEnd(10)} ${n}`);
  }
  if (result.missed.length) {
    console.log(`missed elements flagged by the VLM:`);
    for (const m of result.missed) console.log(`  ${m.label} @ [${m.px.join(",")}] — ${m.note}`);
  }

  // Re-colored overlay of VLM verdicts (label field wins over guess in overlay.py).
  const byId = new Map(result.labels.map((l) => [l.id, l.label]));
  const labeled = candFile.candidates.map((c) => ({ ...c, label: byId.get(c.id) ?? "reject" }));
  writeFileSync(join(dir, "vlm-labeled.json"), JSON.stringify({ candidates: labeled }));
  execFileSync(PY, [
    join("scripts", "eval", "overlay.py"),
    join(dir, "plan.png"),
    join(dir, "vlm-labeled.json"),
    join(dir, "overlay-vlm.png"),
  ]);
  console.log(`wrote ${join(dir, outName)} + overlay-vlm.png`);
}

main().catch((e) => {
  console.error("classify failed:", (e as Error).message);
  process.exit(1);
});
