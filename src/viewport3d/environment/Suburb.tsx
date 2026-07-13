"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

// F5.2 — Suburb preset: a rolling grass lot with the model on flat ground, a
// sparse ring of window-fronted houses in the mid-distance, and a mixed, wind-
// swept low-poly tree/shrub canopy. All procedural + instanced (no asset fetch),
// deterministic via a seeded PRNG. Terrain gently undulates away from the lot;
// houses/trees seat on it. Distant context casts no shadow (outside the sun
// frustum); trees sway in a vertex-shader breeze.

const HOUSE_CAP = 160; // per facade variant
const ROOF_CAP = 480;
const VEG_CAP = 256; // per tree style
const GRASS_CAP = 26000; // near-field grass blades

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _sc = new THREE.Vector3();
const _e = new THREE.Euler();
const _col = new THREE.Color();

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** sRGB hex → linear rgb triple, for baked vertex colours. */
const lin = (hex: string): [number, number, number] => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};

// --- Noise fields ------------------------------------------------------------
// Summed directional sines — irregular (no sin*cos checkerboard grid). Shared so
// the ground mesh and every seated object agree on the terrain height.
interface Layer { dx: number; dz: number; freq: number; amp: number; ph: number; }
function makeField(seed: number, baseFreq: number, octaves: number): (x: number, z: number) => number {
  const r = mulberry32(seed);
  const layers: Layer[] = [];
  let freq = baseFreq, amp = 1;
  for (let o = 0; o < octaves; o++) {
    const ang = r() * Math.PI * 2;
    layers.push({ dx: Math.cos(ang), dz: Math.sin(ang), freq, amp, ph: r() * 10 });
    freq *= 1.9; amp *= 0.55;
  }
  const norm = layers.reduce((s, l) => s + l.amp, 0);
  return (x, z) => {
    let v = 0;
    for (const l of layers) v += l.amp * Math.sin((x * l.dx + z * l.dz) * l.freq + l.ph);
    return v / norm; // ~[-1, 1]
  };
}
const terrainField = makeField(91, 0.05, 4);
const lawnField = makeField(53, 0.045, 3); // lawn patches (metre-scale, visible)
const lawnField2 = makeField(29, 0.22, 2); // finer mottle
const LAWN_DARK = lin("#3c5622");
const LAWN_LITE = lin("#7ba049");
const GRASS_LO = lin("#5f9134"); // blade tint (brighter/lusher than the ground)
const GRASS_HI = lin("#93c05c");

/** Flat under the lot, rolling just beyond it. */
function terrainHeight(x: number, z: number, flatR: number) {
  return terrainField(x, z) * 1.6 * smoothstep(flatR, flatR * 2.4, Math.hypot(x, z));
}

/** A big undulating ground plane with macro colour variation (breaks the grass
 *  tile repeat) plus micro grass texture. Flat under the lot. */
function groundGeometry(R: number, flatR: number): THREE.BufferGeometry {
  const seg = 120;
  const g = new THREE.PlaneGeometry(R * 2, R * 2, seg, seg);
  g.rotateX(-Math.PI / 2); // lie in XZ, Y up
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z, flatR));
    // Two irregular seamless fields (big patches + finer mottle) lerp two greens:
    // no repeating texture, so no tile grid. Gain-expanded so patches read.
    const v = 0.6 * lawnField(x, z) + 0.4 * lawnField2(x, z);
    const mix = Math.min(1, Math.max(0, 0.5 + 1.5 * v));
    colors[i * 3] = LAWN_DARK[0] + (LAWN_LITE[0] - LAWN_DARK[0]) * mix;
    colors[i * 3 + 1] = LAWN_DARK[1] + (LAWN_LITE[1] - LAWN_DARK[1]) * mix;
    colors[i * 3 + 2] = LAWN_DARK[2] + (LAWN_LITE[2] - LAWN_DARK[2]) * mix;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

// --- House facades -----------------------------------------------------------
// Light wall (so per-instance colour tints it) with a window grid + a door,
// drawn once per storey/width variant and shared by all houses of that variant.
interface Variant { cols: number; rows: number; hMin: number; hMax: number; wMin: number; wMax: number; }
const VARIANTS: Variant[] = [
  { cols: 2, rows: 1, hMin: 3.2, hMax: 4.2, wMin: 7, wMax: 9 }, // bungalow
  { cols: 2, rows: 2, hMin: 5.2, hMax: 6.6, wMin: 7.5, wMax: 9.5 }, // two-storey
  { cols: 3, rows: 2, hMin: 5.2, hMax: 6.4, wMin: 9.5, wMax: 12 }, // wide two-storey
];
const facadeCache = new Map<number, THREE.CanvasTexture>();
function facadeTexture(v: number): THREE.CanvasTexture {
  let tex = facadeCache.get(v);
  if (!tex) {
    const { cols, rows } = VARIANTS[v];
    const W = 128, H = 128;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#e8e3d8"; ctx.fillRect(0, 0, W, H); // wall base
    ctx.fillStyle = "rgba(0,0,0,0.10)"; ctx.fillRect(0, H * 0.92, W, H * 0.08); // foundation
    const mX = W * 0.12, mTop = H * 0.1, mBot = H * 0.32;
    const gw = (W - 2 * mX) / cols, gh = (H - mTop - mBot) / rows;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const wx = mX + i * gw + gw * 0.18, wy = mTop + j * gh + gh * 0.12;
        const ww = gw * 0.64, wh = gh * 0.7;
        ctx.fillStyle = "#cfc8b8"; ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4); // frame
        ctx.fillStyle = "#39485a"; ctx.fillRect(wx, wy, ww, wh); // glass
        ctx.strokeStyle = "rgba(220,225,230,0.7)"; ctx.lineWidth = 1.2; // muntins
        ctx.beginPath();
        ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh);
        ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(0,0,0,0.15)"; ctx.fillRect(wx - 2, wy + wh + 2, ww + 4, 2); // sill
      }
    }
    const dw = W * 0.14, dh = H * 0.22, dx = W / 2 - dw / 2, dy = H - mBot * 0.92;
    ctx.fillStyle = "#6a4a34"; ctx.fillRect(dx, dy, dw, dh); // door
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    facadeCache.set(v, tex);
  }
  return tex;
}

/** Gable-roof prism: unit footprint (±0.5), base y=0, ridge at y=1 along z.
 *  Six outward-wound triangles; hidden bottom omitted; flat-shaded. */
function gableGeometry(): THREE.BufferGeometry {
  const A = [-0.5, 0, -0.5], B = [0.5, 0, -0.5], C = [0.5, 0, 0.5], D = [-0.5, 0, 0.5];
  const E = [0, 1, -0.5], F = [0, 1, 0.5];
  const tri = (...v: number[][]) => v.flat();
  const pos = [
    ...tri(A, D, F), ...tri(A, F, E), ...tri(B, E, F), ...tri(B, F, C),
    ...tri(A, E, B), ...tri(D, C, F),
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// --- Trees (merged low-poly, baked vertex colours) ---------------------------
interface Part { geo: THREE.BufferGeometry; color: [number, number, number]; }
/** Merge primitive parts into one non-indexed geometry with per-part vertex
 *  colours. Callers own (and dispose) the input primitives. */
function mergeParts(parts: Part[]): THREE.BufferGeometry {
  const nis = parts.map((p) => {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    return { g, temp: p.geo.index != null, color: p.color, n: g.getAttribute("position").count };
  });
  const total = nis.reduce((s, p) => s + p.n, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const { g, temp, color, n } of nis) {
    const pa = g.getAttribute("position"), na = g.getAttribute("normal");
    for (let i = 0; i < n; i++) {
      const k = (o + i) * 3;
      pos[k] = pa.getX(i); pos[k + 1] = pa.getY(i); pos[k + 2] = pa.getZ(i);
      nor[k] = na.getX(i); nor[k + 1] = na.getY(i); nor[k + 2] = na.getZ(i);
      col[k] = color[0]; col[k + 1] = color[1]; col[k + 2] = color[2];
    }
    o += n;
    if (temp) g.dispose();
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  m.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  m.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return m;
}

const BARK = lin("#5a4632");
const BIRCH_BARK = lin("#d7d2c6");
const GREENS = ["#4d7a38", "#5c8a44", "#436e30", "#6f9a4a", "#3f6b2f"].map(lin);
const g = (i: number) => GREENS[i % GREENS.length];

/** Deciduous: trunk + a couple of branches + a lumpy multi-blob canopy. */
function buildRoundTree(): THREE.BufferGeometry {
  const parts: Part[] = [];
  const push = (geo: THREE.BufferGeometry, color: [number, number, number]) => parts.push({ geo, color });
  const trunk = new THREE.CylinderGeometry(0.13, 0.2, 2.0, 6); trunk.translate(0, 1.0, 0); push(trunk, BARK);
  const b1 = new THREE.CylinderGeometry(0.06, 0.1, 1.3, 5); b1.rotateZ(0.6); b1.translate(0.4, 1.7, 0); push(b1, BARK);
  const b2 = new THREE.CylinderGeometry(0.06, 0.1, 1.2, 5); b2.rotateZ(-0.5); b2.rotateY(1.1); b2.translate(-0.3, 1.6, 0.3); push(b2, BARK);
  const blobs: [number, number, number, number, number][] = [
    [1.2, 0, 3.1, 0, 0], [0.9, 0.8, 2.7, 0.2, 1], [0.85, -0.6, 2.8, -0.5, 2], [0.7, 0.1, 3.6, 0.4, 3],
  ];
  for (const [r, x, y, z, ci] of blobs) {
    const ic = new THREE.IcosahedronGeometry(r, 1); ic.translate(x, y, z); push(ic, g(ci));
  }
  const merged = mergeParts(parts);
  parts.forEach((p) => p.geo.dispose());
  return merged;
}
/** Conifer: short trunk + stacked cones. */
function buildConifer(): THREE.BufferGeometry {
  const parts: Part[] = [];
  const trunk = new THREE.CylinderGeometry(0.12, 0.16, 1.0, 6); trunk.translate(0, 0.5, 0); parts.push({ geo: trunk, color: BARK });
  const cones: [number, number, number][] = [[1.3, 1.6, 1.4], [1.0, 1.5, 2.3], [0.65, 1.4, 3.2]];
  for (const [r, h, y] of cones) {
    const cn = new THREE.ConeGeometry(r, h, 7); cn.translate(0, y, 0); parts.push({ geo: cn, color: g(2) });
  }
  const merged = mergeParts(parts);
  parts.forEach((p) => p.geo.dispose());
  return merged;
}
/** Shrub: a couple of low blobs, no trunk. */
function buildBush(): THREE.BufferGeometry {
  const parts: Part[] = [];
  const blobs: [number, number, number, number, number][] = [
    [0.9, 0, 0.7, 0, 1], [0.7, 0.6, 0.55, 0.2, 3], [0.65, -0.5, 0.6, -0.3, 0],
  ];
  for (const [r, x, y, z, ci] of blobs) {
    const ic = new THREE.IcosahedronGeometry(r, 1); ic.translate(x, y, z); parts.push({ geo: ic, color: g(ci) });
  }
  const merged = mergeParts(parts);
  parts.forEach((p) => p.geo.dispose());
  return merged;
}
/** Birch: tall slim pale trunk + small canopy. */
function buildBirch(): THREE.BufferGeometry {
  const parts: Part[] = [];
  const trunk = new THREE.CylinderGeometry(0.09, 0.13, 3.2, 6); trunk.translate(0, 1.6, 0); parts.push({ geo: trunk, color: BIRCH_BARK });
  const blobs: [number, number, number, number, number][] = [[0.8, 0, 3.4, 0, 4], [0.6, 0.4, 3.0, 0.2, 1]];
  for (const [r, x, y, z, ci] of blobs) {
    const ic = new THREE.IcosahedronGeometry(r, 1); ic.translate(x, y, z); parts.push({ geo: ic, color: g(ci) });
  }
  const merged = mergeParts(parts);
  parts.forEach((p) => p.geo.dispose());
  return merged;
}

// Shared breeze clock: one uniform, advanced once per frame, read by trees + grass.
const windUniforms = { uTime: { value: 0 } };
/** MeshStandardMaterial that bends geometry by a height-scaled breeze in the
 *  vertex shader. `key` keeps each variant on its own compiled program. */
function makeWindMaterial(key: string, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, ...extra });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float wph = instanceMatrix[3].x * 0.5 + instanceMatrix[3].z * 0.37;
        #else
          float wph = 0.0;
        #endif
        float wh = max(transformed.y, 0.0);
        float wsw = sin(uTime * 1.4 + wph) * 0.06 + sin(uTime * 2.7 + wph * 1.7) * 0.03;
        transformed.x += wsw * wh;
        transformed.z += cos(uTime * 1.1 + wph) * 0.045 * wh;`,
      );
  };
  m.customProgramCacheKey = () => "suburb-wind-" + key;
  return m;
}

/** A single grass blade: a tapered upright quad, built DOUBLE-FACED in geometry
 *  (both windings) with an up-facing normal on every vertex, rendered FrontSide.
 *  That way each side has its own front triangle so the blade is lit like the
 *  lawn from any angle — DoubleSide would flip the up-normal down (black grass).
 *  Vertex colour is a greyscale base→tip gradient; hue is per-instance. */
function bladeGeometry(): THREE.BufferGeometry {
  const w = 0.045, h = 0.19, g0 = 0.72, g1 = 1.12;
  const BL = [-w / 2, 0, 0], BR = [w / 2, 0, 0], TR = [w / 6, h, 0], TL = [-w / 6, h, 0];
  const b: [number[], number] = [BL, g0], r: [number[], number] = [BR, g0];
  const tr: [number[], number] = [TR, g1], tl: [number[], number] = [TL, g1];
  const verts: [number[], number][] = [
    b, r, tr, b, tr, tl, // front
    b, tr, r, b, tl, tr, // back (reversed winding, same up-normal)
  ];
  const n = verts.length;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  verts.forEach(([p, g], i) => {
    pos.set(p, i * 3);
    col.set([g, g, g], i * 3);
    nor.set([0, 1, 0], i * 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  return geo;
}

const WALL_COLORS = ["#d9c9a6", "#c9b899", "#bcc4cb", "#d3b6a0", "#cfc9bd", "#aab19f", "#c6b7a6"];
const ROOF_COLORS = ["#6b4a3a", "#7c5a48", "#495059", "#5b5149", "#7f3f34", "#3f4650"];
const STYLES = ["round", "conifer", "bush", "birch"] as const;
type Style = (typeof STYLES)[number];

interface House { x: number; z: number; ty: number; w: number; d: number; h: number; roofH: number; rot: number; variant: number; wall: string; roof: string; }
interface Veg { x: number; z: number; ty: number; scale: number; rotY: number; }
interface Blade { x: number; z: number; ty: number; rotY: number; tilt: number; scale: number; }

function buildNeighborhood(span: number) {
  const clearR = Math.max(span * 2.6, 34); // model sits well clear of neighbours
  const reach = Math.max(span * 7, 120);
  const flatR = Math.max(span * 0.85, 7); // small flat pad; terrain rolls just past it
  const step = 30; // sparse — few houses
  const rnd = mulberry32(101);

  const houses: House[] = [];
  for (let gx = -reach; gx <= reach; gx += step) {
    for (let gz = -reach; gz <= reach; gz += step) {
      const x = gx + (rnd() * 2 - 1) * 7;
      const z = gz + (rnd() * 2 - 1) * 7;
      const dd = Math.hypot(x, z);
      if (dd < clearR || dd > reach) continue;
      if (rnd() < 0.35) continue; // thin the grid
      const variant = rnd() < 0.4 ? 0 : rnd() < 0.6 ? 1 : 2;
      const V = VARIANTS[variant];
      houses.push({
        x, z, ty: terrainHeight(x, z, flatR),
        w: V.wMin + rnd() * (V.wMax - V.wMin),
        d: 7 + rnd() * 3.5,
        h: V.hMin + rnd() * (V.hMax - V.hMin),
        roofH: 1.6 + rnd() * 1.2,
        rot: Math.floor(rnd() * 4) * (Math.PI / 2) + (rnd() * 2 - 1) * 0.1,
        variant,
        wall: WALL_COLORS[Math.floor(rnd() * WALL_COLORS.length)],
        roof: ROOF_COLORS[Math.floor(rnd() * ROOF_COLORS.length)],
      });
    }
  }

  const trnd = mulberry32(202);
  const veg: Record<Style, Veg[]> = { round: [], conifer: [], bush: [], birch: [] };
  const near = (x: number, z: number, m: number) => houses.some((h) => Math.hypot(h.x - x, h.z - z) < m);
  // Sparse, area-uniform scatter (sqrt radius, else it clumps into a near wall)
  // starting at the house ring so the lot stays open and houses show through.
  for (let i = 0; i < 150; i++) {
    const ang = trnd() * Math.PI * 2;
    const rad = Math.sqrt(clearR * clearR + trnd() * (reach * reach - clearR * clearR));
    const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
    if (near(x, z, 3.5)) continue; // keep out of houses
    const r = trnd();
    const style: Style = r < 0.38 ? "round" : r < 0.62 ? "conifer" : r < 0.85 ? "bush" : "birch";
    if (veg[style].length >= VEG_CAP) continue;
    veg[style].push({
      x, z, ty: terrainHeight(x, z, flatR),
      scale: (style === "bush" ? 0.8 : 1.0) + trnd() * 0.7,
      rotY: trnd() * Math.PI * 2,
    });
  }

  // Near-field 3D grass — what actually reads as a lawn (a flat surface never
  // will). Denser toward the house (pow bias); ring clears the model footprint.
  const grnd = mulberry32(303);
  const gInner = Math.max(span * 0.7, 5);
  const gOuter = Math.max(span * 4, 30);
  const blades: Blade[] = [];
  for (let i = 0; i < GRASS_CAP; i++) {
    const rad = gInner + (gOuter - gInner) * Math.pow(grnd(), 1.7);
    const ang = grnd() * Math.PI * 2;
    const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
    blades.push({ x, z, ty: terrainHeight(x, z, flatR), rotY: grnd() * Math.PI * 2, tilt: (grnd() * 2 - 1) * 0.14, scale: 0.6 + grnd() * 0.8 });
  }

  return { houses, veg, blades, groundR: Math.max(span * 18, 250), flatR };
}

export function Suburb({ span }: { span: number }) {
  const { houses, veg, blades, groundR, flatR } = useMemo(() => buildNeighborhood(span), [span]);

  // Ground, geometries + materials (owned here; r3f disposes on unmount). The
  // lawn is pure vertex colour — no repeating texture, so no tile grid.
  const ground = useMemo(() => groundGeometry(groundR, flatR), [groundR, flatR]);
  const groundMat = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, metalness: 0 }),
    [],
  );
  const bodyGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const roofGeo = useMemo(() => gableGeometry(), []);
  const bodyMats = useMemo(() => VARIANTS.map((_, v) => new THREE.MeshStandardMaterial({ map: facadeTexture(v), roughness: 0.92, metalness: 0 })), []);
  const roofMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, flatShading: true }), []);

  const treeGeos = useMemo<Record<Style, THREE.BufferGeometry>>(
    () => ({ round: buildRoundTree(), conifer: buildConifer(), bush: buildBush(), birch: buildBirch() }),
    [],
  );
  const treeMat = useMemo(() => makeWindMaterial("tree", { flatShading: true }), []);
  const bladeGeo = useMemo(() => bladeGeometry(), []);
  const grassMat = useMemo(() => makeWindMaterial("grass"), []); // FrontSide; blade is double-faced in geometry

  const bodyRefs = [useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null)];
  const roofRef = useRef<THREE.InstancedMesh>(null);
  const grassRef = useRef<THREE.InstancedMesh>(null);
  const vegRefs = {
    round: useRef<THREE.InstancedMesh>(null),
    conifer: useRef<THREE.InstancedMesh>(null),
    bush: useRef<THREE.InstancedMesh>(null),
    birch: useRef<THREE.InstancedMesh>(null),
  };

  useLayoutEffect(() => {
    const roof = roofRef.current;
    let ri = 0;
    VARIANTS.forEach((_, v) => {
      const mesh = bodyRefs[v].current;
      if (!mesh) return;
      const list = houses.filter((h) => h.variant === v);
      list.forEach((h, i) => {
        _e.set(0, h.rot, 0); _q.setFromEuler(_e);
        _p.set(h.x, h.ty + h.h / 2, h.z); _sc.set(h.w, h.h, h.d);
        mesh.setMatrixAt(i, _m.compose(_p, _q, _sc));
        mesh.setColorAt(i, _col.set(h.wall));
        if (roof) {
          _p.set(h.x, h.ty + h.h, h.z); _sc.set(h.w * 1.04, h.roofH, h.d * 1.04);
          roof.setMatrixAt(ri, _m.compose(_p, _q, _sc));
          roof.setColorAt(ri, _col.set(h.roof));
          ri++;
        }
      });
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    if (roof) {
      roof.count = ri;
      roof.instanceMatrix.needsUpdate = true;
      if (roof.instanceColor) roof.instanceColor.needsUpdate = true;
    }
  }, [houses]);

  useLayoutEffect(() => {
    _q.identity();
    STYLES.forEach((style) => {
      const mesh = vegRefs[style].current;
      if (!mesh) return;
      const list = veg[style];
      list.forEach((t, i) => {
        _e.set(0, t.rotY, 0); _q.setFromEuler(_e);
        _p.set(t.x, t.ty, t.z); _sc.setScalar(t.scale);
        mesh.setMatrixAt(i, _m.compose(_p, _q, _sc));
      });
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
    });
  }, [veg]);

  useLayoutEffect(() => {
    const mesh = grassRef.current;
    if (!mesh) return;
    blades.forEach((bl, i) => {
      _e.set(bl.tilt, bl.rotY, bl.tilt * 0.6);
      _q.setFromEuler(_e);
      _p.set(bl.x, bl.ty, bl.z);
      _sc.setScalar(bl.scale);
      mesh.setMatrixAt(i, _m.compose(_p, _q, _sc));
      // Follow the same lawn field as the ground (so grass matches its patch),
      // but with brighter, lusher blade greens.
      const v = 0.6 * lawnField(bl.x, bl.z) + 0.4 * lawnField2(bl.x, bl.z);
      const mix = Math.min(1, Math.max(0, 0.5 + 1.5 * v));
      _col.setRGB(
        GRASS_LO[0] + (GRASS_HI[0] - GRASS_LO[0]) * mix,
        GRASS_LO[1] + (GRASS_HI[1] - GRASS_LO[1]) * mix,
        GRASS_LO[2] + (GRASS_HI[2] - GRASS_LO[2]) * mix,
      );
      mesh.setColorAt(i, _col);
    });
    mesh.count = blades.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [blades]);

  useFrame((_, dt) => {
    windUniforms.uTime.value += Math.min(dt, 0.05);
  });

  return (
    <>
      {/* Rolling lawn — also the model's shadow catcher (flat under the lot). */}
      <mesh geometry={ground} material={groundMat} position={[0, -0.02, 0]} receiveShadow />

      {/* Near-field 3D grass blades — the actual lawn (wind-swept). */}
      <instancedMesh ref={grassRef} args={[bladeGeo, grassMat, GRASS_CAP]} frustumCulled={false} />

      {/* Houses: window facades + gable roofs, split by variant. */}
      {VARIANTS.map((_, v) => (
        <instancedMesh key={v} ref={bodyRefs[v]} args={[bodyGeo, bodyMats[v], HOUSE_CAP]} frustumCulled={false} />
      ))}
      <instancedMesh ref={roofRef} args={[roofGeo, roofMat, ROOF_CAP]} frustumCulled={false} />

      {/* Mixed, wind-swept vegetation. */}
      {STYLES.map((style) => (
        <instancedMesh key={style} ref={vegRefs[style]} args={[treeGeos[style], treeMat, VEG_CAP]} frustumCulled={false} />
      ))}
    </>
  );
}
