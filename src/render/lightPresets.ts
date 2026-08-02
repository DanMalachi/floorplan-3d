import * as THREE from "three";

/**
 * Physical light units and the single global exposure that maps them onto the
 * display (`docs/render-contract.md` §2.2, §4, §5).
 *
 * Every light in the scene is authored in real photometric units — lux for
 * directional and sky, candela for point and spot, nits for area and emissive.
 * Physical units make lighting DERIVABLE instead of tuned: an "overcast
 * afternoon" preset becomes a lookup rather than a taste judgment, and at M2 a
 * room's lights can be specified as the fixtures that would actually be in it,
 * in lumens off a box. Eyeballed values do not compose — two independently
 * tuned lights have no defined relationship, so adding a third means retuning
 * all of them.
 *
 * The previous eye-tuned intensities (sun 0.3..2.4, hemi 0.16..0.66, studio
 * 2.1/0.55) are DISCARDED, not converted (§4.2). There was never a scale to
 * recover: the ratios encoded a person's judgment under a fixed curve with no
 * exposure control. There is nothing to migrate.
 */

// ---------------------------------------------------------------------------
// Exposure
// ---------------------------------------------------------------------------

/** Clear-sky direct sun at noon. Standard photometric reference: ~100-120 klx. */
export const REFERENCE_SUN_LUX = 100_000;

/**
 * THE single exposure owner (§2.2). Applied SCENE-REFERRED — it converts
 * authored physical units into three light intensities — because the usual
 * display-referred slot does not exist in this pipeline:
 *
 *   - `renderer.toneMappingExposure` is unreachable. The composer forces
 *     `gl.toneMapping = NoToneMapping`, and that uniform belongs to a shader
 *     chunk three omits entirely in that mode.
 *   - `ToneMappingEffect` has no exposure parameter. Its extra options affect
 *     the Reinhard2 operator only; Neutral and ACES are fixed curves.
 *
 * DERIVATION, not a tuned constant. Three's physical lighting gives a lambertian
 * surface outgoing radiance `L = albedo / PI * E * dotNL`. For an 18% grey card
 * at normal incidence under the reference sun:
 *
 *   L = 0.18 / PI * 100000 = 5730 nits
 *
 * We want that to land at linear 0.18 going into the tone mapper (Khronos
 * Neutral is near-identity through the low and mid range, compressing only
 * highlights), so:
 *
 *   exposure = 0.18 / 5730 = PI / 100000
 *
 * The 0.18 cancels: exposure is exactly PI / REFERENCE_SUN_LUX, independent of
 * the card's albedo. That is the calibration, and `/calibration` is the scene
 * that verifies it.
 *
 * This is a global constant. If a scene or asset needs it changed to look
 * right, the asset, the light or the material is wrong — the exposure is not
 * the fix (§2.4).
 */
export const RENDER_EXPOSURE = Math.PI / REFERENCE_SUN_LUX;

/** Convert an authored physical value (lux / candela / nits) to a three intensity. */
export const toRenderIntensity = (physical: number): number => physical * RENDER_EXPOSURE;

/**
 * Candela for a single ceiling-mounted, isotropic point fixture whose
 * downward hemisphere (2π sr — the ceiling above blocks the rest) delivers an
 * average `targetLux` across a room of `areaM2`. Derived, not tuned: incident
 * flux is `E_avg * area`, and an isotropic source spreads that flux over 2π sr
 * into the room, so `intensity = flux / (2 * PI)`. This is the same
 * flux-over-solid-angle relationship §4.1 already states for a point light's
 * full-4π conversion (candela = lumens / 4π), restricted to the downward half
 * because the other half lights the inside of the ceiling slab, not the room.
 *
 * Real distribution under a single point source is not perfectly even —
 * brighter directly below the fixture, dimmer at a room's far corners,
 * especially in an elongated or L-shaped one — and that is not modelled here.
 * This sizes ONE fixture per room (`docs render-contract.md` M2), not a
 * multi-source lighting simulation; large or oddly-shaped rooms underlighting
 * at the edges is a known limitation of that scope, not a bug in this formula.
 */
export function roomFixtureCandela(areaM2: number, targetLux: number): number {
  return (targetLux * areaM2) / (2 * Math.PI);
}

// ---------------------------------------------------------------------------
// Physical sky model
// ---------------------------------------------------------------------------

/**
 * Reference illuminances (standard photometry), for anyone changing the model:
 *
 *   direct sun + clear sky, noon    100,000 - 120,000 lx
 *   full daylight, indirect          10,000 -  25,000 lx
 *   overcast day                      1,000 -  10,000 lx
 *   sunrise / sunset, clear                      ~400 lx
 *   civil twilight                                ~3.4 lx
 *   full moon, clear                              ~0.25 lx
 */
const CLEAR_SKY_DIFFUSE_LUX = 20_000;
const OVERCAST_TOTAL_LUX = 10_000;
const FULL_MOON_LUX = 0.25;

export interface SkyLighting {
  /** Sun direction (unit). */
  dir: THREE.Vector3;
  /** Direct sun illuminance, lux. */
  sunLux: number;
  /** Diffuse sky illuminance, lux. Drives the hemisphere light. */
  skyLux: number;
  sunColor: THREE.Color;
  skyColor: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
}

const col = (hex: string) => new THREE.Color(hex);

/**
 * Sun direction + physical illuminances for an hour (0..24) and weather.
 * Colors are unchanged from the previous rig — a color is a color, and only the
 * intensities were unit-less. `overcast` is 0 (clear) / 0.8 (cloudy) / 1 (rain).
 */
export function computeSkyLighting(t: number, overcast: number): SkyLighting {
  // 6h -> horizon (east), 12h -> overhead, 18h -> horizon (west); night below.
  const phi = ((t - 6) / 12) * Math.PI;
  const sunY = Math.sin(phi);
  const dir = new THREE.Vector3(Math.cos(phi), Math.max(sunY, -0.15), 0.35).normalize();

  const day = Math.max(0, sunY); // 0 at/below horizon -> 1 at noon
  const lowSun = 1 - Math.min(1, day / 0.28); // 1 near sunrise/sunset
  const night = sunY < 0 ? Math.min(1, -sunY / 0.35) : 0;

  // Direct sun. The 1.15 exponent stands in for atmospheric extinction, which
  // is why a 30-degree sun is well under half a noon sun rather than exactly
  // half. Overcast removes direct sun almost entirely — that is what overcast
  // physically IS, not merely a dimmer sun.
  const sunLux = REFERENCE_SUN_LUX * Math.pow(day, 1.15) * (1 - 0.95 * overcast);

  // Diffuse sky. Clear sky carries ~20 klx at noon; a fully overcast sky
  // carries the whole ~10 klx budget as diffuse. Below the horizon we fall to
  // moonlight — physically right, and it means night scenes render very dark
  // until M2 gives rooms their own fixtures. That is expected, not a bug.
  const clearDiffuse = CLEAR_SKY_DIFFUSE_LUX * Math.pow(day, 0.6);
  const overcastDiffuse = OVERCAST_TOTAL_LUX * Math.pow(day, 0.5);
  const skyLux = Math.max(
    THREE.MathUtils.lerp(clearDiffuse, overcastDiffuse, overcast),
    FULL_MOON_LUX,
  );

  const grey = col("#c4c9ce").multiplyScalar(0.18 + 0.72 * day);
  const sunColor = col("#fff2df")
    .lerp(col("#ff7d33"), lowSun * (1 - night)) // warm at the horizon
    .lerp(col("#8fa6db"), night) // cool moonlight
    .lerp(grey, 0.5 * overcast);
  const skyColor = col("#0a0e1c")
    .lerp(col("#bcd6ff"), day)
    .lerp(col("#ffb066"), lowSun * (1 - night) * 0.7)
    .lerp(grey, 0.55 * overcast);
  const hemiSky = col("#0c1020").lerp(col("#dce9ff"), day).lerp(grey, 0.5 * overcast);
  const hemiGround = col("#0a0a10").lerp(col("#6b5a44"), day).lerp(grey, 0.35 * overcast);

  return { dir, sunLux, skyLux, sunColor, skyColor, hemiSky, hemiGround };
}

/**
 * Studio ("none") preset. Not a sky — a lighting instrument set, so its values
 * are stated as the illuminance a photographer's key and fill would actually
 * produce rather than derived from an hour of the day.
 */
export const STUDIO = {
  keyLux: 20_000,
  fillLux: 6_000,
  keyColor: "#fff1dd",
  fillSky: "#dfe9ff",
  fillGround: "#4a4438",
} as const;

/**
 * M2 room fixtures. ~2700K warm white, the standard colour temperature of a
 * domestic LED ceiling fixture — not tuned to taste, stated as what the
 * fixture physically is (same convention as `STUDIO.keyColor` for a
 * photographer's key lamp).
 */
export const ROOM_FIXTURE_COLOR = "#ffddb0";

// ---------------------------------------------------------------------------
// Camera-mode presets
// ---------------------------------------------------------------------------

export type CameraPreset = "perspective" | "cutaway" | "top";

export interface CameraPresetValues {
  /** Multiplier on direct sun. 1 = physical. */
  sunScale: number;
  /** Multiplier on diffuse sky. 1 = physical. */
  skyScale: number;
  /** Multiplier on image-based lighting. 1 = physical. */
  iblScale: number;
  /**
   * Interim interior fill, lux — RETIRED at M2. Stood in for the per-room
   * fixtures `RoomLights` (`src/render/roomLighting.ts`) now provides, at
   * roughly the 150-300 lx a lit living space actually sits at. Both
   * non-physical presets author this as 0 now that rooms carry real lights;
   * kept as a field (rather than deleted) so a future mode that genuinely
   * needs a flat fill has somewhere to put it without a new code path.
   */
  interiorFillLux: number;
  /** Whether this preset makes a physical-correctness claim. */
  physical: boolean;
}

/**
 * Three named presets (§5.4). `perspective` is THE ONLY physically motivated
 * one — it is where M1c baselines are captured and the only mode any
 * correctness claim covers. `cutaway` and `top` are legibility-first, and every
 * departure below is recorded.
 *
 * Note what these presets do NOT do: they do not touch the sun. An earlier
 * proposal suppressed sun contribution in cutaway to stop light leaking through
 * the missing ceiling. Reading the implementation killed it — cutaway fades
 * only walls facing the camera (dot > 0.25); the far walls, the sky, the
 * ground, the lawn and the skyline all still render. The sun is one scene-wide
 * light, so cutting it darkens the entire visible world to fix an interior
 * leak. The depth-only ceiling proxy in FloorMesh fixes the leak instead, and
 * the exterior stays correctly lit.
 */
export const CAMERA_PRESETS: Record<CameraPreset, CameraPresetValues> = {
  perspective: {
    sunScale: 1,
    skyScale: 1,
    iblScale: 1,
    interiorFillLux: 0,
    physical: true,
  },
  cutaway: {
    sunScale: 1, // the world outside the cut stays sunlit — see note above
    skyScale: 1,
    iblScale: 1.15, // DEPARTURE: lifts material read on the exposed interior
    interiorFillLux: 0, // RETIRED at M2 — rooms carry real fixtures now (RoomLights)
    physical: false,
  },
  top: {
    sunScale: 1,
    skyScale: 1,
    iblScale: 1.3, // DEPARTURE: plan legibility beats directional modelling here
    interiorFillLux: 0, // RETIRED at M2 — rooms carry real fixtures now (RoomLights)
    physical: false,
  },
};

/** Camera preset for a wall view mode. Walkthrough is first-person: physical. */
export function presetFor(wallMode: "full" | "cutaway" | "top", walkthrough: boolean): CameraPreset {
  if (walkthrough) return "perspective";
  return wallMode === "full" ? "perspective" : wallMode;
}

// ---------------------------------------------------------------------------
// IBL dome partition (contract §7.2.4)
// ---------------------------------------------------------------------------

/**
 * The environment map and `hemisphereLight` represent ONE sky, partitioned by
 * solid angle rather than duplicated. `IBL_RIG_GAIN` is the Lightformer rig's
 * geometric gain — irradiance delivered per unit key-rect radiance, with the
 * key/coolSide/warmSide rects held at their authored ratio (1.2:0.7:0.55
 * outdoor, 1.6:0.7:0.55 studio) — measured from the rig geometry in
 * `Environment3d.tsx` by `scripts/render/ibl-audit.mjs` (8M-sample
 * cosine-weighted Monte Carlo). A full uniform dome is PI sr; this rig covers
 * ~51%. Re-measure and update these two numbers if the rig's rect geometry
 * (position/scale/rotation) changes — they are not derivable from the ratio
 * alone.
 */
const IBL_RIG_GAIN: Record<"outdoor" | "studio", number> = {
  outdoor: 1.603,
  studio: 1.586,
};

/** Rec.709 luminance of the key rect's colour (`#eef3ff`), linear working space. */
const IBL_KEY_LUMINANCE = 0.895;

/**
 * `scene.environmentIntensity` that puts the key rect's contribution to the
 * env map at physical `skyTotalLux / PI` nits (§7.2.4) — the single lever, so
 * the rects' authored intensities keep encoding the sky's shape and only this
 * one number moves. `keyBaseIntensity` is the key rect's own authored
 * intensity (1.2 outdoor / 1.6 studio), unscaled by any camera-preset
 * departure — that departure belongs on the returned value, not baked in here.
 */
export function envIntensityForSky(skyTotalLux: number, keyBaseIntensity: number): number {
  const targetNits = skyTotalLux / Math.PI;
  const rawKeyRadiance = IBL_KEY_LUMINANCE * keyBaseIntensity;
  return toRenderIntensity(targetNits) / rawKeyRadiance;
}

/**
 * Diffuse-sky lux `hemisphereLight` carries: the slice of the dome the env
 * map's rig geometry does not cover. `skyTotalLux` is `skyLux` outdoors or
 * `STUDIO.fillLux` in studio — the same total the env map used to duplicate.
 */
export function hemisphereLuxForSky(skyTotalLux: number, mode: "outdoor" | "studio"): number {
  return skyTotalLux * (1 - IBL_RIG_GAIN[mode] / Math.PI);
}
