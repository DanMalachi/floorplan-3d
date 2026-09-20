#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getBounds, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const argv = process.argv.slice(2);
if (!argv[0] || argv.includes("--help")) {
  console.log("Usage: node audit-glb.mjs <model.glb> [--json <audit.json>]");
  process.exit(argv.includes("--help") ? 0 : 2);
}
const file = path.resolve(argv[0]);
const jsonIndex = argv.indexOf("--json");
const jsonPath = jsonIndex >= 0 ? path.resolve(argv[jsonIndex + 1]) : null;
const bytes = await readFile(file);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.readBinary(new Uint8Array(bytes));
const root = doc.getRoot();

function primitiveTriangles(primitive) {
  const count = primitive.getIndices()?.getCount() ?? primitive.getAttribute("POSITION")?.getCount() ?? 0;
  switch (primitive.getMode()) {
    case 4: return Math.floor(count / 3);
    case 5:
    case 6: return Math.max(0, count - 2);
    default: return 0;
  }
}

const meshes = root.listMeshes();
const primitives = meshes.flatMap((mesh) => mesh.listPrimitives());
const vertexAccessors = new Set(primitives.map((primitive) => primitive.getAttribute("POSITION")).filter(Boolean));
const scene = root.getDefaultScene() ?? root.listScenes()[0] ?? null;
const bounds = scene ? getBounds(scene) : { min: [null, null, null], max: [null, null, null] };
const dimensions = bounds.min[0] === null ? [null, null, null] : bounds.max.map((value, index) => value - bounds.min[index]);
const textures = root.listTextures().map((texture) => ({
  name: texture.getName() || null,
  uri: texture.getURI() || null,
  mimeType: texture.getMimeType() || null,
  bytes: texture.getImage()?.byteLength ?? null
}));

const materials = root.listMaterials().map((material) => ({
  name: material.getName() || null,
  baseColor: Boolean(material.getBaseColorTexture()),
  metallicRoughness: Boolean(material.getMetallicRoughnessTexture()),
  normal: Boolean(material.getNormalTexture()),
  emissive: Boolean(material.getEmissiveTexture()),
  occlusion: Boolean(material.getOcclusionTexture())
}));

const audit = {
  file,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  fileBytes: bytes.byteLength,
  bounds,
  dimensionsXYZM: dimensions,
  nodes: root.listNodes().length,
  meshes: meshes.length,
  primitives: primitives.length,
  vertices: [...vertexAccessors].reduce((sum, accessor) => sum + accessor.getCount(), 0),
  triangles: primitives.reduce((sum, primitive) => sum + primitiveTriangles(primitive), 0),
  materials,
  textures,
  embeddedTextureBytes: textures.reduce((sum, texture) => sum + (texture.bytes ?? 0), 0),
  missing: {
    baseColor: materials.filter((material) => !material.baseColor).map((material) => material.name),
    roughness: materials.filter((material) => !material.metallicRoughness).map((material) => material.name),
    normal: materials.filter((material) => !material.normal).map((material) => material.name)
  }
};

const output = JSON.stringify(audit, null, 2) + "\n";
if (jsonPath) await writeFile(jsonPath, output, { flag: "wx" });
process.stdout.write(output);
