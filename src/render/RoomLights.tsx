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
 *
 * Sprint 3d: raw nearest-by-distance re-ranking flickers at a room boundary —
 * two lights on either side of a doorway keep trading the "nearest" spot as
 * the camera crosses it, each swap forcing that shadow-variant recompile plus
 * a visible shadow pop. A challenger must beat the current caster by
 * `HYSTERESIS_DIST_RATIO` (not just barely edge it out) before it takes over.
 */
const RANK_INTERVAL_S = 0.35;
/** Squared-distance ratio a challenger must beat the incumbent by (0.49 ==
 *  actual distance ~30% closer) before it's allowed to take over as caster. */
const HYSTERESIS_DIST_SQ_RATIO = 0.49;

export function RoomLights({ scene }: { scene: Scene }) {
  // computeRoomLights only reads rooms/walls/nodes/fixtures — never openings.
  // A walkthrough door swing (WalkthroughMode.tsx) republishes a new Scene
  // object every frame but keeps those sub-arrays referentially stable, so
  // memoizing on them (not on `scene` itself) skips the recompute for the
  // ~1-2s a door is animating.
  const lights = useMemo(
    () => computeRoomLights(scene),
    [scene.rooms, scene.walls, scene.nodes, scene.fixtures],
  );
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

    const distSqByIndex = new Map<number, number>();
    refs.current.forEach((light, i) => {
      if (!light) return;
      light.getWorldPosition(worldPos);
      distSqByIndex.set(i, worldPos.distanceToSquared(camera.position));
    });

    // Incumbents keep their slot unless a challenger is decisively closer
    // (HYSTERESIS_DIST_SQ_RATIO) — see the class doc for why.
    const incumbents = [...casting.current]
      .filter((i) => distSqByIndex.has(i))
      .sort((a, b) => distSqByIndex.get(b)! - distSqByIndex.get(a)!); // worst-first
    const challengers = [...distSqByIndex.keys()]
      .filter((i) => !casting.current.has(i))
      .sort((a, b) => distSqByIndex.get(a)! - distSqByIndex.get(b)!); // best-first

    const next = new Set<number>();
    for (const incumbentIdx of incumbents) {
      const incumbentDistSq = distSqByIndex.get(incumbentIdx)!;
      const bestChallenger = challengers[0];
      const beaten =
        bestChallenger !== undefined &&
        distSqByIndex.get(bestChallenger)! < incumbentDistSq * HYSTERESIS_DIST_SQ_RATIO;
      if (beaten) {
        next.add(challengers.shift()!);
      } else {
        next.add(incumbentIdx);
      }
    }
    while (next.size < ROOM_LIGHT.shadow.maxCasters && challengers.length > 0) {
      next.add(challengers.shift()!);
    }

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
