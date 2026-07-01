"use client";

import { useMemo } from "react";
import { DoubleSide } from "three";
import type { Scene } from "@/schema/scene";
import { buildFloorGeometry } from "./geometry/triangulateFloor";

export function Floors({ scene }: { scene: Scene }) {
  const floors = useMemo(() => {
    const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
    return scene.rooms.map((room) => {
      const loop = room.loop
        .map((id) => nodes.get(id))
        .filter((n): n is NonNullable<typeof n> => n != null);
      return { id: room.id, geometry: buildFloorGeometry(loop) };
    });
  }, [scene]);

  return (
    <group>
      {floors.map((f) => (
        <mesh key={f.id} geometry={f.geometry} receiveShadow>
          <meshStandardMaterial color="#8a94a6" side={DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}
