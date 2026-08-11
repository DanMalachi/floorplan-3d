"use client";

// Kitchen v2 direct-manipulation resize, path-aware (v2.1): a selected
// kitchen run grows arrow handles at the two FREE ENDS of its path — leg 0's
// start and the last leg's end. Dragging an end lengthens/shortens that leg
// in 10cm steps while everything else (corners included) stays planted. The
// store's gesture hook keeps the run glued to its wall and carries attached
// sinks/cooktops while it resizes.

import { useRef, useState } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { FurnitureItem } from "@/schema/scene";
import { useSceneStore } from "@/store/useSceneStore";
import { GENERATORS } from "@/parametric";
import { isKitchenRun } from "./kitchenAttach";
import { pathLegs, runLocalToWorld, type RunLeg } from "./runPath";
import { ACCENT } from "@/viewport3d/WallMesh";

const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const STEP = 0.1;

function rayToPlan(e: ThreeEvent<PointerEvent>, offset: { cx: number; cz: number }) {
  const hit = new THREE.Vector3();
  if (!e.ray.intersectPlane(FLOOR_PLANE, hit)) return null;
  return { x: hit.x + offset.cx, y: hit.z + offset.cz };
}

/** A leg's local direction in plan-world terms. */
function worldDir(item: FurnitureItem, leg: RunLeg): { x: number; y: number } {
  const c = Math.cos(item.rotation);
  const s = Math.sin(item.rotation);
  return { x: leg.dx * c - leg.dz * s, y: leg.dx * s + leg.dz * c };
}

function EndHandle({ item, end, offset }: {
  item: FurnitureItem;
  end: 1 | -1; // -1 = path start (leg 0), +1 = path end (last leg)
  offset: { cx: number; cz: number };
}) {
  const spec = item.parametric!;
  const g = GENERATORS[spec.generator];
  const [hovered, setHovered] = useState(false);
  const drag = useRef<{ pointerId: number } | null>(null);

  const d = spec.dims.d;
  const legs = pathLegs(spec);
  const leg = end === -1 ? legs[0] : legs[legs.length - 1];
  const isLast = end === 1 && legs.length > 1;
  const dirW = worldDir(item, leg);
  // Pointing direction: out of this end of the path.
  const point = end === -1 ? { x: -dirW.x, y: -dirW.y } : dirW;

  const endLocal =
    end === -1
      ? { x: leg.sx, z: leg.sz }
      : { x: leg.sx + leg.dx * leg.len, z: leg.sz + leg.dz * leg.len };
  const gripLocal = {
    x: endLocal.x + leg.fx * (d / 2) + (end === -1 ? -leg.dx : leg.dx) * 0.09,
    z: endLocal.z + leg.fz * (d / 2) + (end === -1 ? -leg.dz : leg.dz) * 0.09,
  };
  const grip = runLocalToWorld(item, gripLocal);
  const handleY =
    spec.generator === "kitchenWall"
      ? (item.elevation ?? g.defaultElevation ?? 0) + spec.dims.h / 2
      : spec.dims.h + 0.06;

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { pointerId: e.pointerId };
    useSceneStore.getState().beginGesture();
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const dr = drag.current;
    if (!dr || e.pointerId !== dr.pointerId) return;
    e.stopPropagation();
    const p = rayToPlan(e, offset);
    if (!p) return;
    const s = useSceneStore.getState();
    const [lo, hi] = g.dimLimits.w;
    let patch: Partial<FurnitureItem>;
    let label: number;

    if (isLast) {
      // Grow/shrink the LAST leg from its corner; nothing else moves.
      const cW = runLocalToWorld(item, { x: leg.sx, z: leg.sz });
      const u = (p.x - cW.x) * dirW.x + (p.y - cW.y) * dirW.y;
      const w = THREE.MathUtils.clamp(Math.round((u - d) / STEP) * STEP, 0.1, hi);
      const extras = spec.extraLegs!.map((l, i) =>
        i === spec.extraLegs!.length - 1 ? { ...l, w } : l,
      );
      patch = { parametric: { ...spec, extraLegs: extras } };
      label = w;
    } else if (end === -1) {
      // Leg 0's start moves; its END (and every later leg) stays planted.
      const fixedW = runLocalToWorld(item, {
        x: legs[0].sx + legs[0].dx * legs[0].len,
        z: legs[0].sz + legs[0].dz * legs[0].len,
      });
      const raw = (fixedW.x - p.x) * dirW.x + (fixedW.y - p.y) * dirW.y;
      const w = THREE.MathUtils.clamp(Math.round(raw / STEP) * STEP, lo, hi);
      patch = {
        x: fixedW.x - dirW.x * (w / 2),
        y: fixedW.y - dirW.y * (w / 2),
        parametric: { ...spec, dims: { ...spec.dims, w } },
      };
      label = w;
    } else {
      // Straight run's far end; the start stays planted.
      const fixedW = runLocalToWorld(item, { x: legs[0].sx, z: legs[0].sz });
      const raw = (p.x - fixedW.x) * dirW.x + (p.y - fixedW.y) * dirW.y;
      const w = THREE.MathUtils.clamp(Math.round(raw / STEP) * STEP, lo, hi);
      patch = {
        x: fixedW.x + dirW.x * (w / 2),
        y: fixedW.y + dirW.y * (w / 2),
        parametric: { ...spec, dims: { ...spec.dims, w } },
      };
      label = w;
    }

    const next = {
      ...s.scene,
      furniture: s.scene.furniture.map((f) => (f.id === item.id ? { ...f, ...patch } : f)),
    };
    s.updateGesture(next, {
      guides: [],
      labels: [{ world: [grip.x, handleY + 0.12, grip.y], text: `${Math.round(label * 100)} cm` }],
    });
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    const dr = drag.current;
    if (!dr || e.pointerId !== dr.pointerId) return;
    e.stopPropagation();
    (e.target as Element).releasePointerCapture(e.pointerId);
    drag.current = null;
    useSceneStore.getState().endGesture("Resize kitchen run");
  };

  return (
    <group position={[grip.x, handleY, grip.y]} rotation={[0, Math.atan2(-point.y, point.x), 0]}>
      {/* Arrow cone pointing out of this end. */}
      <mesh rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.045, 0.11, 12]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={hovered ? 1 : 0.75} depthTest={false} />
      </mesh>
      {/* Fat invisible hit target — the cone alone is a sniper shot. */}
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          // Registers as hover so the camera locks BEFORE the press (same
          // hover-gate the furniture layers use).
          useSceneStore.getState().setHover3d({ kind: "furniture", id: item.id });
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          const cur = useSceneStore.getState().hover3d;
          if (cur?.kind === "furniture" && cur.id === item.id) useSceneStore.getState().setHover3d(null);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <sphereGeometry args={[0.14, 12, 10]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Mounts the two path-end handles for the selected kitchen run (Furnish mode). */
export function RunHandles({ offset }: { offset: { cx: number; cz: number } }) {
  const appMode = useSceneStore((s) => s.appMode);
  const sel3d = useSceneStore((s) => s.sel3d);
  const scene = useSceneStore((s) => s.scene);
  if (appMode !== "furnish" || sel3d?.kind !== "furniture") return null;
  const item = scene.furniture.find((f) => f.id === sel3d.id);
  if (!item || !isKitchenRun(item)) return null;
  return (
    <group>
      <EndHandle key={`${item.id}-`} item={item} end={-1} offset={offset} />
      <EndHandle key={`${item.id}+`} item={item} end={1} offset={offset} />
    </group>
  );
}
