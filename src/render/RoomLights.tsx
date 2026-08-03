"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { Scene } from "@/schema/scene";
import { ROOM_LIGHT, SHADOW } from "./contract";
import { computeRoomLights } from "./roomLighting";

/**
 * M2 — one ceiling light per detected room, mounted alongside Floors/Ceilings
 * inside the same recentred plan-space group so `computeRoomLights`' plan
 * coordinates need no second offset.
 *
 * Every light contributes illumination; only the `ROOM_LIGHT.shadow.maxCasters`
 * nearest to the camera cast a shadow (point-light shadows are a 6-face cube
 * map — see contract.ts for the cost accounting). Re-ranked periodically, not
 * every frame: toggling `castShadow` forces three to recompile the affected
 * materials' shadow variant, and doing that continuously for a light sitting
 * near the rank boundary is worse than the rank being briefly stale.
 */
const RANK_INTERVAL_S = 0.35;

export function RoomLights({ scene }: { scene: Scene }) {
  const lights = useMemo(() => computeRoomLights(scene), [scene]);
  const camera = useThree((s) => s.camera);
  const refs = useRef<(THREE.PointLight | null)[]>([]);
  const casting = useRef<Set<number>>(new Set());
  // Starts already "due" so the first shadow ranking lands on frame one
  // instead of leaving every room light shadowless for the first interval.
  const elapsed = useRef(RANK_INTERVAL_S);
  const worldPos = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    elapsed.current += delta;
    if (elapsed.current < RANK_INTERVAL_S) return;
    elapsed.current = 0;

    const ranked = refs.current
      .map((light, i) => {
        if (!light) return null;
        light.getWorldPosition(worldPos);
        return { i, distSq: worldPos.distanceToSquared(camera.position) };
      })
      .filter((r): r is { i: number; distSq: number } => r != null)
      .sort((a, b) => a.distSq - b.distSq)
      .slice(0, ROOM_LIGHT.shadow.maxCasters)
      .map((r) => r.i);

    const next = new Set(ranked);
    let changed = next.size !== casting.current.size;
    if (!changed) for (const i of next) if (!casting.current.has(i)) { changed = true; break; }
    if (!changed) return;

    casting.current = next;
    refs.current.forEach((light, i) => {
      if (light) light.castShadow = next.has(i);
    });
  });

  return (
    <group>
      {lights.map((l, i) => (
        <pointLight
          key={l.id}
          ref={(el) => { refs.current[i] = el; }}
          position={l.position}
          color={l.color}
          intensity={l.intensity}
          decay={ROOM_LIGHT.decay}
          distance={0}
          shadow-mapSize={[ROOM_LIGHT.shadow.mapSize, ROOM_LIGHT.shadow.mapSize]}
          shadow-camera-near={0.1}
          shadow-camera-far={ROOM_LIGHT.shadow.farM}
          shadow-bias={SHADOW.bias}
          shadow-normalBias={SHADOW.normalBias}
          shadow-radius={ROOM_LIGHT.shadow.radius}
        />
      ))}
    </group>
  );
}
