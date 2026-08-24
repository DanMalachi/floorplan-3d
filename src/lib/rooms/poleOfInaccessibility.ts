import { pointInPolygon } from "./roomArea";

export interface Point2 {
  x: number;
  y: number;
}

/**
 * Pole of inaccessibility: the point inside a (possibly concave) simple
 * polygon that is farthest from any edge. Used to place a room's ceiling
 * light so an L-shaped or U-shaped room doesn't get it centered in a wall or
 * outside the room entirely, which the naive vertex-average centroid can do.
 *
 * Mapbox's `polylabel` algorithm (grid + best-first refinement), reimplemented
 * here rather than pulled in as a dependency — this repo has no geometry
 * libraries and hand-rolls its polygon math elsewhere (triangulateFloor,
 * wallJunctions); one more self-contained ~80-line file matches that pattern
 * better than a new npm dependency for a single call site.
 *
 * `precision` is in the same units as `poly` (plan meters); 0.02 m is far
 * finer than matters for light placement and keeps iteration count low for
 * room-sized polygons.
 */
export function poleOfInaccessibility(poly: Point2[], precision = 0.02): Point2 {
  if (poly.length === 0) return { x: 0, y: 0 };
  if (poly.length < 3) return { x: poly[0].x, y: poly[0].y };

  let minX = poly[0].x, minY = poly[0].y, maxX = poly[0].x, maxY = poly[0].y;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  if (width === 0 || height === 0) return { x: minX, y: minY };

  const cellSize = Math.min(width, height);
  const h = cellSize / 2;
  if (h === 0) return { x: minX, y: minY };

  // Best-first search over a queue of cells, ranked by an upper bound on the
  // best distance-to-edge achievable inside that cell (`max`). Popping the
  // best-bound cell first and splitting it into quadrants converges on the
  // true farthest-from-boundary point without exploring the whole grid.
  const queue: Cell[] = [];
  for (let x = minX; x < maxX; x += cellSize) {
    for (let y = minY; y < maxY; y += cellSize) {
      queue.push(makeCell(x + h, y + h, h, poly));
    }
  }

  let best = makeCell(minX + width / 2, minY + height / 2, 0, poly);
  const bboxCell = makeCell(minX + width / 2, minY + height / 2, 0, poly);
  if (bboxCell.d > best.d) best = bboxCell;

  // A full binary heap is the textbook structure for this queue; an array
  // re-sorted each pop is O(n log n) instead of O(log n), but n stays in the
  // dozens for room-scale polygons at this precision, and this runs once per
  // room (memoized by the caller), not per frame. Not worth the extra code
  // for this call site's actual sizes.
  while (queue.length) {
    queue.sort((a, b) => a.max - b.max); // ascending; pop from the end (best last)
    const cell = queue.pop()!;
    if (cell.d > best.d) best = cell;
    // Nothing left in the queue can beat `best` even at its most optimistic
    // bound — done.
    if (cell.max - best.d <= precision) continue;

    const half = cell.h / 2;
    queue.push(makeCell(cell.x - half, cell.y - half, half, poly));
    queue.push(makeCell(cell.x + half, cell.y - half, half, poly));
    queue.push(makeCell(cell.x - half, cell.y + half, half, poly));
    queue.push(makeCell(cell.x + half, cell.y + half, half, poly));
  }

  return { x: best.x, y: best.y };
}

interface Cell {
  x: number;
  y: number;
  h: number; // half-size of the cell
  d: number; // signed distance from the cell center to the polygon boundary
  max: number; // upper bound on distance achievable anywhere in this cell
}

function makeCell(x: number, y: number, h: number, poly: Point2[]): Cell {
  const d = signedDistanceToPolygon({ x, y }, poly);
  return { x, y, h, d, max: d + h * Math.SQRT2 };
}

function signedDistanceToPolygon(p: Point2, poly: Point2[]): number {
  let minSq = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    minSq = Math.min(minSq, distToSegmentSq(p, poly[j], poly[i]));
  }
  const dist = Math.sqrt(minSq);
  return pointInPolygon(p.x, p.y, poly) ? dist : -dist;
}

function distToSegmentSq(p: Point2, a: Point2, b: Point2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return (p.x - cx) ** 2 + (p.y - cy) ** 2;
}
