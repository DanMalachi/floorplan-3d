"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { Node, Opening, Scene, Wall } from "@/schema/scene";
import { WALL_HEIGHT } from "@/schema/constants";
import {
  useSceneStore,
  type DimLabel,
  type PickRef,
  type SnapGuide,
} from "@/store/useSceneStore";
import {
  buildWallSegments,
  buildOpeningVolumes,
  type OpeningVolume,
  type WallPiece,
} from "./geometry/buildWallSegments";
import { snapDelta, snapPlanPoint } from "./snap";

// Apple-blue accent shared by all 3D selection feedback.
export const ACCENT = "#0a84ff";
const WALL_COLOR = "#d8d2c4";

const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/** Where the pointer ray hits the floor, in PLAN coordinates. */
function rayToPlan(
  e: ThreeEvent<PointerEvent>,
  offset: { cx: number; cz: number },
): { x: number; y: number } | null {
  const hit = new THREE.Vector3();
  if (!e.ray.intersectPlane(FLOOR_PLANE, hit)) return null;
  return { x: hit.x + offset.cx, y: hit.z + offset.cz };
}

const isPick = (p: PickRef | null, kind: PickRef["kind"], id: string) =>
  p !== null && p.kind === kind && p.id === id;

const fmt = (m: number) => `${m.toFixed(2)} m`;

/** Lengths of every wall touching the given nodes — the live dimension readout. */
function wallLengthLabels(scene: Scene, nodeIds: Set<string>): DimLabel[] {
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  const labels: DimLabel[] = [];
  for (const w of scene.walls) {
    if (!nodeIds.has(w.a) && !nodeIds.has(w.b)) continue;
    const a = nodes.get(w.a);
    const b = nodes.get(w.b);
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    labels.push({
      world: [(a.x + b.x) / 2, (w.height ?? WALL_HEIGHT) + 0.25, (a.y + b.y) / 2],
      text: fmt(len),
    });
  }
  return labels;
}

interface DragState {
  pointerId: number;
  start: { x: number; y: number }; // plan coords at gesture start
  base: Scene;
}

function WallGroup({ wall, a, b, ops, offset }: {
  wall: Wall;
  a: Node;
  b: Node;
  ops: Opening[];
  offset: { cx: number; cz: number };
}) {
  const hovered = useSceneStore((s) => isPick(s.hover3d, "wall", wall.id));
  const selected = useSceneStore((s) => isPick(s.sel3d, "wall", wall.id));
  const drag = useRef<DragState | null>(null);

  const { pieces, volumes, mid, len, dir, normal } = useMemo(() => {
    const nodes = new Map<string, Node>([[a.id, a], [b.id, b]]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy) || 1;
    return {
      pieces: buildWallSegments(wall, ops, nodes),
      volumes: buildOpeningVolumes(wall, ops, nodes),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      len: Math.hypot(dx, dy),
      dir: { x: dx / L, y: dy / L },
      normal: { x: -dy / L, y: dx / L },
    };
  }, [wall, ops, a, b]);

  const glow = selected ? 0.5 : hovered ? 0.22 : 0;

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const s = useSceneStore.getState();
    s.setSel3d({ kind: "wall", id: wall.id });
    const start = rayToPlan(e, offset);
    if (!start) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { pointerId: e.pointerId, start, base: s.scene };
    s.beginGesture();
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    e.stopPropagation();
    const cur = rayToPlan(e, offset);
    if (!cur) return;
    // Translate the whole wall along its plan normal.
    let dist =
      (cur.x - d.start.x) * normal.x + (cur.y - d.start.y) * normal.y;
    if (!e.shiftKey) dist = snapDelta(dist);
    const moved = new Set([wall.a, wall.b]);
    const nodes = d.base.nodes.map((n) =>
      moved.has(n.id)
        ? { ...n, x: n.x + normal.x * dist, y: n.y + normal.y * dist }
        : n,
    );
    const next: Scene = { ...d.base, nodes };
    const labels = wallLengthLabels(next, moved);
    labels.push({
      world: [mid.x + normal.x * dist, (wall.height ?? WALL_HEIGHT) + 0.6, mid.y + normal.y * dist],
      text: `Δ ${fmt(Math.abs(dist))}`,
    });
    useSceneStore.getState().updateGesture(next, { guides: [], labels });
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    e.stopPropagation();
    (e.target as Element).releasePointerCapture(e.pointerId);
    drag.current = null;
    useSceneStore.getState().endGesture("Move wall");
  };

  const hoverHandlers = {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      useSceneStore.getState().setHover3d({ kind: "wall", id: wall.id });
    },
    onPointerOut: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const cur = useSceneStore.getState().hover3d;
      if (isPick(cur, "wall", wall.id)) useSceneStore.getState().setHover3d(null);
    },
  };

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
          {...hoverHandlers}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
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
      {selected && (
        <>
          <CornerHandle nodeId={wall.a} x={a.x} y={a.y} offset={offset} />
          <CornerHandle nodeId={wall.b} x={b.x} y={b.y} offset={offset} />
          <Html
            position={[mid.x, (wall.height ?? WALL_HEIGHT) + 0.25, mid.y]}
            center
            style={{ pointerEvents: "none" }}
          >
            <div style={dimLabelStyle}>{fmt(len)}</div>
          </Html>
        </>
      )}
    </group>
  );
}

/** Draggable endpoint of a selected wall. Moving it reshapes every wall
 *  sharing the node — connected corners stay connected, Sims-style. */
function CornerHandle({ nodeId, x, y, offset }: {
  nodeId: string;
  x: number;
  y: number;
  offset: { cx: number; cz: number };
}) {
  const drag = useRef<DragState | null>(null);

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const s = useSceneStore.getState();
    const start = rayToPlan(e, offset);
    if (!start) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { pointerId: e.pointerId, start, base: s.scene };
    s.beginGesture();
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    e.stopPropagation();
    const cur = rayToPlan(e, offset);
    if (!cur) return;
    let nx = cur.x;
    let ny = cur.y;
    let guides: SnapGuide[] = [];
    if (!e.shiftKey) {
      const snapped = snapPlanPoint(nx, ny, d.base.nodes, new Set([nodeId]));
      nx = snapped.x;
      ny = snapped.y;
      guides = snapped.guides;
    }
    const nodes = d.base.nodes.map((n) => (n.id === nodeId ? { ...n, x: nx, y: ny } : n));
    const next: Scene = { ...d.base, nodes };
    useSceneStore
      .getState()
      .updateGesture(next, { guides, labels: wallLengthLabels(next, new Set([nodeId])) });
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    e.stopPropagation();
    (e.target as Element).releasePointerCapture(e.pointerId);
    drag.current = null;
    useSceneStore.getState().endGesture("Move corner");
  };

  return (
    <mesh
      position={[x, 0.06, y]}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerOver={(e) => e.stopPropagation()}
    >
      <sphereGeometry args={[0.14, 20, 16]} />
      <meshStandardMaterial color="#ffffff" emissive={ACCENT} emissiveIntensity={0.6} />
    </mesh>
  );
}

/** Invisible-until-noticed glass box filling a door/window gap. */
function OpeningPick({ vol }: { vol: OpeningVolume }) {
  const hovered = useSceneStore((s) => isPick(s.hover3d, "opening", vol.openingId));
  const selected = useSceneStore((s) => isPick(s.sel3d, "opening", vol.openingId));
  const opacity = selected ? 0.45 : hovered ? 0.25 : 0.04;

  return (
    <mesh
      position={vol.position}
      rotation={[0, vol.rotationY, 0]}
      userData={{ pick: { kind: "opening", id: vol.openingId } }}
      onPointerOver={(e) => {
        e.stopPropagation();
        useSceneStore.getState().setHover3d({ kind: "opening", id: vol.openingId });
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        const cur = useSceneStore.getState().hover3d;
        if (isPick(cur, "opening", vol.openingId)) useSceneStore.getState().setHover3d(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        useSceneStore.getState().setSel3d({ kind: "opening", id: vol.openingId });
      }}
      onPointerDown={(e) => e.stopPropagation()}
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

export const dimLabelStyle: React.CSSProperties = {
  padding: "2px 7px",
  borderRadius: 6,
  background: "rgba(20,20,24,0.8)",
  color: "#e8f1ff",
  fontSize: 12,
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
};

export function Walls({ scene, offset }: {
  scene: Scene;
  offset: { cx: number; cz: number };
}) {
  // Openings grouped once per openings-array identity — node drags don't
  // touch it, so per-wall `ops` arrays stay referentially stable mid-gesture.
  const byWall = useMemo(() => {
    const m = new Map<string, Opening[]>();
    for (const o of scene.openings) {
      const arr = m.get(o.wallId) ?? [];
      arr.push(o);
      m.set(o.wallId, arr);
    }
    return m;
  }, [scene.openings]);

  const nodes = useMemo(
    () => new Map(scene.nodes.map((n) => [n.id, n])),
    [scene.nodes],
  );
  const EMPTY: Opening[] = useMemo(() => [], []);

  return (
    <group>
      {scene.walls.map((wall) => {
        const a = nodes.get(wall.a);
        const b = nodes.get(wall.b);
        if (!a || !b) return null;
        return (
          <WallGroup
            key={wall.id}
            wall={wall}
            a={a}
            b={b}
            ops={byWall.get(wall.id) ?? EMPTY}
            offset={offset}
          />
        );
      })}
    </group>
  );
}
