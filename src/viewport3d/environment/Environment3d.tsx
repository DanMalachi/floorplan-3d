"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { Sky, Environment, Lightformer } from "@react-three/drei";
import { useSceneStore } from "@/store/useSceneStore";
import { Suburb } from "./Suburb";

// The world around the model: a time-of-day sun/sky/fog rig plus procedural IBL
// for material reflections. Outdoor presets (suburb/city) show a physical sky
// driven by the hour; "none" keeps the neutral studio look. Ground and distant
// context (grass, skyline) are layered on in later F5 sub-steps.

const col = (hex: string) => new THREE.Color(hex);

/** Sun direction + lighting/sky colours for a given hour (0..24). */
function computeSky(t: number) {
  // 6h → horizon (east), 12h → overhead, 18h → horizon (west); night below.
  const phi = ((t - 6) / 12) * Math.PI;
  const sunY = Math.sin(phi);
  const dir = new THREE.Vector3(Math.cos(phi), Math.max(sunY, -0.15), 0.35).normalize();

  const day = Math.max(0, sunY); // 0 at/below horizon → 1 at noon
  const lowSun = 1 - Math.min(1, day / 0.28); // 1 near sunrise/sunset
  const night = sunY < 0 ? Math.min(1, -sunY / 0.35) : 0;

  const sunColor = col("#fff2df")
    .lerp(col("#ff7d33"), lowSun * (1 - night)) // warm at the horizon
    .lerp(col("#8fa6db"), night); // cool moonlight
  const sunIntensity = night > 0.5 ? 0.3 : 0.4 + 2.0 * day;

  const sky = col("#0a0e1c")
    .lerp(col("#bcd6ff"), day)
    .lerp(col("#ffb066"), lowSun * (1 - night) * 0.7);
  const hemiSky = col("#0c1020").lerp(col("#dce9ff"), day);
  const hemiGround = col("#0a0a10").lerp(col("#6b5a44"), day);
  const hemiIntensity = 0.16 + 0.5 * day;

  return { dir, sunColor, sunIntensity, sky, hemiSky, hemiGround, hemiIntensity };
}

export function Environment3d({ span, halfX, halfZ }: { span: number; halfX: number; halfZ: number }) {
  const preset = useSceneStore((s) => s.envPreset);
  const timeOfDay = useSceneStore((s) => s.timeOfDay);
  const outdoor = preset !== "none";
  const s = useMemo(() => computeSky(timeOfDay), [timeOfDay]);

  const sunPos = useMemo(
    () => s.dir.clone().multiplyScalar(Math.max(span * 1.2, 8)),
    [s.dir, span],
  );
  const skyDir: [number, number, number] = [s.dir.x, s.dir.y, s.dir.z];
  const shadow = span * 0.9 + 4;
  const studioBg = useMemo(() => col("#101014"), []);

  return (
    <>
      <color attach="background" args={[outdoor ? s.sky : studioBg]} />
      <fog attach="fog" args={[outdoor ? s.sky : studioBg, span * 3.5, span * (outdoor ? 16 : 11)]} />

      {outdoor ? (
        <>
          <Sky
            sunPosition={skyDir}
            turbidity={6}
            rayleigh={2}
            mieCoefficient={0.006}
            mieDirectionalG={0.8}
            distance={45000}
          />
          <hemisphereLight color={s.hemiSky} groundColor={s.hemiGround} intensity={s.hemiIntensity} />
          <directionalLight
            color={s.sunColor}
            position={sunPos}
            intensity={s.sunIntensity}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.0002}
            shadow-normalBias={0.02}
          >
            <orthographicCamera attach="shadow-camera" args={[-shadow, shadow, shadow, -shadow, 0.5, span * 6]} />
          </directionalLight>
        </>
      ) : (
        <>
          <hemisphereLight args={["#dfe9ff", "#4a4438", 0.55]} />
          <directionalLight
            color="#fff1dd"
            position={[span * 0.8, span * 1.1, span * 0.55]}
            intensity={2.1}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.0002}
            shadow-normalBias={0.02}
          >
            <orthographicCamera attach="shadow-camera" args={[-shadow, shadow, shadow, -shadow, 0.5, span * 6]} />
          </directionalLight>
        </>
      )}

      {/* Procedural IBL — soft reflections on glass/floors in every preset. */}
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={outdoor ? 1.2 : 1.6} position={[0, 8, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[14, 14, 1]} color="#eef3ff" />
        <Lightformer form="rect" intensity={0.7} position={[-9, 3, -6]} scale={[8, 5, 1]} color="#cfe0ff" />
        <Lightformer form="rect" intensity={0.55} position={[9, 3, 6]} scale={[8, 5, 1]} color="#ffe6c8" />
      </Environment>

      {/* Ground. Suburb brings its own lawn + neighbourhood; studio ("none") and
          the city placeholder (until F5.3) use a plain shadow-catcher disc. */}
      {preset === "suburb" ? (
        <Suburb span={span} halfX={halfX} halfZ={halfZ} />
      ) : (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
          <circleGeometry args={[Math.max(span * 3, 30), 64]} />
          <meshStandardMaterial color={outdoor ? "#5f6b4a" : "#1d1d22"} roughness={0.95} metalness={0} />
        </mesh>
      )}
    </>
  );
}
