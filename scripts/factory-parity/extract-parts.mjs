#!/usr/bin/env node
/**
 * Phase 0 (parametric-factory port) reference-data extractor.
 *
 * Reads one GLB and writes a JSON fixture describing its world-space geometry:
 * overall bbox/triangle count plus a per-NODE breakdown (primitives belonging to
 * the same node are merged into one part, matching how Blender exports one
 * object = one node with N primitives when it has N material slots).
 *
 * All bounds are WORLD-SPACE (node transforms applied), in glTF Y-up metres,
 * matching what the live Three.js viewer sees.
 *
 * Usage:
 *   node scripts/factory-parity/extract-parts.mjs \
 *     --glb <path-to.glb> --out <path-to.json> \
 *     --slug <slug> --set <min|default|max|...> [--args '{"width":1.68}']
 *
 * Requires @gltf-transform/core (already a devDependency of this repo).
 */
import { NodeIO } from "@gltf-transform/core";
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    }
  }
  return out;
}

/** Column-major 4x4 * point (w=1). */
function transformPoint(m, p) {
  const [x, y, z] = p;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

function emptyBBox() {
  return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
}

function extend(bb, p) {
  for (let i = 0; i < 3; i++) {
    bb.min[i] = Math.min(bb.min[i], p[i]);
    bb.max[i] = Math.max(bb.max[i], p[i]);
  }
}

function mergeInto(a, b) {
  for (let i = 0; i < 3; i++) {
    a.min[i] = Math.min(a.min[i], b.min[i]);
    a.max[i] = Math.max(a.max[i], b.max[i]);
  }
}

function round(bb, dp = 6) {
  const r = (n) => Math.round(n * 10 ** dp) / 10 ** dp;
  return { min: bb.min.map(r), max: bb.max.map(r) };
}

async function extract(glbPath) {
  const io = new NodeIO();
  const doc = await io.read(glbPath);
  const root = doc.getRoot();

  const parts = [];
  const overall = emptyBBox();
  let totalTriangles = 0;

  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const worldMatrix = node.getWorldMatrix();

    const nodeBBox = emptyBBox();
    let nodeTriangles = 0;
    let materialName = null;
    const materialNames = new Set();

    for (const prim of mesh.listPrimitives()) {
      const posAcc = prim.getAttribute("POSITION");
      if (!posAcc) continue;
      const count = posAcc.getCount();
      const v = [0, 0, 0];
      for (let i = 0; i < count; i++) {
        posAcc.getElement(i, v);
        extend(nodeBBox, transformPoint(worldMatrix, v));
      }
      const idx = prim.getIndices();
      const triCount = idx ? idx.getCount() / 3 : count / 3;
      nodeTriangles += triCount;
      const mat = prim.getMaterial();
      const name = mat ? mat.getName() || null : null;
      if (name) materialNames.add(name);
      if (materialName === null) materialName = name;
    }

    if (nodeTriangles === 0) continue;

    parts.push({
      name: node.getName() || mesh.getName() || "(unnamed)",
      bbox: round(nodeBBox),
      triangles: nodeTriangles,
      material: materialNames.size > 1 ? [...materialNames].join("+") : materialName,
    });
    mergeInto(overall, nodeBBox);
    totalTriangles += nodeTriangles;
  }

  // stable order: by node name, matches Blender's object-creation order closely enough for diffing
  parts.sort((a, b) => a.name.localeCompare(b.name));

  return {
    bbox: round(overall),
    triangles: totalTriangles,
    parts,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.glb || !args.out) {
    console.error(
      "Usage: node extract-parts.mjs --glb <in.glb> --out <out.json> --slug <slug> --set <set> [--args '<json>']",
    );
    process.exit(1);
  }
  const glbPath = path.resolve(args.glb);
  const outPath = path.resolve(args.out);
  const slug = args.slug || path.basename(glbPath, ".glb");
  const set = args.set || "default";
  let parsedArgs = {};
  if (args.args) {
    try {
      parsedArgs = JSON.parse(args.args);
    } catch (e) {
      console.error("Could not parse --args as JSON:", args.args, e.message);
      process.exit(1);
    }
  }

  const { bbox, triangles, parts } = await extract(glbPath);

  const fixture = {
    slug,
    set,
    args: parsedArgs,
    bbox,
    triangles,
    parts,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2) + "\n");
  console.log(
    `wrote ${outPath}  (bbox ${(bbox.max[0] - bbox.min[0]).toFixed(3)} x ${(bbox.max[1] - bbox.min[1]).toFixed(3)} x ${(bbox.max[2] - bbox.min[2]).toFixed(3)} m, ${triangles} tris, ${parts.length} parts)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
