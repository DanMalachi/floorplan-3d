/**
 * One-off diagnostic: print the AABB of any .glb files passed as arguments.
 * Used to isolate which gltf-transform pass deforms a model.
 *
 *   npx tsx scripts/blenderkit/aabb-probe.ts a.glb b.glb ...
 */

import path from "node:path";
import { geomSize } from "../ikea/glb-geom";

for (const f of process.argv.slice(2)) {
  const s = geomSize(path.resolve(f));
  console.log(`${path.basename(f).padEnd(28)} ${s ? s.map((n) => n.toFixed(3)).join(" x ") : "unreadable"}`);
}
