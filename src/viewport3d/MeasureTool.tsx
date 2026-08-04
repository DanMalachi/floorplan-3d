"use client";

// Build-mode "Measure" tool: click two points anywhere in the scene — floor,
// wall face, or ceiling — and read the true 3D distance between them. New,
// additive Canvas child (mirrors FurnitureLayer's PlacementGhost catch-plane
// pattern) — not a modification to any protected wall/collision file. Only
// mounted while buildTool === "measure".
//
// Surface picking (floor/wall/ceiling) lives in buildTools/planMath.ts's
// `raycastSceneSurfaces` — pure, store-independent, same convention as
// WallTool/OpeningTool's own duplicated rayToPlan. The big invisible plane
// below is kept only so R3F actually fires pointer events everywhere in the
// room (guarantees `e.ray` is available); its own intersection point is no
// longer used directly.

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { Node } from "@/schema/scene";
import { useSceneStore } from "@/store/useSceneStore";
import { PD } from "@/ui/planDock/tokens";
import { raycastSceneSurfaces } from "./buildTools/planMath";

const fmt = (m: number) => (m >= 1 ? `${m.toFixed(2)} m` : `${Math.round(m * 100)} cm`);

type Pt = { x: number; y: number; z: number };

export function MeasureTool({ offset }: { offset: { cx: number; cz: number } }) {
  const active = useSceneStore((s) => s.buildTool === "measure" && s.appMode === "build");
  const scene = useSceneStore((s) => s.scene);
  // Mirrors FloorMesh.tsx's own `Ceilings` visibility condition — the ceiling
  // should only compete as a pickable surface when one is actually rendered
  // (Cutaway/Top deliberately hide it so you can see inside).
  const wallMode = useSceneStore((s) => s.wallMode);
  const showCeilings = useSceneStore((s) => s.showCeilings);
  const ceilingVisible = wallMode === "full" && showCeilings;
  // `wallFrameOf` (inside raycastSceneSurfaces) needs nodes indexed by id —
  // build that once per scene change, not on every pointer move.
  const nodes = useMemo(() => new Map<string, Node>(scene.nodes.map((n) => [n.id, n])), [scene.nodes]);
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
    const hit = raycastSceneSurfaces(e.ray, scene, offset, nodes, ceilingVisible);
    if (hit) setCursor({ x: hit.point.x, y: hit.point.y, z: hit.point.z });
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const hit = raycastSceneSurfaces(e.ray, scene, offset, nodes, ceilingVisible);
    if (!hit) return;
    const p: Pt = { x: hit.point.x, y: hit.point.y, z: hit.point.z };
    setPoints((prev) => (prev.length >= 2 ? [p] : [...prev, p]));
  };

  const a = points[0] ?? null;
  const b = points[1] ?? (points.length === 1 ? cursor : null);
  const dist = a && b ? Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) : null;
  const mid = a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 } : null;

  return (
    <>
      {/* Catch-all: no longer read for its own intersection point (that's
          raycastSceneSurfaces's job now) — kept only so R3F fires pointer
          events everywhere in the room, guaranteeing `e.ray` is populated. */}
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
        <mesh position={[a.x, a.y, a.z]}>
          <sphereGeometry args={[0.06, 16, 12]} />
          <meshBasicMaterial color="#5b8def" />
        </mesh>
      )}
      {a && b && (
        <>
          <line>
            <bufferGeometry
              onUpdate={(g) => g.setFromPoints([new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)])}
            />
            <lineBasicMaterial color="#5b8def" linewidth={2} />
          </line>
          {mid && dist !== null && (
            <Html position={[mid.x, mid.y + 0.3, mid.z]} center style={{ pointerEvents: "none" }}>
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
