"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { CameraControls, Grid, Html, Line } from "@react-three/drei";
import { EffectComposer, N8AO, ToneMapping, SMAA } from "@react-three/postprocessing";
import * as THREE from "three";
import { DPR, FRAME_BUFFER_TYPE, SHADOW, TONE_MAPPING } from "@/render/contract";
import { RenderContractCheck } from "@/render/RenderContractCheck";
import { RoomLights } from "@/render/RoomLights";
import { useSceneStore, type WallViewMode, type EnvPreset, type Weather } from "@/store/useSceneStore";
import { T, glass, chip } from "@/ui/tokens";
import { Walls, dimLabelStyle } from "./WallMesh";
import { Floors, Ceilings } from "./FloorMesh";
import { Environment3d } from "./environment/Environment3d";
import { FurnitureLayer } from "./FurnitureLayer";
import { RunDrawGhost } from "@/parametric/RunDrawGhost";
import { CounterItemGhost } from "@/parametric/CounterItemGhost";
import { RunHandles } from "@/parametric/RunHandles";
import { FixtureLayer } from "./FixtureLayer";
import { SnapGridOverlays } from "./SnapGridViz";
import { MeasureTool } from "./MeasureTool";
import { WallTool } from "./buildTools/WallTool";
import { OpeningTool } from "./buildTools/OpeningTool";
import { BottomDock } from "@/ui/planDock/BottomDock";
import { BuildToolbar } from "@/ui/planDock/BuildToolbar";
import { BuildNavigator } from "@/ui/planDock/BuildNavigator";
import { Inspector } from "@/ui/planDock/inspector/Inspector";
import { PdToastHost } from "@/ui/planDock/toast";
import { StairLayer } from "./StairMesh";
import { CameraFocusRig } from "./CameraFocusRig";
import { CameraRig } from "./CameraRig";
import { CameraKeyboardRig } from "./CameraKeyboardRig";
import { CameraDoubleClickRig } from "./CameraDoubleClickRig";
import { registerViewportCanvas } from "./viewportCapture";
import { WalkthroughRig, WalkthroughHint, WalkthroughFovControl } from "./walkthrough/WalkthroughMode";
import { WALKTHROUGH_CONFIG } from "./walkthrough/config";

// Model center (plan x,y) and span for framing. Keyed on frameToken — only a
// whole-scene replace reframes; edits never shift the model under the cursor.
function useSceneBounds() {
  const frameToken = useSceneStore((s) => s.frameToken);
  return useMemo(() => {
    const scene = useSceneStore.getState().scene;
    if (scene.nodes.length === 0) {
      return { cx: 0, cz: 0, span: 6, halfX: 3, halfZ: 3 };
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
      halfX: (maxX - minX) / 2, // footprint half-extents (world x / z)
      halfZ: (maxY - minY) / 2,
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

const WALL_MODES: { id: WallViewMode; label: string }[] = [
  { id: "full", label: "Full" },
  { id: "cutaway", label: "Cutaway" },
  { id: "top", label: "Top" },
];

const ENV_PRESETS: { id: EnvPreset; label: string }[] = [
  { id: "none", label: "Studio" },
  { id: "suburb", label: "Suburb" },
  { id: "city", label: "City" },
];

const WEATHERS: { id: Weather; label: string }[] = [
  { id: "clear", label: "☀ Clear" },
  { id: "cloudy", label: "☁ Cloudy" },
  { id: "rain", label: "🌧 Rain" },
];

/** 13.5 → "1:30 PM" for the time slider readout. */
function fmtHour(t: number): string {
  const h24 = Math.floor(t) % 24;
  const m = Math.round((t - Math.floor(t)) * 60) % 60;
  const ampm = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

/** Scene panel (View mode): environment preset + a fun time-of-day slider. */
function ScenePanel() {
  const preset = useSceneStore((s) => s.envPreset);
  const setEnvPreset = useSceneStore((s) => s.setEnvPreset);
  const time = useSceneStore((s) => s.timeOfDay);
  const setTimeOfDay = useSceneStore((s) => s.setTimeOfDay);
  const weather = useSceneStore((s) => s.weather);
  const setWeather = useSceneStore((s) => s.setWeather);
  const walkthroughActive = useSceneStore((s) => s.walkthroughActive);
  const setWalkthroughActive = useSceneStore((s) => s.setWalkthroughActive);
  const icon = time >= 6 && time < 19 ? "☀️" : "🌙";
  return (
    <div style={{ position: "absolute", left: 14, top: 112, width: 216, display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", ...glass() }}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>Scene</div>
      <button
        onClick={() => setWalkthroughActive(!walkthroughActive)}
        style={chip(walkthroughActive, { borderRadius: 8, border: "none", fontSize: 12, padding: "7px 10px" })}
      >
        {walkthroughActive ? "Exit walkthrough (Esc)" : "🚶 Walk through"}
      </button>
      <div style={{ display: "flex", gap: 4 }}>
        {ENV_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => setEnvPreset(p.id)}
            style={chip(preset === p.id, {
              flex: 1, fontSize: 11.5, borderRadius: 999, border: "none",
              background: preset === p.id ? T.accent : T.inputBg,
              color: preset === p.id ? "#fff" : T.textDim,
            })}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, opacity: preset === "none" ? 0.4 : 1 }}
        title={preset === "none" ? "Time of day has no effect in the Studio preset" : undefined}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
        <input
          type="range"
          min={0}
          max={24}
          step={0.25}
          value={time}
          onChange={(e) => setTimeOfDay(Number(e.target.value))}
          disabled={preset === "none"}
          style={{ flex: 1, accentColor: T.accent }}
        />
      </div>
      <div style={{ fontSize: 11, color: T.textFaint, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
        {fmtHour(time)}
      </div>
      {preset !== "none" && (
        <div style={{ display: "flex", gap: 4 }}>
          {WEATHERS.map((w) => (
            <button
              key={w.id}
              onClick={() => setWeather(w.id)}
              style={chip(weather === w.id, {
                flex: 1, fontSize: 11, borderRadius: 999, border: "none",
                background: weather === w.id ? T.accent : T.inputBg,
                color: weather === w.id ? "#fff" : T.textDim,
              })}
            >
              {w.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Sims wall-view control: Full / Cutaway / Top, plus a Ceilings toggle. */
function WallModeToggle() {
  const wallMode = useSceneStore((s) => s.wallMode);
  const setWallMode = useSceneStore((s) => s.setWallMode);
  const showCeilings = useSceneStore((s) => s.showCeilings);
  const setShowCeilings = useSceneStore((s) => s.setShowCeilings);
  return (
    <div
      style={{
        position: "absolute",
        left: 14,
        top: 64,
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
      <span style={{ width: 1, alignSelf: "stretch", margin: "3px 2px", background: T.panelBorder }} />
      <button
        title="Show ceilings (Full view only)"
        style={chip(showCeilings, {
          borderRadius: 999,
          border: "none",
          fontSize: 11.5,
          opacity: wallMode === "full" ? 1 : 0.5,
        })}
        onClick={() => setShowCeilings(!showCeilings)}
      >
        Ceiling
      </button>
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

// Paint-brush cursor shown while a Decorate brush is active. Inline SVG data
// URI (no asset fetch); hotspot at the bristle tip.
const BRUSH_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><g transform="rotate(45 14 14)"><rect x="11" y="3" width="6" height="11" rx="1.5" fill="#3a3a3a" stroke="#ffffff" stroke-width="1.3"/><rect x="10.5" y="13" width="7" height="4" fill="#ffffff" stroke="#3a3a3a" stroke-width="0.9"/><path d="M11 17 h6 l-1.2 6 h-3.6 z" fill="#0a84ff" stroke="#ffffff" stroke-width="0.9"/></g></svg>',
)}") 14 25, crosshair`;

export function Viewport({ collabOverlay }: { collabOverlay?: React.ReactNode } = {}) {
  const scene = useSceneStore((s) => s.scene);
  const { cx, cz, span, halfX, halfZ } = useSceneBounds();
  const wrapRef = useRef<HTMLDivElement>(null);
  const hovering = useSceneStore((s) => s.hover3d !== null);
  // A walkthrough door swing folds its per-frame writes into a gesture too
  // (WalkthroughMode.tsx), but it isn't a drag: it shouldn't tear down N8AO
  // or lock out camera controls the way dragging furniture/walls does.
  const dragging = useSceneStore((s) => s.gestureBase !== null && !s.doorGestureActive);
  // Camera arbitration moved to <CameraRig> below. The tool-armed states that
  // used to switch the whole camera off now cost only the LEFT button, so
  // orbit/pan/zoom stay live at all times — see CameraRig.tsx for why the old
  // `enabled={!toolBusy}` gate had to go and what replaced it.
  const appMode = useSceneStore((s) => s.appMode);
  const wallMode = useSceneStore((s) => s.wallMode);
  const envPreset = useSceneStore((s) => s.envPreset);
  const brush = useSceneStore((s) => s.brush);
  const walkthroughActive = useSceneStore((s) => s.walkthroughActive);
  const setWalkthroughActive = useSceneStore((s) => s.setWalkthroughActive);
  const [walkthroughLocked, setWalkthroughLocked] = useState(false);
  const [walkthroughFov, setWalkthroughFov] = useState(WALKTHROUGH_CONFIG.fovDeg);
  // The CAD grid is an editing aid; hide it in the immersive View presets.
  const showGrid = envPreset === "none" || appMode !== "view";
  const offset = useMemo(() => ({ cx, cz }), [cx, cz]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    const s = useSceneStore.getState();
    const mod = e.ctrlKey || e.metaKey;
    // Letter shortcuts match on e.code (physical key), not e.key: a Hebrew/
    // Russian/... layout types a different character on the same key, and
    // e.key-based matching silently dead-keys R/Z/Y for those users.
    if (mod && e.code === "KeyZ") {
      if (e.shiftKey) s.redoScene();
      else s.undoScene();
    } else if (mod && e.code === "KeyY") {
      s.redoScene();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      s.deleteSelected3d();
    } else if (e.code === "KeyR" && !mod) {
      const step = (Math.PI / 12) * (e.shiftKey ? -1 : 1); // 15° per tap
      if (s.placing) s.rotatePlacing(step);
      else if (s.sel3d?.kind === "furniture") s.rotateSelectedFurniture(step);
      else if (s.sel3d?.kind === "fixture") s.rotateSelectedFixture(step);
      else return;
    } else if (e.key === "Escape") {
      if (s.brush) s.setBrush(null);
      else if (s.placing) s.setPlacing(null);
      else if (s.placingCounter) s.setPlacingCounter(null);
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
        cursor: brush ? BRUSH_CURSOR : dragging ? "grabbing" : hovering ? "pointer" : "auto",
      }}
    >
      <Canvas
        // Every renderer value below is recorded in src/render/contract.ts and
        // checked at startup by <RenderContractCheck>. Values are passed
        // explicitly even where they match the library default — see
        // docs/render-contract.md §1.1 for why a default is not the same as a
        // decision.
        shadows={{ type: SHADOW.type }}
        camera={{ position: [9, 8, 11], fov: 50 }}
        dpr={DPR}
        // `flat` disables the renderer's own tonemapping so the ToneMapping
        // effect in the composer owns the display transform (avoids double
        // tonemapping). The composer forces NoToneMapping too; this is the
        // belt to its braces.
        flat
        // preserveDrawingBuffer lets us snapshot the frame for project thumbnails.
        gl={{ preserveDrawingBuffer: true }}
        onCreated={({ gl }) => registerViewportCanvas(gl.domElement)}
        onPointerMissed={() => useSceneStore.getState().setSel3d(null)}
      >
        {/* Sky, sun, fog, IBL and ground — driven by the Scene preset + time. */}
        <Environment3d span={span} halfX={halfX} halfZ={halfZ} />

        {/* Recenter the model over the origin (reframes only on scene load). */}
        <group position={[-cx, 0, -cz]}>
          <Floors scene={scene} />
          <Ceilings scene={scene} />
          <RoomLights scene={scene} />
          <Walls scene={scene} offset={offset} />
          <FurnitureLayer scene={scene} offset={offset} />
          <RunDrawGhost offset={offset} />
          <CounterItemGhost offset={offset} />
          <RunHandles offset={offset} />
          <FixtureLayer scene={scene} offset={offset} />
          <MeasureTool offset={offset} />
          <WallTool offset={offset} />
          <OpeningTool offset={offset} />
          <StairLayer scene={scene} />
          <CameraFocusRig offset={offset} />
          <DragVizLayer cx={cx} cz={cz} span={span} />
          {/* Snap grids (floor/ceiling) shown while placing or dragging. */}
          <SnapGridOverlays />
          {/* Collaborators' selection markers (plan coords, inside the group). */}
          {collabOverlay}
        </group>

        {showGrid && (
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
        )}
        <CameraControls
          makeDefault
          // Walkthrough is the ONE legitimate use of `enabled` — it replaces
          // the camera wholesale rather than restricting it. Every tool state
          // is handled by <CameraRig>, one button at a time.
          enabled={!walkthroughActive}
          smoothTime={0.18}
          draggingSmoothTime={0.06}
        />
        <FitCamera span={span} />
        {/* After FitCamera: the rig's far plane is derived from the dolly
            limit and must win over FitCamera's opening-shot value. */}
        <CameraRig span={span} halfX={halfX} halfZ={halfZ} />
        {/* P2 T2/T3: double-click-to-frame and the WASD/QE/T/F/Home keyboard
            channel. Separate files, not folded into CameraRig, so its own
            diff stays the button-map/envelope it already was. */}
        <CameraKeyboardRig halfX={halfX} halfZ={halfZ} />
        <CameraDoubleClickRig />
        {walkthroughActive && (
          <WalkthroughRig
            scene={scene}
            offset={offset}
            fovDeg={walkthroughFov}
            onExit={() => setWalkthroughActive(false)}
            onLockChange={setWalkthroughLocked}
          />
        )}

        {/* Photographic pass: ambient occlusion grounds furniture and darkens
            corners, ACES tonemapping, SMAA. AO is the cost centre — dropped
            while dragging and in Top view. */}
        {/* Chain order is fixed by contract §2.3: HDR scene-space effects, then
            ToneMapping, then LDR display-space effects. Bloom/SSR/DoF go ABOVE
            the ToneMapping line; vignette/LUT/grain go below. An HDR effect
            placed after tone mapping operates on clamped values and silently
            stops meaning anything. */}
        <EffectComposer
          multisampling={0}
          enableNormalPass={false}
          frameBufferType={FRAME_BUFFER_TYPE}
        >
          {!dragging && wallMode !== "top" ? (
            <N8AO aoRadius={0.7} intensity={2.4} distanceFalloff={1} halfRes />
          ) : (
            <></>
          )}
          <ToneMapping mode={TONE_MAPPING.operator} />
          <SMAA />
        </EffectComposer>
        <RenderContractCheck />
      </Canvas>
      {(appMode === "build" || appMode === "furnish") && <StatusOverlay />}
      {(appMode === "build" || appMode === "furnish") && <Inspector />}
      {appMode === "build" && <BuildToolbar />}
      {appMode === "build" && <BuildNavigator />}
      {appMode === "furnish" && <BottomDock />}
      {appMode === "view" && <ScenePanel />}
      <WalkthroughHint active={walkthroughActive} locked={walkthroughLocked} />
      <WalkthroughFovControl active={walkthroughActive} fovDeg={walkthroughFov} onChange={setWalkthroughFov} />
      <WallModeToggle />
      <PdToastHost />
    </div>
  );
}
