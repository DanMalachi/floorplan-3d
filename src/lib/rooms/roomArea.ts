import type { Id, Node } from "../../schema/scene";

/**
 * Signed-magnitude polygon area (m²) of a room loop via the shoelace formula.
 * Winding-independent (absolute value). Nodes are looked up by id; unknown ids
 * are skipped. Shared helper — replaces the inline copies in Viewport/floor mesh.
 */
export function roomArea(loop: Id[], nodes: Map<Id, Node>): number {
  const pts = loop.map((id) => nodes.get(id)).filter((n): n is Node => n != null);
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/**
 * Axis-aligned bounding-box SIZE (metres) of a room loop — the room's
 * "W x H" as the inspector prints it, and the input to semanticGraph's
 * aspect ratio.
 *
 * One implementation for both: semanticGraph computed this inline and then
 * threw w/h away (keeping only the ratio), so the number the panel shows and
 * the number the classifier reasoned about could have drifted apart. Unknown
 * node ids are skipped, and an empty loop measures 0 x 0 rather than the
 * -Infinity a bare min/max sweep would produce.
 */
export function roomBBox(loop: Id[], nodes: Map<Id, Node>): { w: number; h: number } {
  const pts = loop.map((id) => nodes.get(id)).filter((n): n is Node => n != null);
  if (pts.length === 0) return { w: 0, h: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { w: maxX - minX, h: maxY - minY };
}

/** Convenience: build the id->Node map most callers need alongside roomArea. */
export function nodeMap(nodes: Node[]): Map<Id, Node> {
  return new Map(nodes.map((n) => [n.id, n]));
}

/** Ray-casting point-in-polygon. Works in any consistent 2D space (px or m). */
export function pointInPolygon(
  x: number,
  y: number,
  poly: { x: number; y: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i];
    const pj = poly[j];
    if (
      pi.y > y !== pj.y > y &&
      x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}
