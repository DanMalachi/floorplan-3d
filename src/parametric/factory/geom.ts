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
  /** Per corner: the axis `fabricUV` projected it on. A corner's UV is a
   *  function of (vertex, axis), so `finish` can share a vertex between every
   *  corner with the same pair — identical shading, a sixth of the vertices. */
  uvAxis: Uint8Array | null = null;
  smooth = true;
  material: THREE.Material;
  /** Several materials on one part (oak face + end grain): `triMat` indexes
   *  `mats` per triangle. Flat-shaded parts only. */
  mats?: THREE.Material[];
  triMat?: Uint8Array;

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

  /** `randomise_uv`: rotate + offset this part's UVs at random so identical
   *  grain never lines up between parts. */
  randomiseUV(random: () => number): void {
    const th = random() * 6.283, ox = random(), oy = random();
    const c = Math.cos(th), sn = Math.sin(th), U = this.uv;
    for (let i = 0; i < U.length; i += 2) {
      const x = U[i], y = U[i + 1];
      U[i] = c * x - sn * y + ox;
      U[i + 1] = sn * x + c * y + oy;
    }
  }

  /** `fabric_uv`: world-scale planar UVs (metres / tile) per face, projected
   *  on the face's dominant axis. Call it where the script does — BEFORE any
   *  puff/place — so the weave keeps its physical scale on every size. */
  fabricUV(tile: number): void {
    const T = this.tris, P = this.pos;
    const uv = (this.uv = new Array(T.length * 2));
    const ax = (this.uvAxis = new Uint8Array(T.length));
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
        ax[t + k] = dom;
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
 *  band = seg/2 and cells = cuts+1 (the short bevel edges are never cut).
 *  `cuts[axis]` replaces that axis's uniform cells with explicit loop
 *  positions (centred frame) — `cushion_mesh`'s bisect planes. A cut inside
 *  a bevel lands at its true height on the arc; one past the arc's 45° point
 *  belongs to the neighbouring face and is dropped. */
export function roundedGrid(
  name: string, sx: number, sy: number, sz: number, z0: number,
  r: number, band: number, cells: [number, number, number], mat: THREE.Material, tile: number,
  cuts?: (number[] | undefined)[],
): Part {
  const part = new Part(name, mat);
  const h = [sx / 2, sy / 2, sz / 2];
  // A bevel can't exceed the thinnest half extent.
  const re = Math.min(r, ...h);
  // Parameter samples along one axis of half extent `he`: [-he, he] with the
  // rounded bands [he-r, he] sampled `band` times each.
  const samples = (he: number, flat: number, cut?: number[]): number[] => {
    const rr = re;
    const inner = he - rr;
    const out: number[] = [];
    for (let i = 0; i <= band; i++) out.push(-he + (rr * i) / band);
    if (cut) {
      for (const c of cut) {
        const t = Math.abs(c) - inner;
        if (t <= 0) out.push(c);
        else if (t < rr * Math.SQRT1_2) out.push(Math.sign(c) * (inner + (t * rr) / Math.sqrt(rr * rr - t * t)));
      }
    } else for (let i = 1; i < flat; i++) out.push(-inner + (2 * inner * i) / flat);
    for (let i = 0; i <= band; i++) out.push(inner + (rr * i) / band);
    // bisect_plane(dist=1e-5): a cut on an existing loop adds nothing.
    return out.sort((a, b) => a - b).filter((v, i, arr) => i === 0 || v - arr[i - 1] > 1e-5);
  };
  const S = h.map((he, ax) => samples(he, cells[ax], cuts?.[ax]));
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

/** CPython's `random.Random(seed).random()` for a non-negative int seed <
 *  2^32 — MT19937 with init_by_array, 53-bit doubles. Where a script's
 *  randomness decides WHERE geometry goes (per-button jitter), a stand-in
 *  generator moves parts by centimetres; this reproduces it exactly. */
export function pyRandom(seed: number): () => number {
  const N = 624, M = 397;
  const mt = new Uint32Array(N);
  let mti = N;
  mt[0] = 19650218;
  for (let i = 1; i < N; i++) mt[i] = Math.imul(1812433253, mt[i - 1] ^ (mt[i - 1] >>> 30)) + i;
  const key = [seed >>> 0];
  let i = 1, j = 0;
  for (let k = Math.max(N, key.length); k; k--) {
    mt[i] = (mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1664525)) + key[j] + j;
    i++; j++;
    if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
    if (j >= key.length) j = 0;
  }
  for (let k = N - 1; k; k--) {
    mt[i] = (mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1566083941)) - i;
    i++;
    if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
  }
  mt[0] = 0x80000000;
  const next = (): number => {
    if (mti >= N) {
      for (let k = 0; k < N; k++) {
        const y = (mt[k] & 0x80000000) | (mt[(k + 1) % N] & 0x7fffffff);
        mt[k] = mt[(k + M) % N] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      mti = 0;
    }
    let y = mt[mti++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  };
  return () => ((next() >>> 5) * 67108864 + (next() >>> 6)) / 9007199254740992;
}

const perlin = new ImprovedNoise();

/** Blender `mathutils.noise.noise` stand-in (gradient noise, [-1, 1]). */
export function noise3(x: number, y: number, z: number): number {
  return perlin.noise(x, y, z);
}

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

/** Turned leg: bmesh `create_cone(segments=N, radius1=bot, radius2=top)`
 *  stretched to height h, its foot splayed out by (sx·splay, sy·splay·ky).
 *  Smooth sides, n-gon caps fan-triangulated as the glTF exporter does. */
export function coneLeg(
  name: string, x: number, y: number, h: number, bot: number, top: number,
  splay: number, ky: number, sx: number, sy: number, mat: THREE.Material, tile: number, N = 28,
): Part {
  const p = new Part(name, mat);
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

export interface Hit { p: [number, number, number]; n: [number, number, number] }

/** `surface(ob).ray_cast` for HORIZONTAL rays (every stitch row in the
 *  scripts is cast at a fixed height). Only the triangles crossing a ray's
 *  height matter, so each height is indexed on first use (a row reuses it):
 *  those triangles binned into 3cm plan cells; a ray walks the cells along
 *  its path, nearest first, and stops once no later cell can hold a closer
 *  hit. Face normal on hit, as BVHTree returns. */
export class HorizontalRaycaster {
  private levels = new Map<number, Map<number, number[]>>();
  private stamp: Uint32Array;
  private epoch = 0;
  private static readonly DXY = 0.03;

  constructor(private part: Part) {
    this.stamp = new Uint32Array(part.tris.length / 3);
  }

  private static key(x: number, y: number): number {
    return (x + 1024) * 2048 + (y + 1024);
  }

  private level(oz: number): Map<number, number[]> {
    let cells = this.levels.get(oz);
    if (cells) return cells;
    cells = new Map();
    this.levels.set(oz, cells);
    const P = this.part.pos, T = this.part.tris, { DXY } = HorizontalRaycaster;
    for (let t = 0; t < T.length; t += 3) {
      const a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3;
      if (Math.min(P[a + 2], P[b + 2], P[c + 2]) > oz || Math.max(P[a + 2], P[b + 2], P[c + 2]) < oz) continue;
      const x0 = Math.floor(Math.min(P[a], P[b], P[c]) / DXY), x1 = Math.floor(Math.max(P[a], P[b], P[c]) / DXY);
      const y0 = Math.floor(Math.min(P[a + 1], P[b + 1], P[c + 1]) / DXY), y1 = Math.floor(Math.max(P[a + 1], P[b + 1], P[c + 1]) / DXY);
      for (let x = x0; x <= x1; x++)
        for (let y = y0; y <= y1; y++) {
          const k = HorizontalRaycaster.key(x, y);
          let bin = cells.get(k);
          if (!bin) cells.set(k, (bin = []));
          bin.push(t);
        }
    }
    return cells;
  }

  /** Nearest hit of the ray (ox, oy, oz) + d·(dx, dy, 0), |d| ≤ maxDist. */
  cast(ox: number, oy: number, oz: number, dx: number, dy: number, maxDist = 2): Hit | null {
    const P = this.part.pos, T = this.part.tris, { DXY } = HorizontalRaycaster;
    const cells = this.level(oz);
    const epoch = ++this.epoch;
    let best = Infinity, hit: Hit | null = null;
    const step = DXY / 2;
    let lastKey = NaN;
    for (let d = 0; d <= maxDist + step; d += step) {
      // A hit closer than the cells still ahead is final.
      if (best < d - DXY * 1.5) break;
      const k = HorizontalRaycaster.key(Math.floor((ox + dx * d) / DXY), Math.floor((oy + dy * d) / DXY));
      if (k === lastKey) continue;
      lastKey = k;
      const bin = cells.get(k);
      if (!bin) continue;
      for (const t of bin) {
        if (this.stamp[t / 3] === epoch) continue;
        this.stamp[t / 3] = epoch;
        const a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3;
        // Möller–Trumbore with direction (dx, dy, 0).
        const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
        const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
        const px = dy * e2z, py = -dx * e2z, pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < 1e-14) continue;
        const inv = 1 / det;
        const sx = ox - P[a], sy = oy - P[a + 1], sz = oz - P[a + 2];
        const u = (sx * px + sy * py + sz * pz) * inv;
        if (u < 0 || u > 1) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
        const v = (dx * qx + dy * qy) * inv;
        if (v < 0 || u + v > 1) continue;
        const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (dist <= 0 || dist >= best) continue;
        best = dist;
        const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
        const l = Math.hypot(nx, ny, nz) || 1;
        hit = { p: [ox + dx * dist, oy + dy * dist, oz], n: [nx / l, ny / l, nz / l] };
      }
    }
    return hit;
  }
}

/** `stitch_mesh`: one tiny lens per stitch (axis along the row, half sunk in
 *  the surface), 8 triangles each. rows = hits in path order. */
export function stitchMesh(name: string, rows: Hit[][], mat: THREE.Material, L = 0.0085, w = 0.0021, h = 0.0018): Part {
  const part = new Part(name, mat);
  for (const row of rows) {
    const m = row.length;
    row.forEach(({ p, n }, i) => {
      const a = row[Math.max(i - 1, 0)].p, b = row[Math.min(i + 1, m - 1)].p;
      let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
      const dn = tx * n[0] + ty * n[1] + tz * n[2];
      tx -= n[0] * dn; ty -= n[1] * dn; tz -= n[2] * dn;
      const tl = Math.hypot(tx, ty, tz);
      if (tl < 1e-6) return;
      tx /= tl; ty /= tl; tz /= tl;
      const s = [n[1] * tz - n[2] * ty, n[2] * tx - n[0] * tz, n[0] * ty - n[1] * tx];
      const c = [p[0] - n[0] * 0.0004, p[1] - n[1] * 0.0004, p[2] - n[2] * 0.0004];
      const at = (k: number[], f: number) => part.addVert(c[0] + k[0] * f, c[1] + k[1] * f, c[2] + k[2] * f);
      const ring = [at(s, w), at(n, h), at(s, -w), at(n, -h * 0.4)];
      const t0 = at([tx, ty, tz], -L / 2), t1 = at([tx, ty, tz], L / 2);
      for (let j = 0; j < 4; j++) {
        part.tris.push(t0, ring[(j + 1) % 4], ring[j]);
        part.tris.push(t1, ring[j], ring[(j + 1) % 4]);
      }
    });
  }
  return part;
}

/** Blender's SOLIDIFY (simple mode) on an (nu × nv) grid part: the shell spans
 *  [t(o−1)/2, t(o+1)/2] along each vertex normal (offset 0 = centred, 1 = all
 *  in front of the normal), the back shell reversed, a rim on every boundary
 *  edge. `uv` is per vertex and is extended for the new shell. */
export function solidifyGrid(p: Part, nu: number, nv: number, thickness: number, offset: number, uv: number[]): void {
  const at = (i: number, j: number) => j * (nu + 1) + i;
  const N = p.vertexCount;
  const n = p.vertexNormals();
  const P = p.pos;
  const front = (thickness * (offset + 1)) / 2, back = (thickness * (offset - 1)) / 2;
  for (let k = 0; k < N; k++) {
    const x = P[k * 3], y = P[k * 3 + 1], z = P[k * 3 + 2];
    const nx = n[k * 3], ny = n[k * 3 + 1], nz = n[k * 3 + 2];
    P[k * 3] = x + nx * front; P[k * 3 + 1] = y + ny * front; P[k * 3 + 2] = z + nz * front;
    p.addVert(x + nx * back, y + ny * back, z + nz * back);
    uv.push(uv[k * 2], uv[k * 2 + 1]);
  }
  const outer = p.tris.length;
  for (let t = 0; t < outer; t += 3) p.tris.push(p.tris[t] + N, p.tris[t + 2] + N, p.tris[t + 1] + N);
  // Boundary edges in the faces' own winding; rim (b, a, a', b').
  const rim = (a: number, b: number) => p.quad(b, a, a + N, b + N);
  for (let i = 0; i < nu; i++) rim(at(i, 0), at(i + 1, 0));
  for (let j = 0; j < nv; j++) rim(at(nu, j), at(nu, j + 1));
  for (let i = nu; i > 0; i--) rim(at(i, nv), at(i - 1, nv));
  for (let j = nv; j > 0; j--) rim(at(0, j), at(0, j - 1));
}

/** Per-vertex UVs → the per-corner layout `finish` reads (one axis: a vertex
 *  never needs a second UV). */
export function vertexUV(p: Part, uv: number[]): void {
  p.uv = new Array(p.tris.length * 2);
  for (let c = 0; c < p.tris.length; c++) {
    p.uv[c * 2] = uv[p.tris[c] * 2];
    p.uv[c * 2 + 1] = uv[p.tris[c] * 2 + 1];
  }
  p.uvAxis = new Uint8Array(p.tris.length);
}

/** A POLY curve with bevel_depth = radius converted to a mesh: a `ring`-sided
 *  tube (bevel_resolution r gives 2r + 4 sides), no caps. Frames are
 *  parallel-transported along the path. UVs are left empty. */
export function tubePath(
  name: string, coords: [number, number, number][], mat: THREE.Material, radius: number, closed: boolean, ring: number,
): Part {
  const p = new Part(name, mat);
  const n = coords.length;
  const V = coords.map((c) => new THREE.Vector3(...c));
  const tan = V.map((_, i) => {
    const a = V[closed ? (i - 1 + n) % n : Math.max(i - 1, 0)];
    const b = V[closed ? (i + 1) % n : Math.min(i + 1, n - 1)];
    return b.clone().sub(a).normalize();
  });
  const t0 = tan[0];
  let nrm = new THREE.Vector3(Math.abs(t0.z) < 0.9 ? 0 : 1, 0, Math.abs(t0.z) < 0.9 ? 1 : 0).cross(t0).normalize();
  const bin = new THREE.Vector3();
  const rings: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      // Parallel transport: drop the component along the new tangent.
      nrm = nrm.sub(tan[i].clone().multiplyScalar(nrm.dot(tan[i])));
      if (nrm.lengthSq() < 1e-12) nrm = new THREE.Vector3(0, 0, 1).cross(tan[i]);
      nrm.normalize();
    }
    bin.crossVectors(tan[i], nrm);
    const rg: number[] = [];
    for (let j = 0; j < ring; j++) {
      const a = (2 * Math.PI * j) / ring, c = Math.cos(a) * radius, s = Math.sin(a) * radius;
      rg.push(p.addVert(V[i].x + nrm.x * c + bin.x * s, V[i].y + nrm.y * c + bin.y * s, V[i].z + nrm.z * c + bin.z * s));
    }
    rings.push(rg);
  }
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = rings[i], b = rings[(i + 1) % n];
    for (let j = 0; j < ring; j++) p.quad(a[j], a[(j + 1) % ring], b[(j + 1) % ring], b[j]);
  }
  return p;
}

/** Blender Z-up / -Y front  →  app Y-up / +Z front (the glTF exporter's map). */
const TO_APP = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

/** Centre like the build scripts (X/Y on the bbox centre, base at Z=0), convert
 *  axes, and emit one named THREE.Mesh per part. Smooth parts get the shared
 *  vertex normals; flat parts (hard-edged legs) get per-face ones. */
export function finish(parts: Part[], opts: { centre?: boolean } = {}): THREE.Group {
  const lo = new THREE.Vector3(Infinity, Infinity, Infinity);
  const hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of parts) {
    const b = p.bounds();
    lo.min(b.lo); hi.max(b.hi);
  }
  // centre: false = the script places the piece itself (no bbox recentring).
  const shift = opts.centre === false
    ? new THREE.Matrix4()
    : new THREE.Matrix4().makeTranslation(-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z);
  const group = new THREE.Group();
  for (const p of parts) {
    p.transform(shift);
    p.transform(TO_APP);
    const vn = p.smooth ? p.vertexNormals() : null;
    const P = p.pos, T = p.tris, U = p.uv;
    const g = new THREE.BufferGeometry();
    if (vn && (p.uvAxis || U.length === 0)) {
      // Indexed: one output vertex per (vertex, UV projection axis).
      const A = p.uvAxis;
      const slot = new Int32Array((P.length / 3) * 3).fill(-1);
      const index = new Uint32Array(T.length);
      const cap = Math.min(T.length, P.length); // at most one per (vertex, axis) used
      const pos = new Float32Array(cap * 3), nor = new Float32Array(cap * 3), uv = new Float32Array(cap * 2);
      let n = 0;
      for (let c = 0; c < T.length; c++) {
        const k = T[c] * 3 + (A ? A[c] : 0);
        let o = slot[k];
        if (o < 0) {
          const v = T[c] * 3;
          o = slot[k] = n++;
          pos[o * 3] = P[v]; pos[o * 3 + 1] = P[v + 1]; pos[o * 3 + 2] = P[v + 2];
          nor[o * 3] = vn[v]; nor[o * 3 + 1] = vn[v + 1]; nor[o * 3 + 2] = vn[v + 2];
          uv[o * 2] = U[c * 2] ?? 0; uv[o * 2 + 1] = U[c * 2 + 1] ?? 0;
        }
        index[c] = o;
      }
      g.setIndex(new THREE.BufferAttribute(index, 1));
      g.setAttribute("position", new THREE.BufferAttribute(pos.slice(0, n * 3), 3));
      g.setAttribute("normal", new THREE.BufferAttribute(nor.slice(0, n * 3), 3));
      g.setAttribute("uv", new THREE.BufferAttribute(uv.slice(0, n * 2), 2));
      const mesh = new THREE.Mesh(g, p.material);
      mesh.name = p.name;
      group.add(mesh);
      continue;
    }
    const count = p.tris.length;
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    // Multi-material parts: corners written grouped by material, one draw group each.
    const order = p.triMat
      ? Array.from({ length: count / 3 }, (_, t) => t).sort((a, b) => p.triMat![a] - p.triMat![b])
      : null;
    for (let c = 0; c < count; c++) {
      const src = order ? order[Math.floor(c / 3)] * 3 + (c % 3) : c;
      const v = T[src] * 3, o = c * 3;
      pos[o] = P[v]; pos[o + 1] = P[v + 1]; pos[o + 2] = P[v + 2];
      if (vn) { nor[o] = vn[v]; nor[o + 1] = vn[v + 1]; nor[o + 2] = vn[v + 2]; }
      uv[c * 2] = U[src * 2] ?? 0;
      uv[c * 2 + 1] = U[src * 2 + 1] ?? 0;
    }
    if (order && p.mats) {
      let start = 0;
      for (let m = 0; m < p.mats.length; m++) {
        const n3 = order.filter((t) => p.triMat![t] === m).length * 3;
        if (n3) g.addGroup(start, n3, m);
        start += n3;
      }
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    if (vn) g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    else g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, p.mats ?? p.material);
    mesh.name = p.name;
    group.add(mesh);
  }
  return group;
}
