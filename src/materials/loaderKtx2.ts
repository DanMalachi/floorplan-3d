"use client";

/**
 * KTX2 texture loading for the M3d/D4 floor catalog — the async counterpart
 * to `loader.ts`'s WebP path.
 *
 * ── Why this can't reuse loader.ts's synchronous-placeholder trick ─────────
 * `THREE.TextureLoader.load()` returns a real `Texture` object immediately
 * and mutates its `.image` in place once bytes arrive — the same object
 * reference stays valid, so a material built from it needs no update.
 * `KTX2Loader.load()` has no equivalent: it is callback/promise-only, and
 * the `CompressedTexture` it eventually produces is constructed with its
 * mipmap data as a REQUIRED constructor argument (`new CompressedTexture(
 * mipmaps, width, height, format, type)`) — there is no empty shell to hand
 * out early and fill in later. So this module is promise-based, and its
 * caller (`textures.ts`'s `useFloorTexture` hook) owns the "nothing to show
 * yet" state via React, rather than pretending a texture exists before it
 * does.
 *
 * Self-hosted transcoder (`public/basis/`, copied from `three`'s own
 * `examples/jsm/libs/basis/`) — no third-party CDN, matching every other
 * "no unverified external dependency" call this project has made.
 *
 * Colour space is NOT hand-tagged here — material-spec.md §5.1 forbids it by
 * name. `KTX2Loader` reads each container's own embedded transfer-function
 * metadata (written by the encoder's `--assign-tf srgb`/`--assign-tf linear`,
 * material-spec.md §5.1) and assigns `colorSpace` itself.
 */
import * as THREE from "three";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import type { Ktx2Material } from "./registryKtx2";

const TRANSCODER_PATH = "/basis/";

let loader: KTX2Loader | null = null;
let detectedFor: THREE.WebGLRenderer | null = null;

/** One loader instance, `detectSupport` called at most once per renderer —
 *  it reads GPU capabilities and is not expected to change mid-session. */
function getLoader(gl: THREE.WebGLRenderer): KTX2Loader {
  loader ??= new KTX2Loader().setTranscoderPath(TRANSCODER_PATH);
  if (detectedFor !== gl) {
    loader.detectSupport(gl);
    detectedFor = gl;
  }
  return loader;
}

function applyTiling(tex: THREE.Texture, coverM: number): void {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.repeat.set(1 / coverM, 1 / coverM);
}

export interface Ktx2FloorTex {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  /** Same texture object as `roughnessMap` — material-spec.md §6's ORM
   *  packing (R=AO, G=roughness, B=metalness) means one sampler serves both
   *  material slots. Metalness is never wired: every floor in this catalog
   *  is dielectric (`metalness: 0`), so the packed B channel is always flat
   *  0 and a `metalnessMap` slot would contribute nothing — see
   *  material-spec.md §2.1a for the same reasoning applied to metalness. */
  aoMap: THREE.Texture;
}

/**
 * Loads and tiles the three KTX2 maps for one catalog material. Rejects if
 * any map fails — the caller's cache is keyed by style, so a failure isn't
 * retried until the component remounts, matching normal fetch-failure
 * behaviour elsewhere in the app.
 *
 * Sequential, not `Promise.all` — found and reproduced at M3d/D4, not a
 * superstition: firing three `loadAsync` calls concurrently against one
 * `KTX2Loader` intermittently cross-assigned results between them (a normal
 * map's decoded data landing in the albedo texture object, consistently
 * enough to catch visually — a wood floor rendered as a solid blue/magenta
 * mottle, the classic look of tangent-space normal data shown as colour).
 * `KTX2Loader` dispatches transcoding to a worker pool internally; this
 * reads as a response-routing race there, not anything wrong with the KTX2
 * files themselves — decoding the same shipped file directly with `ktx
 * extract` shows the correct image every time. Sequential loading costs
 * some wall-clock time (three round trips instead of one parallel batch)
 * for a per-room, cached-after-first-load material set, which is the right
 * side to be slow on.
 */
export async function loadKtx2FloorTextures(material: Ktx2Material, gl: THREE.WebGLRenderer): Promise<Ktx2FloorTex> {
  const ktx2 = getLoader(gl);
  const map = await ktx2.loadAsync(material.maps.albedo);
  const normalMap = await ktx2.loadAsync(material.maps.normal);
  const orm = await ktx2.loadAsync(material.maps.orm);

  for (const tex of [map, normalMap, orm]) applyTiling(tex, material.coverM);
  // Upload to the GPU now rather than waiting for first render — the same
  // workaround drei's useKTX2 applies, for the same reason (three.js #22696).
  for (const tex of [map, normalMap, orm]) gl.initTexture(tex);

  return { map, normalMap, roughnessMap: orm, aoMap: orm };
}
