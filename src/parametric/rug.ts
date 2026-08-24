import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "./types";
import { finishMaterial, isColorable } from "./materials";
import { mulberry32 } from "@/decorate/proceduralTexture";

// Rugs — Phase 3, the first of the soft-decor set.
//
// A rug is its surface, so most of the look lives in materials.ts. What lives
// here is the part a texture cannot do:
//
//  1. **The pile has REAL relief.** The top is a subdivided grid whose vertices
//     are pushed up a few millimetres by value noise — 2–3mm for a woven wool,
//     8mm for a shag. A normal map fakes the lighting of a bump but never its
//     silhouette or its shadow, which is why a map-only rug reads as a printed
//     sheet the moment it crosses your eye line. The grid is ~3cm, so the cost
//     is a few thousand triangles, not a displacement-map subdivision.
//  2. **The edge is a bevel, not a seam.** The first pass laid a pile plane on
//     a flat "binding tape" slab; two coplanar faces in two tones drew a hard
//     line round the rug. Now the relief damps to zero over the last 3cm and a
//     skirt drops from that rim to the floor in the SAME material: the edge is
//     shaded by its own geometry, the way a bound edge actually is.
//  3. **UVs are authored in METRES**, matching FloorMesh. The carpet scans come
//     from the floor catalog with their repeat already at 1/coverM, so a UV in
//     metres lands the scan life-size with no per-instance texture clone and no
//     mutation of a texture the floors share.

/** Target grid spacing in metres. 3cm keeps a 1.7×2.4 rug near 4k quads. */
const CELL = 0.03;
const MAX_SEG = 80;
/** How far in from the edge the relief fades out — the bound rim. */
const RIM = 0.035;
/** The underside sits this far above the floor plane. A rug's skirt ends
 *  exactly where the floor is, and two surfaces meeting at y=0 z-fight: the
 *  first pass drew a dashed black line all the way round the rim. 1.5mm is
 *  under the tolerance of anything that measures the rug and far enough to
 *  separate the depth values. */
const BASE = 0.0015;

/** Pile depth per finish, in metres. This is what "shag" means: the same
 *  generator, an order of magnitude more relief. */
function pileAmp(finish: string): number {
  if (finish === "rug-shag") return 0.009;
  if (finish === "rug-flat") return 0.0015;
  if (finish === "rug-jute") return 0.005; // braided rope stands proud
  if (finish === "rug-modern") return 0.004;
  return 0.003;
}

function variantOf(spec: ParametricSpec): string {
  return spec.variant ?? "area";
}

/** Which cards are discs. Shape belongs to the PRODUCT, not to the finish —
 *  a braided jute rug is round the way a shag round rug is, and neither
 *  becomes rectangular because someone re-tunes its material. */
function isRound(variant: string): boolean {
  return variant === "round" || variant === "jute";
}

/** Horizontal run of the edge chamfer — wider than the rug is tall, so the
 *  edge reads as a roll rather than a cliff. */
function chamferPull(h: number): number {
  return Math.min(0.02, Math.max(0.008, h * 0.9));
}

/** Smooth value noise on a wrapping lattice — deterministic, seeded, and free
 *  of any canvas or image, so it builds identically in the browser and under
 *  tsx. `freq` is lattice cells per metre. */
function pileNoise(seed: number, freq: number): (x: number, z: number) => number {
  const N = 64;
  const rnd = mulberry32(seed);
  const lat = new Float32Array(N * N);
  for (let i = 0; i < lat.length; i++) lat[i] = rnd();
  const at = (i: number, j: number) => lat[((i % N) + N) % N * N + (((j % N) + N) % N)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x, z) => {
    const fx = x * freq;
    const fz = z * freq;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = smooth(fx - i);
    const tz = smooth(fz - j);
    const a = at(i, j) * (1 - tx) + at(i + 1, j) * tx;
    const b = at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx;
    return a * (1 - tz) + b * tz;
  };
}

/** 0 at the very edge, 1 once you are RIM inside it — the bound rim, and the
 *  reason the pile no longer ends in a cliff. */
function rimFade(distToEdge: number): number {
  const t = THREE.MathUtils.clamp(distToEdge / RIM, 0, 1);
  return t * t * (3 - 2 * t);
}

interface Surface {
  /** Top surface, y in [h-amp, h], UVs in metres. */
  top: THREE.BufferGeometry;
  /** Skirt from the rim down to the floor, sharing the rim's own heights. */
  skirt: THREE.BufferGeometry;
}

/** Rectangular pile: a displaced grid plus its skirt. */
function rectSurface(w: number, d: number, h: number, amp: number, noise: (x: number, z: number) => number): Surface {
  const nx = Math.min(MAX_SEG, Math.max(4, Math.round(w / CELL)));
  const nz = Math.min(MAX_SEG, Math.max(4, Math.round(d / CELL)));
  const pos: number[] = [];
  const uv: number[] = [];
  const uv1: number[] = [];
  const idx: number[] = [];
  const heightAt = (x: number, z: number) => {
    const edge = Math.min(x + w / 2, w / 2 - x, z + d / 2, d / 2 - z);
    return h - amp + noise(x, z) * amp * rimFade(edge);
  };
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = -w / 2 + (w * i) / nx;
      const z = -d / 2 + (d * j) / nz;
      pos.push(x, heightAt(x, z), z);
      uv.push(x + w / 2, z + d / 2); // channel 0: metres, for the weave grain
      uv1.push(i / nx, j / nz); // channel 1: 0..1, for a pattern that never tiles
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + (nx + 1);
      const e = c + 1;
      idx.push(a, c, b, b, c, e);
    }
  }
  const top = new THREE.BufferGeometry();
  top.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  top.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  top.setAttribute("uv1", new THREE.Float32BufferAttribute(uv1, 2));
  top.setIndex(idx);
  top.computeVertexNormals();

  // Skirt: walk the boundary in order, chamfer each rim vertex to the base.
  const ring: number[] = [];
  for (let i = 0; i <= nx; i++) ring.push(i); // near edge
  for (let j = 1; j <= nz; j++) ring.push(j * (nx + 1) + nx); // right
  for (let i = nx - 1; i >= 0; i--) ring.push(nz * (nx + 1) + i); // far
  for (let j = nz - 1; j >= 1; j--) ring.push(j * (nx + 1)); // left
  const skirt = skirtFromRing(pos, ring, w, d, 0, 0, chamferPull(h));
  return { top, skirt };
}

/** Round (or oval) pile: the same displaced surface on a polar grid. */
function roundSurface(w: number, d: number, h: number, amp: number, noise: (x: number, z: number) => number): Surface {
  const rx = w / 2;
  const rz = d / 2;
  const seg = Math.min(128, Math.max(24, Math.round((Math.PI * (rx + rz)) / CELL)));
  const rings = Math.min(MAX_SEG, Math.max(4, Math.round(Math.min(rx, rz) / CELL)));
  const pos: number[] = [];
  const uv: number[] = [];
  const uv1: number[] = [];
  const idx: number[] = [];
  const heightAt = (x: number, z: number, t: number) => {
    // `t` is 0 at centre, 1 at the rim; the edge distance is the remaining
    // radius, measured in the smaller axis so an oval fades evenly.
    const edge = (1 - t) * Math.min(rx, rz);
    return h - amp + noise(x, z) * amp * rimFade(edge);
  };
  pos.push(0, heightAt(0, 0, 0), 0);
  uv.push(rx, rz);
  uv1.push(0.5, 0.5);
  for (let r = 1; r <= rings; r++) {
    const t = r / rings;
    for (let a = 0; a < seg; a++) {
      const ang = (a / seg) * Math.PI * 2;
      const x = Math.cos(ang) * rx * t;
      const z = Math.sin(ang) * rz * t;
      pos.push(x, heightAt(x, z, t), z);
      uv.push(x + rx, z + rz); // channel 0: metres
      uv1.push((x + rx) / w, (z + rz) / d); // channel 1: 0..1 across the disc
    }
  }
  const ringStart = (r: number) => 1 + (r - 1) * seg;
  for (let a = 0; a < seg; a++) idx.push(0, ringStart(1) + ((a + 1) % seg), ringStart(1) + a);
  for (let r = 1; r < rings; r++) {
    for (let a = 0; a < seg; a++) {
      const a0 = ringStart(r) + a;
      const a1 = ringStart(r) + ((a + 1) % seg);
      const b0 = ringStart(r + 1) + a;
      const b1 = ringStart(r + 1) + ((a + 1) % seg);
      idx.push(a0, a1, b0, a1, b1, b0);
    }
  }
  const top = new THREE.BufferGeometry();
  top.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  top.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  top.setAttribute("uv1", new THREE.Float32BufferAttribute(uv1, 2));
  top.setIndex(idx);
  top.computeVertexNormals();

  const ring: number[] = [];
  for (let a = 0; a < seg; a++) ring.push(ringStart(rings) + a);
  const skirt = skirtFromRing(pos, ring, w, d, 0, 0, chamferPull(h));
  return { top, skirt };
}

/** Closes a surface to the floor: one quad per rim edge, from the rim vertex's
 *  own height down to the base. Shares the rim's heights exactly, so there is
 *  no step and no second tone — the edge is just the surface turning over.
 *
 *  The bottom ring is pulled INWARD, which makes the edge a chamfer rather
 *  than a wall. A vertical rim on a 2cm rug is a 2cm dark stripe seen almost
 *  edge-on from any standing camera, and it aliases into a dashed black line
 *  round the whole rug — the same ugly boundary the binding tape drew, just
 *  thinner. A chamfer catches the light across its width instead. */
function skirtFromRing(pos: number[], ring: number[], w: number, d: number, cx: number, cz: number, pull: number): THREE.BufferGeometry {
  const p: number[] = [];
  const uv: number[] = [];
  const uv1: number[] = [];
  const idx: number[] = [];
  for (let k = 0; k < ring.length; k++) {
    const v = ring[k] * 3;
    const x = pos[v];
    const y = pos[v + 1];
    const z = pos[v + 2];
    // Toward the centre, by `pull` metres — the chamfer's horizontal run.
    const dx = cx - x;
    const dz = cz - z;
    const len = Math.hypot(dx, dz) || 1;
    const bx = x + (dx / len) * pull;
    const bz = z + (dz / len) * pull;
    p.push(x, y, z, bx, BASE, bz);
    uv.push(x + w / 2, z + d / 2, bx + w / 2, bz + d / 2);
    // The pattern wraps over the chamfer instead of stopping at the rim —
    // a Persian border that ends exactly where the edge turns down looks
    // printed on, because a woven border runs right over the selvedge.
    uv1.push((x + w / 2) / w, (z + d / 2) / d, (bx + w / 2) / w, (bz + d / 2) / d);
  }
  for (let k = 0; k < ring.length; k++) {
    const a = (k * 2) % (ring.length * 2);
    const b = a + 1; // a's floor vertex
    const c = ((k + 1) % ring.length) * 2;
    const e = c + 1;
    // Wound so the faces look OUT of the rug: a skirt facing inward is a rim
    // that vanishes at grazing angles, which is the look we are replacing.
    idx.push(a, c, b, c, e, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("uv1", new THREE.Float32BufferAttribute(uv1, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export const rugGenerator: GeneratorDef = {
  id: "rug",
  label: "Rug",
  category: "Decor",
  rooms: ["living", "bedroom", "dining", "study", "kids", "bathroom"],
  wallSnap: false,
  // A rug is walked over, not walked into: it must not block a sofa from
  // sitting on it, and it must not be blocked by one.
  noCollide: true,
  dimLimits: { w: [0.4, 5], d: [0.4, 5], h: [0.006, 0.06] },
  modules: [],
  fronts: ["slab"],
  handles: ["none"],
  // The patterned three (persian / modern / jute) carry their own palettes on
  // UV channel 1, so they are offered as finishes but ignore the colour wheel.
  // rug-flat is the plain flatweave AND the only rug finish that needs neither
  // a canvas nor an image decode — which is what lets the headless suite build
  // every card.
  finishes: ["rug-wool", "rug-shag", "rug-persian", "rug-modern", "rug-jute", "rug-wool-navy", "rug-flat"],
  hotspotKeywords: ["rug", "carpet", "mat"],
  variantIsProduct: true,
  variants: [
    {
      id: "area",
      label: "Area",
      cardLabel: "Wool area rug",
      hotspotKeywords: ["rug", "carpet"],
      defaults: { dims: { w: 1.7, d: 2.4, h: 0.02 }, finish: "rug-wool" },
    },
    {
      id: "round",
      label: "Round",
      cardLabel: "Round shag rug",
      hotspotKeywords: ["rug", "carpet"],
      defaults: { dims: { w: 1.6, d: 1.6, h: 0.038 }, finish: "rug-shag" },
    },
    {
      id: "persian",
      label: "Persian",
      cardLabel: "Persian medallion rug",
      hotspotKeywords: ["rug", "carpet", "persian"],
      defaults: { dims: { w: 2.0, d: 3.0, h: 0.014 }, finish: "rug-persian" },
    },
    {
      id: "modern",
      label: "Modern",
      cardLabel: "Modern geometric rug",
      hotspotKeywords: ["rug", "carpet"],
      defaults: { dims: { w: 2.0, d: 2.9, h: 0.016 }, finish: "rug-modern" },
    },
    {
      id: "jute",
      label: "Jute",
      cardLabel: "Braided jute round",
      hotspotKeywords: ["rug", "carpet", "mat"],
      defaults: { dims: { w: 1.8, d: 1.8, h: 0.024 }, finish: "rug-jute" },
    },
  ],
  defaultSpec: {
    generator: "rug",
    dims: { w: 1.7, d: 2.4, h: 0.02 },
    modules: {},
    front: "slab",
    handle: "none",
    finish: "rug-wool",
    variant: "area",
  },
  build(spec: ParametricSpec): THREE.Group {
    const { w, d, h } = spec.dims;
    const variant = variantOf(spec);
    const mat = finishMaterial(spec.finish);
    const group = new THREE.Group();

    // Relief can never lift the rug past the height it declares, so the base
    // plane sits an amplitude below and the noise fills that budget upward.
    const amp = Math.min(pileAmp(spec.finish), h * 0.55);
    // Lattice cells per metre. Both stay well under the grid's own Nyquist
    // limit (1 / 2·CELL ≈ 16): noise finer than the mesh that samples it turns
    // into speckle, which is a worse lie than a flat plane. Shag clumps at a
    // coarser pitch than a woven loop — bumps of ~11cm against ~7cm.
    const freq = spec.finish === "rug-shag" ? 9 : 14;
    const round = isRound(variant);
    const noise = pileNoise(round ? 71 : 17, freq);

    const surface = round
      ? roundSurface(w, d, h, amp, noise)
      : rectSurface(w, d, h, amp, noise);

    const top = new THREE.Mesh(surface.top, mat);
    const skirt = new THREE.Mesh(surface.skirt, mat);
    group.add(top, skirt);

    // Backing: the rug is not a hole in the floor when seen from below (or
    // from a walkthrough camera at ankle height).
    const backing = round
      ? new THREE.Mesh(new THREE.CircleGeometry(0.5, 48), mat)
      : new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    if (round) backing.scale.set(w, d, 1);
    // Its own 0..1 UVs serve as the pattern channel too; a patterned material
    // reads uv1 on every mesh it is on, and a missing attribute renders the
    // texture's first texel across the whole face.
    backing.geometry.setAttribute("uv1", backing.geometry.getAttribute("uv").clone());
    backing.rotation.x = Math.PI / 2; // faces down
    backing.position.y = BASE;
    group.add(backing);

    if (isColorable(spec.finish) && spec.color) {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.userData.tintColor = spec.color;
      });
    }
    return group;
  },
};
