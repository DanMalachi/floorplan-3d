"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { Sky, Environment, Lightformer } from "@react-three/drei";
import { useSceneStore } from "@/store/useSceneStore";
import { SHADOW } from "@/render/contract";
import {
  CAMERA_PRESETS,
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

export function Environment3d({ span, halfX, halfZ }: { span: number; halfX: number; halfZ: number }) {
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
          {/* Diffuse sky, lux. */}
          <hemisphereLight
            color={s.hemiSky}
            groundColor={s.hemiGround}
            intensity={toRenderIntensity(hemisphereLuxForSky(s.skyLux, "outdoor") * cam.skyScale)}
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

      {/* INTERIM interior fill (contract §5.4). The ceiling now correctly
          occludes the sun, so a roofed interior is genuinely dark in the modes
          that exist to look inside it. This stands in for the per-room fixtures
          M2 adds, at roughly the illuminance a lit living space actually sits
          at. It is 0 in perspective — the physical mode — and RETIRES AT M2. */}
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
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
          <circleGeometry args={[Math.max(span * 3, 30), 64]} />
          <meshStandardMaterial color="#1d1d22" roughness={0.95} metalness={0} />
        </mesh>
      )}
    </>
  );
}
