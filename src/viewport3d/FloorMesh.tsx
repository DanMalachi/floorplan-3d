"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { Scene, FloorStyle } from "@/schema/scene";
import { useSceneStore } from "@/store/useSceneStore";
import { WALL_HEIGHT } from "@/schema/constants";
import { buildFloorGeometry } from "./geometry/triangulateFloor";
import { floorTexture, floorRoughness } from "./textures";
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
  const mat = useMemo(() => {
    const tex = floorTexture(style);
    return new THREE.MeshStandardMaterial({
      map: tex.map,
      normalMap: tex.normalMap,
      normalScale: new THREE.Vector2(0.6, 0.6),
      // Catalog materials ship a roughness map; procedural styles leave it
      // undefined and rely on the scalar alone.
      roughnessMap: tex.roughnessMap,
      roughness: floorRoughness(style),
      metalness: 0,
      emissive: new THREE.Color(ACCENT),
      emissiveIntensity: 0,
      side: THREE.DoubleSide,
    });
  }, [style]);
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
        const paintable = s.appMode === "furnish" && s.brush?.kind === "floor";
        if (!((s.appMode === "build" && !s.placing) || paintable)) return;
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
        // Floor brush (Decorate mode): click sets this room's floor material.
        if (s.appMode === "furnish" && s.brush?.kind === "floor") {
          e.stopPropagation();
          const next = s.brush.style;
          if (style !== next) {
            s.commitScene("Floor material", {
              ...s.scene,
              rooms: s.scene.rooms.map((r) => (r.id === roomId ? { ...r, floor: next } : r)),
            });
          }
          return;
        }
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
    // RAILS only — deliberately not every non-solid kind. A rail means open to
    // the SKY, so the room loses its ceiling. A portal means open to the next
    // ROOM, and the ceiling runs straight over it. Do not merge these.
    const railEdges = new Set(
      scene.walls
        .filter((w) => w.kind === "rail")
        .map((w) => [w.a, w.b].sort().join("|")),
    );
    // Every wall by its node-pair edge, to look up each bounding wall's own
    // (possibly customized) height — same lookup shape as WallMesh's per-wall
    // height resolution, just keyed for room-loop traversal.
    const wallByEdge = new Map(
      scene.walls.map((w) => [[w.a, w.b].sort().join("|"), w]),
    );
    const out: { id: string; geometry: THREE.BufferGeometry; height: number }[] = [];
    for (const room of scene.rooms) {
      const loop = room.loop
        .map((id) => nodes.get(id))
        .filter((n): n is NonNullable<typeof n> => n != null);
      if (loop.length < 3) continue;
      const open = room.loop.some((id, i) =>
        railEdges.has([id, room.loop[(i + 1) % room.loop.length]].sort().join("|")),
      );
      if (open) continue; // balcony / open-air room — no ceiling
      // Ceiling sits at the tallest bounding wall — a shorter wall (partition/
      // half-wall) is a valid partial-height wall, open above up to this line.
      // Only edges that resolve to a wall record count toward the max, so a
      // missing lookup can't silently drag the ceiling down to the default.
      let height: number | null = null;
      for (let i = 0; i < room.loop.length; i++) {
        const wall = wallByEdge.get([room.loop[i], room.loop[(i + 1) % room.loop.length]].sort().join("|"));
        if (!wall) continue;
        const h = wall.height ?? WALL_HEIGHT;
        height = height == null ? h : Math.max(height, h);
      }
      out.push({ id: room.id, geometry: buildFloorGeometry(loop), height: height ?? WALL_HEIGHT });
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
    <group>
      {ceilings.map((c) => (
        <mesh key={c.id} position={[0, c.height, 0]} geometry={c.geometry} material={mat} receiveShadow />
      ))}
    </group>
  );
}
