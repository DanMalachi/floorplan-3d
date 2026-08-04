"use client";

// Build-mode "Wall" tool (Plan Dock P2): click to place nodes and draw wall
// segments, chaining from the end of one into the start of the next
// (Sims-style rapid walling). New, additive Canvas child — mirrors
// MeasureTool's catch-plane/rayToPlan pattern; not a modification to any
// protected wall/collision file. Junction mitring is free: WallMesh's
// <Walls> re-solves scene-wide from scene.walls/nodes on every render, so a
// new wall meeting an old corner mitres exactly like two traced walls do.
//
// v1 scope cuts (deliberate, per the plan's "Risks / open flags"): ending
// mid-span of an existing wall does not split it — that needs re-homing any
// Opening.offset on the split wall plus room-loop consistency, the riskiest
// sub-feature, cut from v1. Closed loops don't auto-create rooms/floors —
// loop detection only exists in quarantined legacy/ (never imported from);
// a new src/lib/rooms/detectLoops.ts is a follow-up for Dan to green-light.
// Both surface as a one-time toast per session, not a silent gap.

import { useEffect, useState } from "react";
import * as THREE from "three";
import { Html, Line } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { Node, Scene, Wall } from "@/schema/scene";
import { DEFAULT_THICKNESS } from "@/schema/constants";
import { useSceneStore } from "@/store/useSceneStore";
import { PD } from "@/ui/planDock/tokens";
import { pdToast } from "@/ui/planDock/toast";
import { GRID } from "../snap";
import { nearestNode } from "./planMath";

const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function rayToPlan(e: ThreeEvent<PointerEvent | MouseEvent>, offset: { cx: number; cz: number }) {
  const hit = new THREE.Vector3();
  if (!e.ray.intersectPlane(FLOOR_PLANE, hit)) return null;
  return { x: hit.x + offset.cx, y: hit.z + offset.cz };
}

const fmt = (m: number) => (m >= 1 ? `${m.toFixed(2)} m` : `${Math.round(m * 100)} cm`);
const roundTo = (v: number, step: number) => Math.round(v / step) * step;
const nextId = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/** A resolved click/hover point: either an existing node (merge) or a fresh
 *  grid-snapped plan coordinate (id null — minted only when actually committed). */
type ResolvedPoint = { id: string | null; x: number; y: number };

let toastedScopeCut = false; // once per session — don't nag on every segment

export function WallTool({ offset }: { offset: { cx: number; cz: number } }) {
  const active = useSceneStore((s) => s.buildTool === "wall" && s.appMode === "build");
  const [anchor, setAnchor] = useState<ResolvedPoint | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!active) {
      setAnchor(null);
      return;
    }
    // Capture-phase: Viewport's own key handler (its wrapper div) stops
    // Escape from bubbling once it's handled something, so a bubble-phase
    // listener here would randomly miss presses. Capture always sees it first.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (anchor) {
        setAnchor(null); // first Esc: end this chain, stay armed
      } else {
        useSceneStore.getState().setBuildTool("select"); // second Esc: drop the tool
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, anchor]);

  if (!active) return null;

  const resolvePoint = (raw: { x: number; y: number }, excludeId: string | null): ResolvedPoint => {
    const nodes = useSceneStore.getState().scene.nodes;
    const pool = excludeId ? nodes.filter((n) => n.id !== excludeId) : nodes;
    const near = nearestNode(raw.x, raw.y, pool);
    if (near) return { id: near.id, x: near.x, y: near.y };
    return { id: null, x: roundTo(raw.x, GRID), y: roundTo(raw.y, GRID) };
  };

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const p = rayToPlan(e, offset);
    if (p) setCursor(p);
  };

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const raw = rayToPlan(e, offset);
    if (!raw) return;
    const point = resolvePoint(raw, anchor?.id ?? null);

    if (!anchor) {
      setAnchor(point);
      return;
    }
    // Reject a zero-length segment: same existing node, or two fresh points
    // that landed on the same grid cell.
    const zeroLength =
      (point.id !== null && point.id === anchor.id) ||
      (point.id === null && anchor.id === null && Math.hypot(point.x - anchor.x, point.y - anchor.y) < 1e-6);
    if (zeroLength) return;

    const s = useSceneStore.getState();
    const nodes: Node[] = [...s.scene.nodes];
    const walls: Wall[] = [...s.scene.walls];

    let aId = anchor.id;
    if (!aId) {
      aId = nextId("n");
      nodes.push({ id: aId, x: anchor.x, y: anchor.y });
    }
    let bId = point.id;
    if (!bId) {
      bId = nextId("n");
      nodes.push({ id: bId, x: point.x, y: point.y });
    }

    const wall: Wall = { id: nextId("w"), a: aId, b: bId, thickness: DEFAULT_THICKNESS };
    walls.push(wall);

    const next: Scene = { ...s.scene, nodes, walls };
    s.commitScene("Draw wall", next); // one undo step per segment — no beginGesture (previews stay local state)

    if (!toastedScopeCut) {
      toastedScopeCut = true;
      pdToast("Walls only for now — rooms/floors close once loop detection ships");
    }

    setAnchor({ id: bId, x: point.x, y: point.y }); // chain: this segment's end is the next start
  };

  const previewA = anchor;
  const previewB = anchor && cursor ? resolvePoint(cursor, anchor.id) : null;
  const dist = previewA && previewB ? Math.hypot(previewB.x - previewA.x, previewB.y - previewA.y) : null;
  const mid = previewA && previewB ? { x: (previewA.x + previewB.x) / 2, y: (previewA.y + previewB.y) / 2 } : null;

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
      {previewA && (
        <mesh position={[previewA.x, 0.03, previewA.y]}>
          <sphereGeometry args={[0.07, 16, 12]} />
          <meshBasicMaterial color="#5b8def" />
        </mesh>
      )}
      {previewA && previewB && (
        <>
          <Line
            points={[
              [previewA.x, 0.03, previewA.y],
              [previewB.x, 0.03, previewB.y],
            ]}
            color="#5b8def"
            lineWidth={2}
          />
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
