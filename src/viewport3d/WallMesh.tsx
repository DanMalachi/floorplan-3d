"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import type { Node, Opening, Scene, Wall } from "@/schema/scene";
import { WALL_HEIGHT, DEFAULT_THICKNESS, RAIL_HEIGHT } from "@/schema/constants";
import {
  useSceneStore,
  type DimLabel,
  type PickRef,
} from "@/store/useSceneStore";
import {
  buildWallSegments,
  buildOpeningVolumes,
  type OpeningVolume,
} from "./geometry/buildWallSegments";
import { GRID, openingEdgeBounds, snapDelta, snapPlanPoint } from "./snap";

// Apple-blue accent shared by all 3D selection feedback.
export const ACCENT = "#0a84ff";
const WALL_COLOR = "#d8d2c4";
const MIN_OPENING_WIDTH = 0.4;

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
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Lengths of every wall touching the given nodes - the live dimension readout. */
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

/** The wall's local frame - everything opening gestures need. */
interface WallFrame {
  ax: number;
  ay: number;
  ux: number;
  uy: number;
  L: number;
  wallH: number;
  th: number;
  rotationY: number;
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
  const selSide = useSceneStore((s) =>
    isPick(s.sel3d, "wall", wall.id) ? s.sel3d!.side ?? "a" : null,
  );
  const wallMode = useSceneStore((s) => s.wallMode);
  const drag = useRef<DragState | null>(null);

  const { pieces, volumes, mid, len, normal, frame } = useMemo(() => {
    const nodes = new Map<string, Node>([[a.id, a], [b.id, b]]);
    // Sims top-down view: walls drop to knee-high stubs.
    const eff = wallMode === "top" ? { ...wall, height: 0.32 } : wall;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L;
    const uy = dy / L;
    return {
      pieces: buildWallSegments(eff, ops, nodes),
      volumes: buildOpeningVolumes(eff, ops, nodes),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      len: Math.hypot(dx, dy),
      normal: { x: -uy, y: ux },
      frame: {
        ax: a.x, ay: a.y, ux, uy,
        L: Math.hypot(dx, dy),
        wallH: eff.height ?? WALL_HEIGHT,
        th: wall.thickness ?? DEFAULT_THICKNESS,
        rotationY: -Math.atan2(uy, ux),
      } satisfies WallFrame,
    };
  }, [wall, ops, a, b, wallMode]);

  // Three materials per wall, indexed onto the box faces so each long face can
  // take its own Tambour colour: `neutral` covers the ends/top/bottom, `matA`
  // the wall-local +Z face (side A), `matB` the -Z face (side B). Selection
  // glow, cutaway fade and paint mutate these directly instead of re-rendering.
  const [neutral, matA, matB] = useMemo(() => {
    const mk = () =>
      new THREE.MeshStandardMaterial({
        color: WALL_COLOR,
        emissive: new THREE.Color(ACCENT),
        emissiveIntensity: 0,
        transparent: true,
        opacity: 1,
        roughness: 0.85, // matte painted plaster
        metalness: 0,
        envMapIntensity: 0.45,
      });
    return [mk(), mk(), mk()] as const;
  }, []);
  useEffect(
    () => () => {
      neutral.dispose();
      matA.dispose();
      matB.dispose();
    },
    [neutral, matA, matB],
  );
  // BoxGeometry face→material order is [+X,-X,+Y,-Y,+Z,-Z]; side A = +Z, B = -Z.
  const mats = useMemo(
    () => [neutral, neutral, neutral, neutral, matA, matB],
    [neutral, matA, matB],
  );
  useEffect(() => {
    matA.color.set(wall.paintA ?? WALL_COLOR);
  }, [matA, wall.paintA]);
  useEffect(() => {
    matB.color.set(wall.paintB ?? WALL_COLOR);
  }, [matB, wall.paintB]);
  // Selection feedback stays light on the painted faces so their true Tambour
  // colour reads: the neutral edges carry most of the accent, the targeted face
  // gets only a gentle lift, and untargeted painted faces stay near-accurate.
  useEffect(() => {
    neutral.emissiveIntensity = selected ? 0.12 : hovered ? 0.1 : 0;
    const face = (isTarget: boolean) =>
      selected ? (isTarget ? 0.14 : 0.03) : hovered ? 0.06 : 0;
    matA.emissiveIntensity = face(selSide === "a");
    matB.emissiveIntensity = face(selSide === "b");
  }, [neutral, matA, matB, selected, hovered, selSide]);

  // Cutaway: fade walls on the camera's side of the model so the interior
  // reads. Smoothly damped per frame; no React re-renders involved.
  useFrame((state, dt) => {
    let target = 1;
    if (wallMode === "cutaway") {
      const camX = state.camera.position.x;
      const camZ = state.camera.position.z;
      const wx = mid.x - offset.cx;
      const wz = mid.y - offset.cz;
      const wl = Math.hypot(wx, wz);
      const cl = Math.hypot(camX, camZ);
      if (wl > 1e-3 && cl > 1e-3 && (wx * camX + wz * camZ) / (wl * cl) > 0.25) {
        target = 0.13;
      }
    }
    if (Math.abs(neutral.opacity - target) > 1e-3) {
      const o = THREE.MathUtils.damp(neutral.opacity, target, 10, dt);
      const dw = o > 0.55;
      for (const m of [neutral, matA, matB]) {
        m.opacity = o;
        m.depthWrite = dw;
      }
    }
  });

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    const s = useSceneStore.getState();
    if (s.appMode !== "build" || s.placing) return; // walls edit in Build only
    e.stopPropagation();
    // Which face did the pointer land on? The long faces carry a local ±Z
    // normal; end caps / top pick up (or keep) side A. This is what makes
    // "click the face you want to paint" work.
    const n = e.face?.normal;
    let side: "a" | "b" | undefined;
    if (n && Math.abs(n.z) > 0.5) side = n.z > 0 ? "a" : "b";
    else if (s.sel3d?.kind === "wall" && s.sel3d.id === wall.id) side = s.sel3d.side;
    s.setSel3d({ kind: "wall", id: wall.id, side: side ?? "a" });
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
      world: [mid.x + normal.x * dist, frame.wallH + 0.6, mid.y + normal.y * dist],
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
      const s = useSceneStore.getState();
      if (s.appMode !== "build" || s.placing) return;
      e.stopPropagation();
      s.setHover3d({ kind: "wall", id: wall.id });
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
          material={mats}
          {...hoverHandlers}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <boxGeometry args={p.size} />
        </mesh>
      ))}
      {volumes.map((v) => {
        const op = ops.find((o) => o.id === v.openingId);
        return op ? (
          <OpeningPick
            key={v.openingId}
            vol={v}
            opening={op}
            siblings={ops}
            frame={frame}
            offset={offset}
          />
        ) : null;
      })}
      {selected && (
        <>
          <CornerHandle nodeId={wall.a} x={a.x} y={a.y} offset={offset} />
          <CornerHandle nodeId={wall.b} x={b.x} y={b.y} offset={offset} />
          <Html
            position={[mid.x, frame.wallH + 0.25, mid.y]}
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
 *  sharing the node - connected corners stay connected, Sims-style. */
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
    let guides: ReturnType<typeof snapPlanPoint>["guides"] = [];
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

// --- Openings ---------------------------------------------------------------

interface OpeningDrag extends DragState {
  /** cursor's wall-coordinate minus the opening center at grab time */
  grabDelta: number;
  lo: number; // allowed center range (slide) or edge range (resize)
  hi: number;
}

/** s-coordinate (meters along the wall from node a) of a plan point. */
const toWallS = (p: { x: number; y: number }, f: WallFrame) =>
  (p.x - f.ax) * f.ux + (p.y - f.ay) * f.uy;

function openingLabels(op: Opening, f: WallFrame): DimLabel[] {
  const cx = f.ax + f.ux * op.offset;
  const cy = f.ay + f.uy * op.offset;
  const left = op.offset - op.width / 2;
  const right = f.L - (op.offset + op.width / 2);
  return [
    {
      world: [cx, op.sill + op.height + 0.35, cy],
      text: `${fmt(op.width)} · ←${left.toFixed(2)} · ${right.toFixed(2)}→`,
    },
  ];
}

/** A door/window gap: glass volume that slides along its wall; edge handles
 *  resize it. Windows read as faint glass even when idle. */
function OpeningPick({ vol, opening, siblings, frame, offset }: {
  vol: OpeningVolume;
  opening: Opening;
  siblings: Opening[];
  frame: WallFrame;
  offset: { cx: number; cz: number };
}) {
  const hovered = useSceneStore((s) => isPick(s.hover3d, "opening", opening.id));
  const selected = useSceneStore((s) => isPick(s.sel3d, "opening", opening.id));
  const drag = useRef<OpeningDrag | null>(null);

  const idle = opening.type === "window" ? 0.16 : 0.035;
  const opacity = selected ? 0.45 : hovered ? 0.25 : idle;

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    const s = useSceneStore.getState();
    if (s.appMode !== "build" || s.placing) return; // openings edit in Build only
    e.stopPropagation();
    s.setSel3d({ kind: "opening", id: opening.id });
    const start = rayToPlan(e, offset);
    if (!start) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const { lo, hi } = openingEdgeBounds(opening, siblings, frame.L);
    drag.current = {
      pointerId: e.pointerId,
      start,
      base: s.scene,
      grabDelta: toWallS(start, frame) - opening.offset,
      lo: lo + opening.width / 2, // center bounds
      hi: hi - opening.width / 2,
    };
    s.beginGesture();
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    e.stopPropagation();
    if (d.hi < d.lo) return; // no room on this wall
    const cur = rayToPlan(e, offset);
    if (!cur) return;
    let want = toWallS(cur, frame) - d.grabDelta;
    if (!e.shiftKey) want = Math.round(want / GRID) * GRID;
    const off = clamp(want, d.lo, d.hi);
    const openings = d.base.openings.map((o) =>
      o.id === opening.id ? { ...o, offset: off } : o,
    );
    const next: Scene = { ...d.base, openings };
    useSceneStore.getState().updateGesture(next, {
      guides: [],
      labels: openingLabels({ ...opening, offset: off }, frame),
    });
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    e.stopPropagation();
    (e.target as Element).releasePointerCapture(e.pointerId);
    drag.current = null;
    useSceneStore.getState().endGesture("Move opening");
  };

  return (
    <>
      <mesh
        position={vol.position}
        rotation={[0, vol.rotationY, 0]}
        userData={{ pick: { kind: "opening", id: opening.id } }}
        onPointerOver={(e) => {
          const s = useSceneStore.getState();
          if (s.appMode !== "build" || s.placing) return;
          e.stopPropagation();
          s.setHover3d({ kind: "opening", id: opening.id });
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          const cur = useSceneStore.getState().hover3d;
          if (isPick(cur, "opening", opening.id)) useSceneStore.getState().setHover3d(null);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <boxGeometry args={vol.size} />
        <meshStandardMaterial
          color={ACCENT}
          transparent
          opacity={opacity}
          depthWrite={false}
          roughness={0.12}
          metalness={0}
          envMapIntensity={1.2}
        />
      </mesh>
      {selected && (
        <>
          <EdgeHandle edge="start" opening={opening} siblings={siblings} frame={frame} offset={offset} />
          <EdgeHandle edge="end" opening={opening} siblings={siblings} frame={frame} offset={offset} />
          <Html
            position={[
              frame.ax + frame.ux * opening.offset,
              opening.sill + opening.height + 0.35,
              frame.ay + frame.uy * opening.offset,
            ]}
            center
            style={{ pointerEvents: "none" }}
          >
            <div style={dimLabelStyle}>
              {opening.type} · {fmt(opening.width)}
            </div>
          </Html>
        </>
      )}
    </>
  );
}

/** Vertical pill at one side of a selected opening - drag to resize width. */
function EdgeHandle({ edge, opening, siblings, frame, offset }: {
  edge: "start" | "end";
  opening: Opening;
  siblings: Opening[];
  frame: WallFrame;
  offset: { cx: number; cz: number };
}) {
  const drag = useRef<OpeningDrag | null>(null);
  const sEdge =
    edge === "start" ? opening.offset - opening.width / 2 : opening.offset + opening.width / 2;
  const px = frame.ax + frame.ux * sEdge;
  const py = frame.ay + frame.uy * sEdge;
  const midY = opening.sill + opening.height / 2;

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const s = useSceneStore.getState();
    const start = rayToPlan(e, offset);
    if (!start) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const { lo, hi } = openingEdgeBounds(opening, siblings, frame.L);
    drag.current = {
      pointerId: e.pointerId,
      start,
      base: s.scene,
      grabDelta: 0,
      lo: edge === "start" ? lo : opening.offset - opening.width / 2 + MIN_OPENING_WIDTH,
      hi: edge === "start" ? opening.offset + opening.width / 2 - MIN_OPENING_WIDTH : hi,
    };
    s.beginGesture();
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    e.stopPropagation();
    if (d.hi < d.lo) return;
    const cur = rayToPlan(e, offset);
    if (!cur) return;
    let want = toWallS(cur, frame);
    if (!e.shiftKey) want = Math.round(want / GRID) * GRID;
    const sNew = clamp(want, d.lo, d.hi);
    const fixed =
      edge === "start" ? opening.offset + opening.width / 2 : opening.offset - opening.width / 2;
    const startS = Math.min(sNew, fixed);
    const endS = Math.max(sNew, fixed);
    const openings = d.base.openings.map((o) =>
      o.id === opening.id
        ? { ...o, offset: (startS + endS) / 2, width: endS - startS }
        : o,
    );
    const next: Scene = { ...d.base, openings };
    useSceneStore.getState().updateGesture(next, {
      guides: [],
      labels: openingLabels(
        { ...opening, offset: (startS + endS) / 2, width: endS - startS },
        frame,
      ),
    });
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    e.stopPropagation();
    (e.target as Element).releasePointerCapture(e.pointerId);
    drag.current = null;
    useSceneStore.getState().endGesture("Resize opening");
  };

  return (
    <mesh
      position={[px, midY, py]}
      rotation={[0, frame.rotationY, 0]}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerOver={(e) => e.stopPropagation()}
    >
      <boxGeometry args={[0.07, opening.height * 0.7, frame.th * 1.3]} />
      <meshStandardMaterial color="#ffffff" emissive={ACCENT} emissiveIntensity={0.6} />
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

// --- Rails ------------------------------------------------------------------

const RAIL_GLASS = "#bfe9e4"; // faint teal so the barrier reads without blocking
const RAIL_CAP = "#6b7078"; // handrail
const RAIL_CAP_H = 0.06;
const RAIL_CAP_THK = 0.09;
const RAIL_PANEL_THK = 0.035;

/** A rail: a low, see-through barrier (balcony railing / balustrade). Renders as
 *  a glass panel with a solid handrail cap. Stored in scene.walls with
 *  kind="rail", so it selects, moves, and reshapes exactly like a wall. */
function RailGroup({ wall, a, b, offset }: {
  wall: Wall;
  a: Node;
  b: Node;
  offset: { cx: number; cz: number };
}) {
  const hovered = useSceneStore((s) => isPick(s.hover3d, "wall", wall.id));
  const selected = useSceneStore((s) => isPick(s.sel3d, "wall", wall.id));
  const wallMode = useSceneStore((s) => s.wallMode);
  const drag = useRef<DragState | null>(null);

  const { mid, normal, rotationY, len, height } = useMemo(() => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L;
    const uy = dy / L;
    return {
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      normal: { x: -uy, y: ux },
      rotationY: -Math.atan2(uy, ux),
      len: Math.hypot(dx, dy),
      // Rails drop to knee-high stubs in the Sims top-down view, like walls.
      height: wallMode === "top" ? 0.32 : RAIL_HEIGHT,
    };
  }, [a, b, wallMode]);

  const glow = selected ? 0.5 : hovered ? 0.22 : 0;
  const panelH = Math.max(0.01, height - RAIL_CAP_H);

  const [glass, cap] = useMemo(() => {
    const g = new THREE.MeshStandardMaterial({
      color: RAIL_GLASS,
      emissive: new THREE.Color(ACCENT),
      emissiveIntensity: 0,
      transparent: true,
      opacity: 0.22,
      roughness: 0.08,
      metalness: 0,
      envMapIntensity: 1.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const c = new THREE.MeshStandardMaterial({
      color: RAIL_CAP,
      emissive: new THREE.Color(ACCENT),
      emissiveIntensity: 0,
      roughness: 0.4,
      metalness: 0.3,
    });
    return [g, c] as const;
  }, []);
  useEffect(() => () => { glass.dispose(); cap.dispose(); }, [glass, cap]);
  useEffect(() => {
    glass.emissiveIntensity = glow;
    cap.emissiveIntensity = glow;
  }, [glass, cap, glow]);

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    const s = useSceneStore.getState();
    if (s.appMode !== "build" || s.placing) return;
    e.stopPropagation();
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
    let dist = (cur.x - d.start.x) * normal.x + (cur.y - d.start.y) * normal.y;
    if (!e.shiftKey) dist = snapDelta(dist);
    const moved = new Set([wall.a, wall.b]);
    const nodes = d.base.nodes.map((n) =>
      moved.has(n.id) ? { ...n, x: n.x + normal.x * dist, y: n.y + normal.y * dist } : n,
    );
    const next: Scene = { ...d.base, nodes };
    const labels = wallLengthLabels(next, moved);
    labels.push({
      world: [mid.x + normal.x * dist, height + 0.5, mid.y + normal.y * dist],
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
    useSceneStore.getState().endGesture("Move rail");
  };

  const hoverHandlers = {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      const s = useSceneStore.getState();
      if (s.appMode !== "build" || s.placing) return;
      e.stopPropagation();
      s.setHover3d({ kind: "wall", id: wall.id });
    },
    onPointerOut: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const cur = useSceneStore.getState().hover3d;
      if (isPick(cur, "wall", wall.id)) useSceneStore.getState().setHover3d(null);
    },
  };

  const meshProps = {
    position: [mid.x, 0, mid.y] as [number, number, number],
    rotation: [0, rotationY, 0] as [number, number, number],
    userData: { pick: { kind: "wall", id: wall.id } },
    ...hoverHandlers,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };

  return (
    <group>
      {/* glass balustrade panel — no shadow (Three casts opaque shadows for glass) */}
      <mesh {...meshProps} position={[mid.x, panelH / 2, mid.y]} material={glass}>
        <boxGeometry args={[len, panelH, RAIL_PANEL_THK]} />
      </mesh>
      {/* handrail cap */}
      <mesh {...meshProps} position={[mid.x, height - RAIL_CAP_H / 2, mid.y]} material={cap} castShadow>
        <boxGeometry args={[len, RAIL_CAP_H, RAIL_CAP_THK]} />
      </mesh>
      {selected && (
        <>
          <CornerHandle nodeId={wall.a} x={a.x} y={a.y} offset={offset} />
          <CornerHandle nodeId={wall.b} x={b.x} y={b.y} offset={offset} />
          <Html position={[mid.x, height + 0.2, mid.y]} center style={{ pointerEvents: "none" }}>
            <div style={dimLabelStyle}>rail · {fmt(len)}</div>
          </Html>
        </>
      )}
    </group>
  );
}

export function Walls({ scene, offset }: {
  scene: Scene;
  offset: { cx: number; cz: number };
}) {
  // Group openings per wall, PRESERVING array identity for walls whose
  // openings didn't change - so dragging one opening only rebuilds its host
  // wall, and node drags (openings untouched) rebuild nothing here at all.
  const cache = useRef(new Map<string, Opening[]>());
  const byWall = useMemo(() => {
    const fresh = new Map<string, Opening[]>();
    for (const o of scene.openings) {
      const arr = fresh.get(o.wallId) ?? [];
      arr.push(o);
      fresh.set(o.wallId, arr);
    }
    const prev = cache.current;
    for (const [wallId, arr] of fresh) {
      const old = prev.get(wallId);
      if (old && old.length === arr.length && old.every((o, i) => o === arr[i])) {
        fresh.set(wallId, old); // unchanged - keep the old reference
      }
    }
    cache.current = fresh;
    return fresh;
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
        if (wall.kind === "rail") {
          return <RailGroup key={wall.id} wall={wall} a={a} b={b} offset={offset} />;
        }
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
