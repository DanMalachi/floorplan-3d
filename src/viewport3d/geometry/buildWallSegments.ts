import type { Node, Opening, Wall } from "@/schema/scene";
import { DEFAULT_THICKNESS, WALL_HEIGHT } from "@/schema/constants";

// A single solid box making up part of a wall. Openings become real gaps by
// emitting fewer/shorter boxes — NO boolean/CSG ops (Risk #1, segment-split first).
export interface WallPiece {
  position: [number, number, number]; // world center (x, y, z)
  size: [number, number, number]; // [length-along-wall, height, thickness]
  rotationY: number; // rotation about world Y to align length with wall direction
}

/**
 * Split one wall into solid sub-boxes, cutting real gaps for each opening.
 *
 * Works in wall-local length space [0, L] then transforms back to world, so it
 * is correct at ANY wall angle. For each opening we emit:
 *   - full-height solid spans in the gaps between openings,
 *   - a sill box below a window (sill > 0),
 *   - a lintel box above any opening whose top is below the wall height.
 */
export function buildWallSegments(
  wall: Wall,
  openings: Opening[],
  nodes: Map<string, Node>,
): WallPiece[] {
  const a = nodes.get(wall.a);
  const b = nodes.get(wall.b);
  if (!a || !b) return [];

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) return [];

  const ux = dx / L;
  const uy = dy / L;
  const wallH = wall.height ?? WALL_HEIGHT;
  const t = wall.thickness ?? DEFAULT_THICKNESS;
  // plan (x, y) -> world (x, z); rotate box's local +X onto the wall direction.
  const rotationY = -Math.atan2(uy, ux);

  const piece = (s: number, e: number, yb: number, yt: number): WallPiece | null => {
    const spanLen = e - s;
    const h = yt - yb;
    if (spanLen <= 1e-6 || h <= 1e-6) return null;
    const cx = (s + e) / 2; // center distance along wall from node a
    return {
      position: [a.x + ux * cx, (yb + yt) / 2, a.y + uy * cx],
      size: [spanLen, h, t],
      rotationY,
    };
  };

  const ops = openings
    .map((o) => {
      const half = o.width / 2;
      return {
        start: Math.max(0, o.offset - half),
        end: Math.min(L, o.offset + half),
        sill: Math.max(0, o.sill),
        top: Math.min(wallH, o.sill + o.height),
      };
    })
    .filter((o) => o.end > o.start)
    .sort((p, q) => p.start - q.start);

  const pieces: (WallPiece | null)[] = [];
  let cursor = 0;
  for (const o of ops) {
    if (o.start > cursor) pieces.push(piece(cursor, o.start, 0, wallH)); // solid between openings
    if (o.sill > 0) pieces.push(piece(o.start, o.end, 0, o.sill)); // window sill below
    if (o.top < wallH) pieces.push(piece(o.start, o.end, o.top, wallH)); // lintel above
    cursor = Math.max(cursor, o.end);
  }
  if (cursor < L) pieces.push(piece(cursor, L, 0, wallH)); // trailing solid

  return pieces.filter((p): p is WallPiece => p !== null);
}

// Baseboard proportions (meters).
const BASEBOARD_H = 0.09;
const BASEBOARD_PROUD = 0.02; // sticks out past each wall face

/** Solid runs of [0, L] once the given gaps are removed. Shared by wall bodies
 *  and baseboards so the two can never disagree on where an opening cuts. */
export function subtractGaps(
  L: number,
  gaps: { start: number; end: number }[],
): [number, number][] {
  const sorted = [...gaps].sort((p, q) => p.start - q.start);
  const runs: [number, number][] = [];
  let cursor = 0;
  for (const g of sorted) {
    if (g.start > cursor) runs.push([cursor, g.start]);
    cursor = Math.max(cursor, g.end);
  }
  if (cursor < L) runs.push([cursor, L]);
  return runs;
}

/**
 * Baseboard band hugging the wall's floor line. Runs continuous under windows
 * (their sill keeps the floor solid) but breaks at floor-level openings (doors).
 * One box per run, wrapping both faces (thickness + a proud lip each side).
 */
export function buildBaseboards(
  wall: Wall,
  openings: Opening[],
  nodes: Map<string, Node>,
): WallPiece[] {
  if (wall.kind === "rail") return [];
  const a = nodes.get(wall.a);
  const b = nodes.get(wall.b);
  if (!a || !b) return [];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) return [];
  const ux = dx / L;
  const uy = dy / L;
  const t = wall.thickness ?? DEFAULT_THICKNESS;
  const rotationY = -Math.atan2(uy, ux);

  // Only floor-level openings (doors) break the baseboard.
  const gaps = openings
    .filter((o) => o.sill <= 1e-3)
    .map((o) => ({
      start: Math.max(0, o.offset - o.width / 2),
      end: Math.min(L, o.offset + o.width / 2),
    }))
    .filter((g) => g.end > g.start);

  const bandT = t + 2 * BASEBOARD_PROUD;
  const pieces: WallPiece[] = [];
  for (const [s, e] of subtractGaps(L, gaps)) {
    if (e - s <= 1e-6) continue;
    const cx = (s + e) / 2;
    pieces.push({
      position: [a.x + ux * cx, BASEBOARD_H / 2, a.y + uy * cx],
      size: [e - s, BASEBOARD_H, bandT],
      rotationY,
    });
  }
  return pieces;
}

/** An opening's gap volume — the raycast/selection target for doors & windows. */
export interface OpeningVolume {
  openingId: string;
  type: Opening["type"];
  position: [number, number, number];
  size: [number, number, number];
  rotationY: number;
}

/**
 * The box each opening occupies inside its wall, in world space. Slightly
 * thicker than the wall so a highlight reads through both faces.
 */
export function buildOpeningVolumes(
  wall: Wall,
  openings: Opening[],
  nodes: Map<string, Node>,
): OpeningVolume[] {
  const a = nodes.get(wall.a);
  const b = nodes.get(wall.b);
  if (!a || !b) return [];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) return [];
  const ux = dx / L;
  const uy = dy / L;
  const wallH = wall.height ?? WALL_HEIGHT;
  const t = wall.thickness ?? DEFAULT_THICKNESS;
  const rotationY = -Math.atan2(uy, ux);

  const out: OpeningVolume[] = [];
  for (const o of openings) {
    const start = Math.max(0, o.offset - o.width / 2);
    const end = Math.min(L, o.offset + o.width / 2);
    const sill = Math.max(0, o.sill);
    const top = Math.min(wallH, o.sill + o.height);
    if (end <= start || top <= sill) continue;
    const c = (start + end) / 2;
    out.push({
      openingId: o.id,
      type: o.type,
      position: [a.x + ux * c, (sill + top) / 2, a.y + uy * c],
      size: [end - start, top - sill, t * 1.08],
      rotationY,
    });
  }
  return out;
}
