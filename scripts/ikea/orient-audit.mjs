// Audit orientation across all shipped IKEA models. For each item with a local glb
// we compare the glb's geometry AABB (from POSITION accessor min/max, retained even
// under draco) against IKEA's known W/D/H. If the model's VERTICAL (Y) extent does
// not match the real height — but a horizontal axis does — the model is lying down.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

// ---- glb geometry AABB (reused from inspect-glb.mjs) ----
function parseGlb(p) {
  const buf = readFileSync(p);
  if (buf.toString("ascii", 0, 4) !== "glTF") throw new Error("not glb");
  let off = 12, json = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(body.toString("utf8"));
    off += 8 + len;
  }
  return json;
}
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const fromTRS = (t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) => { const [x, y, z, w] = q, [sx, sy, sz] = s; const x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2; return [(1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0, (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0, (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0, t[0], t[1], t[2], 1]; };
const nm = (n) => n.matrix ?? fromTRS(n.translation, n.rotation, n.scale);
const xf = (m, p) => { const [x, y, z] = p, w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1; return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w]; };
function aabb(g) {
  const mn = [1 / 0, 1 / 0, 1 / 0], mx = [-1 / 0, -1 / 0, -1 / 0];
  const sc = g.scenes[g.scene ?? 0];
  const walk = (i, par) => { const n = g.nodes[i], w = mul(par, nm(n)); if (n.mesh != null) for (const pr of g.meshes[n.mesh].primitives) { const a = g.accessors[pr.attributes.POSITION]; if (!a?.min || !a?.max) continue; for (const cx of [a.min[0], a.max[0]]) for (const cy of [a.min[1], a.max[1]]) for (const cz of [a.min[2], a.max[2]]) { const q = xf(w, [cx, cy, cz]); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], q[k]); mx[k] = Math.max(mx[k], q[k]); } } } for (const c of n.children ?? []) walk(c, w); };
  for (const r of sc.nodes) walk(r, fromTRS());
  return [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
}

const items = JSON.parse(readFileSync(path.resolve("data/furniture-ikea.json"), "utf8"));
const DIR = path.resolve("public/furniture/ikea");
const near = (a, b) => a > 0 && b > 0 && Math.abs(a - b) / Math.max(a, b) <= 0.18; // 18% tol

const lying = [], ok = [], noHeight = [], noDims = [];
for (const it of items) {
  const f = path.join(DIR, `${it.sourceItemId}.glb`);
  if (!existsSync(f)) continue;
  const d = it.dimensions || {};
  const h = d.height != null ? d.height / 100 : null;   // real height (m)
  const w = d.width != null ? d.width / 100 : null;
  const dep = d.depth != null ? d.depth / 100 : null;
  let size;
  try { size = aabb(parseGlb(f)); } catch { continue; }
  const [gx, gy, gz] = size;
  if (h == null) { noHeight.push(it.sourceItemId); continue; }
  const yMatchesHeight = near(gy, h);
  const yMatchesFootprint = (w != null && near(gy, w)) || (dep != null && near(gy, dep));
  // Lying down: the vertical extent matches a footprint dim, not the height, and a
  // horizontal extent matches the height.
  const horizMatchesHeight = near(gx, h) || near(gz, h);
  const rec = { id: it.sourceItemId, name: it.name, real: `${d.width ?? "?"}×${d.depth ?? "?"}×${d.height}cm`, glb: `${gx.toFixed(2)}×${gy.toFixed(2)}×${gz.toFixed(2)}m` };
  if (yMatchesHeight) ok.push(rec);
  else if (!yMatchesHeight && horizMatchesHeight && (yMatchesFootprint || gy < h * 0.7)) lying.push(rec);
  else noDims.push(rec); // ambiguous (square-ish, extendable, or odd)
}

console.log(`Shipped models audited: ${ok.length + lying.length + noDims.length + noHeight.length}`);
console.log(`  upright (Y≈height)      : ${ok.length}`);
console.log(`  LYING DOWN (height on X/Z): ${lying.length}`);
console.log(`  ambiguous/square         : ${noDims.length}`);
console.log(`  no real height           : ${noHeight.length}`);
console.log(`\n── LYING DOWN (${lying.length}) ──`);
for (const r of lying.slice(0, 60)) console.log(`  ${r.id}  ${r.name.padEnd(14)} real ${r.real.padEnd(18)} glb ${r.glb}`);
console.log(`\n── sample AMBIGUOUS (${noDims.length}) ──`);
for (const r of noDims.slice(0, 12)) console.log(`  ${r.id}  ${r.name.padEnd(14)} real ${r.real.padEnd(18)} glb ${r.glb}`);
