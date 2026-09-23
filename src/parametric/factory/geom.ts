import * as THREE from "three";
import { ImprovedNoise } from "three/examples/jsm/math/ImprovedNoise.js";

// TypeScript port of the done-furniture-factory Blender helpers
// (~/.claude/skills/done-furniture-factory/scripts/blender/furniture_lib.py and
// the per-piece build scripts). docs/parametric-furniture.md "v3" is the spec.
//
// Everything here works in BLENDER axes — X width, Y depth (-Y = front),
// Z up — so a build script ports line for line. `finish()` converts to the
// app's convention (glTF: Y up, front +Z), exactly what the Blender glTF
// exporter does to the shipped GLB, which is what the parity fixtures in
// ./__fixtures__ were measured from.

/** A deformable mesh: shared vertices (so smooth normals and displacement
 *  behave like a bmesh) plus per-corner UVs (so the per-face planar
 *  projection of `fabric_uv` survives, seams included). */
export class Part {
  name: string;
  pos: number[] = [];
  tris: number[] = [];
  /** Per triangle corner, aligned with `tris`. */
  uv: number[] = [];
  smooth = true;
  material: THREE.Material;

  constructor(name: string, material: THREE.Material) {
    this.name = name;
    this.material = material;
  }

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  addVert(x: number, y: number, z: number): number {
    this.pos.push(x, y, z);
    return this.pos.length / 3 - 1;
  }

  /** Quad a-b-c-d (counter-clockwise seen from outside) as two triangles. */
  quad(a: number, b: number, c: number, d: number): void {
    this.tris.push(a, b, c, a, c, d);
  }

  minZ(): number {
    let m = Infinity;
    for (let i = 2; i < this.pos.length; i += 3) m = Math.min(m, this.pos[i]);
    return m;
  }

  bounds(): { lo: THREE.Vector3; hi: THREE.Vector3 } {
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity);
    const hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < this.pos.length; i += 3) {
      lo.x = Math.min(lo.x, this.pos[i]); hi.x = Math.max(hi.x, this.pos[i]);
      lo.y = Math.min(lo.y, this.pos[i + 1]); hi.y = Math.max(hi.y, this.pos[i + 1]);
      lo.z = Math.min(lo.z, this.pos[i + 2]); hi.z = Math.max(hi.z, this.pos[i + 2]);
    }
    return { lo, hi };
  }

  transform(m: THREE.Matrix4): void {
    // Affine only (translations/rotations) — no perspective divide needed.
    const e = m.elements, p = this.pos;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      p[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
      p[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      p[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
  }

  /** Area-weighted smooth vertex normals — bmesh `normal_update` equivalent. */
  vertexNormals(): Float32Array {
    const n = new Float32Array(this.pos.length);
    const p = this.pos, T = this.tris;
    for (let t = 0; t < T.length; t += 3) {
      const i = T[t] * 3, j = T[t + 1] * 3, k = T[t + 2] * 3;
      // (c-b) x (a-b): outward for CCW a-b-c, length = 2·area.
      const ux = p[k] - p[j], uy = p[k + 1] - p[j + 1], uz = p[k + 2] - p[j + 2];
      const vx = p[i] - p[j], vy = p[i + 1] - p[j + 1], vz = p[i + 2] - p[j + 2];
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      n[i] += fx; n[i + 1] += fy; n[i + 2] += fz;
      n[j] += fx; n[j + 1] += fy; n[j + 2] += fz;
      n[k] += fx; n[k + 1] += fy; n[k + 2] += fz;
    }
    for (let i = 0; i < n.length; i += 3) {
      const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
      n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
    }
    return n;
  }

  /** `fabric_uv`: world-scale planar UVs (metres / tile) per face, projected
   *  on the face's dominant axis. Call it where the script does — BEFORE any
   *  puff/place — so the weave keeps its physical scale on every size. */
  fabricUV(tile: number): void {
    const T = this.tris, P = this.pos;
    const uv = (this.uv = new Array(T.length * 2));
    // Quads were pushed as consecutive triangle pairs (a,b,c, a,c,d); a quad's
    // diagonal (a-c) is shared, so (c-a)x(d-b) is its normal — project both
    // halves on that axis so a quad never tears along its own diagonal.
    for (let t = 0; t < T.length; t += 6) {
      const a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3, d = T[t + 5] * 3;
      const ux = P[c] - P[a], uy = P[c + 1] - P[a + 1], uz = P[c + 2] - P[a + 2];
      const vx = P[d] - P[b], vy = P[d + 1] - P[b + 1], vz = P[d + 2] - P[b + 2];
      const nx = Math.abs(uy * vz - uz * vy), ny = Math.abs(uz * vx - ux * vz), nz = Math.abs(ux * vy - uy * vx);
      const dom = nx >= ny && nx >= nz ? 0 : ny >= nz ? 1 : 2;
      const p = dom === 0 ? 1 : 0, q = dom === 2 ? 1 : 2;
      for (let k = 0; k < 6; k++) {
        const v = T[t + k] * 3;
        uv[(t + k) * 2] = P[v + p] / tile;
        uv[(t + k) * 2 + 1] = P[v + q] / tile;
      }
    }
  }
}

/** `rounded_box(sx, sy, sz, z0, r, sub, seg)`: a cube bevelled on every edge
 *  (circular profile, radius r) then subdivided `sub` times. Built directly as
 *  a rounded grid rather than bevel+subdivide, same density: each flat span
 *  gets sub+1 cells and each 90° edge arc seg·(sub+1), half on either face. */
export function roundedBox(
  name: string, sx: number, sy: number, sz: number, z0: number,
  r: number, sub: number, mat: THREE.Material, tile: number, seg = 4,
): Part {
  const band = Math.max(1, Math.round((seg * (sub + 1)) / 2));
  return roundedGrid(name, sx, sy, sz, z0, r, band, [sub + 1, sub + 1, sub + 1], mat, tile);
}

/** The rounded grid behind `roundedBox`, with its own flat cell count per
 *  axis — `tufted_slab`'s bevel(seg) + per-axis `subdivide_edges(cuts)` is
 *  band = seg/2 and cells = cuts+1 (the short bevel edges are never cut). */
export function roundedGrid(
  name: string, sx: number, sy: number, sz: number, z0: number,
  r: number, band: number, cells: [number, number, number], mat: THREE.Material, tile: number,
): Part {
  const part = new Part(name, mat);
  const h = [sx / 2, sy / 2, sz / 2];
  // A bevel can't exceed the thinnest half extent.
  const re = Math.min(r, ...h);
  // Parameter samples along one axis of half extent `he`: [-he, he] with the
  // rounded bands [he-r, he] sampled `band` times each.
  const samples = (he: number, flat: number): number[] => {
    const rr = re;
    const inner = he - rr;
    const out: number[] = [];
    for (let i = 0; i <= band; i++) out.push(-he + (rr * i) / band);
    for (let i = 1; i < flat; i++) out.push(-inner + (2 * inner * i) / flat);
    for (let i = 0; i <= band; i++) out.push(inner + (rr * i) / band);
    return out.filter((v, i, arr) => i === 0 || v - arr[i - 1] > 1e-9);
  };
  const S = h.map((he, ax) => samples(he, cells[ax]));
  // Faces share their border samples exactly (same arrays), so a vertex is
  // identified by its sample INDEX on each axis — cheap to key, no rounding.
  const [n0, n1, n2] = [S[0].length, S[1].length, S[2].length];
  // Hot path (every vertex of every cushion, on every inspector drag): a
  // typed index table and scalar maths, no per-vertex arrays.
  const lookup = new Int32Array(n0 * n1 * n2).fill(-1);
  const [c0, c1, c2] = [h[0] - re, h[1] - re, h[2] - re];
  const zOff = z0 + sz / 2;
  const vert = (p: number[], idx: number[]): number => {
    const k = idx[0] + n0 * (idx[1] + n1 * idx[2]);
    let i = lookup[k];
    if (i < 0) {
      // Project the cube-surface point onto the rounded box.
      const q0 = Math.max(-c0, Math.min(c0, p[0]));
      const q1 = Math.max(-c1, Math.min(c1, p[1]));
      const q2 = Math.max(-c2, Math.min(c2, p[2]));
      const d0 = p[0] - q0, d1 = p[1] - q1, d2 = p[2] - q2;
      const l = Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2);
      i = l > 1e-12
        ? part.addVert(q0 + (d0 / l) * re, q1 + (d1 / l) * re, q2 + (d2 / l) * re + zOff)
        : part.addVert(p[0], p[1], p[2] + zOff);
      lookup[k] = i;
    }
    return i;
  };
  // Six faces: (normal axis, sign). u/v axes chosen so quads wind CCW outward.
  for (const ax of [0, 1, 2]) {
    for (const sign of [-1, 1]) {
      const [u, v] = sign > 0 ? [(ax + 1) % 3, (ax + 2) % 3] : [(ax + 2) % 3, (ax + 1) % 3];
      const su = S[u], sv = S[v];
      const grid: number[][] = [];
      const p = [0, 0, 0], idx = [0, 0, 0];
      p[ax] = sign * h[ax];
      idx[ax] = sign > 0 ? S[ax].length - 1 : 0;
      for (let i = 0; i < su.length; i++) {
        grid.push([]);
        for (let j = 0; j < sv.length; j++) {
          p[u] = su[i]; p[v] = sv[j];
          idx[u] = i; idx[v] = j;
          grid[i].push(vert(p, idx));
        }
      }
      for (let i = 0; i < su.length - 1; i++)
        for (let j = 0; j < sv.length - 1; j++)
          part.quad(grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]);
    }
  }
  part.fabricUV(tile);
  return part;
}

/** Seeded [0,1) generator — stands in for Python's `random` (seeded per
 *  script). Values differ from CPython's; wrinkles only have to read right,
 *  the parity fixtures gate shape. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const perlin = new ImprovedNoise();

/** `crease(ob, amp, freq, seed)`: ridged noise pushed along vertex normals. */
export function crease(part: Part, amp: number, freq: number, seed: number): void {
  const n = part.vertexNormals();
  const p = part.pos;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i] * freq + seed, y = p[i + 1] * freq + seed * 0.7, z = p[i + 2] * freq + seed * 1.3;
    const r = 1 - Math.abs(perlin.noise(x, y, z)) * 2;
    const r2 = perlin.noise(x * 2.3 + 3.1, y * 2.3 + 1.7, z * 2.3 + 0.4);
    const d = amp * (0.7 * r + 0.3 * r2);
    p[i] += n[i] * d; p[i + 1] += n[i + 1] * d; p[i + 2] += n[i + 2] * d;
  }
}

/** `puff(ob, crown, belly, wr, front)`: soft-goods shaping on a rounded slab —
 *  raised crown, bellied sides, optional plump front, faint wrinkles. */
export function puff(part: Part, crown: number, belly: number, wr: number, front: number, random: () => number): void {
  const { lo, hi } = part.bounds();
  const cx = (lo.x + hi.x) / 2, cy = (lo.y + hi.y) / 2;
  const hx = (hi.x - lo.x) / 2, hy = (hi.y - lo.y) / 2;
  const z0 = lo.z, z1 = hi.z;
  const p = part.pos;
  for (let i = 0; i < p.length; i += 3) {
    const u = (p[i] - cx) / hx;
    const w = (p[i + 1] - cy) / hy;
    const t = (p[i + 2] - z0) / (z1 - z0);
    const edge = Math.max(Math.abs(u), Math.abs(w));
    if (t > 0.5) p[i + 2] += crown * Math.max(0, 1 - u * u) * Math.max(0, 1 - w * w) * (t - 0.5) * 2;
    if (front && w < 0) p[i + 1] -= front * Math.max(0, 1 - u * u) * (1 - (2 * t - 1) ** 2) * -w;
    const bulge = belly * (1 - (2 * t - 1) ** 2);
    p[i] += bulge * u * Math.min(1, edge * 1.2) * 0.5;
    p[i + 1] += bulge * w * Math.min(1, edge * 1.2) * 0.5;
  }
  if (wr) crease(part, wr, 7.0, random() * 9);
}

/** `piping(hx, hy, z, rc, rad, ring)`: an upholstery welt — a tube swept
 *  around a rounded-rectangle path in the parent cushion's local frame. */
export function piping(
  name: string, hx: number, hy: number, z: number, rc: number, rad: number,
  mat: THREE.Material, tile: number, ring = 6,
): Part {
  const part = new Part(name, mat);
  const pts: [number, number][] = [];
  for (const [cxs, cys, a0] of [[1, 1, 0], [-1, 1, 90], [-1, -1, 180], [1, -1, 270]]) {
    for (let k = 0; k < 7; k++) {
      const a = THREE.MathUtils.degToRad(a0 + (90 * k) / 6);
      pts.push([cxs * (hx - rc) + rc * Math.cos(a), cys * (hy - rc) + rc * Math.sin(a)]);
    }
  }
  const n = pts.length;
  const rings: number[][] = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = pts[i];
    const [nx, ny] = pts[(i + 1) % n];
    const [px, py] = pts[(i - 1 + n) % n];
    let tx = nx - px, ty = ny - py;
    const L = Math.hypot(tx, ty) || 1;
    tx /= L; ty /= L;
    const ox = ty, oy = -tx;
    const rg: number[] = [];
    for (let j = 0; j < ring; j++) {
      const t = (2 * Math.PI * j) / ring;
      rg.push(part.addVert(x + ox * rad * Math.cos(t), y + oy * rad * Math.cos(t), z + rad * Math.sin(t)));
    }
    rings.push(rg);
  }
  for (let i = 0; i < n; i++) {
    const a = rings[i], b = rings[(i + 1) % n];
    // bmesh recalc_face_normals makes these face outward; this winding does.
    for (let j = 0; j < ring; j++) part.quad(a[j], b[j], b[(j + 1) % ring], a[(j + 1) % ring]);
  }
  part.fabricUV(tile);
  return part;
}

/** `place(ob, x, y, z, rx, bz)`: rotate about X around the part's base, then
 *  move it into place (mesh space — no object transform). */
export function place(part: Part, x: number, y: number, z: number, rx = 0, bz?: number): void {
  const base = bz ?? part.minZ();
  const m = new THREE.Matrix4().makeTranslation(x, y, z)
    .multiply(new THREE.Matrix4().makeRotationX(rx))
    .multiply(new THREE.Matrix4().makeTranslation(0, 0, -base));
  part.transform(m);
}

export function smoothstep(t: number): number {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

/** Turned leg: bmesh `create_cone(segments=28, radius1=bot, radius2=top)`
 *  stretched to height h, its foot splayed out by (sx·splay, sy·splay·ky).
 *  Smooth sides, n-gon caps fan-triangulated as the glTF exporter does. */
export function coneLeg(
  name: string, x: number, y: number, h: number, bot: number, top: number,
  splay: number, ky: number, sx: number, sy: number, mat: THREE.Material, tile: number,
): Part {
  const p = new Part(name, mat);
  const N = 28;
  const ring = (r: number, t: number) =>
    Array.from({ length: N }, (_, i) => p.addVert(
      r * Math.cos((2 * Math.PI * i) / N) + sx * splay * (1 - t) + x,
      r * Math.sin((2 * Math.PI * i) / N) + sy * splay * ky * (1 - t) + y,
      t * h,
    ));
  const B = ring(bot, 0), T = ring(top, 1);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    p.quad(B[i], B[j], T[j], T[i]);
  }
  // One cap's fan, then the other's: fabricUV reads triangles in pairs.
  for (let i = 1; i < N - 1; i++) p.tris.push(T[0], T[i], T[i + 1]);
  for (let i = 1; i < N - 1; i++) p.tris.push(B[0], B[i + 1], B[i]);
  p.fabricUV(tile);
  return p;
}

/** Covered button: `create_uvsphere(u=16, v=10, radius)` squashed to half
 *  depth along Y, centred on (x, y, z). */
export function button(name: string, x: number, y: number, z: number, rad: number, mat: THREE.Material, tile: number): Part {
  const p = new Part(name, mat);
  const U = 16, V = 10;
  const top = p.addVert(x, y, z + rad);
  const rings: number[][] = [];
  for (let j = 1; j < V; j++) {
    const th = (Math.PI * j) / V;
    rings.push(Array.from({ length: U }, (_, i) => {
      const ph = (2 * Math.PI * i) / U;
      return p.addVert(x + rad * Math.sin(th) * Math.cos(ph), y + 0.5 * rad * Math.sin(th) * Math.sin(ph), z + rad * Math.cos(th));
    }));
  }
  const bot = p.addVert(x, y, z - rad);
  // Quads first, then each pole's fan: fabricUV reads triangles in pairs.
  for (let i = 0; i < U; i++)
    for (let j = 0; j < V - 2; j++) p.quad(rings[j][i], rings[j + 1][i], rings[j + 1][(i + 1) % U], rings[j][(i + 1) % U]);
  for (let i = 0; i < U; i++) p.tris.push(top, rings[0][i], rings[0][(i + 1) % U]);
  for (let i = 0; i < U; i++) p.tris.push(bot, rings[V - 2][(i + 1) % U], rings[V - 2][i]);
  p.fabricUV(tile);
  return p;
}

/** `member()`: a solid timber rail, UVs with V along the grain axis and a
 *  random offset per member. Its 3-4mm bevel is left out (invisible at room
 *  scale, and it would cost 5x the triangles), so it is shaded flat. */
export function member(
  name: string, cx: number, cy: number, z0: number, sx: number, sy: number, sz: number,
  grain: 0 | 1 | 2, mat: THREE.Material, tile: number, random: () => number,
): Part {
  const p = new Part(name, mat);
  p.smooth = false;
  const v = (a: number, b: number, c: number) => p.addVert(cx + (a * sx) / 2, cy + (b * sy) / 2, z0 + ((c + 1) * sz) / 2);
  const [b0, b1, b2, b3] = [v(-1, -1, -1), v(1, -1, -1), v(1, 1, -1), v(-1, 1, -1)];
  const [t0, t1, t2, t3] = [v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1)];
  const faces: [number[], number][] = [
    [[b3, b2, b1, b0], 2], [[t0, t1, t2, t3], 2],
    [[b0, b1, t1, t0], 1], [[b2, b3, t3, t2], 1],
    [[b1, b2, t2, t1], 0], [[b3, b0, t0, t3], 0],
  ];
  const ou = random(), ov = random();
  const others = ([0, 1, 2] as const).filter((a) => a !== grain);
  for (const [[a, b, c, d], n] of faces) {
    p.quad(a, b, c, d);
    // Across-grain axis: the face's end grain uses the other two axes;
    // a long face uses whichever in-plane axis is not the grain.
    const across = n === grain ? others[1] : others.find((ax) => ax !== n)!;
    for (const i of [a, b, c, a, c, d]) p.uv.push(p.pos[i * 3 + across] / tile + ou, p.pos[i * 3 + grain] / tile + ov);
  }
  return p;
}

/** Blender Z-up / -Y front  →  app Y-up / +Z front (the glTF exporter's map). */
const TO_APP = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

/** Centre like the build scripts (X/Y on the bbox centre, base at Z=0), convert
 *  axes, and emit one named THREE.Mesh per part. Smooth parts get the shared
 *  vertex normals; flat parts (hard-edged legs) get per-face ones. */
export function finish(parts: Part[]): THREE.Group {
  const lo = new THREE.Vector3(Infinity, Infinity, Infinity);
  const hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of parts) {
    const b = p.bounds();
    lo.min(b.lo); hi.max(b.hi);
  }
  const shift = new THREE.Matrix4().makeTranslation(-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z);
  const group = new THREE.Group();
  for (const p of parts) {
    p.transform(shift);
    p.transform(TO_APP);
    const vn = p.smooth ? p.vertexNormals() : null;
    const count = p.tris.length;
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    const P = p.pos, T = p.tris, U = p.uv;
    for (let c = 0; c < count; c++) {
      const v = T[c] * 3, o = c * 3;
      pos[o] = P[v]; pos[o + 1] = P[v + 1]; pos[o + 2] = P[v + 2];
      if (vn) { nor[o] = vn[v]; nor[o + 1] = vn[v + 1]; nor[o + 2] = vn[v + 2]; }
      uv[c * 2] = U[c * 2] ?? 0;
      uv[c * 2 + 1] = U[c * 2 + 1] ?? 0;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    if (vn) g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    else g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, p.material);
    mesh.name = p.name;
    group.add(mesh);
  }
  return group;
}
