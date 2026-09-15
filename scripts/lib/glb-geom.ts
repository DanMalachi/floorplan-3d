/**
 * Read a .glb's world-space geometry AABB WITHOUT decoding it. POSITION accessor
 * min/max are retained even under KHR_draco_mesh_compression (per spec), so we can
 * derive true model dimensions cheaply — used to detect mis-oriented models.
 */
import { readFileSync } from "node:fs";

function parseGlb(p: string): any {
  const buf = readFileSync(p);
  if (buf.toString("ascii", 0, 4) !== "glTF") throw new Error("not glb");
  let off = 12,
    json: any = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(body.toString("utf8")); // "JSON"
    off += 8 + len;
  }
  return json;
}

type M = number[];
const mul = (a: M, b: M): M => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
const fromTRS = (t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]): M => {
  const [x, y, z, w] = q;
  const [sx, sy, sz] = s;
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
const nodeMatrix = (n: any): M => n.matrix ?? fromTRS(n.translation, n.rotation, n.scale);
const xform = (m: M, p: number[]): number[] => {
  const [x, y, z] = p;
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
  ];
};

/** World-space geometry size [x, y, z] in the glb's own units (meters for IKEA). */
export function geomSize(glbPath: string): [number, number, number] | null {
  let g: any;
  try {
    g = parseGlb(glbPath);
  } catch {
    return null;
  }
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  const scene = g.scenes?.[g.scene ?? 0];
  if (!scene) return null;
  const walk = (idx: number, parent: M) => {
    const n = g.nodes[idx];
    const world = mul(parent, nodeMatrix(n));
    if (n.mesh != null) {
      for (const prim of g.meshes[n.mesh].primitives) {
        const acc = g.accessors[prim.attributes.POSITION];
        if (!acc?.min || !acc?.max) continue;
        for (const cx of [acc.min[0], acc.max[0]])
          for (const cy of [acc.min[1], acc.max[1]])
            for (const cz of [acc.min[2], acc.max[2]]) {
              const q = xform(world, [cx, cy, cz]);
              for (let i = 0; i < 3; i++) {
                mn[i] = Math.min(mn[i], q[i]);
                mx[i] = Math.max(mx[i], q[i]);
              }
            }
      }
    }
    for (const c of n.children ?? []) walk(c, world);
  };
  for (const r of scene.nodes) walk(r, fromTRS());
  if (!isFinite(mn[0])) return null;
  return [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
}
