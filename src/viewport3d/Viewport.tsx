"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useSceneStore } from "@/store/useSceneStore";
import { Walls } from "./WallMesh";
import { Floors } from "./FloorMesh";

// Compute model center (plan x,y) and span so we can recenter + frame any scene.
function useSceneBounds() {
  const scene = useSceneStore((s) => s.scene);
  return useMemo(() => {
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
  }, [scene]);
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
          {sel3d.kind} selected — Delete removes, Esc deselects
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
      s.setSel3d(null);
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
        cursor: hovering ? "pointer" : "auto",
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

        {/* Recenter the model over the origin. */}
        <group position={[-cx, 0, -cz]}>
          <Floors scene={scene} />
          <Walls scene={scene} />
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
        <OrbitControls makeDefault />
        <FitCamera span={span} />
      </Canvas>
      <StatusOverlay />
    </div>
  );
}
