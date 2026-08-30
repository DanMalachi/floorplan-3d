"use client";

/**
 * KTX2/BasisU support for FURNITURE GLBs, wired into whatever GLTFLoader
 * `useGLTF` hands back (`src/viewport3d/FurnitureLayer.tsx`'s `GlbModel`,
 * and `src/render/perf/PerfFurnishRig.tsx`'s `FurnishItem`, its unprotected
 * mirror). This is a DIFFERENT mechanism from `src/materials/loaderKtx2.ts`
 * (the floor-material path): a KTX2 furniture texture lives INSIDE the GLB
 * via the `KHR_texture_basisu` extension, so the hookup point is
 * `GLTFLoader.setKTX2Loader()`, reached through drei's
 * `useGLTF(url, draco, meshopt, extendLoader)` — not a direct
 * `KTX2Loader.loadAsync()` call on a standalone `.ktx2` file.
 *
 * Same self-hosted transcoder as the floor pipeline (`public/basis/`, copied
 * from three's own `examples/jsm/libs/basis`) — one transcoder, one shared
 * instance, matching `src/materials/loaderKtx2.ts`'s own reasoning for why
 * it's self-hosted rather than a CDN.
 *
 * Imports `KTX2Loader` from `three/examples/jsm/loaders/KTX2Loader.js`
 * (three's own, actively-maintained implementation — the same one
 * `src/materials/loaderKtx2.ts` already uses in production), NOT
 * `three-stdlib`'s bundled copy (544 lines vs three's 1276 — an older port
 * that predates Zstd supercompression support, which
 * `scripts/blenderkit/optimize-ktx2.ts` relies on via `--zstd 19`). Safe to
 * mix: `three-stdlib`'s `GLTFLoader.setKTX2Loader()` only ever calls
 * `.load(url, onLoad, onProgress, onError)` on whatever it's handed — the
 * standard three.js `Loader` interface — so the two packages never need to
 * agree on anything beyond that.
 *
 * Colour space is NOT hand-tagged here — same rule material-spec.md §5.1
 * states for the floor pipeline, and the same reason: `KTX2Loader` reads
 * each texture's own embedded transfer-function metadata (written by
 * `optimize-ktx2.ts`'s `--assign-tf srgb`/`--assign-tf linear`) and assigns
 * `colorSpace` itself. Hand-tagging it here would be redundant at best and
 * silently wrong at worst if the two ever disagreed.
 */
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { useMemo } from "react";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import type { GLTFLoader, GLTF } from "three-stdlib";

const TRANSCODER_PATH = "/basis/";

let ktx2Loader: KTX2Loader | null = null;
let detectedFor: THREE.WebGLRenderer | null = null;

/** One shared KTX2Loader instance, `detectSupport` re-run only when the
 *  renderer identity changes — mirrors `src/materials/loaderKtx2.ts`'s
 *  `getLoader`. GPU capabilities (BC7 on desktop / ASTC on Apple / ETC1S-
 *  only mobile, or none of the above) are queried once by `detectSupport`,
 *  not chosen by hand here — that's the whole point of using KTX2Loader
 *  over shipping a single fixed GPU format. */
function getKtx2Loader(gl: THREE.WebGLRenderer): KTX2Loader {
  ktx2Loader ??= new KTX2Loader().setTranscoderPath(TRANSCODER_PATH);
  if (detectedFor !== gl) {
    ktx2Loader.detectSupport(gl);
    detectedFor = gl;
  }
  return ktx2Loader;
}

/**
 * `useGLTF`'s 4th argument (`extendLoader`). Registers the shared KTX2Loader
 * on whichever GLTFLoader drei hands back.
 *
 * Safe to wire in unconditionally, for every furniture GLB, IKEA included:
 * a GLB that doesn't declare `KHR_texture_basisu` (every IKEA model today,
 * and any BlenderKit model not yet run through `optimize-ktx2.ts`) never
 * reaches the code that reads `parser.options.ktx2Loader` at all, so
 * registering it is a harmless no-op for those assets. That's what keeps
 * this hookup a one-call addition in FurnitureLayer.tsx rather than a
 * per-catalog branch.
 */
export function useKtx2ExtendLoader(): (loader: GLTFLoader) => void {
  const gl = useThree((s) => s.gl);
  return useMemo(
    () => (loader: GLTFLoader) => {
      loader.setKTX2Loader(getKtx2Loader(gl) as unknown as Parameters<GLTFLoader["setKTX2Loader"]>[0]);
    },
    [gl],
  );
}

/**
 * Fail LOUDLY on a silent KTX2 transcode loss, instead of rendering a
 * furniture model with a blank/white material.
 *
 * ── Why this exists — the failure mode it's guarding against is real,
 *    reproduced, and does not throw on its own ─────────────────────────────
 * `GLTFLoader.loadTextureImage` (three-stdlib's copy, used by `useGLTF`, and
 * three's own — both identical here) wraps every texture load in
 * `.catch(() => null)`. A KTX2 texture that fails to transcode — corrupt
 * bytes, a GPU/browser combination `detectSupport` didn't anticipate, the
 * transcoder wasm failing to load — resolves to `texture = null`, and
 * `assignTexture` then returns early (`if (!texture) return null`) WITHOUT
 * ever setting `materialParams[mapName]`. The result: a `MeshStandardMaterial`
 * that looks EXACTLY like one whose source glTF material never declared that
 * texture slot in the first place — flat white/grey, or lit with the wrong
 * normals — logged once to `console.error` inside `loadImageSource`, no
 * thrown error, no rejected promise anywhere `ModelBoundary` (product) or
 * `ItemBoundary` (perf harness) would catch. This is the exact
 * "silently-wrong-numbers" shape `docs/PERFORMANCE-HANDOFF.md` already
 * documents once for this workstream (65/75 BlenderKit GLBs failing to load
 * while the harness reported an empty house's numbers as a furnished one) —
 * just one layer deeper, at the texture instead of the model.
 *
 * The fix has to compare the LOADED result against what the source glTF
 * JSON declared, because a missing texture slot on the live material is
 * indistinguishable from "this material never had one" by inspecting the
 * material alone — `gltf.parser.json` is the only place that distinction
 * still exists once GLTFLoader has finished swallowing the failure.
 *
 * Only runs for GLBs that actually use `KHR_texture_basisu` — every IKEA
 * model, and any BlenderKit model not yet run through `optimize-ktx2.ts`,
 * exits on the first line and costs nothing.
 *
 * Throws (does not warn) on a genuine loss, so the caller's existing error
 * boundary — `ModelBoundary` in FurnitureLayer.tsx, `ItemBoundary` in
 * PerfFurnishRig.tsx, neither modified by this file — treats it exactly
 * like a 404: falls through to the next candidate / placeholder in product,
 * and counts as `failed` (not a phantom `placed`) in the perf harness.
 */
export function assertKtx2TexturesResolved(gltf: GLTF, sourceUrl: string): void {
  const parser = (gltf as unknown as { parser?: { json?: GltfJson; associations?: Map<unknown, { materials?: number }> } })
    .parser;
  const json = parser?.json;
  const associations = parser?.associations;
  if (!json || !associations) return; // defensive: nothing to cross-check without parser internals

  const usesBasisu = Array.isArray(json.extensionsUsed) && json.extensionsUsed.includes("KHR_texture_basisu");
  if (!usesBasisu) return; // not a KTX2 asset — this check owns nothing here

  const missing: string[] = [];
  gltf.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      const ref = associations.get(mat);
      const idx = ref?.materials;
      if (idx === undefined) continue;
      const matDef = json.materials?.[idx];
      if (!matDef) continue;

      for (const slot of TEXTURE_SLOTS) {
        if (!slot.jsonRef(matDef)) continue; // this material never declared this texture
        const live = (mat as unknown as Record<string, THREE.Texture | undefined>)[slot.matField];
        if (!live) missing.push(`${mat.name || `material#${idx}`}: ${slot.label}`);
      }
    }
  });

  if (missing.length > 0) {
    const detail = [...new Set(missing)].join(", ");
    throw new Error(
      `KTX2 furniture asset lost texture(s) during transcode: ${sourceUrl} — ${detail}. ` +
        `GLTFLoader swallows a per-texture transcode failure and would otherwise render this ` +
        `model untextured with no error (see assertKtx2TexturesResolved's docstring). Thrown ` +
        `here instead so it fails the same way a 404 does.`,
    );
  }
}

interface GltfJson {
  extensionsUsed?: string[];
  materials?: Array<{
    pbrMetallicRoughness?: { baseColorTexture?: unknown; metallicRoughnessTexture?: unknown };
    normalTexture?: unknown;
    occlusionTexture?: unknown;
    emissiveTexture?: unknown;
  }>;
}

const TEXTURE_SLOTS: Array<{
  jsonRef: (m: NonNullable<GltfJson["materials"]>[number]) => unknown;
  matField: string;
  label: string;
}> = [
  { jsonRef: (m) => m.pbrMetallicRoughness?.baseColorTexture, matField: "map", label: "baseColor" },
  { jsonRef: (m) => m.pbrMetallicRoughness?.metallicRoughnessTexture, matField: "roughnessMap", label: "metallicRoughness" },
  { jsonRef: (m) => m.normalTexture, matField: "normalMap", label: "normal" },
  { jsonRef: (m) => m.occlusionTexture, matField: "aoMap", label: "occlusion" },
  { jsonRef: (m) => m.emissiveTexture, matField: "emissiveMap", label: "emissive" },
];
