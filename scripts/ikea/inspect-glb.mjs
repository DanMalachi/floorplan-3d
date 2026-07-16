// Diagnostic: parse a .glb without decoding, report extensions, textures, and the
// WORLD-space geometry AABB (so we can see if "height" is along Y or a wrong axis).
import { readFileSync } from "node:fs";

function parseGlb(path) {
  const buf = readFileSync(path);
  const magic = buf.toString("ascii", 0, 4);
  if (magic !== "glTF") throw new Error("not a glb: " + magic);
  let off = 12, json = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(body.toString("utf8")); // JSON
    off += 8 + len;
  }
  return json;
}

// --- tiny mat4 (column-major) ---
const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
const fromTRS = (t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) => {
  const [x, y, z, w] = q, [sx, sy, sz] = s;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    t[0], t[1], t[2], 1,
  ];
};
const nodeMatrix = (n) => n.matrix ?? fromTRS(n.translation, n.rotation, n.scale);
const xform = (m, p) => {
  const [x, y, z] = p;
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
  ];
};

function worldAABB(gltf) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const scene = gltf.scenes[gltf.scene ?? 0];
  const walk = (idx, parent) => {
    const n = gltf.nodes[idx];
    const world = mul(parent, nodeMatrix(n));
    if (n.mesh != null) {
      for (const prim of gltf.meshes[n.mesh].primitives) {
        const acc = gltf.accessors[prim.attributes.POSITION];
        if (!acc?.min || !acc?.max) continue; // draco keeps these per spec
        const [x0, y0, z0] = acc.min, [x1, y1, z1] = acc.max;
        for (const cx of [x0, x1]) for (const cy of [y0, y1]) for (const cz of [z0, z1]) {
          const p = xform(world, [cx, cy, cz]);
          for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p[i]); max[i] = Math.max(max[i], p[i]); }
        }
      }
    }
    for (const c of n.children ?? []) walk(c, world);
  };
  const I = fromTRS();
  for (const r of scene.nodes) walk(r, I);
  return { size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

for (const path of process.argv.slice(2)) {
  const g = parseGlb(path);
  const imgs = (g.images ?? []).map((im) => im.mimeType ?? (im.uri ? "uri" : "bufferView"));
  const texMats = (g.materials ?? []).filter((m) =>
    m.pbrMetallicRoughness?.baseColorTexture || m.normalTexture || m.emissiveTexture).length;
  const { size } = worldAABB(g);
  const [sx, sy, sz] = size.map((v) => +v.toFixed(3));
  const tallestAxis = sy >= sx && sy >= sz ? "Y✓" : sx >= sy && sx >= sz ? "X(!)" : "Z(!)";
  console.log(`\n${path.split(/[\\/]/).pop()}`);
  console.log(`  extensionsUsed : ${JSON.stringify(g.extensionsUsed ?? [])}`);
  console.log(`  meshes=${(g.meshes ?? []).length} materials=${(g.materials ?? []).length} texturedMats=${texMats} images=${imgs.length} [${imgs.join(",")}]`);
  console.log(`  geom size XYZ  : ${sx} × ${sy} × ${sz}  → tallest axis = ${tallestAxis}`);
}
