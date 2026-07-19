/**
 * Phase 2.5/3 eval harness — candidate generation (M2).
 *
 * Runs the real extraction pipeline headless and emits the high-recall
 * candidate set the VLM will classify, plus a color-coded overlay PNG for
 * eyeballing. Vector PDFs go through the Phase 2 geometry pipeline; images
 * and raster PDFs go through the Phase 3 classical-CV proposer. Either way
 * the output contract is identical: candidates.json + plan.png + overlay.png,
 * so classify.ts / score.ts / ab.ts run unchanged.
 *
 * Usage:
 *   npx tsx scripts/eval/gen-candidates.ts <plan.pdf|plan.png|jpg|webp> [--mpp 0.0108] [--out dir] [--targets 10,22]
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { generateCandidates, type CandidateSet } from "../../src/trace2d/candidates";
import { rasterToCandidates, type RasterProposal } from "../../src/trace2d/rasterCandidates";
import type { ImportSegment, ImportArc } from "../../src/trace2d/types";

const PY =
  process.env.PYTHON_EXE ??
  "C:\\Users\\dandu\\AppData\\Local\\Programs\\Python\\Python311\\python.exe";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const input = process.argv[2];
if (!input || !existsSync(input)) {
  console.error("usage: npx tsx scripts/eval/gen-candidates.ts <plan.pdf|png|jpg|webp> [--mpp N] [--out dir] [--targets a,b]");
  process.exit(1);
}
const mpp = arg("--mpp") ? Number(arg("--mpp")) : null;
const base = basename(input).replace(/\.(pdf|png|jpe?g|webp)$/i, "");
const outDir = arg("--out") ?? join("eval-out", base);
const targets = (arg("--targets") ?? "").split(",").filter(Boolean).map(Number);
mkdirSync(outDir, { recursive: true });

const py = (args: string[]) =>
  execFileSync(PY, args, { maxBuffer: 256 * 1024 * 1024, encoding: "utf8" });

/** Phase 3 raster path: propose centerlines from pixels, then regularize. */
function rasterSet(imagePath: string, pngOut: string | null): CandidateSet {
  const proposal = JSON.parse(
    py([join("scripts", "propose_raster.py"), imagePath, ...(pngOut ? ["--png-out", pngOut] : [])]),
  ) as RasterProposal & { error?: string; detail?: string };
  if (proposal.error) throw new Error(`${proposal.error}${proposal.detail ? `: ${proposal.detail}` : ""}`);
  const q = proposal.quality;
  console.log(
    `raster proposer: ${q.width}x${q.height}px, wall thickness ~${q.wallThicknessPx}px, mask=${q.maskBranch}, quality=${q.verdict}`,
  );
  for (const n of q.notes) console.log(`  note: ${n}`);
  return rasterToCandidates(proposal, mpp);
}

let set: CandidateSet;
let sourceNote: string;
let renderSize: { width: number; height: number } | null = null;

if (/\.(png|jpe?g|webp)$/i.test(input)) {
  // Plain image: the image itself is the plan (and the classify/overlay PNG).
  set = rasterSet(input, join(outDir, "plan.png"));
  sourceNote = "raster image";
} else {
  // PDF: extract vector geometry; if the page is really a scan, fall through
  // to the raster proposer on the page render (native-res for image pages).
  const raw = JSON.parse(py([join("scripts", "extract_pdf.py"), input, "0"]));
  if (raw.error) throw new Error(raw.error);
  const png = Buffer.from(raw.render.dataUrl.split(",")[1], "base64");
  writeFileSync(join(outDir, "plan.png"), png);
  renderSize = { width: raw.render.widthPx, height: raw.render.heightPx };

  if (!raw.isVector) {
    set = rasterSet(join(outDir, "plan.png"), null);
    sourceNote = `raster PDF (render ${raw.render.widthPx}x${raw.render.heightPx})`;
  } else {
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
    set = generateCandidates(segs, arcs, mpp, { extractionTargets: targets });
    sourceNote = `vector PDF (${raw.stats.segments} segs, ${raw.stats.arcs} arcs, zoom ${z})`;
  }
}

const out = {
  sourcePdf: basename(input),
  metersPerPixel: mpp,
  renderSize,
  generatedAt: new Date().toISOString(),
  ...set,
};
writeFileSync(join(outDir, "candidates.json"), JSON.stringify(out, null, 2));

console.log(`plan: ${basename(input)}  (${sourceNote})`);
console.log(`scale: ${mpp ? `${mpp} m/px` : "NOT SET (pass --mpp; sep/size filters annotate less without it)"}`);
console.log(
  `candidates: ${set.stats.total}${set.stats.rawTotal !== set.stats.total ? ` (compressed from ${set.stats.rawTotal})` : ""}  (kept by strict heuristics: ${set.stats.keptByHeuristic})`,
);
for (const [g, n] of Object.entries(set.stats.byGuess).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${g.padEnd(10)} ${n}`);
}
console.log(`wrote ${join(outDir, "candidates.json")} + plan.png`);

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
