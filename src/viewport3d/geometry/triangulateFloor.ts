import * as THREE from "three";
import type { Node } from "@/schema/scene";

/**
 * Triangulate a (possibly non-convex / L-shaped) room loop into a flat floor at
 * y = 0. Uses THREE.ShapeUtils.triangulateShape (earcut) — Risk #2 handled, no
 * convexity assumption. Plan (x, y) maps to world (x, z).
 */
export function buildFloorGeometry(loop: Node[]): THREE.BufferGeometry {
  const pts = loop.map((n) => new THREE.Vector2(n.x, n.y));
  const tris = THREE.ShapeUtils.triangulateShape(pts, []);

  const positions: number[] = [];
  const uvs: number[] = [];
  for (const tri of tris) {
    for (const idx of tri) {
      positions.push(pts[idx].x, 0, pts[idx].y);
      // Plan-space UVs: 1 UV unit = 1 meter, so floor textures scale
      // physically via texture.repeat regardless of room size.
      uvs.push(pts[idx].x, pts[idx].y);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  return geom;
}
