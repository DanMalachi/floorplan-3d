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
