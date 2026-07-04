"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Grid, Html, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useSceneStore } from "@/store/useSceneStore";
import {
  WALL_HEIGHT,
  DEFAULT_THICKNESS,
  DEFAULT_DOOR,
  DEFAULT_WINDOW,
} from "@/schema/constants";
import type { OpeningType } from "@/schema/scene";
import { CATALOG, CATALOG_BY_ID, CATEGORIES } from "@/furniture/catalog";
import { Walls, dimLabelStyle } from "./WallMesh";
import { Floors } from "./FloorMesh";
import { FurnitureLayer } from "./FurnitureLayer";

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

const inspectorPanel: React.CSSProperties = {
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
};
const inspectorRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6 };
const inspectorInput: React.CSSProperties = {
  width: 58,
  background: "#26262b",
  border: "1px solid #3a3a40",
  borderRadius: 6,
  color: "#eee",
  padding: "3px 6px",
  fontSize: 12,
};

/** Numeric field that commits on Enter/blur and never leaks keys to the pane. */
function NumField({ label, value, onCommit, disabled }: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  disabled?: boolean;
}) {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => setRaw(String(value)), [value]);
  const commit = () => {
    const v = Number(raw);
    if (Number.isFinite(v)) onCommit(v);
    else setRaw(String(value));
  };
  return (
    <label style={inspectorRow}>
      {label}
      <input
        style={{ ...inspectorInput, opacity: disabled ? 0.4 : 1 }}
        value={raw}
        disabled={disabled}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          e.stopPropagation();
        }}
      />
      m
    </label>
  );
}

/** Temporary numeric inspector for the selection (real one lands in M5). */
function MiniInspector() {
  const sel3d = useSceneStore((s) => s.sel3d);
  const scene = useSceneStore((s) => s.scene);

  if (sel3d?.kind === "wall") {
    const wall = scene.walls.find((w) => w.id === sel3d.id);
    if (!wall) return null;
    const a = scene.nodes.find((n) => n.id === wall.a);
    const b = scene.nodes.find((n) => n.id === wall.b);
    const len = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
    const patch = (label: string, p: Partial<typeof wall>) => {
      const s = useSceneStore.getState();
      s.commitScene(label, {
        ...s.scene,
        walls: s.scene.walls.map((w) => (w.id === wall.id ? { ...w, ...p } : w)),
      });
    };
    return (
      <div style={inspectorPanel}>
        <div style={{ fontWeight: 600, color: "#7db8ff" }}>Wall · {len.toFixed(2)} m</div>
        <NumField
          label="Height"
          value={wall.height ?? WALL_HEIGHT}
          onCommit={(v) => patch("Wall height", { height: Math.min(6, Math.max(0.5, v)) })}
        />
        <NumField
          label="Thickness"
          value={wall.thickness ?? DEFAULT_THICKNESS}
          onCommit={(v) => patch("Wall thickness", { thickness: Math.min(1, Math.max(0.05, v)) })}
        />
      </div>
    );
  }

  if (sel3d?.kind === "furniture") {
    const item = scene.furniture.find((f) => f.id === sel3d.id);
    if (!item) return null;
    const spec = CATALOG_BY_ID.get(item.assetId);
    const deg = ((item.rotation * 180) / Math.PI) % 360;
    return (
      <div style={inspectorPanel}>
        <div style={{ fontWeight: 600, color: "#7db8ff" }}>{spec?.name ?? item.assetId}</div>
        <div style={{ opacity: 0.75 }}>
          {spec ? `${spec.footprint.w} × ${spec.footprint.d} m` : ""}
        </div>
        <div style={{ opacity: 0.75 }}>rotation {Math.round(deg)}°</div>
        <div style={{ opacity: 0.6 }}>drag to move · R rotates · Delete removes</div>
      </div>
    );
  }

  if (sel3d?.kind === "opening") {
    const op = scene.openings.find((o) => o.id === sel3d.id);
    if (!op) return null;
    const wall = scene.walls.find((w) => w.id === op.wallId);
    const wallH = wall?.height ?? WALL_HEIGHT;
    const patch = (label: string, p: Partial<typeof op>) => {
      const s = useSceneStore.getState();
      s.commitScene(label, {
        ...s.scene,
        openings: s.scene.openings.map((o) => (o.id === op.id ? { ...o, ...p } : o)),
      });
    };
    const swapTo = (type: OpeningType) => {
      if (type === op.type) return;
      const d = type === "door" ? DEFAULT_DOOR : DEFAULT_WINDOW;
      patch(`Convert to ${type}`, { type, sill: d.sill, height: d.height });
    };
    const segBtn = (type: OpeningType): React.CSSProperties => ({
      padding: "3px 10px",
      borderRadius: 6,
      border: "1px solid #3a3a40",
      background: op.type === type ? "#0a84ff" : "#26262b",
      color: op.type === type ? "#fff" : "#bbb",
      cursor: "pointer",
      fontSize: 12,
    });
    return (
      <div style={inspectorPanel}>
        <div style={{ fontWeight: 600, color: "#7db8ff", textTransform: "capitalize" }}>
          {op.type}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button style={segBtn("door")} onClick={() => swapTo("door")}>Door</button>
          <button style={segBtn("window")} onClick={() => swapTo("window")}>Window</button>
        </div>
        <NumField
          label="Width"
          value={op.width}
          onCommit={(v) => patch("Opening width", { width: Math.max(0.4, v) })}
        />
        <NumField
          label="Height"
          value={op.height}
          onCommit={(v) =>
            patch("Opening height", { height: Math.min(wallH - op.sill, Math.max(0.3, v)) })
          }
        />
        <NumField
          label="Sill"
          value={op.sill}
          disabled={op.type === "door"}
          onCommit={(v) =>
            patch("Opening sill", { sill: Math.min(wallH - op.height, Math.max(0, v)) })
          }
        />
      </div>
    );
  }

  return null;
}

/** Furniture catalog (functional now, restyled in M5). Click an item to pick
 *  it up; click in the scene to place; Esc puts it down. */
function CatalogPanel() {
  const placing = useSceneStore((s) => s.placing);
  const [open, setOpen] = useState(false);
  const btn: React.CSSProperties = {
    padding: "5px 10px",
    borderRadius: 8,
    border: "1px solid #3a3a40",
    background: "rgba(20,20,24,0.78)",
    backdropFilter: "blur(10px)",
    color: "#ddd",
    fontSize: 12,
    cursor: "pointer",
  };
  return (
    <div style={{ position: "absolute", left: 12, top: 12, maxHeight: "calc(100% - 70px)", display: "flex", flexDirection: "column", gap: 6 }}>
      <button style={{ ...btn, alignSelf: "flex-start", background: open ? "#0a84ff" : btn.background, color: open ? "#fff" : "#ddd" }} onClick={() => setOpen(!open)}>
        🛋 Furnish
      </button>
      {open && (
        <div
          style={{
            width: 210,
            overflowY: "auto",
            padding: 10,
            borderRadius: 10,
            background: "rgba(20,20,24,0.82)",
            backdropFilter: "blur(10px)",
            color: "#ddd",
            fontSize: 12,
          }}
        >
          {CATEGORIES.map((cat) => (
            <div key={cat} style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 600, opacity: 0.65, margin: "6px 0 4px" }}>{cat}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {CATALOG.filter((a) => a.category === cat).map((a) => {
                  const active = placing?.assetId === a.assetId;
                  return (
                    <button
                      key={a.assetId}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        border: "1px solid #3a3a40",
                        background: active ? "#0a84ff" : "#26262b",
                        color: active ? "#fff" : "#ccc",
                        cursor: "pointer",
                        fontSize: 11,
                      }}
                      onClick={() =>
                        useSceneStore.getState().setPlacing(active ? null : a.assetId)
                      }
                    >
                      {a.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {placing && (
            <div style={{ opacity: 0.6, marginTop: 4 }}>
              click to place · R rotates · Esc done
            </div>
          )}
        </div>
      )}
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
    } else if (e.key.toLowerCase() === "r" && !mod) {
      const step = (Math.PI / 12) * (e.shiftKey ? -1 : 1); // 15° per tap
      if (s.placing) s.rotatePlacing(step);
      else if (s.sel3d?.kind === "furniture") s.rotateSelectedFurniture(step);
      else return;
    } else if (e.key === "Escape") {
      if (s.placing) s.setPlacing(null);
      else if (s.gestureBase) s.cancelGesture();
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
          <FurnitureLayer scene={scene} offset={offset} />
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
      <CatalogPanel />
    </div>
  );
}
