"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Grid, Html, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useSceneStore } from "@/store/useSceneStore";
import { WALL_HEIGHT, DEFAULT_THICKNESS } from "@/schema/constants";
import { Walls, dimLabelStyle } from "./WallMesh";
import { Floors } from "./FloorMesh";

// Model center (plan x,y) and span for framing. Keyed on frameToken — only a
// whole-scene replace reframes; edits never shift the model under the cursor.
function useSceneBounds() {
  const frameToken = useSceneStore((s) => s.frameToken);
  return useMemo(() => {
    const scene = useSceneStore.getState().scene;
    if (scene.nodes.length === 0) {
      return { cx: 0, cz: 0, span: 6 };
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of scene.nodes) {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y);
    }
    return {
      cx: (minX + maxX) / 2,
      cz: (minY + maxY) / 2, // plan y -> world z
      span: Math.max(maxX - minX, maxY - minY, 1),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameToken]);
}

function FitCamera({ span }: { span: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as
    | { target: THREE.Vector3; update: () => void }
    | null;
  useEffect(() => {
    const dist = Math.max(span * 1.6, 5) + 3;
    const dir = new THREE.Vector3(0.7, 0.7, 1).normalize();
    camera.position.copy(dir.multiplyScalar(dist));
    camera.near = 0.05;
    camera.far = dist * 20;
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }
  }, [span, camera, controls]);
  return null;
}

/** Snap guides + live dimension labels during a drag (plan coords — rendered
 *  inside the recentered group). */
function DragVizLayer({ cx, cz, span }: { cx: number; cz: number; span: number }) {
  const viz = useSceneStore((s) => s.dragViz);
  if (!viz) return null;
  const ext = span * 1.2;
  return (
    <>
      {viz.guides.map((g, i) =>
        g.axis === "x" ? (
          <Line
            key={i}
            points={[[g.value, 0.02, cz - ext], [g.value, 0.02, cz + ext]]}
            color="#0a84ff"
            transparent
            opacity={0.65}
            lineWidth={1.5}
          />
        ) : (
          <Line
            key={i}
            points={[[cx - ext, 0.02, g.value], [cx + ext, 0.02, g.value]]}
            color="#0a84ff"
            transparent
            opacity={0.65}
            lineWidth={1.5}
          />
        ),
      )}
      {viz.labels.map((l, i) => (
        <Html key={`l${i}`} position={l.world} center style={{ pointerEvents: "none" }}>
          <div style={dimLabelStyle}>{l.text}</div>
        </Html>
      ))}
    </>
  );
}

/** Temporary numeric inspector for the selected wall (real one lands in M5). */
function MiniInspector() {
  const sel3d = useSceneStore((s) => s.sel3d);
  const scene = useSceneStore((s) => s.scene);
  const wall = sel3d?.kind === "wall" ? scene.walls.find((w) => w.id === sel3d.id) : undefined;
  const [height, setHeight] = useState("");
  const [thickness, setThickness] = useState("");

  useEffect(() => {
    if (!wall) return;
    setHeight(String(wall.height ?? WALL_HEIGHT));
    setThickness(String(wall.thickness ?? DEFAULT_THICKNESS));
  }, [wall]);

  if (!wall) return null;
  const a = scene.nodes.find((n) => n.id === wall.a);
  const b = scene.nodes.find((n) => n.id === wall.b);
  const len = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;

  const commit = (field: "height" | "thickness", raw: string) => {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    const s = useSceneStore.getState();
    if (field === "height") {
      const h = Math.min(6, Math.max(0.5, v));
      if (h === (wall.height ?? WALL_HEIGHT)) return;
      s.commitScene("Wall height", {
        ...s.scene,
        walls: s.scene.walls.map((w) => (w.id === wall.id ? { ...w, height: h } : w)),
      });
    } else {
      const t = Math.min(1, Math.max(0.05, v));
      if (t === wall.thickness) return;
      s.commitScene("Wall thickness", {
        ...s.scene,
        walls: s.scene.walls.map((w) => (w.id === wall.id ? { ...w, thickness: t } : w)),
      });
    }
  };

  const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6 };
  const input: React.CSSProperties = {
    width: 58,
    background: "#26262b",
    border: "1px solid #3a3a40",
    borderRadius: 6,
    color: "#eee",
    padding: "3px 6px",
    fontSize: 12,
  };

  return (
    <div
      style={{
        position: "absolute",
        right: 12,
        top: 12,
        padding: "10px 12px",
        borderRadius: 10,
        background: "rgba(20,20,24,0.78)",
        backdropFilter: "blur(10px)",
        color: "#ddd",
        fontSize: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontWeight: 600, color: "#7db8ff" }}>Wall · {len.toFixed(2)} m</div>
      <label style={row}>
        Height
        <input
          style={input}
          value={height}
          onChange={(e) => setHeight(e.target.value)}
          onBlur={() => commit("height", height)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit("height", height);
            e.stopPropagation();
          }}
        />
        m
      </label>
      <label style={row}>
        Thickness
        <input
          style={input}
          value={thickness}
          onChange={(e) => setThickness(e.target.value)}
          onBlur={() => commit("thickness", thickness)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit("thickness", thickness);
            e.stopPropagation();
          }}
        />
        m
      </label>
    </div>
  );
}

/** Selection + undo status while the real inspector waits for M5. */
function StatusOverlay() {
  const sel3d = useSceneStore((s) => s.sel3d);
  const past = useSceneStore((s) => s.scenePast.length);
  const future = useSceneStore((s) => s.sceneFuture.length);
  if (!sel3d && past === 0 && future === 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        bottom: 12,
        padding: "6px 10px",
        borderRadius: 8,
        background: "rgba(20,20,24,0.72)",
        backdropFilter: "blur(8px)",
        color: "#ddd",
        fontSize: 12,
        pointerEvents: "none",
        display: "flex",
        gap: 12,
      }}
    >
      {sel3d ? (
        <span style={{ color: "#7db8ff" }}>
          {sel3d.kind} selected — drag to move, Delete removes, Esc deselects
        </span>
      ) : (
        <span>nothing selected</span>
      )}
      <span style={{ opacity: 0.7 }}>
        ⌘Z undo ({past}) · ⇧⌘Z redo ({future})
      </span>
    </div>
  );
}

export function Viewport() {
  const scene = useSceneStore((s) => s.scene);
  const { cx, cz, span } = useSceneBounds();
  const wrapRef = useRef<HTMLDivElement>(null);
  const hovering = useSceneStore((s) => s.hover3d !== null);
  const dragging = useSceneStore((s) => s.gestureBase !== null);
  const offset = useMemo(() => ({ cx, cz }), [cx, cz]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    const s = useSceneStore.getState();
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") {
      if (e.shiftKey) s.redoScene();
      else s.undoScene();
    } else if (mod && e.key.toLowerCase() === "y") {
      s.redoScene();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      s.deleteSelected3d();
    } else if (e.key === "Escape") {
      if (s.gestureBase) s.cancelGesture();
      else s.setSel3d(null);
    } else {
      return; // not ours — let it bubble (2D editor listens on window)
    }
    // Handled here: keep the 2D trace editor's window listener out of it.
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={() => wrapRef.current?.focus()}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        outline: "none",
        cursor: dragging ? "grabbing" : hovering ? "pointer" : "auto",
      }}
    >
      <Canvas
        shadows
        camera={{ position: [9, 8, 11], fov: 50 }}
        onPointerMissed={() => useSceneStore.getState().setSel3d(null)}
      >
        <color attach="background" args={["#1e1e22"]} />
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[span, span * 1.5, span * 0.8]}
          intensity={1.3}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />

        {/* Recenter the model over the origin (reframes only on scene load). */}
        <group position={[-cx, 0, -cz]}>
          <Floors scene={scene} />
          <Walls scene={scene} offset={offset} />
          <DragVizLayer cx={cx} cz={cz} span={span} />
        </group>

        <Grid
          args={[200, 200]}
          cellSize={1}
          cellThickness={0.6}
          sectionSize={5}
          sectionThickness={1}
          infiniteGrid
          fadeDistance={Math.max(span * 4, 40)}
          position={[0, -0.01, 0]}
        />
        <OrbitControls makeDefault enabled={!dragging} />
        <FitCamera span={span} />
      </Canvas>
      <StatusOverlay />
      <MiniInspector />
    </div>
  );
}
