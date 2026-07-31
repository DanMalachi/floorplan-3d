/**
 * BlenderKit furniture pipeline, step 2 — pick the shippable subset.
 *
 * Reads the full CC0 index and applies metadata-only gates, so we download 85
 * files instead of 355. Selection is kept in its own module (rather than inline
 * in the downloader) because the thresholds are the tunable part: re-running
 * this is free, re-downloading is not.
 *
 * ── Why these gates, and one that was wrong ─────────────────────────────────
 * The obvious quality gate, `modelStyle === "realistic"`, is a TRAP. Measuring
 * the full population showed 116 assets have a glTF export and dimensions, of
 * which 82 are tagged "realistic" and 34 are tagged nothing at all. Inspecting
 * that untagged 34 turns up "Mid Century Lounge Chair", "Modern Wooden
 * Cabinet", "Vintage Day Bed", "Industrial Coffee Table" — i.e. exactly the
 * realistic furniture we want, from uploaders who simply left the field blank.
 * So `modelStyle` is a metadata-completeness signal, not a quality signal:
 * we exclude only the styles that are explicitly wrong for an interior-design
 * app, and treat null as unknown-but-keep.
 *
 * Scene rejection is done by physical size, not `objectCount`. A sofa
 * legitimately has cushions as separate objects, so counting objects punishes
 * good models; a room-sized bounding box is the honest "this is a set, not an
 * item" signal.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { BlenderKitIndexEntry } from "./index-schema";

const INDEX = path.resolve("data/furniture-blenderkit.json");

/** Model styles that are wrong for a realistic interior-design catalog. Anything
 *  else — including an absent tag — is allowed through. */
const EXCLUDED_STYLES = new Set(["lowpoly", "low-poly", "stylized", "cartoon", "anime", "sculpt"]);

/** Plan-footprint bounds in metres. Below the floor we're looking at pens and
 *  screws; above the ceiling we're looking at a whole room. */
const MIN_PLAN_M = 0.15;
const MAX_PLAN_M = 4.0;

/** Height bounds in metres — catches floor-plane scenes (h≈0) and buildings. */
const MIN_HEIGHT_M = 0.05;
const MAX_HEIGHT_M = 3.0;

/** Triangle budget. Generous here because gltf-transform + Draco run later; the
 *  point is only to drop the pathological million-poly outliers. */
const MAX_FACES = 200_000;

export interface SelectionResult {
  kept: BlenderKitIndexEntry[];
  rejected: { entry: BlenderKitIndexEntry; reason: string }[];
}

/** Largest horizontal extent. BlenderKit reports dimensions in Blender's Z-up
 *  frame, so X and Y are the plan footprint and Z is height. */
export function planExtent(e: BlenderKitIndexEntry): number {
  return Math.max(e.geometry.dimensionX ?? 0, e.geometry.dimensionY ?? 0);
}

export function select(entries: BlenderKitIndexEntry[]): SelectionResult {
  const kept: BlenderKitIndexEntry[] = [];
  const rejected: { entry: BlenderKitIndexEntry; reason: string }[] = [];

  for (const e of entries) {
    const g = e.geometry;
    let reason: string | null = null;

    if (e.license !== "cc_zero") reason = "license";
    else if (e.gltfFileId === null) reason = "no glTF export (blend-only)";
    else if (g.dimensionX === null || g.dimensionZ === null) reason = "no dimensions";
    else if (e.modelStyle && EXCLUDED_STYLES.has(e.modelStyle)) reason = `style=${e.modelStyle}`;
    else if (planExtent(e) < MIN_PLAN_M) reason = `too small (${planExtent(e).toFixed(2)}m)`;
    else if (planExtent(e) > MAX_PLAN_M) reason = `too large, likely a scene (${planExtent(e).toFixed(2)}m)`;
    else if (g.dimensionZ < MIN_HEIGHT_M) reason = `flat (h=${g.dimensionZ.toFixed(2)}m)`;
    else if (g.dimensionZ > MAX_HEIGHT_M) reason = `too tall (h=${g.dimensionZ.toFixed(2)}m)`;
    else if ((g.faceCount ?? 0) > MAX_FACES) reason = `${g.faceCount} faces`;

    if (reason) rejected.push({ entry: e, reason });
    else kept.push(e);
  }

  return { kept, rejected };
}

export function loadIndex(): BlenderKitIndexEntry[] {
  return JSON.parse(readFileSync(INDEX, "utf8")) as BlenderKitIndexEntry[];
}

// Run directly to print the selection report without downloading anything.
if (process.argv[1] && process.argv[1].endsWith("select.ts")) {
  const all = loadIndex();
  const { kept, rejected } = select(all);
  const byReason = new Map<string, number>();
  for (const r of rejected) {
    const key = r.reason.replace(/\(.*\)/, "").replace(/\d+/g, "N").trim();
    byReason.set(key, (byReason.get(key) ?? 0) + 1);
  }
  const byCat = new Map<string, number>();
  for (const e of kept) byCat.set(e.category, (byCat.get(e.category) ?? 0) + 1);

  console.log(`Selected ${kept.length} of ${all.length} CC0 interior assets.\n`);
  console.log("Rejected by reason:");
  for (const [r, n] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${r}`);
  }
  console.log("\nKept by category:");
  for (const [c, n] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${c}`);
  }
}
