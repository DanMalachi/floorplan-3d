/**
 * Phase 2.5 eval harness — candidate generation (M2).
 *
 * Runs the real extraction pipeline headless against a vector PDF and emits
 * the high-recall candidate set the VLM will classify, plus a color-coded
 * overlay PNG for eyeballing.
 *
 * Usage:
 *   npx tsx scripts/eval/gen-candidates.ts <plan.pdf> [--mpp 0.0108] [--out dir] [--targets 10,22]
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { generateCandidates } from "../../src/trace2d/candidates";
import type { ImportSegment, ImportArc } from "../../src/store/useSceneStore";

const PY =
  process.env.PYTHON_EXE ??
  "C:\\Users\\dandu\\AppData\\Local\\Programs\\Python\\Python311\\python.exe";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const pdf = process.argv[2];
if (!pdf || !existsSync(pdf)) {
  console.error("usage: npx tsx scripts/eval/gen-candidates.ts <plan.pdf> [--mpp N] [--out dir] [--targets a,b]");
  process.exit(1);
}
const mpp = arg("--mpp") ? Number(arg("--mpp")) : null;
const base = basename(pdf).replace(/\.pdf$/i, "");
const outDir = arg("--out") ?? join("eval-out", base);
const targets = (arg("--targets") ?? "").split(",").filter(Boolean).map(Number);
mkdirSync(outDir, { recursive: true });

// 1. Extract raw geometry via the same python script the API route uses.
const raw = JSON.parse(
  execFileSync(PY, [join("scripts", "extract_pdf.py"), pdf, "0"], {
    maxBuffer: 256 * 1024 * 1024,
    encoding: "utf8",
  }),
);
if (raw.error) throw new Error(raw.error);

// 2. pt → render-px (same conversion as importPdf.ts).
const z: number = raw.render.zoom;
const segs: ImportSegment[] = raw.segments.map((s: Record<string, number | string | null>) => ({
  x0: (s.x0 as number) * z,
  y0: (s.y0 as number) * z,
  x1: (s.x1 as number) * z,
  y1: (s.y1 as number) * z,
  color: (s.color as [number, number, number] | null) ?? null,
  width: (s.width as number) ?? 0,
  layer: (s.layer as string) ?? "0",
}));
const arcs: ImportArc[] = (raw.arcs ?? []).map((a: Record<string, number | string | null>) => ({
  x0: (a.x0 as number) * z,
  y0: (a.y0 as number) * z,
  x1: (a.x1 as number) * z,
  y1: (a.y1 as number) * z,
  chord: (a.chord as number) * z,
  color: (a.color as [number, number, number] | null) ?? null,
  width: (a.width as number) ?? 0,
  layer: (a.layer as string) ?? "0",
}));

// 3. Save the page render (background for the overlay + the M3 VLM image).
const png = Buffer.from(raw.render.dataUrl.split(",")[1], "base64");
writeFileSync(join(outDir, "plan.png"), png);

// 4. Candidates.
const set = generateCandidates(segs, arcs, mpp, { extractionTargets: targets });
const out = {
  sourcePdf: basename(pdf),
  metersPerPixel: mpp,
  renderSize: { width: raw.render.widthPx, height: raw.render.heightPx },
  generatedAt: new Date().toISOString(),
  ...set,
};
writeFileSync(join(outDir, "candidates.json"), JSON.stringify(out, null, 2));

// 5. Report.
console.log(`plan: ${basename(pdf)}  (${raw.stats.segments} segs, ${raw.stats.arcs} arcs, zoom ${z})`);
console.log(`scale: ${mpp ? `${mpp} m/px` : "NOT SET (pass --mpp; sep/size filters annotate less without it)"}`);
console.log(
  `candidates: ${set.stats.total}${set.stats.rawTotal !== set.stats.total ? ` (compressed from ${set.stats.rawTotal})` : ""}  (kept by strict heuristics: ${set.stats.keptByHeuristic})`,
);
for (const [g, n] of Object.entries(set.stats.byGuess).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${g.padEnd(10)} ${n}`);
}
console.log(`wrote ${join(outDir, "candidates.json")} + plan.png`);

// 6. Overlay for eyeballing.
try {
  execFileSync(PY, [
    join("scripts", "eval", "overlay.py"),
    join(outDir, "plan.png"),
    join(outDir, "candidates.json"),
    join(outDir, "overlay.png"),
  ]);
  console.log(`wrote ${join(outDir, "overlay.png")}`);
} catch (e) {
  console.error("overlay render failed:", (e as Error).message);
}
