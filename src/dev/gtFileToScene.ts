// Dev-only: turn a ground-truth JSON file (dragged in from disk via the GT Lab)
// into a renderable Scene. Two on-disk shapes exist, so we detect and dispatch:
//
//   1. EXPORT format  (floorplan-gt/*.gt.json, written by exportGroundTruth.ts):
//      raw trace state — points[], segments[], openings[] — plus metersPerPixel.
//      We feed it straight through the canonical trace→scene path so a dropped GT
//      renders IDENTICALLY to what Build mode produces from the same trace.
//
//   2. AUTHORED format (hand-written test fixtures): metadata + walls[{start,end}]
//      + doors/windows. Handled by gtToScene.

import type { Scene } from "@/schema/scene";
import type { AppMode, StoreState, TracePoint, TraceSegment, TraceOpening } from "@/store/useSceneStore";
import { traceToScene } from "@legacy/trace2d/traceToScene";
import { gtToScene, type GtFile } from "./gtToScene";

interface GtExport {
  points?: TracePoint[];
  segments?: TraceSegment[];
  openings?: TraceOpening[];
  metersPerPixel?: number | null;
}

/** Parse an already-JSON-decoded GT file into a Scene, or throw with a reason. */
export function gtFileToScene(data: unknown): Scene {
  if (data == null || typeof data !== "object") throw new Error("not a JSON object");
  const o = data as GtExport & GtFile;

  // Export format — check segments FIRST: it also carries a resolved `walls`
  // array (different shape), so the authored branch below must not claim it.
  if (Array.isArray(o.segments) && Array.isArray(o.points)) {
    const mpp = o.metersPerPixel;
    if (typeof mpp !== "number" || !(mpp > 0)) {
      throw new Error("uncalibrated GT export (missing metersPerPixel)");
    }
    return traceToScene({
      points: o.points,
      segments: o.segments,
      openings: o.openings ?? [],
      metersPerPixel: mpp,
    });
  }

  // Authored format — walls given as start/end coordinate pairs.
  if (Array.isArray(o.walls) && Array.isArray(o.walls[0]?.start)) {
    return gtToScene(o as GtFile);
  }

  throw new Error("unrecognized GT format");
}

export interface GtProject {
  name: string; // display name (file name minus .gt.json / .json)
  stats: string; // "12 walls · 3 openings · 2 rooms"
  overrides: Partial<StoreState>; // durable state to seed the saved project with
}

/**
 * Turn a dropped GT file into everything needed to save it as a project: the
 * rendered Scene, a stats line, and the durable store slice. Export-format files
 * also carry their raw trace (points/segments/openings + calibration), which we
 * restore so the saved project stays editable in Trace/Build — not just viewable.
 */
export function gtFileToProject(data: unknown, filename: string): GtProject {
  const scene = gtFileToScene(data); // validates + throws with a reason on bad input
  const name = filename.replace(/\.gt\.json$|\.json$/i, "");
  const stats = `${scene.walls.length} walls · ${scene.openings.length} openings · ${scene.rooms.length} rooms`;

  const overrides: Partial<StoreState> = {
    scene,
    appMode: "view" as AppMode,
    sourcePdfName: filename,
  };

  const o = data as {
    points?: TracePoint[];
    segments?: TraceSegment[];
    openings?: TraceOpening[];
    metersPerPixel?: number | null;
  };
  if (Array.isArray(o.points) && Array.isArray(o.segments) && typeof o.metersPerPixel === "number") {
    overrides.points = o.points;
    overrides.segments = o.segments;
    overrides.openings = o.openings ?? [];
    overrides.metersPerPixel = o.metersPerPixel;
  }

  return { name, stats, overrides };
}
