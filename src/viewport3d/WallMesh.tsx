"use client";

import { useMemo } from "react";
import type { Opening, Scene } from "@/schema/scene";
import { buildWallSegments, type WallPiece } from "./geometry/buildWallSegments";

export function Walls({ scene }: { scene: Scene }) {
  const pieces = useMemo<WallPiece[]>(() => {
    const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
    const byWall = new Map<string, Opening[]>();
    for (const o of scene.openings) {
      const arr = byWall.get(o.wallId) ?? [];
      arr.push(o);
      byWall.set(o.wallId, arr);
    }
    const out: WallPiece[] = [];
    for (const w of scene.walls) {
      out.push(...buildWallSegments(w, byWall.get(w.id) ?? [], nodes));
    }
    return out;
  }, [scene]);

  return (
    <group>
      {pieces.map((p, i) => (
        <mesh
          key={i}
          position={p.position}
          rotation={[0, p.rotationY, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={p.size} />
          <meshStandardMaterial color="#d8d2c4" />
        </mesh>
      ))}
    </group>
  );
}
