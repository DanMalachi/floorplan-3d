"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { Sky, Environment, Lightformer } from "@react-three/drei";
import { useSceneStore } from "@/store/useSceneStore";
import { SHADOW } from "@/render/contract";
import {
  CAMERA_PRESETS,
  OUTDOOR_SHADOW_FILL_BOOST,
  STUDIO,
  computeSkyLighting,
  envIntensityForSky,
  hemisphereLuxForSky,
  presetFor,
  toRenderIntensity,
} from "@/render/lightPresets";
import { Suburb } from "./Suburb";
import { City } from "./City";
import { Rain } from "./Rain";

// The world around the model: a time-of-day sun/sky/fog rig plus procedural IBL
// for material reflections. Outdoor presets (suburb/city) show a physical sky
// driven by the hour; "none" keeps the neutral studio look. Ground and distant
// context (grass, skyline) are layered on in later F5 sub-steps.

const col = (hex: string) => new THREE.Color(hex);

// Lighting is authored in physical units (lux) and converted to three
// intensities by the single global exposure in src/render/lightPresets.ts.
// The old eye-tuned intensities are gone, not converted — see contract §4.2.

/**
 * `groundFade` — extend the studio shadow-catcher far beyond the fog's far
 * plane, so it dissolves into the background instead of ending at a visible
 * rim.
 *
 * At its normal size the disc's edge draws a hard horizon line across the
 * frame. That is correct for the editor, where the disc reads as a work
 * surface the model sits on. It is wrong for a presentation embed, where the
 * model should appear to sit in nothing at all.
 *
 * Deliberately not "hide the ground": deleting the disc would take the contact
 * shadow with it and leave the model floating. Making it effectively infinite
 * keeps every shadow and lets the existing fog do the disappearing.
 *
 * `groundShadow` — set false to stop the studio disc receiving the sun's
 * shadow. Added 2026-09-01, approved by Dan.
 *
 * `groundFade` above makes the disc effectively infinite, which removes the
 * horizon but leaves the room's own cast shadow lying across it as a large,
 * hard-edged dark slab. On a marketing page that slab is the most visually
 * prominent object after the model itself, and it reads as a rendering
 * artefact rather than as light. With this off the room floats on the
 * background instead, which is the presentation reading.
 *
 * It is the DISC that stops receiving, not the lights that stop casting — so
 * everything inside the room still shades and self-shadows exactly as before.
 * The only thing that goes is the shadow thrown onto the ground plane.
 *
 * PROTECTED FILE (docs/PROTECTED_PATHS.md, CLAUDE.md rule 1) — both props
 * approved by Dan, see "Approved exceptions" there. Additive, and each defaults
 * to the value that keeps every existing caller rendering what it rendered
 * before.
 */
export function Environment3d({
  span,
  halfX,
  halfZ,
  groundFade = false,
  groundShadow = true,
}: {
  span: number;
  halfX: number;
  halfZ: number;
  groundFade?: boolean;
  groundShadow?: boolean;
}) {
  const preset = useSceneStore((s) => s.envPreset);
  const timeOfDay = useSceneStore((s) => s.timeOfDay);
  const weather = useSceneStore((s) => s.weather);
  const wallMode = useSceneStore((s) => s.wallMode);
  const outdoor = preset !== "none";

  const overcast = outdoor ? (weather === "clear" ? 0 : weather === "cloudy" ? 0.8 : 1) : 0;
  const s = useMemo(() => computeSkyLighting(timeOfDay, overcast), [timeOfDay, overcast]);

  // Camera-mode preset. Only `perspective` claims physical correctness; cutaway
  // and top carry recorded departures for legibility (contract §5.4). None of
  // them touch the sun — the ceiling proxy in FloorMesh handles interior
  // occlusion, so the world outside a cutaway stays correctly sunlit.
  const cam = CAMERA_PRESETS[presetFor(wallMode, false)];
  const fill = toRenderIntensity(cam.interiorFillLux);

  // §7.2.4 dome partition: env map + hemisphere carry one sky, not two. Key
  // rect's own authored intensity (unscaled by cam.iblScale — that departure
  // lands on environmentIntensity, the single lever) drives the level.
  const keyBaseIntensity = outdoor ? 1.2 : 1.6;
  const environmentIntensity =
    envIntensityForSky(outdoor ? s.skyLux : STUDIO.fillLux, keyBaseIntensity) * cam.iblScale;

  const sunPos = useMemo(
    () => s.dir.clone().multiplyScalar(Math.max(span * 1.2, 8)),
    [s.dir, span],
  );
  const skyDir: [number, number, number] = [s.dir.x, s.dir.y, s.dir.z];
  const shadow = SHADOW.frustumHalfExtent(span);
  const studioBg = useMemo(() => col("#101014"), []);
  const fogFar = span * (outdoor ? 16 : 11) * (1 - 0.42 * overcast); // haze thickens

  return (
    <>
      <color attach="background" args={[outdoor ? s.skyColor : studioBg]} />
      <fog attach="fog" args={[outdoor ? s.skyColor : studioBg, span * 3.5, fogFar]} />

      {outdoor ? (
        <>
          <Sky
            sunPosition={skyDir}
            turbidity={6 + 14 * overcast}
            rayleigh={2 - 1.4 * overcast}
            mieCoefficient={0.006 + 0.02 * overcast}
            mieDirectionalG={0.8}
            distance={45000}
          />
          {weather === "rain" && <Rain span={span} />}
          {/* Diffuse sky, lux. OUTDOOR_SHADOW_FILL_BOOST compensates for this
              renderer having no real ground-bounce/GI — see its own doc
              comment (lightPresets.ts): a shadow-side wall gets ONLY this
              light, so at the physically-measured split alone it read much
              darker than a real bounce-lit wall would (Dan's ruling). */}
          <hemisphereLight
            color={s.hemiSky}
            groundColor={s.hemiGround}
            intensity={toRenderIntensity(
              hemisphereLuxForSky(s.skyLux, "outdoor") * cam.skyScale * OUTDOOR_SHADOW_FILL_BOOST,
            )}
          />
          {/* Direct sun, lux. */}
          <directionalLight
            color={s.sunColor}
            position={sunPos}
            intensity={toRenderIntensity(s.sunLux * cam.sunScale)}
            castShadow
            shadow-mapSize={[SHADOW.mapSize, SHADOW.mapSize]}
            shadow-bias={SHADOW.bias}
            shadow-normalBias={SHADOW.normalBias}
          >
            <orthographicCamera attach="shadow-camera" args={[-shadow, shadow, shadow, -shadow, 0.5, span * 6]} />
          </directionalLight>
        </>
      ) : (
        <>
          {/* Studio: a key/fill instrument set, stated as the illuminance real
              lamps would produce rather than derived from an hour. */}
          <hemisphereLight
            color={STUDIO.fillSky}
            groundColor={STUDIO.fillGround}
            intensity={toRenderIntensity(hemisphereLuxForSky(STUDIO.fillLux, "studio") * cam.skyScale)}
          />
          <directionalLight
            color={STUDIO.keyColor}
            position={[span * 0.8, span * 1.1, span * 0.55]}
            intensity={toRenderIntensity(STUDIO.keyLux * cam.sunScale)}
            castShadow
            shadow-mapSize={[SHADOW.mapSize, SHADOW.mapSize]}
            shadow-bias={SHADOW.bias}
            shadow-normalBias={SHADOW.normalBias}
          >
            <orthographicCamera attach="shadow-camera" args={[-shadow, shadow, shadow, -shadow, 0.5, span * 6]} />
          </directionalLight>
        </>
      )}

      {/* Interior fill (contract §5.4) — RETIRED at M2. It stood in for the
          per-room fixtures `RoomLights` now provides while the ceiling
          correctly occluded the sun but nothing lit the rooms it revealed.
          `CAMERA_PRESETS.cutaway`/`.top` now author `interiorFillLux: 0`
          (`lightPresets.ts`), so `fill` is always 0 and this never mounts;
          kept rather than deleted so a preset value change is still the only
          lever, per §5.4's "camera-mode lighting is the three named presets,
          nothing else" rule — not a second code path to re-enable by hand. */}
      {fill > 0 && <ambientLight intensity={fill} color="#fff6e8" />}

      {/* Procedural IBL — soft reflections on glass/floors in every preset.
          Rect intensities are the fixed shape of the sky (§7.2.4); the level
          is `environmentIntensity` alone, computed above from `skyLux`. */}
      <Environment resolution={128} environmentIntensity={environmentIntensity}>
        <Lightformer form="rect" intensity={keyBaseIntensity} position={[0, 8, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[14, 14, 1]} color="#eef3ff" />
        <Lightformer form="rect" intensity={0.7} position={[-9, 3, -6]} scale={[8, 5, 1]} color="#cfe0ff" />
        <Lightformer form="rect" intensity={0.55} position={[9, 3, 6]} scale={[8, 5, 1]} color="#ffe6c8" />
      </Environment>

      {/* Ground. Suburb brings its own lawn + neighbourhood; City brings a rooftop
          terrace + skyline; studio ("none") uses a plain shadow-catcher disc. */}
      {preset === "suburb" ? (
        <Suburb span={span} halfX={halfX} halfZ={halfZ} />
      ) : preset === "city" ? (
        <City span={span} halfX={halfX} halfZ={halfZ} />
      ) : (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow={groundShadow}>
          {/* `fogFar` above is span * 11 indoors, so a radius of span * 60 is
              fully fogged to the background long before its rim — the ground
              simply stops existing, with no horizon to see. */}
          <circleGeometry args={[groundFade ? Math.max(span * 60, 600) : Math.max(span * 3, 30), 64]} />
          <meshStandardMaterial color="#1d1d22" roughness={0.95} metalness={0} />
        </mesh>
      )}
    </>
  );
}
