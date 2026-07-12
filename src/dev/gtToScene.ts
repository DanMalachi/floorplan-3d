// Dev-only: render a hand-authored ground-truth floorplan (floorplan-gt/*.json)
// directly in the 3D view. This reads the app's GT EXPORT format back IN so a GT
// spec can be inspected as geometry without going through the trace pipeline.
//
// GT coords are in the units named by metadata (default feet), origin bottom-left.
// The Scene is meters everywhere, so every length is scaled by UNIT_TO_M.

import type { Scene, Node, Wall, Opening } from "@/schema/scene";
import { WALL_HEIGHT, DEFAULT_DOOR, DEFAULT_WINDOW } from "@/schema/constants";

/** The hand-authored GT file shape (subset we render). */
export interface GtFile {
  metadata?: { coordinate_system?: { units?: string; origin?: string } };
  walls: { id: string; type?: string; start: [number, number]; end: [number, number] }[];
  doors?: { id: string; wall: string; center: [number, number]; width?: number; swing?: string }[];
  windows?: { id: string; wall: string; start: [number, number]; end: [number, number] }[];
}

const UNIT_TO_M: Record<string, number> = {
  ft: 0.3048, feet: 0.3048, "'": 0.3048,
  in: 0.0254, inch: 0.0254, '"': 0.0254,
  m: 1, meter: 1, meters: 1,
  cm: 0.01, mm: 0.001,
};

// Wall thickness by GT type (meters). Exterior reads thicker in 3D.
const THICKNESS: Record<string, number> = { exterior: 0.2, interior: 0.1 };

/** Convert a GT floorplan into a renderable Scene (meters). Pure + deterministic. */
export function gtToScene(gt: GtFile): Scene {
  const units = gt.metadata?.coordinate_system?.units?.toLowerCase() ?? "ft";
  const scale = UNIT_TO_M[units] ?? 0.3048;

  // --- nodes: weld coincident wall endpoints into shared nodes ---------------
  const nodes: Node[] = [];
  const byKey = new Map<string, string>();
  const EPS = 1e-4; // meters
  const nodeAt = (xu: number, yu: number): string => {
    const x = xu * scale;
    const y = yu * scale;
    const key = `${Math.round(x / EPS)},${Math.round(y / EPS)}`;
    const hit = byKey.get(key);
    if (hit) return hit;
    const id = `n${nodes.length}`;
    nodes.push({ id, x, y });
    byKey.set(key, id);
    return id;
  };

  // --- walls -----------------------------------------------------------------
  const walls: Wall[] = [];
  // keep each wall's endpoints in ORIGINAL units to project openings onto it
  const ends = new Map<string, { ax: number; ay: number; bx: number; by: number }>();
  for (const w of gt.walls) {
    const a = nodeAt(w.start[0], w.start[1]);
    const b = nodeAt(w.end[0], w.end[1]);
    if (a === b) continue; // zero-length
    walls.push({
      id: w.id,
      a,
      b,
      thickness: THICKNESS[w.type ?? "interior"] ?? THICKNESS.interior,
      height: WALL_HEIGHT,
      kind: "wall",
    });
    ends.set(w.id, { ax: w.start[0], ay: w.start[1], bx: w.end[0], by: w.end[1] });
  }

  // Distance (meters) along a wall from its node `a` to point (px,py), clamped
  // to the wall. Scene `Opening.offset` is measured from node a.
  const offsetAlong = (wallId: string, px: number, py: number): number | null => {
    const e = ends.get(wallId);
    if (!e) return null;
    const dx = e.bx - e.ax;
    const dy = e.by - e.ay;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return null;
    const t = Math.max(0, Math.min(1, ((px - e.ax) * dx + (py - e.ay) * dy) / len2));
    return t * Math.sqrt(len2) * scale;
  };

  // --- openings (doors + windows) --------------------------------------------
  const openings: Opening[] = [];
  for (const d of gt.doors ?? []) {
    const offset = offsetAlong(d.wall, d.center[0], d.center[1]);
    if (offset == null) continue;
    openings.push({
      id: d.id,
      type: "door",
      wallId: d.wall,
      offset,
      width: d.width != null ? d.width * scale : DEFAULT_DOOR.width,
      height: DEFAULT_DOOR.height,
      sill: DEFAULT_DOOR.sill,
    });
  }
  for (const w of gt.windows ?? []) {
    const cx = (w.start[0] + w.end[0]) / 2;
    const cy = (w.start[1] + w.end[1]) / 2;
    const offset = offsetAlong(w.wall, cx, cy);
    if (offset == null) continue;
    const width = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]) * scale;
    openings.push({
      id: w.id,
      type: "window",
      wallId: w.wall,
      offset,
      width: width || DEFAULT_WINDOW.width,
      height: DEFAULT_WINDOW.height,
      sill: DEFAULT_WINDOW.sill,
    });
  }

  return { schemaVersion: 2, units: "meters", nodes, walls, openings, rooms: [], furniture: [] };
}
