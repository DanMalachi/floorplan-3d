/**
 * Register a traced plan into the benchmark corpus (`eval/corpus.jsonl`).
 *
 * Removes the friction of growing the benchmark by hand: given a source image
 * and the `.gt.json` you exported from the app (TraceRail → Ground truth), it
 * computes the sha256, reads the scale from the GT, auto-tags the drawing
 * style with our own style router, and appends a manifest line. Dedupes by
 * hash so re-running is safe.
 *
 * Usage:
 *   npx tsx scripts/eval/register-plan.ts <source-image> <plan.gt.json> \
 *     [--split benchmark|dev] [--style X] [--id X] [--rights X] \
 *     [--provenance "..."] [--trainable] [--dry-run] [--force]
 *
 * Defaults: split=benchmark (held out), rights=owned, trainable=false
 * (benchmark plans are never trained on).
 */
import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { basename, join } from "node:path";
import type { GroundTruth } from "../../src/trace2d/exportGroundTruth";

const PY =
  process.env.PYTHON_EXE ??
  "C:\\Users\\dandu\\AppData\\Local\\Programs\\Python\\Python311\\python.exe";
const MANIFEST = join("eval", "corpus.jsonl");

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (flag: string) => process.argv.includes(flag);

const source = process.argv[2];
const gtPath = process.argv[3];
if (!source || !gtPath || source.startsWith("--") || !existsSync(source) || !existsSync(gtPath)) {
  console.error(
    "usage: npx tsx scripts/eval/register-plan.ts <source-image> <plan.gt.json> [--split benchmark|dev] [--style X] [--id X] [--rights X] [--provenance ...] [--trainable] [--dry-run] [--force]",
  );
  process.exit(1);
}

const gt = JSON.parse(readFileSync(gtPath, "utf8")) as GroundTruth;
if (gt.kind !== "floorplan-ground-truth") {
  console.error(`${gtPath} is not a floorplan-ground-truth file`);
  process.exit(1);
}
if (gt.metersPerPixel == null) {
  console.error(
    `WARNING: ${gtPath} has no metersPerPixel (traced without scale). Set the scale in the app and re-export, or size filters will be wrong.`,
  );
}

const sha256 = createHash("sha256").update(readFileSync(source)).digest("hex");

// Dedupe against existing entries.
const existing = existsSync(MANIFEST)
  ? readFileSync(MANIFEST, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as { id: string; sha256?: string })
  : [];
const dup = existing.find((e) => e.sha256 === sha256);
if (dup && !has("--force")) {
  console.error(`already registered as "${dup.id}" (same sha256). Use --force to add anyway.`);
  process.exit(1);
}

// Auto-tag style via our own router (best-effort; falls back to "unknown").
let style = arg("--style");
if (!style) {
  try {
    const tmp = join("eval-out", "_register-signals");
    const out = execFileSync(PY, [join("scripts", "propose_raster.py"), source, "--signals", tmp], {
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
    });
    style = (JSON.parse(out).routing?.style as string) ?? "unknown";
  } catch {
    style = "unknown";
  }
}

const entry = {
  id: arg("--id") ?? basename(source).replace(/\.(png|jpe?g|webp|pdf)$/i, "").replace(/[^\w.-]/g, "_"),
  source: source.replace(/\\/g, "/"),
  gt: gtPath.replace(/\\/g, "/"),
  mpp: gt.metersPerPixel,
  style,
  split: (arg("--split") as "benchmark" | "dev") ?? "benchmark",
  provenance: arg("--provenance") ?? "user-supplied",
  rights: arg("--rights") ?? "owned",
  trainable: has("--trainable"),
  sha256,
};

const nWalls = gt.walls.length;
const nDoors = gt.resolvedOpenings.filter((o) => o.type === "door").length;
const nWindows = gt.resolvedOpenings.filter((o) => o.type === "window").length;
console.log(
  `${entry.id}: style=${style}, split=${entry.split}, mpp=${entry.mpp}, GT ${nWalls}w/${nDoors}d/${nWindows}win`,
);
console.log(JSON.stringify(entry));

if (has("--dry-run")) {
  console.log("(dry run — not written)");
} else {
  appendFileSync(MANIFEST, JSON.stringify(entry) + "\n");
  console.log(`appended to ${MANIFEST}`);
}
