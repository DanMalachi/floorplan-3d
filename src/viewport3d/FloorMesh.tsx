"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { Scene, FloorStyle } from "@/schema/scene";
import { useSceneStore } from "@/store/useSceneStore";
import { WALL_HEIGHT } from "@/schema/constants";
import { buildFloorGeometry } from "./geometry/triangulateFloor";
import { floorTexture, FLOOR_ROUGHNESS } from "./textures";
import { ACCENT } from "./WallMesh";

function Floor({ roomId, style, geometry }: {
  roomId: string;
  style: FloorStyle;
  geometry: THREE.BufferGeometry;
}) {
  const hovered = useSceneStore(
    (s) => s.hover3d?.kind === "room" && s.hover3d.id === roomId,
  );
  const selected = useSceneStore(
    (s) => s.sel3d?.kind === "room" && s.sel3d.id === roomId,
  );
  const setHover3d = useSceneStore((s) => s.setHover3d);
  const setSel3d = useSceneStore((s) => s.setSel3d);

  // Per-room material (textures are shared) so the highlight stays per-room.
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: floorTexture(style),
        roughness: FLOOR_ROUGHNESS[style],
        metalness: 0,
        emissive: new THREE.Color(ACCENT),
        emissiveIntensity: 0,
        side: THREE.DoubleSide,
      }),
    [style],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => {
    mat.emissiveIntensity = selected ? 0.25 : hovered ? 0.1 : 0;
  }, [mat, hovered, selected]);

  return (
    <mesh
      geometry={geometry}
      material={mat}
      receiveShadow
      userData={{ pick: { kind: "room", id: roomId } }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        const s = useSceneStore.getState();
        if (s.appMode !== "build" || s.placing) return;
        e.stopPropagation();
        setHover3d({ kind: "room", id: roomId });
      }}
      onPointerOut={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        const cur = useSceneStore.getState().hover3d;
        if (cur?.kind === "room" && cur.id === roomId) setHover3d(null);
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        const s = useSceneStore.getState();
        if (s.appMode !== "build" || s.placing) return; // let the ground plane place
        e.stopPropagation();
        setSel3d({ kind: "room", id: roomId });
      }}
    />
  );
}

export function Floors({ scene }: { scene: Scene }) {
  const floors = useMemo(() => {
    const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
    return scene.rooms.map((room) => {
      const loop = room.loop
        .map((id) => nodes.get(id))
        .filter((n): n is NonNullable<typeof n> => n != null);
      return {
        id: room.id,
        style: room.floor ?? ("wood" as FloorStyle),
        geometry: buildFloorGeometry(loop),
      };
    });
  }, [scene]);

  return (
    <group>
      {floors.map((f) => (
        <Floor key={f.id} roomId={f.id} style={f.style} geometry={f.geometry} />
      ))}
    </group>
  );
}

/** Per-room ceiling planes at wall height. Reuses the floor triangulation, lifted
 *  to WALL_HEIGHT. Shown only in Full wall-mode (and via the Ceilings toggle) so
 *  Cutaway/Top can always see in. Rooms bounded by any rail (balconies) are open
 *  to the sky and get no ceiling. */
export function Ceilings({ scene }: { scene: Scene }) {
  const wallMode = useSceneStore((s) => s.wallMode);
  const show = useSceneStore((s) => s.showCeilings);

  const ceilings = useMemo(() => {
    const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
    const railEdges = new Set(
      scene.walls
        .filter((w) => w.kind === "rail")
        .map((w) => [w.a, w.b].sort().join("|")),
    );
    const out: { id: string; geometry: THREE.BufferGeometry }[] = [];
    for (const room of scene.rooms) {
      const loop = room.loop
        .map((id) => nodes.get(id))
        .filter((n): n is NonNullable<typeof n> => n != null);
      if (loop.length < 3) continue;
      const open = room.loop.some((id, i) =>
        railEdges.has([id, room.loop[(i + 1) % room.loop.length]].sort().join("|")),
      );
      if (open) continue; // balcony / open-air room — no ceiling
      out.push({ id: room.id, geometry: buildFloorGeometry(loop) });
    }
    return out;
  }, [scene]);

  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ededed",
        roughness: 0.95,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    [],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => () => ceilings.forEach((c) => c.geometry.dispose()), [ceilings]);

  if (!show || wallMode !== "full") return null;
  return (
    <group position={[0, WALL_HEIGHT, 0]}>
      {ceilings.map((c) => (
        <mesh key={c.id} geometry={c.geometry} material={mat} receiveShadow />
      ))}
    </group>
  );
}
