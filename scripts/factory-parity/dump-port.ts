// Dumps a factory port's built geometry (per named part: positions, normals,
// uvs, material name) to JSON so render-compare.py can render it in Blender
// NEXT TO the approved baked GLB — same renderer, same textures, same light.
// Run: npx tsx scripts/factory-parity/dump-port.ts <generator> <w> <d> <h> <out.json>

import * as fs from "node:fs";
import * as THREE from "three";
import { GENERATORS, sanitizeSpec } from "@/parametric";
import type { ParametricSpec } from "@/schema/scene";

const [gen, w, d, h, out] = process.argv.slice(2);
const g = GENERATORS[gen as ParametricSpec["generator"]];
if (!g || !out) throw new Error("usage: dump-port.ts <generator> <w> <d> <h> <out.json>");
const spec = sanitizeSpec({ ...g.defaultSpec, dims: { w: +w, d: +d, h: +h } });
const group = g.build(spec);
group.updateMatrixWorld(true);
const parts: unknown[] = [];
group.traverse((o) => {
  if (!(o instanceof THREE.Mesh)) return;
  const geo = o.geometry as THREE.BufferGeometry;
  parts.push({
    name: o.name,
    material: (o.material as THREE.Material).name,
    tint: o.userData.tintColor ?? null,
    position: Array.from(geo.attributes.position.array),
    normal: Array.from(geo.attributes.normal.array),
    uv: Array.from(geo.attributes.uv.array),
  });
});
fs.writeFileSync(out, JSON.stringify({ generator: gen, dims: spec.dims, parts }));
console.log(`wrote ${out} (${parts.length} parts)`);
