import type { TracePoint, TraceSegment, TraceOpening } from "@/store/useSceneStore";

// ---------------------------------------------------------------------------
// Ground-truth export (Phase 2.5 / M1). A hand-traced plan already encodes
// class implicitly — a segment traced with the wall tool IS a wall, a traced
// opening IS a door/window. Exporting the trace (in image-px space, the same
// space candidates live in) gives the scoring harness labeled ground truth
// with no extra labeling UI.
// ---------------------------------------------------------------------------

export interface GtWall {
  segmentId: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface GtOpening {
  id: string;
  type: "door" | "window";
  segmentId: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface GroundTruth {
  schemaVersion: 1;
  kind: "floorplan-ground-truth";
  sourcePdf: string | null;
  exportedAt: string;
  metersPerPixel: number | null;
  imageSize: { width: number; height: number } | null;
  // Raw trace state (openings in wall-local t0..t1) — full fidelity.
  points: TracePoint[];
  segments: TraceSegment[];
  openings: TraceOpening[];
  // Resolved to image-px endpoints — what the scoring harness consumes.
  walls: GtWall[];
  resolvedOpenings: GtOpening[];
}

export function buildGroundTruth(args: {
  sourcePdf: string | null;
  metersPerPixel: number | null;
  imageSize: { width: number; height: number } | null;
  points: TracePoint[];
  segments: TraceSegment[];
  openings: TraceOpening[];
}): GroundTruth {
  const byId = new Map(args.points.map((p) => [p.id, p]));
  const walls: GtWall[] = [];
  const segById = new Map<string, { a: TracePoint; b: TracePoint }>();
  for (const s of args.segments) {
    const a = byId.get(s.a);
    const b = byId.get(s.b);
    if (!a || !b) continue;
    segById.set(s.id, { a, b });
    walls.push({ segmentId: s.id, x0: a.x, y0: a.y, x1: b.x, y1: b.y });
  }
  const resolvedOpenings: GtOpening[] = [];
  for (const o of args.openings) {
    const seg = segById.get(o.segmentId);
    if (!seg) continue;
    const { a, b } = seg;
    resolvedOpenings.push({
      id: o.id,
      type: o.type,
      segmentId: o.segmentId,
      x0: a.x + (b.x - a.x) * o.t0,
      y0: a.y + (b.y - a.y) * o.t0,
      x1: a.x + (b.x - a.x) * o.t1,
      y1: a.y + (b.y - a.y) * o.t1,
    });
  }
  return {
    schemaVersion: 1,
    kind: "floorplan-ground-truth",
    sourcePdf: args.sourcePdf,
    exportedAt: new Date().toISOString(),
    metersPerPixel: args.metersPerPixel,
    imageSize: args.imageSize,
    points: args.points,
    segments: args.segments,
    openings: args.openings,
    walls,
    resolvedOpenings,
  };
}

/** Trigger a browser download of the ground truth as JSON. */
export function downloadGroundTruth(gt: GroundTruth) {
  const base = (gt.sourcePdf ?? "plan").replace(/\.pdf$/i, "");
  const blob = new Blob([JSON.stringify(gt, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${base}.gt.json`;
  a.click();
  URL.revokeObjectURL(url);
}
