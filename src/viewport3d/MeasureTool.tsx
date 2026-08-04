"use client";

// Build-mode "Measure" tool: click two points on the floor, read the plan
// distance between them. New, additive Canvas child (mirrors FurnitureLayer's
// PlacementGhost catch-plane pattern) — not a modification to any protected
// wall/collision file. Only mounted while buildTool === "measure".

import { useEffect, useState } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useSceneStore } from "@/store/useSceneStore";
import { PD } from "@/ui/planDock/tokens";

const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function rayToPlan(e: ThreeEvent<PointerEvent | MouseEvent>, offset: { cx: number; cz: number }) {
  const hit = new THREE.Vector3();
  if (!e.ray.intersectPlane(FLOOR_PLANE, hit)) return null;
  return { x: hit.x + offset.cx, y: hit.z + offset.cz };
}

const fmt = (m: number) => (m >= 1 ? `${m.toFixed(2)} m` : `${Math.round(m * 100)} cm`);

type Pt = { x: number; y: number };

export function MeasureTool({ offset }: { offset: { cx: number; cz: number } }) {
  const active = useSceneStore((s) => s.buildTool === "measure" && s.appMode === "build");
  // 0 points: nothing placed yet. 1 point: first click made, `cursor` is the
  // live second point. 2 points: measurement finalized; the next click starts
  // a fresh one from that click.
  const [points, setPoints] = useState<Pt[]>([]);
  const [cursor, setCursor] = useState<Pt | null>(null);

  useEffect(() => {
    if (!active) {
      setPoints([]);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPoints([]);
    };
    // Capture-phase: Viewport's wrapper div handles Escape itself (clearing
    // selection/brush/gesture) and stops it from bubbling, so a bubble-phase
    // listener here never actually ran — this was dead code. Capture always
    // sees the key before that handler gets a chance to stop it.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active]);

  if (!active) return null;

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const p = rayToPlan(e, offset);
    if (p) setCursor(p);
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const p = rayToPlan(e, offset);
    if (!p) return;
    setPoints((prev) => (prev.length >= 2 ? [p] : [...prev, p]));
  };

  const a = points[0] ?? null;
  const b = points[1] ?? (points.length === 1 ? cursor : null);
  const dist = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : null;
  const mid = a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;

  return (
    <>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[offset.cx, 0.002, offset.cz]}
        onPointerMove={onMove}
        onClick={onClick}
      >
        <planeGeometry args={[600, 600]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {a && (
        <mesh position={[a.x, 0.03, a.y]}>
          <sphereGeometry args={[0.06, 16, 12]} />
          <meshBasicMaterial color="#5b8def" />
        </mesh>
      )}
      {a && b && (
        <>
          <line>
            <bufferGeometry
              onUpdate={(g) => g.setFromPoints([new THREE.Vector3(a.x, 0.03, a.y), new THREE.Vector3(b.x, 0.03, b.y)])}
            />
            <lineBasicMaterial color="#5b8def" linewidth={2} />
          </line>
          {mid && dist !== null && (
            <Html position={[mid.x, 0.35, mid.y]} center style={{ pointerEvents: "none" }}>
              <div
                style={{
                  padding: "2px 8px",
                  borderRadius: 6,
                  background: "oklch(0.2 0.014 260 / 0.85)",
                  color: PD.textPrimary,
                  fontFamily: PD.fontMono,
                  fontSize: 12,
                  whiteSpace: "nowrap",
                }}
              >
                {fmt(dist)}
              </div>
            </Html>
          )}
        </>
      )}
    </>
  );
}
