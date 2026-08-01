"use client";

/**
 * Render calibration scene — the ONLY thing the render contract is judged
 * against.
 *
 * Real floorplans will look wrong between M1b and M2: the eye-tuned intensities
 * are gone and the per-room fixtures that replace them do not exist yet. Tuning
 * anything here to make a real plan look better is exactly what this workstream
 * exists to prevent. Judge the rigs below, nothing else.
 *
 *   exposure  — sun-only 18% grey card, verifies RENDER_EXPOSURE numerically
 *   roof      — exterior view of the roof, for shadow acne across a sun sweep
 *   interior  — inside the roofed room: the sun must stop at the ceiling and
 *               arrive only through the window
 *   riser     — the shared-tall-wall fixture, for riser-panel acne
 *   reference — M1c. The material chart + architecture the baseline images in
 *               docs/calibration are captured from, and the slot a candidate
 *               asset is dropped into to be judged against them.
 *
 * `window.__probe(planX, planZ, y, px)` samples the presented frame at a world
 * point, so measurements survive a camera change instead of silently drifting
 * onto whatever the old screen rect now covers.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, ToneMapping, SMAA } from "@react-three/postprocessing";
import * as THREE from "three";
import { DPR, FRAME_BUFFER_TYPE, SHADOW, TONE_MAPPING } from "@/render/contract";
import { RenderContractCheck } from "@/render/RenderContractCheck";
import {
  CAMERA_PRESETS,
  REFERENCE_SUN_LUX,
  RENDER_EXPOSURE,
  computeSkyLighting,
  presetFor,
  toRenderIntensity,
} from "@/render/lightPresets";
import { sampleScene } from "@/schema/sampleScene";
import { useSceneStore, type EnvPreset } from "@/store/useSceneStore";
import { riserScene } from "./riserScene";
import { CANONICAL_HOUR, ROOM_CENTRE, referenceScene } from "./referenceScene";
import { ReferenceRig, type CandidateInfo } from "./ReferenceRig";
import { Floors, Ceilings } from "@/viewport3d/FloorMesh";
import { Walls } from "@/viewport3d/WallMesh";
import { Environment3d } from "@/viewport3d/environment/Environment3d";

type Mode = "exposure" | "roof" | "interior" | "riser" | "reference";

/** Scene centre — the sample scene spans x 0..5, y 0..7 in plan. */
const OFFSET = { cx: 2.5, cz: 3 };
/** The riser fixture spans x 0..8, z 0..3. */
const RISER_OFFSET = { cx: 4, cz: 1.5 };

/**
 * Which fixture each rig centres on. The page knows this, so nothing that
 * measures the scene has to be told which offset to use — a probe pointed at
 * the wrong centre reports a real number about the wrong place, which is worse
 * than an error.
 */
const OFFSETS: Record<Mode, { cx: number; cz: number }> = {
  exposure: OFFSET, // unused: the exposure rig has no plan-space scene
  roof: OFFSET,
  interior: OFFSET,
  riser: RISER_OFFSET,
  reference: ROOM_CENTRE,
};

const ENV_PRESETS: EnvPreset[] = ["none", "suburb", "city"];
const WALL_MODES = ["full", "cutaway", "top"] as const;

// ---------------------------------------------------------------------------
// Exposure rig — sun only, nothing else
// ---------------------------------------------------------------------------

const GREY_CARD_ALBEDO = 0.18;

/**
 * Khronos Neutral subtracts a fixed black-point offset of 0.04 for any input at
 * or above 0.08 (three's NeutralToneMapping: `offset = x < 0.08 ? ... : 0.04`),
 * and passes values below its 0.76 compression knee through unchanged.
 *
 * So a correctly exposed 18% card does NOT read 0.18 — it reads 0.14 by design.
 * Comparing against 0.18 would report a correct exposure as a 22% error.
 */
const NEUTRAL_EXPECTED = GREY_CARD_ALBEDO - 0.04;

function GreyCard() {
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
    // setRGB writes the working (linear) space directly — a hex literal would
    // be read as sRGB and decode to a different number.
    m.color.setRGB(GREY_CARD_ALBEDO, GREY_CARD_ALBEDO, GREY_CARD_ALBEDO);
    return m;
  }, []);
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <mesh material={mat}>
      <planeGeometry args={[6, 6]} />
    </mesh>
  );
}

function ExposureRig() {
  return (
    <>
      <color attach="background" args={["#000000"]} />
      <GreyCard />
      {/* The reference sun at normal incidence, and nothing else. No sky, no
          IBL, no AO — a rig that includes ambient measures the ambient too. */}
      <directionalLight position={[0, 0, 10]} intensity={toRenderIntensity(REFERENCE_SUN_LUX)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Scene rig — real mesh builders, real environment
// ---------------------------------------------------------------------------

/**
 * The sample scene is the right fixture: a roofed L-shaped room AND a
 * rail-bounded balcony. That pair must behave differently — the room's sun
 * stops at the ceiling, the balcony's does not, because the balcony has no
 * ceiling BY DESIGN rather than hidden for viewing.
 */
function SceneRig({
  off,
  span = 12,
  children,
}: {
  off: { cx: number; cz: number };
  span?: number;
  children?: ReactNode;
}) {
  const scene = useSceneStore((s) => s.scene);
  return (
    <>
      <Environment3d span={span} halfX={span / 2} halfZ={span / 2} />
      <group position={[-off.cx, 0, -off.cz]}>
        <Floors scene={scene} />
        <Ceilings scene={scene} />
        <Walls scene={scene} offset={off} />
        {children}
      </group>
    </>
  );
}

// ---------------------------------------------------------------------------
// Probe
// ---------------------------------------------------------------------------

/**
 * Samples the presented frame at a projected world point. Reports mean
 * luminance and `adjDelta` — the mean absolute difference between horizontally
 * adjacent pixels, which is the acne signal: shadow acne alternates lit/dark
 * per shadow-map texel, so it shows here even when the mean looks correct.
 */
function Probe({
  off,
  onSample,
}: {
  off: { cx: number; cz: number };
  onSample: (rgb: [number, number, number]) => void;
}) {
  const { gl, camera, size } = useThree();
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    // The 5th argument is the old "riser" flag. It is accepted and ignored —
    // the page now derives the fixture centre from the active mode — so the
    // existing verify-*.mjs harnesses keep working unchanged.
    w.__probe = (planX: number, planZ: number, y: number, px = 12) => {
      const v = new THREE.Vector3(planX - off.cx, y, planZ - off.cz).project(camera);
      const cx = Math.round(((v.x + 1) / 2) * size.width);
      const cy = Math.round(((1 - v.y) / 2) * size.height);
      // A probe that silently returns 0 for an off-screen point certifies
      // whatever it is aimed at — an unreadable sample must be reported as
      // unreadable, not as black. `v.z > 1` means behind the camera.
      const visible =
        v.z <= 1 &&
        cx - px >= 0 && cy - px >= 0 &&
        cx + px < size.width && cy + px < size.height;
      if (!visible) return { visible: false, mean: NaN, adjDelta: NaN, sx: cx, sy: cy };
      const src = gl.domElement;
      const c = document.createElement("canvas");
      c.width = src.width;
      c.height = src.height;
      const ctx2 = c.getContext("2d")!;
      ctx2.drawImage(src, 0, 0);
      const scale = src.width / size.width;
      const x0 = Math.max(0, Math.round(cx * scale) - px);
      const y0 = Math.max(0, Math.round(cy * scale) - px);
      const d = ctx2.getImageData(x0, y0, px * 2, px * 2).data;
      const lum = (i: number) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      let sum = 0, adj = 0, n = 0, an = 0;
      for (let r = 0; r < px * 2; r++) {
        for (let cc = 0; cc < px * 2; cc++) {
          const i = (r * px * 2 + cc) * 4;
          sum += lum(i);
          n++;
          if (cc > 0) { adj += Math.abs(lum(i) - lum(i - 4)); an++; }
        }
      }
      return { visible: true, mean: sum / n, adjDelta: adj / Math.max(1, an), sx: cx, sy: cy };
    };

    // LIVE renderer state, read off the renderer rather than off the contract.
    // A manifest that records what the contract SAYS is not evidence about the
    // image: a library can accept a value, warn, and use a different one —
    // three's deprecated shadow alias is coerced during the first shadow pass,
    // which is how the contract and the renderer came to disagree unnoticed.
    // They agree now (§3.1), and this keeps it checkable rather than assumed.
    w.__glState = () => ({
      shadowMapType: gl.shadowMap.type,
      shadowMapEnabled: gl.shadowMap.enabled,
      toneMapping: gl.toneMapping,
      toneMappingExposure: gl.toneMappingExposure,
      outputColorSpace: gl.outputColorSpace,
      colorManagement: THREE.ColorManagement.enabled,
      pixelRatio: gl.getPixelRatio(),
    });
  }, [gl, camera, size, off]);

  // Centre-pixel readout for the exposure rig. Priority 2 runs after the
  // composer (priority 1), so this reads the tone-mapped frame on screen.
  const frame = useRef(0);
  useFrame(() => {
    if (frame.current++ % 15 !== 0) return;
    const ctx = gl.getContext();
    const p = new Uint8Array(4);
    ctx.readPixels(
      Math.floor(ctx.drawingBufferWidth / 2),
      Math.floor(ctx.drawingBufferHeight / 2),
      1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, p,
    );
    onSample([p[0], p[1], p[2]]);
  }, 2);
  return null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const SWEEP_HOURS = [6.5, 7.5, 9, 10.5, 12, 13.5, 15, 16.5, 17.5];

interface Shot {
  pos: [number, number, number];
  target: [number, number, number];
  /** Overridden only for the top-down shot, where the default up is degenerate. */
  up?: [number, number, number];
}

/**
 * The reference room's shot, per camera mode. Written in PLAN coordinates and
 * offset by the room centre below, so a change to the room's extent moves the
 * cameras with it instead of silently reframing.
 *
 * The three shots deliberately differ. A single fixed camera across all three
 * modes would be tidier to compare but would show nothing: `top` flattens walls
 * to 0.32 m, which is meaningless from eye level, and `cutaway` only fades the
 * walls facing the camera, which from inside the room is nothing at all. Each
 * mode is baselined in the shot that mode is actually used in; comparisons are
 * always image-to-image WITHIN a cell, never across modes.
 */
const REFERENCE_SHOTS: Record<(typeof WALL_MODES)[number], Shot> = {
  // Slightly raised, square to the open side, looking across the whole fixture:
  // roofed room on the left, chart on the sunlit terrace on the right. At 45°
  // fov / 16:10 this frames the full 11.5 m width from ~10 m back, and the
  // slight downward tilt spends the pixels on the floor rather than on sky.
  full: { pos: [5.5, 4.2, 15.5], target: [5.5, 0.9, 2.6] },
  // Elevated three-quarter — the angle cutaway exists for.
  cutaway: { pos: [16, 11, 14], target: [5.5, 0.4, 3] },
  // Straight down. `up` must leave the view direction or lookAt degenerates;
  // -z puts the far (window) wall at the top of the frame.
  top: { pos: [5.75, 14, 3], target: [5.75, 0, 3], up: [0, 0, -1] },
};

const CAMERAS: Record<Exclude<Mode, "reference">, Shot> = {
  exposure: { pos: [0, 0, 6], target: [0, 0, 0] },
  // Exterior, high enough to see the whole roof plane.
  roof: { pos: [9, 11, 12], target: [0, 1, 0] },
  // Inside the L-room, standing just inside the windowed wall and looking INTO
  // the room (+X). The window is at plan (0, 2.5), sill 0.9. The sun always
  // carries +Z, so this wall takes sun in the afternoon; light entering at
  // elevation e lands on the floor between x = 0.9/tan(e) and 2.1/tan(e).
  //
  // Facing the window instead would put that patch behind the camera — which
  // is what the first version of this rig did, and why it saw no window light.
  interior: { pos: [0.7 - 2.5, 1.6, 2.4 - 3], target: [4.6 - 2.5, 0.25, 1.6 - 3] },
  // Exterior three-quarter view of the riser fixture, framing the shared wall
  // standing 0.8 m proud of both ceilings and the riser strip either side of it.
  riser: { pos: [7, 7.5, 9], target: [0, 2.4, 0] },
};

function Rig({ mode, wallMode }: { mode: Mode; wallMode: (typeof WALL_MODES)[number] }) {
  const { camera } = useThree();
  useEffect(() => {
    let c: Shot;
    if (mode === "reference") {
      const shot = REFERENCE_SHOTS[wallMode];
      const p = (v: [number, number, number]): [number, number, number] => [
        v[0] - ROOM_CENTRE.cx, v[1], v[2] - ROOM_CENTRE.cz,
      ];
      c = { pos: p(shot.pos), target: p(shot.target), up: shot.up };
    } else {
      c = CAMERAS[mode];
    }
    camera.up.set(...(c.up ?? [0, 1, 0]));
    camera.position.set(...c.pos);
    camera.lookAt(...c.target);
    camera.updateProjectionMatrix();
  }, [camera, mode, wallMode]);
  return null;
}

export default function CalibrationPage() {
  const [mode, setMode] = useState<Mode>("exposure");
  const [hour, setHour] = useState(12);
  const [ui, setUi] = useState(true);
  const [centre, setCentre] = useState<[number, number, number]>([0, 0, 0]);
  const [candidate, setCandidate] = useState<File | null>(null);
  const [candidateInfo, setCandidateInfo] = useState<CandidateInfo | null>(null);

  const setScene = useSceneStore((s) => s.setScene);
  const setTimeOfDay = useSceneStore((s) => s.setTimeOfDay);
  const setWallMode = useSceneStore((s) => s.setWallMode);
  const setEnvPreset = useSceneStore((s) => s.setEnvPreset);
  const setShowCeilings = useSceneStore((s) => s.setShowCeilings);
  const wallMode = useSceneStore((s) => s.wallMode);
  const showCeilings = useSceneStore((s) => s.showCeilings);
  const envPreset = useSceneStore((s) => s.envPreset);

  useEffect(() => {
    setEnvPreset("suburb");
    setWallMode("full");
    const w = window as unknown as Record<string, unknown>;
    w.__setMode = setMode;
    w.__setHour = setHour;
    w.__setUi = setUi;
    w.__setEnv = setEnvPreset;
    w.__setWallMode = setWallMode;
  }, [setEnvPreset, setWallMode]);

  // Fixtures per rig. The riser rig needs its own: risers only appear where a
  // SHARED wall is taller than a room's own ceiling, and neither the sample
  // scene nor the reference room has such a wall.
  useEffect(() => {
    setScene(
      mode === "riser" ? riserScene : mode === "reference" ? referenceScene : sampleScene,
    );
    // The reference baselines are captured at one recorded hour, and it is part
    // of the baseline: a different sun angle is a different image, so entering
    // the rig snaps to it rather than inheriting whatever was on screen.
    if (mode === "reference") setHour(CANONICAL_HOUR);
  }, [mode, setScene]);
  useEffect(() => setTimeOfDay(hour), [hour, setTimeOfDay]);

  /**
   * Everything a baseline image depends on, published for the capture harness
   * to write beside the PNGs. A reference image with no record of the contract
   * that produced it cannot be checked for staleness later — and a stale
   * baseline set is worse than none (§2.4).
   */
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__calibrationManifest = () => ({
      hour,
      envPreset,
      wallMode,
      cameraPreset: presetFor(wallMode, false),
      cameraPresetValues: CAMERA_PRESETS[presetFor(wallMode, false)],
      shot: REFERENCE_SHOTS[wallMode],
      renderExposure: RENDER_EXPOSURE,
      referenceSunLux: REFERENCE_SUN_LUX,
      toneMappingOperator: TONE_MAPPING.operator,
      // What the contract records...
      contractShadowType: SHADOW.type,
      shadowMapSize: SHADOW.mapSize,
      shadowBias: SHADOW.bias,
      shadowNormalBias: SHADOW.normalBias,
      // ...and what the renderer is actually doing. These must agree; where
      // they do not, the image is evidence of the second one.
      live: (window as unknown as { __glState?: () => unknown }).__glState?.(),
      sun: (() => {
        const s = computeSkyLighting(hour, 0);
        return { sunLux: s.sunLux, skyLux: s.skyLux, dir: s.dir.toArray() };
      })(),
    });
  }, [hour, envPreset, wallMode]);

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (!/\.(glb|gltf)$/i.test(f.name)) {
      console.error("[calibration] drop a .glb or .gltf; got", f.name);
      return;
    }
    setMode("reference");
    setCandidateInfo(null);
    setCandidate(f);
  }, []);

  const toLinear = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const measured = toLinear(centre[0]);
  const sun = computeSkyLighting(hour, 0);
  const btn = (on: boolean) => ({
    padding: "5px 9px", borderRadius: 6, border: "1px solid #3a3a44",
    background: on ? "#3f6fd8" : "transparent", color: "inherit",
    cursor: "pointer", fontSize: 11,
  });

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "#0b0b0e", color: "#e8e8ea", fontFamily: "ui-monospace, monospace" }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <Canvas
        shadows={{ type: SHADOW.type }}
        camera={{ position: [0, 0, 6], fov: 45 }}
        dpr={DPR}
        flat
        gl={{ preserveDrawingBuffer: true }}
      >
        <Rig mode={mode} wallMode={wallMode} />
        <Suspense fallback={null}>
          {mode === "exposure" ? (
            <ExposureRig />
          ) : mode === "reference" ? (
            <SceneRig off={OFFSETS.reference} span={14}>
              <ReferenceRig candidate={candidate} onCandidateLoaded={setCandidateInfo} />
            </SceneRig>
          ) : (
            <SceneRig off={OFFSETS[mode]} />
          )}
        </Suspense>
        {/* No AO in any rig: it would darken the card and confound the acne
            read with an unrelated darkening term. */}
        <EffectComposer multisampling={0} enableNormalPass={false} frameBufferType={FRAME_BUFFER_TYPE}>
          <ToneMapping mode={TONE_MAPPING.operator} />
          <SMAA />
        </EffectComposer>
        <RenderContractCheck />
        <Probe off={OFFSETS[mode]} onSample={setCentre} />
      </Canvas>

      {ui && (
        <div style={{ position: "absolute", bottom: 14, left: 14, display: "grid", gap: 8, background: "rgba(12,12,16,0.9)", padding: 12, borderRadius: 10, fontSize: 11, width: 330 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {(["exposure", "roof", "interior", "riser", "reference"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} style={{ ...btn(mode === m), flex: 1 }}>{m}</button>
            ))}
          </div>

          {mode === "exposure" ? (
            <>
              <div style={{ opacity: 0.65 }}>18% grey card, sun only, normal incidence</div>
              <div>exposure &nbsp;{RENDER_EXPOSURE.toExponential(4)} &nbsp;= PI / {REFERENCE_SUN_LUX.toLocaleString()}</div>
              <div>measured sRGB &nbsp;{centre.join(", ")}</div>
              <div>
                measured linear&nbsp;
                <b style={{ color: Math.abs(measured - NEUTRAL_EXPECTED) < 0.02 ? "#5cd08a" : "#e8a33d" }}>
                  {measured.toFixed(4)}
                </b>
                &nbsp;/ expected {NEUTRAL_EXPECTED.toFixed(2)}
              </div>
              <div style={{ opacity: 0.55, lineHeight: 1.45 }}>
                Expected is 0.18 minus Neutral&apos;s fixed 0.04 black-point
                offset — a correct exposure reads 0.14, not 0.18.
              </div>
            </>
          ) : (
            <>
              <div>hour {hour.toFixed(1)} &nbsp; elev {(Math.asin(Math.max(-1, Math.min(1, sun.dir.y))) * (180 / Math.PI)).toFixed(1)}°</div>
              <div style={{ opacity: 0.7 }}>sun {Math.round(sun.sunLux).toLocaleString()} lx &nbsp; sky {Math.round(sun.skyLux).toLocaleString()} lx</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {SWEEP_HOURS.map((h) => (
                  <button key={h} onClick={() => setHour(h)} style={btn(hour === h)}>{h}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {(["full", "cutaway", "top"] as const).map((m) => (
                  <button key={m} onClick={() => setWallMode(m)} style={{ ...btn(wallMode === m), flex: 1 }}>{m}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {ENV_PRESETS.map((p) => (
                  <button key={p} onClick={() => setEnvPreset(p)} style={{ ...btn(envPreset === p), flex: 1 }}>
                    {p === "none" ? "studio" : p}
                  </button>
                ))}
              </div>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={showCeilings} onChange={(e) => setShowCeilings(e.target.checked)} />
                ceilings visible (off = depth-only proxy path)
              </label>
              {mode === "reference" && (
                <>
                  <div style={{ opacity: 0.55, lineHeight: 1.45, borderTop: "1px solid #2a2a33", paddingTop: 8 }}>
                    Baseline cell: <b>{envPreset === "none" ? "studio" : envPreset}</b> ×{" "}
                    <b>{wallMode}</b> → camera preset <b>{presetFor(wallMode, false)}</b>
                    {CAMERA_PRESETS[presetFor(wallMode, false)].physical ? " (physical)" : " (legibility-first)"}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <label style={{ ...btn(false), flex: 1, textAlign: "center" }}>
                      drop or pick a .glb
                      <input
                        type="file"
                        accept=".glb,.gltf"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) { setCandidateInfo(null); setCandidate(f); }
                        }}
                      />
                    </label>
                    {candidate && (
                      <button onClick={() => { setCandidate(null); setCandidateInfo(null); }} style={btn(false)}>
                        clear
                      </button>
                    )}
                  </div>
                  {candidateInfo && (
                    <div style={{ opacity: 0.7 }}>
                      {candidateInfo.name} — {candidateInfo.size.map((v) => v.toFixed(2)).join(" × ")} m
                      <div style={{ opacity: 0.75 }}>
                        authored scale, not normalised; the cage is 2.0 m tall
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
