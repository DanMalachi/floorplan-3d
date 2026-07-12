/**
 * Score the vector Interpreter (src/trace2d/vector/interpret.ts) against ground
 * truth on the vector-cad plans, reusing the shared scorers. Reports recall AND
 * precision per class so regressions in either can't hide. Run after every
 * Interpreter change:
 *   npx tsx scripts/eval/score-vector.ts
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { interpretVector } from "../../src/trace2d/vector/interpret";
import { coveragePlan, scorePlan, heuristicPredictions } from "./score-core";
import type { Candidate } from "../../src/trace2d/candidates";
import type { ImportSegment, ImportArc } from "../../src/store/useSceneStore";
import type { GroundTruth } from "../../src/trace2d/exportGroundTruth";

const PY =
  process.env.PYTHON_EXE ?? "C:/Users/dandu/AppData/Local/Programs/Python/Python311/python.exe";

const plans = readFileSync("eval/corpus.jsonl", "utf8")
  .split(/\r?\n/)
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l))
  .filter((p: { style: string }) => p.style === "vector-cad");

let id = 0;
const wallCand = (w: { x0: number; y0: number; x1: number; y1: number; thickness: number }): Candidate => {
  const dx = w.x1 - w.x0;
  const dy = w.y1 - w.y0;
  return {
    id: id++, kind: "wall", guess: "wall", keptByHeuristic: true,
    px: [Math.round(w.x0), Math.round(w.y0), Math.round(w.x1), Math.round(w.y1)],
    lengthPx: Math.hypot(dx, dy), thicknessPx: w.thickness,
    angleDeg: ((Math.atan2(dy, dx) * 180) / Math.PI + 180) % 180, flags: [],
  };
};
const openCand = (o: { x0: number; y0: number; x1: number; y1: number; type: string; thickness: number; flags?: string[] }): Candidate => {
  const dx = o.x1 - o.x0;
  const dy = o.y1 - o.y0;
  return {
    id: id++, kind: "opening", guess: o.type as Candidate["guess"], keptByHeuristic: true,
    px: [Math.round(o.x0), Math.round(o.y0), Math.round(o.x1), Math.round(o.y1)],
    lengthPx: Math.hypot(dx, dy), thicknessPx: o.thickness,
    angleDeg: ((Math.atan2(dy, dx) * 180) / Math.PI + 180) % 180, flags: o.flags ?? [],
  };
};

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

for (const p of plans) {
  const raw = JSON.parse(
    execFileSync(PY, ["scripts/extract_pdf.py", p.source, "0"], { maxBuffer: 256 * 1024 * 1024, encoding: "utf8" }),
  );
  const z = raw.render.zoom;
  const segs: ImportSegment[] = raw.segments.map((s: Record<string, number>) => ({
    x0: s.x0 * z, y0: s.y0 * z, x1: s.x1 * z, y1: s.y1 * z,
    color: (s.color as unknown as [number, number, number] | null) ?? null, width: s.width ?? 0,
    layer: (s.layer as unknown as string) ?? "0",
  }));
  const arcs: ImportArc[] = (raw.arcs ?? []).map((a: Record<string, number>) => ({
    x0: a.x0 * z, y0: a.y0 * z, x1: a.x1 * z, y1: a.y1 * z, chord: a.chord * z,
    color: (a.color as unknown as [number, number, number] | null) ?? null, width: a.width ?? 0,
    layer: (a.layer as unknown as string) ?? "0",
  }));
  const obs = interpretVector(segs, arcs, p.mpp ?? null);
  id = 0;
  const cands: Candidate[] = [
    ...obs.walls.map(wallCand),
    ...obs.openings.map((o) => openCand({ ...o })),
  ];
  const gt = JSON.parse(readFileSync(p.gt, "utf8")) as GroundTruth;
  const cov = coveragePlan(cands, gt);
  const s = scorePlan(cands, heuristicPredictions(cands), gt);
  const gtD = gt.resolvedOpenings.filter((o) => o.type === "door").length;
  const gtW = gt.resolvedOpenings.filter((o) => o.type === "window").length;
  console.log(`\n=== ${p.id}  (GT: ${gt.walls.length} walls, ${gtD} doors, ${gtW} windows) ===`);
  console.log(
    `  out: ${obs.walls.length} walls, ${obs.openings.filter((o) => o.type === "door").length} doors, ${obs.openings.filter((o) => o.type === "window").length} windows` +
      (obs.faces != null ? ` | faces: ${obs.faces}` : "") +
      ` | thickness(px): [${obs.thicknessClusters.map((t) => t.toFixed(0)).join(", ")}]`,
  );
  console.log(`  WALL   recall(cov) ${cov.walls.hit}/${cov.walls.total}   len-F1 ${pct(s.wallLength.f1)}  (P ${pct(s.wallLength.precision)} / R ${pct(s.wallLength.recall)})`);
  for (const cls of ["door", "window"] as const) {
    const c = s.perClass[cls];
    if (!c) continue;
    console.log(`  ${cls.toUpperCase().padEnd(6)} tp=${c.tp} fp=${c.fp} fn=${c.fn}   P ${pct(c.precision)} / R ${pct(c.recall)} / F1 ${pct(c.f1)}`);
  }
}
