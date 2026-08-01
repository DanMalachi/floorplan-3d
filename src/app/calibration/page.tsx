"use client";

/**
 * Render calibration scene — the ONLY thing M1b is judged against.
 *
 * Real floorplans will look wrong between M1b and M2: the eye-tuned intensities
 * are gone and the per-room fixtures that replace them do not exist yet. Tuning
 * anything here to make a real plan look better is exactly what this milestone
 * exists to prevent. Judge the three rigs below, nothing else.
 *
 *   exposure — sun-only 18% grey card, verifies RENDER_EXPOSURE numerically
 *   roof     — exterior view of the roof, for shadow acne across a sun sweep
 *   interior — inside the roofed room: the sun must stop at the ceiling and
 *              arrive only through the window
 *
 * `window.__probe(planX, planZ, y, px)` samples the presented frame at a world
 * point, so measurements survive a camera change instead of silently drifting
 * onto whatever the old screen rect now covers.
 */

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, ToneMapping, SMAA } from "@react-three/postprocessing";
import * as THREE from "three";
import { DPR, FRAME_BUFFER_TYPE, SHADOW, TONE_MAPPING } from "@/render/contract";
import { RenderContractCheck } from "@/render/RenderContractCheck";
import {
  REFERENCE_SUN_LUX,
  RENDER_EXPOSURE,
  computeSkyLighting,
  toRenderIntensity,
} from "@/render/lightPresets";
import { sampleScene } from "@/schema/sampleScene";
import { useSceneStore } from "@/store/useSceneStore";
import { riserScene } from "./riserScene";
import { Floors, Ceilings } from "@/viewport3d/FloorMesh";
import { Walls } from "@/viewport3d/WallMesh";
import { Environment3d } from "@/viewport3d/environment/Environment3d";

type Mode = "exposure" | "roof" | "interior" | "riser";

/** Scene centre — the sample scene spans x 0..5, y 0..7 in plan. */
const OFFSET = { cx: 2.5, cz: 3 };
/** The riser fixture spans x 0..8, z 0..3. */
const RISER_OFFSET = { cx: 4, cz: 1.5 };

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
function SceneRig({ riser }: { riser?: boolean }) {
  const scene = useSceneStore((s) => s.scene);
  const off = riser ? RISER_OFFSET : OFFSET;
  return (
    <>
      <Environment3d span={12} halfX={6} halfZ={6} />
      <group position={[-off.cx, 0, -off.cz]}>
        <Floors scene={scene} />
        <Ceilings scene={scene} />
        <Walls scene={scene} offset={off} />
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
function Probe({ onSample }: { onSample: (rgb: [number, number, number]) => void }) {
  const { gl, camera, size } = useThree();
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__probe = (planX: number, planZ: number, y: number, px = 12, riser = false) => {
      const off = riser ? RISER_OFFSET : OFFSET;
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
  }, [gl, camera, size]);

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

const CAMERAS: Record<Mode, { pos: [number, number, number]; target: [number, number, number] }> = {
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

function Rig({ mode }: { mode: Mode }) {
  const { camera } = useThree();
  useEffect(() => {
    const c = CAMERAS[mode];
    camera.position.set(...c.pos);
    camera.lookAt(...c.target);
    camera.updateProjectionMatrix();
  }, [camera, mode]);
  return null;
}

export default function CalibrationPage() {
  const [mode, setMode] = useState<Mode>("exposure");
  const [hour, setHour] = useState(12);
  const [ui, setUi] = useState(true);
  const [centre, setCentre] = useState<[number, number, number]>([0, 0, 0]);

  const setScene = useSceneStore((s) => s.setScene);
  const setTimeOfDay = useSceneStore((s) => s.setTimeOfDay);
  const setWallMode = useSceneStore((s) => s.setWallMode);
  const setEnvPreset = useSceneStore((s) => s.setEnvPreset);
  const setShowCeilings = useSceneStore((s) => s.setShowCeilings);
  const wallMode = useSceneStore((s) => s.wallMode);
  const showCeilings = useSceneStore((s) => s.showCeilings);

  useEffect(() => {
    setEnvPreset("suburb");
    setWallMode("full");
    const w = window as unknown as Record<string, unknown>;
    w.__setMode = setMode;
    w.__setHour = setHour;
    w.__setUi = setUi;
  }, [setEnvPreset, setWallMode]);
  // The riser rig needs its own fixture: risers only appear where a SHARED wall
  // is taller than a room's own ceiling, and the sample scene has no such wall.
  useEffect(() => {
    setScene(mode === "riser" ? riserScene : sampleScene);
  }, [mode, setScene]);
  useEffect(() => setTimeOfDay(hour), [hour, setTimeOfDay]);

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
    <div style={{ position: "fixed", inset: 0, background: "#0b0b0e", color: "#e8e8ea", fontFamily: "ui-monospace, monospace" }}>
      <Canvas
        shadows={{ type: SHADOW.type }}
        camera={{ position: [0, 0, 6], fov: 45 }}
        dpr={DPR}
        flat
        gl={{ preserveDrawingBuffer: true }}
      >
        <Rig mode={mode} />
        <Suspense fallback={null}>
          {mode === "exposure" ? <ExposureRig /> : <SceneRig riser={mode === "riser"} />}
        </Suspense>
        {/* No AO in any rig: it would darken the card and confound the acne
            read with an unrelated darkening term. */}
        <EffectComposer multisampling={0} enableNormalPass={false} frameBufferType={FRAME_BUFFER_TYPE}>
          <ToneMapping mode={TONE_MAPPING.operator} />
          <SMAA />
        </EffectComposer>
        <RenderContractCheck />
        <Probe onSample={setCentre} />
      </Canvas>

      {ui && (
        <div style={{ position: "absolute", bottom: 14, left: 14, display: "grid", gap: 8, background: "rgba(12,12,16,0.9)", padding: 12, borderRadius: 10, fontSize: 11, width: 330 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {(["exposure", "roof", "interior", "riser"] as const).map((m) => (
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
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={showCeilings} onChange={(e) => setShowCeilings(e.target.checked)} />
                ceilings visible (off = depth-only proxy path)
              </label>
            </>
          )}
        </div>
      )}
    </div>
  );
}
