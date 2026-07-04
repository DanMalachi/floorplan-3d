"use client";

import { useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import type { Opening, Scene, Wall } from "@/schema/scene";
import { useSceneStore, type PickRef } from "@/store/useSceneStore";
import {
  buildWallSegments,
  buildOpeningVolumes,
  type OpeningVolume,
  type WallPiece,
} from "./geometry/buildWallSegments";

// Apple-blue accent shared by all 3D selection feedback.
export const ACCENT = "#0a84ff";
const WALL_COLOR = "#d8d2c4";

/** Pointer handlers implementing the pick contract for one target. */
function usePick(pick: PickRef) {
  const setHover3d = useSceneStore((s) => s.setHover3d);
  const setSel3d = useSceneStore((s) => s.setSel3d);
  return {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHover3d(pick);
    },
    onPointerOut: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const cur = useSceneStore.getState().hover3d;
      if (cur && cur.kind === pick.kind && cur.id === pick.id) setHover3d(null);
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      setSel3d(pick);
    },
  };
}

const isPick = (p: PickRef | null, kind: PickRef["kind"], id: string) =>
  p !== null && p.kind === kind && p.id === id;

function WallGroup({ wall, pieces, volumes }: {
  wall: Wall;
  pieces: WallPiece[];
  volumes: OpeningVolume[];
}) {
  const hovered = useSceneStore((s) => isPick(s.hover3d, "wall", wall.id));
  const selected = useSceneStore((s) => isPick(s.sel3d, "wall", wall.id));
  const handlers = usePick({ kind: "wall", id: wall.id });
  const glow = selected ? 0.5 : hovered ? 0.22 : 0;

  return (
    <group>
      {pieces.map((p, i) => (
        <mesh
          key={i}
          position={p.position}
          rotation={[0, p.rotationY, 0]}
          castShadow
          receiveShadow
          userData={{ pick: { kind: "wall", id: wall.id } }}
          {...handlers}
        >
          <boxGeometry args={p.size} />
          <meshStandardMaterial
            color={WALL_COLOR}
            emissive={ACCENT}
            emissiveIntensity={glow}
          />
        </mesh>
      ))}
      {volumes.map((v) => (
        <OpeningPick key={v.openingId} vol={v} />
      ))}
    </group>
  );
}

/** Invisible-until-noticed glass box filling a door/window gap. */
function OpeningPick({ vol }: { vol: OpeningVolume }) {
  const hovered = useSceneStore((s) => isPick(s.hover3d, "opening", vol.openingId));
  const selected = useSceneStore((s) => isPick(s.sel3d, "opening", vol.openingId));
  const handlers = usePick({ kind: "opening", id: vol.openingId });
  const opacity = selected ? 0.45 : hovered ? 0.25 : 0.04;

  return (
    <mesh
      position={vol.position}
      rotation={[0, vol.rotationY, 0]}
      userData={{ pick: { kind: "opening", id: vol.openingId } }}
      {...handlers}
    >
      <boxGeometry args={vol.size} />
      <meshStandardMaterial
        color={ACCENT}
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </mesh>
  );
}

export function Walls({ scene }: { scene: Scene }) {
  const built = useMemo(() => {
    const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
    const byWall = new Map<string, Opening[]>();
    for (const o of scene.openings) {
      const arr = byWall.get(o.wallId) ?? [];
      arr.push(o);
      byWall.set(o.wallId, arr);
    }
    return scene.walls.map((wall) => ({
      wall,
      pieces: buildWallSegments(wall, byWall.get(wall.id) ?? [], nodes),
      volumes: buildOpeningVolumes(wall, byWall.get(wall.id) ?? [], nodes),
    }));
  }, [scene]);

  return (
    <group>
      {built.map(({ wall, pieces, volumes }) => (
        <WallGroup key={wall.id} wall={wall} pieces={pieces} volumes={volumes} />
      ))}
    </group>
  );
}
