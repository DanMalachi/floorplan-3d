"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { CameraControls, Grid, Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { useSceneStore, type WallViewMode } from "@/store/useSceneStore";
import {
  WALL_HEIGHT,
  DEFAULT_THICKNESS,
  DEFAULT_DOOR,
  DEFAULT_WINDOW,
} from "@/schema/constants";
import type { OpeningType } from "@/schema/scene";
import { CATALOG_BY_ID, ROOMS } from "@/furniture/catalog";
import { useThumbnail } from "@/furniture/thumbnails";
import { T, glass, chip, field, microLabel } from "@/ui/tokens";
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
  const controls = useThree((s) => s.controls) as CameraControls | null;
  useEffect(() => {
    const dist = Math.max(span * 1.6, 5) + 3;
    const dir = new THREE.Vector3(0.7, 0.7, 1).normalize().multiplyScalar(dist);
    camera.near = 0.05;
    camera.far = dist * 20;
    camera.updateProjectionMatrix();
    if (controls && "setLookAt" in controls) {
      controls.setLookAt(dir.x, dir.y, dir.z, 0, 0, 0, true);
    } else {
      camera.position.copy(dir);
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
            color={T.accent}
            transparent
            opacity={0.65}
            lineWidth={1.5}
          />
        ) : (
          <Line
            key={i}
            points={[[cx - ext, 0.02, g.value], [cx + ext, 0.02, g.value]]}
            color={T.accent}
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
  right: 14,
  top: 64,
  padding: "12px 14px",
  fontSize: 12.5,
  display: "flex",
  flexDirection: "column",
  gap: 9,
  minWidth: 170,
  ...glass(),
};
const inspectorRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" };

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
      <span style={{ color: T.textDim }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <input
          style={field({ width: 58, opacity: disabled ? 0.4 : 1 })}
          value={raw}
          disabled={disabled}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            e.stopPropagation();
          }}
        />
        <span style={{ color: T.textFaint }}>m</span>
      </span>
    </label>
  );
}

/** Contextual inspector, docked top-right when something is selected. */
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
        <div style={{ fontWeight: 600 }}>Wall <span style={{ color: T.textDim, fontWeight: 400 }}>· {len.toFixed(2)} m</span></div>
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
        <div style={{ fontWeight: 600 }}>{spec?.name ?? item.assetId}</div>
        <div style={{ color: T.textDim }}>
          {spec ? `${spec.footprint.w} × ${spec.footprint.d} m · ` : ""}
          {Math.round(deg)}°
        </div>
        <div style={{ color: T.textFaint }}>drag to move · R rotates · Delete removes</div>
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
    return (
      <div style={inspectorPanel}>
        <div style={{ fontWeight: 600, textTransform: "capitalize" }}>{op.type}</div>
        <div style={{ display: "flex", gap: 5 }}>
          <button style={chip(op.type === "door")} onClick={() => swapTo("door")}>Door</button>
          <button style={chip(op.type === "window")} onClick={() => swapTo("window")}>Window</button>
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

/** One catalog tile: a rendered 3D thumbnail with a caption, IKEA-style. */
function CatalogTile({ assetId }: { assetId: string }) {
  const spec = CATALOG_BY_ID.get(assetId);
  const placing = useSceneStore((s) => s.placing);
  const thumb = useThumbnail(assetId);
  const [hover, setHover] = useState(false);
  const active = placing?.assetId === assetId;
  if (!spec) return null;
  return (
    <button
      title={`${spec.name} · ${spec.footprint.w} × ${spec.footprint.d} m`}
      onClick={() => useSceneStore.getState().setPlacing(active ? null : assetId)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        padding: "6px 3px 5px",
        borderRadius: T.radiusS + 2,
        border: `1.5px solid ${active ? T.accent : "transparent"}`,
        background: active ? T.accentSoft : hover ? "rgba(255,255,255,0.07)" : "transparent",
        cursor: "pointer",
        transition: `background ${T.dur} ${T.ease}, border-color ${T.dur} ${T.ease}, transform ${T.dur} ${T.ease}`,
        transform: hover && !active ? "translateY(-1px)" : "none",
      }}
    >
      <div
        style={{
          width: 58,
          height: 58,
          borderRadius: T.radiusS,
          background: "rgba(255,255,255,0.05)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt={spec.name}
            width={56}
            height={56}
            style={{ objectFit: "contain" }}
            draggable={false}
          />
        ) : (
          <span style={{ color: T.textFaint, fontSize: 10 }}>…</span>
        )}
      </div>
      <span
        style={{
          fontSize: 10,
          lineHeight: 1.15,
          color: active ? T.text : T.textDim,
          textAlign: "center",
          maxWidth: 62,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {spec.name}
      </span>
    </button>
  );
}

/** Furniture catalog — the left rail of Furnish mode. Browse by room, pick
 *  by picture: a mini IKEA catalog. */
function CatalogPanel() {
  const placing = useSceneStore((s) => s.placing);
  const [roomId, setRoomId] = useState(ROOMS[0].id);
  const room = ROOMS.find((r) => r.id === roomId) ?? ROOMS[0];
  return (
    <div
      style={{
        position: "absolute",
        left: 14,
        top: 64,
        bottom: 14,
        width: 246,
        display: "flex",
        flexDirection: "column",
        ...glass(),
      }}
    >
      <div style={{ padding: "12px 14px 8px", fontWeight: 600, fontSize: 13 }}>Catalog</div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 3,
          padding: "0 10px 10px",
          borderBottom: `1px solid ${T.panelBorder}`,
        }}
      >
        {ROOMS.map((r) => {
          const active = r.id === roomId;
          return (
            <button
              key={r.id}
              onClick={() => setRoomId(r.id)}
              style={chip(active, {
                fontSize: 11,
                padding: "4px 8px",
                borderRadius: 999,
                border: "none",
                background: active ? T.accent : "transparent",
                color: active ? "#fff" : T.textDim,
              })}
            >
              {r.icon} {r.label}
            </button>
          );
        })}
      </div>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 10,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 4,
          alignContent: "start",
        }}
      >
        {room.assetIds.map((id) => (
          <CatalogTile key={id} assetId={id} />
        ))}
      </div>
      {placing && (
        <div
          style={{
            padding: "8px 14px 12px",
            color: T.textFaint,
            fontSize: 11.5,
            borderTop: `1px solid ${T.panelBorder}`,
          }}
        >
          click to place · R rotates · Esc done
        </div>
      )}
    </div>
  );
}

const WALL_MODES: { id: WallViewMode; label: string }[] = [
  { id: "full", label: "Full" },
  { id: "cutaway", label: "Cutaway" },
  { id: "top", label: "Top" },
];

/** Sims wall-view control: Full / Cutaway / Top. */
function WallModeToggle() {
  const wallMode = useSceneStore((s) => s.wallMode);
  const setWallMode = useSceneStore((s) => s.setWallMode);
  return (
    <div
      style={{
        position: "absolute",
        right: 14,
        bottom: 14,
        display: "flex",
        gap: 3,
        padding: 4,
        ...glass({ borderRadius: 999 }),
      }}
    >
      {WALL_MODES.map((m) => (
        <button
          key={m.id}
          style={chip(wallMode === m.id, { borderRadius: 999, border: "none", fontSize: 11.5 })}
          onClick={() => setWallMode(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

/** Selection + undo status pill. */
function StatusOverlay() {
  const sel3d = useSceneStore((s) => s.sel3d);
  const past = useSceneStore((s) => s.scenePast.length);
  const future = useSceneStore((s) => s.sceneFuture.length);
  if (!sel3d && past === 0 && future === 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 14,
        bottom: 14,
        padding: "7px 12px",
        fontSize: 12,
        pointerEvents: "none",
        display: "flex",
        gap: 12,
        ...glass({ borderRadius: 999 }),
      }}
    >
      {sel3d ? (
        <span style={{ color: T.accent }}>
          {sel3d.kind} selected — drag to move, Delete removes, Esc deselects
        </span>
      ) : (
        <span style={{ color: T.textDim }}>nothing selected</span>
      )}
      <span style={{ color: T.textFaint }}>
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
  const appMode = useSceneStore((s) => s.appMode);
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
        <color attach="background" args={[T.bgCanvas]} />
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
          cellThickness={0.5}
          cellColor="#26262d"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#33333c"
          infiniteGrid
          fadeDistance={Math.max(span * 4, 40)}
          position={[0, -0.01, 0]}
        />
        <CameraControls makeDefault enabled={!dragging} smoothTime={0.18} draggingSmoothTime={0.06} />
        <FitCamera span={span} />
      </Canvas>
      {(appMode === "build" || appMode === "furnish") && <StatusOverlay />}
      {(appMode === "build" || appMode === "furnish") && <MiniInspector />}
      {appMode === "furnish" && <CatalogPanel />}
      <WallModeToggle />
    </div>
  );
}
