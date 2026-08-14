"use client";

import * as THREE from "three";
import { makeCanvas, mulberry32, heightToNormal, applyTiling } from "@/decorate/proceduralTexture";

// Materials, pictures and mouldings for the wall-art generator.
//
// Same lesson the television build ended on, one step further: a picture on a
// wall is a PHOTOGRAPH of a real work, never a drawing of one. Anything
// procedural at this size reads as clip art the moment the camera comes down
// to eye level, and unlike a TV screen there is no "off" state to hide behind.
//
// So the pictures are real museum scans — six public-domain works from the Art
// Institute of Chicago's open-access collection, listed in docs/DATA_RIGHTS.md
// with their catalogue ids. Serving one is REDISTRIBUTION, which is why every
// candidate whose `is_public_domain` flag was false was dropped even when the
// artist has been dead for a century.
//
// What is procedural is everything AROUND the picture, because that is what
// makes a rectangle read as a framed object rather than a decal:
//
//  1. **Paper grain** on a print — matte, ~0.1mm, in roughness and normal.
//  2. **Canvas weave** on a gallery wrap — a real woven crossing at ~0.6mm,
//     coarse enough to catch a highlight along the top edge.
//  3. **Mount board** (the passe-partout) — near-white, felt-matte, with a
//     bevelled inner edge, which is the single detail that separates a framed
//     print from a poster taped to the wall.
//  4. **Glazing** — a faint diagonal sheen. Not `transmission` (it needs its
//     own render pass and turns panels into mirrors) and not a mirror-like
//     MeshStandardMaterial either, since indoors there is no environment worth
//     reflecting. One additive band, the same fake the TV's glare uses.

const hasDOM = () => typeof document !== "undefined";

const texCache = new Map<string, THREE.Texture>();
const matCache = new Map<string, THREE.MeshStandardMaterial>();

// ── The pictures ───────────────────────────────────────────────────────────

export interface Artwork {
  /** Doubles as the finish id on the spec: the inspector's first swatch row
   *  picks the ARTWORK, because on a framed print that is the thing being
   *  chosen and the frame tone is the accessory, not the other way round. */
  id: string;
  url: string;
  /** Shown in the inspector swatch tooltip. */
  label: string;
  /** Pixel aspect (w / h) of the file at `url`. Load is async and three has no
   *  synchronous way to ask, so the number lives here and `wallArt.test.ts`
   *  asserts it against the actual JPEG on disk — a stale value here would
   *  stretch a painting and nothing else would notice. */
  aspect: number;
}

export const ARTWORKS: Artwork[] = [
  { id: "art-wave", url: "/textures/wallart/hokusai-great-wave.jpg", label: "Hokusai · The Great Wave", aspect: 900 / 617 },
  { id: "art-lilies", url: "/textures/wallart/monet-water-lilies.jpg", label: "Monet · Water Lilies", aspect: 900 / 864 },
  { id: "art-bedroom", url: "/textures/wallart/vangogh-bedroom.jpg", label: "Van Gogh · The Bedroom", aspect: 900 / 705 },
  { id: "art-cannons", url: "/textures/wallart/kandinsky-improvisation-30.jpg", label: "Kandinsky · Improvisation No. 30", aspect: 896 / 900 },
  { id: "art-plum", url: "/textures/wallart/hiroshige-plum-garden.jpg", label: "Hiroshige · Plum Garden at Kameido", aspect: 611 / 900 },
  { id: "art-mono", url: "/textures/wallart/stieglitz-hand-of-man.jpg", label: "Stieglitz · The Hand of Man", aspect: 900 / 678 },
];

export const ARTWORK_IDS = ARTWORKS.map((a) => a.id);

export function artworkOf(id: string | undefined): Artwork {
  return ARTWORKS.find((a) => a.id === id) ?? ARTWORKS[0];
}

/** The next artwork along the list — how a gallery set fills its second and
 *  third frames. A set of three copies of one painting is not a gallery wall,
 *  and picking at random would reshuffle every time the spec is re-built. */
export function artworkAfter(id: string, step: number): Artwork {
  const i = ARTWORKS.findIndex((a) => a.id === id);
  return ARTWORKS[((i < 0 ? 0 : i) + step) % ARTWORKS.length];
}

/** The scan itself, on UV channel 1 — the 0..1 set `pictureGeometry` writes,
 *  which spans the picture exactly once. Channel 0 is in METRES for the paper
 *  grain, so a painting sent there would tile a dozen times across a print. */
function artTexture(art: Artwork): THREE.Texture | null {
  if (!hasDOM()) return null;
  let t = texCache.get(art.id);
  if (!t) {
    // Loaded, not drawn: the decode is async and three swaps the image in when
    // it arrives, so the frame is empty for a frame or two and then hung.
    t = new THREE.TextureLoader().load(art.url);
    t.channel = 1;
    t.colorSpace = THREE.SRGBColorSpace;
    // The picture must never repeat into the mount board or around a canvas's
    // returns; the last row of pixels is what a gallery wrap shows on its side.
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 8;
    texCache.set(art.id, t);
  }
  return t;
}

/** A cropped copy for the gallery-wrap case, where the picture must FILL a
 *  face whose aspect it does not share. Cloned rather than re-set, because the
 *  cached texture is on other items in the same scene. */
function croppedArtTexture(art: Artwork, faceAspect: number): THREE.Texture | null {
  const base = artTexture(art);
  if (!base) return null;
  const key = `${art.id}@${faceAspect.toFixed(3)}`;
  let t = texCache.get(key);
  if (!t) {
    t = base.clone();
    t.needsUpdate = true;
    if (faceAspect > art.aspect) {
      // Face is wider than the picture: keep full width, crop top and bottom.
      const r = art.aspect / faceAspect;
      t.repeat.set(1, r);
      t.offset.set(0, (1 - r) / 2);
    } else {
      const r = faceAspect / art.aspect;
      t.repeat.set(r, 1);
      t.offset.set((1 - r) / 2, 0);
    }
    texCache.set(key, t);
  }
  return t;
}

// ── Procedural surfaces ────────────────────────────────────────────────────

/** Value noise, one canvas of greyscale height. Same generator the TV coating
 *  uses; `lattice` sets the blob size, `fine` the per-texel jitter. */
function noiseCanvas(seed: number, lattice: number, fine: number, contrast = 1): HTMLCanvasElement {
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  const rnd = mulberry32(seed);
  const lat = new Float32Array(lattice * lattice);
  for (let i = 0; i < lat.length; i++) lat[i] = rnd();
  const at = (i: number, j: number) =>
    lat[(((i % lattice) + lattice) % lattice) * lattice + (((j % lattice) + lattice) % lattice)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const fx = (x / S) * lattice;
      const fy = (y / S) * lattice;
      const i = Math.floor(fx);
      const j = Math.floor(fy);
      const tx = smooth(fx - i);
      const ty = smooth(fy - j);
      const a = at(i, j) * (1 - tx) + at(i + 1, j) * tx;
      const b = at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx;
      const base = a * (1 - ty) + b * ty;
      const v = (base + (rnd() - 0.5) * fine) * contrast + (1 - contrast) * 0.5;
      const p = (y * S + x) * 4;
      const g = Math.max(0, Math.min(255, Math.round(v * 255)));
      img.data[p] = img.data[p + 1] = img.data[p + 2] = g;
      img.data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** A woven crossing: warp threads under weft threads, both raised. Painted as
 *  height, so the normal and the roughness come from the same field and the
 *  weave cannot shade one way and glint the other. */
function weaveCanvas(seed: number, threads: number): HTMLCanvasElement {
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  const rnd = mulberry32(seed);
  const img = ctx.createImageData(S, S);
  const per = S / threads;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x % per) / per;
      const v = (y % per) / per;
      // Each thread is a half-cylinder across its own width; the two sets
      // alternate over and under in a checker, which is what plain weave is.
      const warp = Math.sin(Math.PI * u);
      const weft = Math.sin(Math.PI * v);
      const over = (Math.floor(x / per) + Math.floor(y / per)) % 2 === 0;
      const h = over ? 0.35 + warp * 0.55 : 0.3 + weft * 0.5;
      // Thread-to-thread irregularity: a perfectly even weave reads as a
      // printed pattern of a weave, which is the thing to avoid.
      const g = Math.max(0, Math.min(255, Math.round((h + (rnd() - 0.5) * 0.12) * 255)));
      const p = (y * S + x) * 4;
      img.data[p] = img.data[p + 1] = img.data[p + 2] = g;
      img.data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function roughnessFrom(src: HTMLCanvasElement, lo: number, hi: number): HTMLCanvasElement {
  const S = src.width;
  const data = src.getContext("2d")!.getImageData(0, 0, S, S).data;
  const [out, octx] = makeCanvas(S);
  const img = octx.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const t = data[i * 4] / 255;
    const g = Math.round((lo + (hi - lo) * t) * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g;
    img.data[i * 4 + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  return out;
}

/** A canvas-built texture on channel 0, tiled in METRES so one cached copy is
 *  life-size on a postcard and on a 1.2m canvas alike. */
function tex(key: string, make: () => HTMLCanvasElement, coverM: number): THREE.Texture {
  let t = texCache.get(key);
  if (!t) {
    t = new THREE.CanvasTexture(make());
    applyTiling(t, coverM);
    t.channel = 0;
    texCache.set(key, t);
  }
  return t;
}

/** Plane carrying BOTH sets: metres on channel 0 for the grain, 0..1 on
 *  channel 1 for the picture. A texture pointed at a channel the geometry does
 *  not have reads (0,0) at every vertex and renders as one flat texel — which
 *  is exactly how the TV's glare overlay disappeared. */
export function pictureGeometry(w: number, h: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.getAttribute("uv");
  const metric = new Float32Array(uv.count * 2);
  for (let i = 0; i < uv.count; i++) {
    metric[i * 2] = uv.getX(i) * w;
    metric[i * 2 + 1] = uv.getY(i) * h;
  }
  g.setAttribute("uv1", uv.clone());
  g.setAttribute("uv", new THREE.BufferAttribute(metric, 2));
  return g;
}

/** A print on paper: the scan, plus paper's own matte tooth. */
export function printMaterial(art: Artwork): THREE.MeshStandardMaterial {
  const key = `print:${art.id}`;
  let m = matCache.get(key);
  if (m) return m;
  m = new THREE.MeshStandardMaterial();
  // White, so the map supplies every colour: any tint here would push the
  // whole painting off its own palette.
  m.color.set("#ffffff");
  m.roughness = 0.62;
  m.metalness = 0;
  if (hasDOM()) {
    const pic = artTexture(art);
    if (pic) m.map = pic;
    // 256 texels over 4cm ≈ 0.15mm per texel: the tooth of a matte art paper.
    const height = () => noiseCanvas(19, 48, 0.6, 0.7);
    m.roughnessMap = tex("wa-paper-rough", () => roughnessFrom(height(), 0.5, 0.72), 0.04);
    m.normalMap = tex("wa-paper-normal", () => heightToNormal(height(), 0.25), 0.04);
    m.normalScale = new THREE.Vector2(0.14, 0.14);
  }
  matCache.set(key, m);
  return m;
}

/** A gallery-wrapped canvas: the same scan on a woven surface, cropped to fill
 *  the face rather than fitted inside a mount. */
export function canvasMaterial(art: Artwork, faceAspect: number): THREE.MeshStandardMaterial {
  const key = `canvas:${art.id}@${faceAspect.toFixed(3)}`;
  let m = matCache.get(key);
  if (m) return m;
  m = new THREE.MeshStandardMaterial();
  m.color.set("#ffffff");
  m.roughness = 0.78;
  m.metalness = 0;
  if (hasDOM()) {
    const pic = croppedArtTexture(art, faceAspect);
    if (pic) m.map = pic;
    // ~0.6mm threads: 24 crossings over 1.5cm.
    const height = () => weaveCanvas(7, 24);
    m.roughnessMap = tex("wa-weave-rough", () => roughnessFrom(height(), 0.6, 0.9), 0.015);
    m.normalMap = tex("wa-weave-normal", () => heightToNormal(height(), 0.7), 0.015);
    m.normalScale = new THREE.Vector2(0.5, 0.5);
  }
  matCache.set(key, m);
  return m;
}

/** Mount board. Warm off-white, felt-matte, with the faintest fibre — a flat
 *  white fill next to a photographic scan reads as a hole in the frame. */
export function mountMaterial(): THREE.MeshStandardMaterial {
  let m = matCache.get("wa-mount");
  if (m) return m;
  m = new THREE.MeshStandardMaterial();
  m.color.set("#f0ece2");
  m.roughness = 0.92;
  m.metalness = 0;
  if (hasDOM()) {
    const height = () => noiseCanvas(23, 40, 0.5, 0.5);
    m.roughnessMap = tex("wa-mount-rough", () => roughnessFrom(height(), 0.84, 0.96), 0.05);
    m.normalMap = tex("wa-mount-normal", () => heightToNormal(height(), 0.2), 0.05);
    m.normalScale = new THREE.Vector2(0.1, 0.1);
  }
  matCache.set("wa-mount", m);
  return m;
}

/** The cut edge of the mount, which on real board is white core exposed at
 *  45° — brighter than the face it surrounds, and the reason a bevel reads as
 *  depth rather than as a printed outline. */
export function bevelMaterial(): THREE.MeshStandardMaterial {
  let m = matCache.get("wa-bevel");
  if (m) return m;
  m = new THREE.MeshStandardMaterial();
  m.color.set("#fbf8f1");
  m.roughness = 0.85;
  matCache.set("wa-bevel", m);
  return m;
}

/** Backing board: the dark card sealed into the back of a frame. Never seen
 *  from the front, always seen from a low camera looking up at a wall. */
export function backingMaterial(): THREE.MeshStandardMaterial {
  let m = matCache.get("wa-backing");
  if (m) return m;
  m = new THREE.MeshStandardMaterial();
  m.color.set("#8d8578");
  m.roughness = 0.95;
  matCache.set("wa-backing", m);
  return m;
}

function glareCanvas(): HTMLCanvasElement {
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.rotate(-0.5);
  const grad = ctx.createLinearGradient(-S * 0.5, 0, S * 0.5, 0);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(0.42, "rgba(255,255,255,0.5)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.62)");
  grad.addColorStop(0.72, "rgba(255,255,255,0)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(-S, -S, S * 2, S * 2);
  ctx.restore();
  return c;
}

/** The glazing: one faint additive band standing in for the window opposite.
 *
 *  Weaker than the television's, deliberately — a lit screen can carry a hard
 *  highlight, but the same band over a painting looks like a smear across it.
 *  Additive, so it can only ever LIFT what is behind it, never grey it down.
 *  `keepMaterial` because ParametricModel clones materials to tint them and a
 *  cloned additive plane loses its blending. */
export function glazing(w: number, h: number): THREE.Mesh {
  const m = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.075,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    color: "#ffffff",
  });
  if (hasDOM()) {
    let t = texCache.get("wa-glare");
    if (!t) {
      t = new THREE.CanvasTexture(glareCanvas());
      t.channel = 1; // 0..1 across the glass; channel 0 is in metres
      texCache.set("wa-glare", t);
    }
    m.map = t;
  }
  const mesh = new THREE.Mesh(pictureGeometry(w, h), m);
  mesh.userData.keepMaterial = true;
  return mesh;
}

// ── Mouldings ──────────────────────────────────────────────────────────────

/** A picture frame as ONE mitred moulding, not four butted sticks.
 *
 *  An extruded rectangle-with-a-hole gives real mitres at all four corners for
 *  free and a bevel that catches a highlight along every edge. Four boxes
 *  cross at the corners instead, and at eye level that crossing is visible as
 *  a step in the middle of what should be a continuous run of grain.
 *
 *  Extrude's own UV generator works in world units, which is what the wood
 *  finishes expect (their textures tile in metres) — the grain lands at life
 *  size without a per-frame UV pass. */
export function frameMoulding(w: number, h: number, width: number, depth: number, mat: THREE.Material): THREE.Mesh {
  return panelWithHole(w, h, w - 2 * width, h - 2 * width, depth, Math.min(0.004, width * 0.25), mat);
}

/** The same extruded ring with the opening stated outright, for a mount board
 *  whose window matches the PICTURE's aspect rather than sitting a uniform
 *  distance inside the frame. */
export function panelWithHole(
  ow: number,
  oh: number,
  innerW: number,
  innerH: number,
  depth: number,
  bevelIn: number,
  mat: THREE.Material,
): THREE.Mesh {
  const w = ow;
  const h = oh;
  const outer = new THREE.Shape();
  outer.moveTo(-w / 2, -h / 2);
  outer.lineTo(w / 2, -h / 2);
  outer.lineTo(w / 2, h / 2);
  outer.lineTo(-w / 2, h / 2);
  outer.closePath();
  const iw = Math.max(0.02, Math.min(innerW, w - 0.004));
  const ih = Math.max(0.02, Math.min(innerH, h - 0.004));
  const hole = new THREE.Path();
  hole.moveTo(-iw / 2, -ih / 2);
  hole.lineTo(iw / 2, -ih / 2);
  hole.lineTo(iw / 2, ih / 2);
  hole.lineTo(-iw / 2, ih / 2);
  hole.closePath();
  outer.holes.push(hole);
  const bevel = Math.max(0.0005, Math.min(bevelIn, depth * 0.25));
  const geo = new THREE.ExtrudeGeometry(outer, {
    depth: Math.max(0.004, depth - 2 * bevel),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 1,
  });
  // Extruded along +Z from z=0; the caller places the front face.
  geo.translate(0, 0, bevel);
  return new THREE.Mesh(geo, mat);
}
