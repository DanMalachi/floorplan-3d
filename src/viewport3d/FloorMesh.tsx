"use client";

import { useMemo } from "react";
import { DoubleSide } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { BufferGeometry } from "three";
import type { Scene } from "@/schema/scene";
import { useSceneStore } from "@/store/useSceneStore";
import { buildFloorGeometry } from "./geometry/triangulateFloor";
import { ACCENT } from "./WallMesh";

const FLOOR_COLOR = "#8a94a6";

function Floor({ roomId, geometry }: { roomId: string; geometry: BufferGeometry }) {
  const hovered = useSceneStore(
    (s) => s.hover3d?.kind === "room" && s.hover3d.id === roomId,
  );
  const selected = useSceneStore(
    (s) => s.sel3d?.kind === "room" && s.sel3d.id === roomId,
  );
  const setHover3d = useSceneStore((s) => s.setHover3d);
  const setSel3d = useSceneStore((s) => s.setSel3d);
  const glow = selected ? 0.4 : hovered ? 0.18 : 0;

  return (
    <mesh
      geometry={geometry}
      receiveShadow
      userData={{ pick: { kind: "room", id: roomId } }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHover3d({ kind: "room", id: roomId });
      }}
      onPointerOut={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        const cur = useSceneStore.getState().hover3d;
        if (cur?.kind === "room" && cur.id === roomId) setHover3d(null);
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        setSel3d({ kind: "room", id: roomId });
      }}
    >
      <meshStandardMaterial
        color={FLOOR_COLOR}
        side={DoubleSide}
        emissive={ACCENT}
        emissiveIntensity={glow}
      />
    </mesh>
  );
}

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
        <Floor key={f.id} roomId={f.id} geometry={f.geometry} />
      ))}
    </group>
  );
}
