/**
 * Showroom layout for the dev-only furniture review scene.
 *
 * Packs every item on a flat floor in rows, using each model's MEASURED plan
 * bounding box (the box the product actually draws after normalizing to the
 * catalog footprint), never the catalog footprint itself: normalize() scales
 * the model's LARGER plan side to the footprint's larger side, so the smaller
 * side can come out wider than the catalog says, and a layout built on
 * footprints could still clip.
 *
 * Guarantee: every pair of boxes is separated by at least `gap` along X or Z.
 * Neighbours in a row are exactly `gap` apart; rows are `gap` apart measured
 * from the deepest item in the row, and every item is flush with its row's
 * front edge, so no box reaches into the next row.
 */

export interface Measured {
  id: string;
  group: string;
  /** Plan size in meters, rotation 0: w along X, d along Z. */
  w: number;
  d: number;
}

export interface Placed extends Measured {
  /** Plan centre, meters. */
  x: number;
  y: number;
  row: number;
}

export function packRows(items: Measured[], gap = 0.4, rowWidth = 14): Placed[] {
  const out: Placed[] = [];
  let x = 0;
  let z = 0;
  let rowDepth = 0;
  let row = 0;
  let group: string | null = null;
  const newRow = () => {
    z += rowDepth + gap;
    x = 0;
    rowDepth = 0;
    row++;
  };
  for (const it of items) {
    // A new category starts a new row so groups read as aisles.
    const groupChange = group !== null && it.group !== group;
    if ((x > 0 && x + it.w > rowWidth) || (groupChange && x > 0)) newRow();
    group = it.group;
    out.push({ ...it, x: x + it.w / 2, y: z + it.d / 2, row });
    x += it.w + gap;
    rowDepth = Math.max(rowDepth, it.d);
  }
  return out;
}

/** Smallest separation between two placed boxes' edges (negative = overlap). */
export function clearance(a: Placed, b: Placed): number {
  const gx = Math.abs(a.x - b.x) - (a.w + b.w) / 2;
  const gz = Math.abs(a.y - b.y) - (a.d + b.d) / 2;
  return Math.max(gx, gz);
}
