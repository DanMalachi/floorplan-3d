import * as THREE from "three";
import { ToneMappingMode } from "postprocessing";

/**
 * The render contract — every renderer-level value the image depends on, in one
 * place. See `docs/render-contract.md` for the decision, rationale and
 * prohibition behind each clause; this file is the machine-readable half.
 *
 * Values are recorded here even where the current library default already
 * matches (§1.1). A default is a decision made by a dependency's changelog: a
 * three.js or R3F bump that changes one produces a different image with no diff
 * to review and no test failure. Recording it turns that silent regression into
 * a loud one via `assertRenderContract` (§1.3).
 *
 * NOTHING here is a look knob. If a scene needs one of these changed to look
 * right, the scene, the lights or the material is wrong — see §2.4.
 */

/** Color management. Both values are three's current defaults; both are asserted. */
export const COLOR = {
  colorManagement: true,
  outputColorSpace: THREE.SRGBColorSpace,
} as const;

/**
 * Device-pixel-ratio policy (§1.1). Explicit and clamped — this is a real
 * performance decision, not documentation: on a 3x display an uncapped dpr more
 * than doubles the fragment cost of a scene already carrying AO and SMAA.
 */
export const DPR: [number, number] = [1, 2];

/**
 * Tone mapping (§2). The renderer's own tone mapper stays OFF — the composer
 * owns the display transform, so `renderer.toneMapping` must read
 * `NoToneMapping` and `renderer.toneMappingExposure` is inert (it is the uniform
 * of a shader chunk three omits entirely under NoToneMapping).
 *
 * Operator is Khronos PBR Neutral, not ACES (§2.4). ACES desaturates and
 * hue-shifts saturated colors as they brighten — a feature in film, a defect
 * here, because the user picks a paint color and has to be able to trust it.
 * Neutral was built for exactly this constraint.
 */
export const TONE_MAPPING = {
  renderer: THREE.NoToneMapping,
  exposure: 1, // renderer-side exposure: inert, asserted to stay neutral
  operator: ToneMappingMode.NEUTRAL,
} as const;

/**
 * Composer frame buffer (§2.1). HalfFloat is what makes physical light units
 * mean anything: an 8-bit target clamps radiance to 1.0 *before* tone mapping,
 * so highlights clip flat and the operator receives pre-destroyed data.
 * This is already the library default — passed explicitly anyway.
 */
export const FRAME_BUFFER_TYPE = THREE.HalfFloatType;

/**
 * Shadows (§3). `PCFShadowMap` — which since three r182 IS the soft filter.
 *
 * Do not "restore" PCFSoftShadowMap. r182 absorbed the two constants into one:
 * "PCFSoftShadowMap with WebGLRenderer is now deprecated. Use PCFShadowMap
 * which is now soft as well." SHADOWMAP_TYPE_PCF now compiles a 5-tap Vogel
 * disk, rotated per pixel by interleaved-gradient noise, sampled through
 * `sampler2DShadow`. The old hard 1-tap `step()` is the BASIC path.
 *
 * Naming the deprecated alias is actively dangerous, not merely stale:
 * `generateShadowMapTypeDefine` falls back to SHADOWMAP_TYPE_BASIC for any
 * value it does not recognise, and PCFSoftShadowMap is no longer in that map.
 * It only reaches the soft path because `WebGLShadowMap.render` coerces it
 * first — a coercion that was itself broken in r182 (#32591, fixed by #32593 in
 * r183) and produced exactly the hard shadows the alias was meant to avoid.
 *

 * Single 2048 frustum, no cascades. Texel density is `2 * (span * 0.9 + 4) /
 * 2048`: 1.7 cm/texel at a 15 m span (fine), 3.9 cm at 40 m (a chair leg falls
 * under one texel and its contact shadow disappears). Past ~25 m span the fix
 * is cascades, NOT a bigger map — 4096 doubles memory for one stop of density
 * and does not change the shape of the problem.
 *
 * Bias convention (§3.3): normalBias is the primary acne control; constant bias
 * stays small and negative, magnitude <= 0.0005. Constant bias offsets every
 * fragment equally regardless of geometry, so the value that clears acne at
 * grazing light is large enough to detach contact shadows elsewhere.
 */
export const SHADOW = {
  type: THREE.PCFShadowMap,
  mapSize: 2048,
  bias: -0.0002,
  normalBias: 0.02,
  /** Half-extent of the directional light's orthographic shadow frustum. */
  frustumHalfExtent: (span: number) => span * 0.9 + 4,
  /** Span past which single-frustum texel density degrades; reach for cascades. */
  cascadeThresholdM: 25,
} as const;

/**
 * §3.4 — a shadow caster must be a closed solid with non-zero thickness.
 *
 * A zero-thickness plane occupies a single depth value, so its front and back
 * faces are coincident in the shadow map and it shadows itself. This is not
 * theoretical: giving the ceiling `castShadow` while it was still a flat
 * triangulated plane produced immediate, obvious acne across the whole roof at
 * every sun elevation above the horizon.
 *
 * The fix is thickness, never bias. Bias large enough to clear a coincident
 * surface is large enough to detach contact shadows everywhere else, and the
 * contract does not allow per-scene knobs.
 */
export const MIN_CASTER_THICKNESS = 0.12;

/**
 * Interior room lights (M2). One ceiling-mounted point light per detected
 * room (`src/render/roomLighting.ts`), sized by floor area against
 * `targetLux` rather than tuned per room — see that file for the derivation.
 */
export const ROOM_LIGHT = {
  /** Average horizontal illuminance a lit living space sits at. Mid-range of
   *  the same 150-300 lx residential-ambient band the M1 interim interior
   *  fill was already stated in terms of (`lightPresets.ts`), so this is not
   *  a new number invented for M2 — it is the number that fill was always
   *  standing in for. */
  targetLux: 300,
  /** Rooms smaller than this (m²) get no fixture at all — closets, shafts,
   *  and sliver loops from a bad trace, where a single ceiling fixture reads
   *  as absurd and the loop itself is closer to noise than a room. */
  minAreaM2: 1.5,
  /**
   * Point-light shadow budget. A point light's shadow is a 6-face cube map —
   * 6x the depth-pass cost of the single directional sun light. `maxCasters`
   * concurrent room lights cast, ranked by distance to camera and re-ranked
   * periodically rather than every frame (`src/render/RoomLights.tsx`):
   * toggling `castShadow` forces three to recompile the affected materials'
   * shadow variant, and doing that every frame for a light sitting near a
   * rank boundary is worse than the rank being a few hundred ms stale.
   *
   * 3 casters x 6 faces x 512^2 = ~4.7M shadow-map texels/frame, the same
   * order as the existing single 2048^2 directional pass (~4.2M) — a second
   * shadow pass of comparable cost, not a new dominant one.
   */
  shadow: {
    maxCasters: 3,
    mapSize: 512,
    /** Cube shadow-camera far plane. A point light's own inverse-square decay
     *  already makes anything past typical residential room scale
     *  negligible; this just bounds the depth range, generously, rather than
     *  chasing per-room size for a shadow pass this cheap to over-provision. */
    farM: 12,
  },
  /** How far below the ceiling surface the fixture sits — a flush-mount
   *  residential ceiling light, not a bare bulb scraping the slab. */
  dropBelowCeilingM: 0.15,
} as const;

/**
 * §0.3 — the render stack this contract was verified against.
 *
 * Every clause here describes behaviour, but records a NAME. `PCFSoftShadowMap`
 * meant a 3x3 soft kernel when M1a wrote it and means "deprecated alias, coerced
 * elsewhere" now; nothing in the repo changed. Renaming the constant fixes that
 * one instance. Pinning is the fix for the class.
 *
 * A change to any of these versions is a contract-invalidation event: §1
 * (colour management), §2 (tone mapping and the composer chain) and §3
 * (shadows) are re-verified against the new build, and captured baselines do
 * not remain valid across it.
 */
export const VERIFIED_AGAINST = {
  three: "0.185.0",
  "@react-three/fiber": "9.6.1",
  "@react-three/drei": "10.7.7",
  postprocessing: "6.39.2",
} as const;

/** Immutable record of every asserted value, for the startup check. */
const EXPECTED = {
  "ColorManagement.enabled": () => THREE.ColorManagement.enabled,
  "gl.outputColorSpace": (gl: THREE.WebGLRenderer) => gl.outputColorSpace,
  "gl.toneMapping": (gl: THREE.WebGLRenderer) => gl.toneMapping,
  "gl.toneMappingExposure": (gl: THREE.WebGLRenderer) => gl.toneMappingExposure,
  "gl.shadowMap.enabled": (gl: THREE.WebGLRenderer) => gl.shadowMap.enabled,
  "gl.shadowMap.type": (gl: THREE.WebGLRenderer) => gl.shadowMap.type,
} as const;

const WANT: Record<keyof typeof EXPECTED, unknown> = {
  "ColorManagement.enabled": COLOR.colorManagement,
  "gl.outputColorSpace": COLOR.outputColorSpace,
  "gl.toneMapping": TONE_MAPPING.renderer,
  "gl.toneMappingExposure": TONE_MAPPING.exposure,
  "gl.shadowMap.enabled": true,
  "gl.shadowMap.type": SHADOW.type,
};

/**
 * Startup assertion (§1.3). Throws in development, logs once in production.
 *
 * Throwing is the point: a warning in a console already carrying R3F and
 * Next.js noise is a warning nobody reads, and this exists precisely for the
 * case where nobody is looking. Dev-throw / prod-log splits it honestly — a
 * dependency bump must not white-screen a user, but it must be impossible to
 * miss on the machine where the bump happens.
 *
 * If this fires, either the code is wrong or the contract is wrong, and one of
 * them gets amended. It does not get silenced.
 */
export function assertRenderContract(gl: THREE.WebGLRenderer): void {
  const bad: string[] = [];
  for (const key of Object.keys(EXPECTED) as (keyof typeof EXPECTED)[]) {
    const actual = EXPECTED[key](gl);
    const want = WANT[key];
    if (actual !== want) bad.push(`  ${key}: expected ${String(want)}, got ${String(actual)}`);
  }
  if (!bad.length) return;

  const msg =
    "Render contract violated — see docs/render-contract.md\n" +
    bad.join("\n") +
    "\nThe renderer is not configured as the contract records. Either the code " +
    "drifted or a dependency changed a default; fix one or amend the contract.";

  if (process.env.NODE_ENV === "development") throw new Error(msg);
  console.error(msg);
}

/**
 * The tone-mapping pass runs inside the composer, so `gl.toneMapping` is forced
 * to NoToneMapping by @react-three/postprocessing on mount. The assertion above
 * therefore has to run AFTER the composer mounts, not in `onCreated` — R3F
 * calls `onCreated` before children render. This flag lets the Canvas defer it.
 */
export const ASSERT_AFTER_COMPOSER_MOUNT = true;
