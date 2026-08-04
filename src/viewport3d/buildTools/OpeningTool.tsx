"use client";

// Build-mode "Opening" tool (Plan Dock P3): armed with a type (door/window/
// passage, `openingType` in the store), the ghost rides whichever solid
// wall is under the pointer — found via planMath's `nearestWallHit` — offset
// clamped against sibling openings on that wall with `openingEdgeBounds`
// (snap.ts), the SAME bounds check drag-resize already uses, so the ghost
// can never claim space a neighboring door/window already owns. Grid-snapped
// along the wall; turns red/rejected when there's no room left. New,
// additive Canvas child — mirrors WallTool/MeasureTool's catch-plane
// pattern. Doesn't touch buildOpeningVolumes/buildJoinery (those build the
// COMMITTED opening's real geometry inside protected WallMesh.tsx) — this
// renders its own simple placeholder box, good enough to preview position
// and size before committing.
//
// Stays armed after a commit (Sims-style repeat-place — same convention
// furniture placing already uses).

import { useEffect, useState } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { Opening, Scene } from "@/schema/scene";
import { DEFAULT_DOOR, DEFAULT_WINDOW } from "@/schema/constants";
import { useSceneStore } from "@/store/useSceneStore";
import { PD } from "@/ui/planDock/tokens";
import { pdToast } from "@/ui/planDock/toast";
import { GRID, openingEdgeBounds } from "../snap";
import { nearestWallHit, type WallFrame } from "./planMath";

const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function rayToPlan(e: ThreeEvent<PointerEvent | MouseEvent>, offset: { cx: number; cz: number }) {
  const hit = new THREE.Vector3();
  if (!e.ray.intersectPlane(FLOOR_PLANE, hit)) return null;
  return { x: hit.x + offset.cx, y: hit.z + offset.cz };
}

const nextId = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const roundTo = (v: number, step: number) => Math.round(v / step) * step;
const fmt = (m: number) => `${m.toFixed(2)} m`;

/** New-opening defaults per type. Passage reuses the door's footprint (no
 *  dedicated constant — matches OpeningInspector's own "switch type keeps
 *  width/height" convention in Viewport.tsx). */
function dimsFor(type: Opening["type"]): { width: number; height: number; sill: number } {
  if (type === "window") return DEFAULT_WINDOW;
  if (type === "passage") return { width: DEFAULT_DOOR.width, height: DEFAULT_DOOR.height, sill: 0 };
  return DEFAULT_DOOR;
}

interface Ghost {
  wallId: string;
  frame: WallFrame;
  offset: number; // center, meters along the wall from node a
  width: number;
  height: number;
  sill: number;
  valid: boolean;
}

function computeGhost(
  raw: { x: number; y: number },
  scene: Scene,
  type: Opening["type"],
): Ghost | null {
  const hit = nearestWallHit(raw.x, raw.y, scene, 0.5);
  if (!hit) return null;
  const dims = dimsFor(type);
  const siblings = scene.openings.filter((o) => o.wallId === hit.wall.id);
  // Same shape openingEdgeBounds always takes: a proposed opening (id can't
  // collide with anything real) plus its siblings, against the wall's span.
  const { lo, hi } = openingEdgeBounds({ id: "__ghost__", offset: hit.s, width: dims.width }, siblings, hit.frame.L);
  const centerLo = lo + dims.width / 2;
  const centerHi = hi - dims.width / 2;
  const snapped = roundTo(hit.s, GRID);
  const center = centerHi >= centerLo ? Math.min(Math.max(snapped, centerLo), centerHi) : snapped;
  const valid = centerHi >= centerLo;
  return { wallId: hit.wall.id, frame: hit.frame, offset: center, width: dims.width, height: dims.height, sill: dims.sill, valid };
}

export function OpeningTool({ offset }: { offset: { cx: number; cz: number } }) {
  const active = useSceneStore((s) => s.buildTool === "opening" && s.appMode === "build");
  const openingType = useSceneStore((s) => s.openingType);
  const [ghost, setGhost] = useState<Ghost | null>(null);

  useEffect(() => {
    if (!active) {
      setGhost(null);
      return;
    }
    // Capture-phase for the same reason as WallTool/MeasureTool: Viewport's
    // wrapper stops Escape from bubbling once it handles something.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") useSceneStore.getState().setBuildTool("select");
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active]);

  if (!active) return null;

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const p = rayToPlan(e, offset);
    const scene = useSceneStore.getState().scene;
    setGhost(p ? computeGhost(p, scene, openingType) : null);
  };

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const s = useSceneStore.getState();
    const p = rayToPlan(e, offset);
    const g = p ? computeGhost(p, s.scene, openingType) : ghost;
    if (!g) {
      pdToast("Hover a wall first");
      return;
    }
    if (!g.valid) {
      pdToast("No room here — move along the wall or clear a neighbor");
      return;
    }
    const opening: Opening = {
      id: nextId("o"),
      type: openingType,
      wallId: g.wallId,
      offset: g.offset,
      width: g.width,
      height: g.height,
      sill: g.sill,
    };
    const next: Scene = { ...s.scene, openings: [...s.scene.openings, opening] };
    s.commitScene(`Add ${openingType}`, next);
    // Stays armed for the next one — Sims repeat-place.
  };

  const g = ghost;
  const cx = g ? g.frame.ax + g.frame.ux * g.offset : 0;
  const cy = g ? g.frame.ay + g.frame.uy * g.offset : 0;
  const color = g?.valid ? "#5b8def" : "#e05252";

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
      {g && (
        <mesh position={[cx, g.sill + g.height / 2, cy]} rotation={[0, g.frame.rotationY, 0]}>
          <boxGeometry args={[g.width, g.height, g.frame.th * 1.05]} />
          <meshBasicMaterial color={color} transparent opacity={0.35} depthWrite={false} />
        </mesh>
      )}
      {g && (
        <Html position={[cx, g.sill + g.height + 0.3, cy]} center style={{ pointerEvents: "none" }}>
          <div
            style={{
              padding: "2px 8px",
              borderRadius: 6,
              background: "oklch(0.2 0.014 260 / 0.85)",
              color: g.valid ? PD.textPrimary : "#ffb3b3",
              fontFamily: PD.fontMono,
              fontSize: 12,
              whiteSpace: "nowrap",
            }}
          >
            {g.valid ? `${openingType} · ${fmt(g.width)}` : "too tight"}
          </div>
        </Html>
      )}
    </>
  );
}
