/**
 * BlenderKit furniture pipeline, step 4 — audit the downloaded .glb files.
 *
 * Two things must be established from the FILES, not from metadata:
 *
 *  1. Up-axis. BlenderKit reports dimensions in Blender's Z-up frame, but the
 *     glTF exporter is supposed to rotate to glTF's Y-up convention. If it did,
 *     a model's glb AABB is [dimX, dimZ, dimY]. We test both mappings against
 *     every file and report the distribution, so `modelRotation` is decided by
 *     measurement rather than by trusting the exporter.
 *
 *  2. Scale agreement. If the glb AABB doesn't match the reported dimensions
 *     under EITHER mapping, the metadata is lying about that asset and its
 *     footprint can't be trusted — the catalog needs the measured value.
 *
 * Reuses scripts/ikea/glb-geom.ts, which reads POSITION accessor min/max without
 * decoding geometry, so this is fast even on 412 MB of models.
 *
 * Run:
 *   npx tsx scripts/blenderkit/audit.ts
 */

import { existsSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { geomSize } from "../ikea/glb-geom";
import { loadIndex, select } from "./select";

const MODEL_DIR = path.resolve("public/furniture/blenderkit");
const OUT = path.resolve("data/furniture-blenderkit.audit.json");

/** Relative agreement between two positive lengths, 1.0 = identical. */
function agree(a: number, b: number): number {
  if (a <= 0 || b <= 0) return 0;
  return Math.min(a, b) / Math.max(a, b);
}

/** Mean agreement across a 3-axis mapping. */
function mappingScore(glb: [number, number, number], want: [number, number, number]): number {
  return (agree(glb[0], want[0]) + agree(glb[1], want[1]) + agree(glb[2], want[2])) / 3;
}

export interface AuditRow {
  assetBaseId: string;
  name: string;
  category: string;
  fileBytes: number;
  /** Measured AABB of the .glb, in its own units. */
  glbSize: [number, number, number] | null;
  /** BlenderKit's reported Blender-frame dimensions [X, Y, Z(up)]. */
  reported: [number, number, number];
  /** Which axis convention the file actually uses. */
  upAxis: "y-up" | "z-up" | "unknown";
  /** Agreement score of the winning mapping, 0..1. */
  score: number;
  /** Plan footprint in metres, measured from the glb under the detected axis. */
  footprint: { w: number; d: number } | null;
  /** Height in metres, measured. */
  height: number | null;
  issues: string[];
}

function main() {
  const { kept } = select(loadIndex());
  const rows: AuditRow[] = [];

  for (const e of kept) {
    const file = path.join(MODEL_DIR, `${e.assetBaseId}.glb`);
    if (!existsSync(file)) continue;

    const reported: [number, number, number] = [
      e.geometry.dimensionX ?? 0,
      e.geometry.dimensionY ?? 0,
      e.geometry.dimensionZ ?? 0,
    ];
    const glb = geomSize(file);
    const issues: string[] = [];

    let upAxis: AuditRow["upAxis"] = "unknown";
    let score = 0;
    let footprint: { w: number; d: number } | null = null;
    let height: number | null = null;

    if (!glb) {
      issues.push("unreadable glb / no POSITION bounds");
    } else {
      // y-up: exporter rotated, so glb = [X, Z, Y] of the Blender frame.
      const yUp = mappingScore(glb, [reported[0], reported[2], reported[1]]);
      // z-up: exporter passed through, glb = [X, Y, Z].
      const zUp = mappingScore(glb, reported);

      if (yUp >= zUp) {
        upAxis = "y-up";
        score = yUp;
        footprint = { w: glb[0], d: glb[2] };
        height = glb[1];
      } else {
        upAxis = "z-up";
        score = zUp;
        footprint = { w: glb[0], d: glb[1] };
        height = glb[2];
      }

      if (score < 0.9) issues.push(`axis/scale mismatch (score ${score.toFixed(2)})`);
      if (height !== null && height > 3.0) issues.push(`height ${height.toFixed(2)}m`);
      if (footprint && Math.max(footprint.w, footprint.d) > 4.0)
        issues.push(`footprint ${Math.max(footprint.w, footprint.d).toFixed(2)}m`);
    }

    rows.push({
      assetBaseId: e.assetBaseId,
      name: e.displayName || e.name,
      category: e.category,
      fileBytes: statSync(file).size,
      glbSize: glb,
      reported,
      upAxis,
      score,
      footprint,
      height,
      issues,
    });
  }

  writeFileSync(OUT, JSON.stringify(rows, null, 2));

  // ── Report ───────────────────────────────────────────────────────────────
  const axis = new Map<string, number>();
  for (const r of rows) axis.set(r.upAxis, (axis.get(r.upAxis) ?? 0) + 1);
  const flagged = rows.filter((r) => r.issues.length > 0);
  const totalMB = rows.reduce((s, r) => s + r.fileBytes, 0) / 1024 / 1024;
  const sizes = rows.map((r) => r.fileBytes).sort((a, b) => a - b);
  const pct = (p: number) => (sizes[Math.floor(sizes.length * p)] / 1024 / 1024).toFixed(1);

  console.log(`Audited ${rows.length} models · ${totalMB.toFixed(0)} MB total\n`);
  console.log("Up-axis detected:");
  for (const [a, n] of axis) console.log(`  ${String(n).padStart(4)}  ${a}`);
  console.log(`\nFile size  median ${pct(0.5)} MB · p90 ${pct(0.9)} MB · max ${pct(0.999)} MB`);
  console.log(`\nFlagged: ${flagged.length}`);
  for (const r of flagged.slice(0, 25)) {
    console.log(`  • ${r.name.slice(0, 40).padEnd(42)} ${r.issues.join("; ")}`);
  }
  console.log(`\nWrote ${path.relative(process.cwd(), OUT)}`);
}

main();
