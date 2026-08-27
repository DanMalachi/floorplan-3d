"use client";

import * as THREE from "three";
import { invalidate } from "@react-three/fiber";
import { makeCanvas, mulberry32, heightToNormal, applyTiling } from "@/decorate/proceduralTexture";

// Materials and small parts for the TV generator.
//
// A television is 90% one surface: the panel. Everything that makes it read as
// a real object rather than a black rectangle is in how that surface handles
// light, so the material work lives here and `tv.ts` only assembles boxes.
//
// Three surfaces, each with grain at the scale of the physical unit it is
// actually made of:
//
//  1. **Anti-glare coating** (the screen). A switched-off panel is NOT black —
//     it is a dark grey mirror covered in a matte diffusion layer, and that
//     layer's grain is ~0.2mm. Both the roughness and the normal come from the
//     same noise field, so the sparkle and the shading agree about where each
//     grain sits. Without it the screen is a flat fill and reads as painted
//     card the moment the camera moves.
//  2. **Brushed anodised aluminium** (bezel and stand). Streaks running along
//     the brush direction, ~0.1mm apart, in roughness AND normal.
//  3. **Moulded pebble plastic** (rear housing). Coarse dimples at ~1mm, the
//     grain every TV back is textured with so fingerprints do not show.
//
// Everything is canvas-built, so every builder is guarded: under `tsx` there is
// no `document`, and a generator that cannot build headless cannot be tested.
// The guarded path drops the maps and keeps the base tone — same material,
// no grain.

const hasDOM = () => typeof document !== "undefined";

const texCache = new Map<string, THREE.Texture>();
const matCache = new Map<string, THREE.MeshStandardMaterial>();

/** A canvas of value noise: a smooth lattice at `lattice` cells across, plus
 *  per-texel jitter. Returns a greyscale height field. */
function noiseCanvas(seed: number, lattice: number, fine: number, contrast = 1): HTMLCanvasElement {
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  const rnd = mulberry32(seed);
  const lat = new Float32Array(lattice * lattice);
  for (let i = 0; i < lat.length; i++) lat[i] = rnd();
  const at = (i: number, j: number) => lat[(((i % lattice) + lattice) % lattice) * lattice + (((j % lattice) + lattice) % lattice)];
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

/** Directional streaks: one brushed pass along X. The lattice is stretched 20:1
 *  so a "grain" is a long scratch rather than a blob — which is the whole
 *  difference between brushed metal and sandpaper. */
function brushedCanvas(seed: number): HTMLCanvasElement {
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  const rnd = mulberry32(seed);
  const img = ctx.createImageData(S, S);
  // One value per ROW, smoothed along Y only: every row is a scratch of its
  // own depth running the full width.
  const rows = new Float32Array(S);
  for (let y = 0; y < S; y++) rows[y] = rnd();
  for (let y = 0; y < S; y++) {
    const r = (rows[(y - 1 + S) % S] + rows[y] * 2 + rows[(y + 1) % S]) / 4;
    for (let x = 0; x < S; x++) {
      // A little jitter along the scratch so it is not a perfect line.
      const v = 0.42 + r * 0.3 + (rnd() - 0.5) * 0.06;
      const p = (y * S + x) * 4;
      const g = Math.max(0, Math.min(255, Math.round(v * 255)));
      img.data[p] = img.data[p + 1] = img.data[p + 2] = g;
      img.data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Maps a height canvas into a roughness canvas spanning [lo, hi]. High spots
 *  catch light, low spots stay matte — the same field, so they cannot disagree. */
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

function tex(key: string, make: () => HTMLCanvasElement, coverM: number): THREE.Texture {
  let t = texCache.get(key);
  if (!t) {
    t = new THREE.CanvasTexture(make());
    applyTiling(t, coverM);
    // Channel 0 carries UVs in METRES (see `screenGeometry`), so one shared
    // texture lands at life size on a 43" and a 75" alike, with no per-item
    // clone of a cached texture other items are using.
    t.channel = 0;
    texCache.set(key, t);
  }
  return t;
}

/** A soft diagonal sheen — the reflection of a window across the glass.
 *
 * This is the difference between a television and a hole cut in the wall. A
 * switched-off panel is a near-mirror, and what it mirrors is the ROOM; but
 * indoors there is no environment map worth reflecting, so a physically
 * honest dark dielectric renders pure black under interior light, which is
 * exactly what the first pass looked like from two metres away. Archviz fakes
 * this the same way: one broad, very faint highlight band laid over the glass,
 * additive so it only ever lifts the black. */
function glareCanvas(): HTMLCanvasElement {
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.translate(S * 0.5, S * 0.5);
  ctx.rotate(-0.42); // a window is rarely square-on to the screen
  const band = (w: number, h: number, alpha: number) => {
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
    grad.addColorStop(0.55, `rgba(255,255,255,${alpha * 0.45})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.save();
    ctx.scale(w, h);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  // One wide soft wash across the whole panel, one tighter streak inside it.
  band(S * 0.62, S * 0.3, 0.34);
  ctx.translate(-S * 0.12, -S * 0.06);
  band(S * 0.3, S * 0.075, 0.5);
  ctx.restore();
  return c;
}

/** The glare overlay mesh, sized to the picture area. Additive and
 *  depth-write-free so it never occludes anything and never darkens. */
export function glarePlane(w: number, h: number): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.5,
    color: "#9fb4cc",
  });
  if (hasDOM()) {
    let t = texCache.get("tv-glare");
    if (!t) {
      t = new THREE.CanvasTexture(glareCanvas());
      // Channel 0 — this mesh is a plain PlaneGeometry whose own uv already
      // runs 0..1 across the panel exactly once. Pointing it at channel 1 (as
      // the first pass did, by analogy with the rugs) samples an attribute
      // that isn't there: every vertex reads uv (0,0), which is one fully
      // transparent texel of the glare canvas, so the sheen rendered as
      // nothing at all and the screen stayed a flat black rectangle.
      t.channel = 0;
      texCache.set("tv-glare", t);
    }
    mat.map = t;
  } else {
    // Headless has no canvas, so the overlay would be a flat white square.
    mat.opacity = 0;
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  // Its own material carries the reflection cheat; cloning it per instance
  // costs nothing, but there is no reason to let the tint pass touch it.
  mesh.userData.keepMaterial = true;
  return mesh;
}

// ── What is ON the screen ──────────────────────────────────────────────────
//
// A REAL PHOTOGRAPH, not a drawing of one. The first pass painted three
// procedural "channels" (a news studio, a match, a landscape) on canvas, and
// they read exactly like what they were: vector shapes on a rectangle. A
// screen is the one surface in a room that shows a photographic image, and
// nothing hand-drawn at this scale survives the comparison.
//
// The picture is `public/textures/tv/broadcast-earth.jpg` — NASA ISS
// photography of the Bahamas (public domain, see docs/DATA_RIGHTS.md),
// 1280×720, 169KB. Chosen for what it has to do from four metres away in a
// small rectangle: real photographic depth, strong colour separation, and no
// text or faces to go soft.
export const BROADCAST_URL = "/textures/tv/broadcast-earth.jpg";

/** The panel itself. `on` is a dim emissive wash, not a lamp: the screen shows
 *  its own light without pretending to illuminate the room (which no
 *  MeshStandardMaterial emissive does anyway — it lights nothing but itself,
 *  and a bright one just blows out to white). */
export function screenMaterial(on: boolean): THREE.MeshStandardMaterial {
  const key = on ? "tv-screen-on" : "tv-screen-off";
  let m = matCache.get(key);
  if (m) return m;
  m = new THREE.MeshStandardMaterial();
  // Not #000: a real off-screen sits around 4% reflectance and picks up the
  // room. Pure black reads as a hole cut in the wall — which is precisely
  // what the first pass rendered as at eye level, so this is lifted well past
  // "physically correct" and paired with the glare overlay above.
  // Lit, the base colour multiplies the photograph: dark enough that room
  // light can't wash the picture into a poster, light enough that the panel
  // still picks up some of the room instead of being pure emission.
  m.color.set(on ? "#2a2f36" : "#191d24");
  m.metalness = 0.35;
  m.roughness = 0.09;
  m.envMapIntensity = 2;
  if (on) {
    // The picture supplies the colour; the material only decides how brightly
    // it emits. White emissive × emissiveMap keeps the broadcast's own hues.
    m.emissive.set("#ffffff");
    m.emissiveIntensity = 0.9;
  }
  if (hasDOM()) {
    // 256 texels over 6.4cm ≈ 0.25mm per texel — the coating's own grain.
    const height = () => noiseCanvas(41, 40, 0.55, 0.9);
    m.roughnessMap = tex("tv-coat-rough", () => roughnessFrom(height(), 0.1, 0.24), 0.064);
    m.normalMap = tex("tv-coat-normal", () => heightToNormal(height(), 0.35), 0.064);
    m.normalScale = new THREE.Vector2(0.25, 0.25);
    if (on) {
      let pic = texCache.get("tv-broadcast");
      if (!pic) {
        // Loaded, not drawn. The decode is async, and three swaps the image in
        // when it arrives — the material is already on screen by then, so the
        // set is dark for a frame or two and then lit. No Suspense needed, and
        // nothing else in the generator has to become async.
        // The `invalidate` callback matters under demand rendering: the swap
        // three does on arrival changes no React prop, so without it the set
        // stays dark until something unrelated repaints.
        pic = new THREE.TextureLoader().load(BROADCAST_URL, () => invalidate());
        // Channel 1: the screen geometry's 0..1 set, which spans the picture
        // area exactly once. Channel 0 is in METRES for the coating grain, so
        // a photograph sent there would tile ~20 times across a 55".
        pic.channel = 1;
        pic.colorSpace = THREE.SRGBColorSpace;
        // The picture must not repeat into the bezel at the panel's edges.
        pic.wrapS = THREE.ClampToEdgeWrapping;
        pic.wrapT = THREE.ClampToEdgeWrapping;
        pic.anisotropy = 8;
        texCache.set("tv-broadcast", pic);
      }
      m.map = pic;
      m.emissiveMap = pic;
    }
  }
  matCache.set(key, m);
  return m;
}

/** Brushed anodised aluminium for bezel and stand hardware. Darker and less
 *  mirror-like than the kitchen `steel` finish — a TV bezel is anodised, not
 *  polished. */
export function anodisedMaterial(): THREE.MeshStandardMaterial {
  let m = matCache.get("tv-anodised");
  if (m) return m;
  m = new THREE.MeshStandardMaterial();
  // Light enough to draw a FRAME LINE against the screen. At #26282c the
  // bezel and the panel were the same value and the whole set read as one
  // black rectangle with no edge at all.
  // Light enough to draw a FRAME LINE against the screen. At #26282c the
  // bezel and the panel were the same value and the whole set read as one
  // black rectangle with no edge at all.
  m.color.set("#494d54");
  m.metalness = 0.9;
  m.roughness = 0.3;
  if (hasDOM()) {
    m.roughnessMap = tex("tv-brush-rough", () => roughnessFrom(brushedCanvas(17), 0.28, 0.5), 0.03);
    m.normalMap = tex("tv-brush-normal", () => heightToNormal(brushedCanvas(17), 0.5), 0.03);
    m.normalScale = new THREE.Vector2(0.3, 0.3);
  }
  matCache.set("tv-anodised", m);
  return m;
}

/** Moulded pebble-grain plastic: the rear housing. Coarser than the coating —
 *  ~1mm dimples — and much matter, because that is what the back of every TV
 *  in the world feels like. */
export function housingMaterial(): THREE.MeshStandardMaterial {
  let m = matCache.get("tv-housing");
  if (m) return m;
  m = new THREE.MeshStandardMaterial();
  m.color.set("#1c1e21");
  m.metalness = 0;
  m.roughness = 0.72;
  if (hasDOM()) {
    const height = () => noiseCanvas(59, 24, 0.35, 1);
    m.roughnessMap = tex("tv-pebble-rough", () => roughnessFrom(height(), 0.6, 0.86), 0.05);
    m.normalMap = tex("tv-pebble-normal", () => heightToNormal(height(), 1.1), 0.05);
    m.normalScale = new THREE.Vector2(0.6, 0.6);
  }
  matCache.set("tv-housing", m);
  return m;
}

/** The screen plane, facing +Z, with BOTH UV sets the materials need:
 *  channel 0 in metres for the coating grain (so a 75" is not a magnified 43")
 *  and channel 1 normalised 0..1 for the emissive vignette, which must span
 *  the panel exactly once whatever size it is. Same split the rugs use. */
export function screenGeometry(w: number, h: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.getAttribute("uv");
  const metric = new Float32Array(uv.count * 2);
  for (let i = 0; i < uv.count; i++) {
    metric[i * 2] = uv.getX(i) * w;
    metric[i * 2 + 1] = uv.getY(i) * h;
  }
  g.setAttribute("uv1", uv.clone()); // 0..1, for the vignette
  g.setAttribute("uv", new THREE.BufferAttribute(metric, 2)); // metres, for the grain
  return g;
}

/** Standby LED: 4mm, always slightly lit when the set is off, dark when it is
 *  on — which is how every TV in the world signals its state, and the one
 *  detail that says "appliance" rather than "black panel". */
export function standbyLed(on: boolean): THREE.Mesh {
  const m = new THREE.MeshStandardMaterial();
  m.color.set(on ? "#141618" : "#3a1418");
  m.emissive.set(on ? "#000000" : "#c8323c");
  m.emissiveIntensity = on ? 0 : 1.4;
  m.roughness = 0.3;
  return new THREE.Mesh(new THREE.SphereGeometry(0.0022, 10, 8), m);
}
