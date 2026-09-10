"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useStore } from "@react-three/fiber";
import type { RoomLight } from "./roomLighting";
import { ROOM_LIGHT, SHADOW } from "./contract";
import { stripDistribution } from "./stripDistribution";

/** Broad, diffused line emission. Each section keeps its own 2D shadow: demoting it to an
 * unshadowed lamp would send the beam straight through walls and furniture. */
export function StripBeam({ light }: { light: RoomLight }) {
  const store = useStore();
  const length = light.beam!.length;
  const rotation = light.beam!.rotation;
  const height = light.position[1];
  const { map, angle, directionalGain, reach } = useMemo(() => {
    const { radius, sample } = stripDistribution(length, height);
    const h = Math.max(height, 0.1);
    const size = 256;
    const data = new Uint8Array(size * size * 4);
    let solidAngle = 0;
    const pixelArea = (radius * 2 / size) ** 2;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = ((x + 0.5) / size * 2 - 1) * radius;
      const dy = ((y + 0.5) / size * 2 - 1) * radius;
      const value = Math.round(255 * sample(dx, dy));
      solidAngle += value / 255 * h * pixelArea / (h * h + dx * dx + dy * dy) ** 1.5;
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = value;
      data[i + 3] = 255;
    }
    const map = new THREE.DataTexture(data, size, size);
    map.magFilter = map.minFilter = THREE.LinearFilter;
    map.needsUpdate = true;
    // The shared lux resolver assumes a 2π downward hemisphere. Preserve
    // that flux by integrating the diffuser's actual smooth distribution.
    return { map, angle: Math.atan2(radius, h), directionalGain: 2 * Math.PI / solidAngle,
      reach: Math.max(ROOM_LIGHT.shadow.farM, Math.hypot(radius, h) + 1) };
  }, [length, height]);
  const target = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => () => map.dispose(), [map]);
  useEffect(() => { store.getState().gl.shadowMap.needsUpdate = true; }, [store, light]);
  return <group>
    <primitive object={target} position={[light.position[0], height - 1, light.position[2]]} />
    <spotLight position={light.position} target={target} color={light.color} intensity={light.intensity * directionalGain}
      angle={angle} penumbra={0} map={map} decay={ROOM_LIGHT.decay} distance={reach} castShadow
      shadow-camera-up={[Math.sin(rotation), 0, -Math.cos(rotation)]}
      shadow-mapSize={[512, 512]} shadow-camera-near={0.03}
      shadow-camera-far={reach}
      shadow-bias={SHADOW.bias} shadow-normalBias={SHADOW.normalBias} shadow-radius={ROOM_LIGHT.shadow.radius} />
  </group>;
}
