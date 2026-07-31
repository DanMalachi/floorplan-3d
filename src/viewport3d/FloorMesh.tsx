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

/** A flat vertical quad from (ax,ay)-(bx,by) in plan, spanning y0 to y1 —
 *  the riser panel that closes the gap above a shorter room's ceiling where
 *  a taller neighbor's shared wall would otherwise leave it open. */
function buildRiserGeometry(ax: number, ay: number, bx: number, by: number, y0: number, y1: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array([
    ax, y0, ay,
    bx, y0, by,
    bx, y1, by,

    ax, y0, ay,
    bx, y1, by,
    ax, y1, ay,
  ]);
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

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

/** Per-room ceiling planes. Reuses the floor triangulation, each lifted to that
 *  room's own ceiling height — the max wall height among walls unique to that
 *  room's perimeter (shared/partition walls don't count, see below). Shown
 *  only in Full wall-mode (and via the Ceilings toggle) so Cutaway/Top can
 *  always see in. Rooms bounded by any rail (balconies) are open to the sky
 *  and get no ceiling. */
export function Ceilings({ scene }: { scene: Scene }) {
  const wallMode = useSceneStore((s) => s.wallMode);
  const show = useSceneStore((s) => s.showCeilings);

  const ceilingsAndRisers = useMemo(() => {
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
    // How many rooms' loops reference each wall — 1 means it's that room's own
    // perimeter, 2 means it's a partition shared with a neighbor. A shared
    // wall shouldn't drag a shorter neighbor's ceiling up just because they
    // touch; it stands exposed above that neighbor's lower ceiling instead.
    const roomsPerWall = new Map<string, number>();
    for (const room of scene.rooms) {
      for (let i = 0; i < room.loop.length; i++) {
        const wall = wallByEdge.get([room.loop[i], room.loop[(i + 1) % room.loop.length]].sort().join("|"));
        if (!wall) continue;
        roomsPerWall.set(wall.id, (roomsPerWall.get(wall.id) ?? 0) + 1);
      }
    }
    const out: { id: string; geometry: THREE.BufferGeometry; height: number }[] = [];
    const risers: { id: string; geometry: THREE.BufferGeometry }[] = [];
    for (const room of scene.rooms) {
      const loop = room.loop
        .map((id) => nodes.get(id))
        .filter((n): n is NonNullable<typeof n> => n != null);
      if (loop.length < 3) continue;
      const open = room.loop.some((id, i) =>
        railEdges.has([id, room.loop[(i + 1) % room.loop.length]].sort().join("|")),
      );
      if (open) continue; // balcony / open-air room — no ceiling
      // Ceiling sits at the tallest wall this room actually OWNS — its
      // perimeter, walls no other room's loop touches. Shared/partition walls
      // are excluded from this max so a tall shared wall can't pull a shorter
      // room's ceiling up to match. Falls back to every bounding wall (old
      // behavior) only if a room has no perimeter wall of its own at all
      // (fully interior, boxed in by neighbors on every side).
      let perimeterHeight: number | null = null;
      let anyHeight: number | null = null;
      for (let i = 0; i < room.loop.length; i++) {
        const wall = wallByEdge.get([room.loop[i], room.loop[(i + 1) % room.loop.length]].sort().join("|"));
        if (!wall) continue;
        const h = wall.height ?? WALL_HEIGHT;
        anyHeight = anyHeight == null ? h : Math.max(anyHeight, h);
        if (roomsPerWall.get(wall.id) === 1) {
          perimeterHeight = perimeterHeight == null ? h : Math.max(perimeterHeight, h);
        }
      }
      const height = perimeterHeight ?? anyHeight ?? WALL_HEIGHT;
      out.push({ id: room.id, geometry: buildFloorGeometry(loop), height });

      // A bounding wall taller than THIS room's own ceiling (a neighbor's
      // shared wall, excluded from the max above) would otherwise leave the
      // airspace above this room open from its ceiling up to that wall's
      // real height. Seal it with a vertical riser panel spanning exactly
      // that gap, along that wall's own line.
      for (let i = 0; i < room.loop.length; i++) {
        const a = nodes.get(room.loop[i]);
        const b = nodes.get(room.loop[(i + 1) % room.loop.length]);
        if (!a || !b) continue;
        const wall = wallByEdge.get([room.loop[i], room.loop[(i + 1) % room.loop.length]].sort().join("|"));
        if (!wall) continue;
        const wallH = wall.height ?? WALL_HEIGHT;
        if (wallH <= height) continue;
        risers.push({ id: `${room.id}:${wall.id}`, geometry: buildRiserGeometry(a.x, a.y, b.x, b.y, height, wallH) });
      }
    }
    return { out, risers };
  }, [scene]);
  const { out: ceilings, risers } = ceilingsAndRisers;

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
  // Same neutral wall tone as WallMesh's WALL_COLOR — a riser reads as the
  // wall continuing upward to seal the gap, not as another ceiling patch.
  const riserMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#d8d2c4",
        roughness: 0.95,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    [],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => () => riserMat.dispose(), [riserMat]);
  useEffect(() => () => ceilings.forEach((c) => c.geometry.dispose()), [ceilings]);
  useEffect(() => () => risers.forEach((r) => r.geometry.dispose()), [risers]);

  if (!show || wallMode !== "full") return null;
  return (
    <group>
      {ceilings.map((c) => (
        <mesh key={c.id} position={[0, c.height, 0]} geometry={c.geometry} material={mat} receiveShadow />
      ))}
      {risers.map((r) => (
        <mesh key={r.id} geometry={r.geometry} material={riserMat} receiveShadow />
      ))}
    </group>
  );
}
