"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, ToneMapping, SMAA } from "@react-three/postprocessing";
import { DPR, FRAME_BUFFER_TYPE, SHADOW, TONE_MAPPING } from "@/render/contract";
import type { Scene } from "@/schema/scene";
import { useSceneStore } from "@/store/useSceneStore";
import { Floors } from "@/viewport3d/FloorMesh";
import { Walls } from "@/viewport3d/WallMesh";
import { Environment3d } from "@/viewport3d/environment/Environment3d";
import { applyLookToKind, DEFAULT_LOOKS, type DoorLook } from "@/doors/look";
import { LOOK_PRESETS } from "@/doors/presets";

/**
 * Door review room. A front room and a back room share one wall carrying
 * four interior doors (closed, ajar, a double pair, a closed right-hand); the
 * front room's left wall is exterior and carries the entry door. The camera
 * wall is a portal, so the doors are seen from inside the front room with no
 * cutaway in the way.
 */

const T = 0.12;
const SHOWROOM: Scene = {
  schemaVersion: 2,
  units: "meters",
  nodes: [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 7, y: 0 },
    { id: "c", x: 7, y: 4.5 },
    { id: "d", x: 0, y: 4.5 },
    { id: "e", x: 0, y: -4 },
    { id: "f", x: 7, y: -4 },
  ],
  walls: [
    { id: "wMid", a: "a", b: "b", thickness: T },
    { id: "wRight", a: "b", b: "c", thickness: T },
    { id: "wFront", a: "c", b: "d", thickness: T, kind: "portal" },
    { id: "wLeft", a: "d", b: "a", thickness: T },
    { id: "wBackL", a: "a", b: "e", thickness: T },
    { id: "wBack", a: "e", b: "f", thickness: T },
    { id: "wBackR", a: "f", b: "b", thickness: T },
  ],
  openings: [
    { id: "d1", type: "door", wallId: "wMid", offset: 1.1, width: 0.9, height: 2.1, sill: 0 },
    { id: "d2", type: "door", wallId: "wMid", offset: 2.55, width: 0.9, height: 2.1, sill: 0, swingDeg: 35 },
    { id: "d3", type: "door", wallId: "wMid", offset: 4.25, width: 1.4, height: 2.1, sill: 0, double: true },
    { id: "d4", type: "door", wallId: "wMid", offset: 5.95, width: 0.9, height: 2.1, sill: 0, hinge: "end" },
    // Entry: wLeft runs from d (0, 4.5) to a (0, 0), so offset 2.25 is mid-wall.
    { id: "e1", type: "door", wallId: "wLeft", offset: 2.25, width: 1.05, height: 2.3, sill: 0 },
  ],
  rooms: [
    { id: "rFront", name: "Front", loop: ["a", "b", "c", "d"], floor: "wood" },
    { id: "rBack", name: "Back", loop: ["e", "f", "b", "a"], floor: "wood" },
  ],
  furniture: [],
};

const OFF = { cx: 3.5, cz: 0.25 };

interface Shot {
  pos: [number, number, number];
  target: [number, number, number];
}
/** Plan coordinates (x, height, plan y); offset applied on use. */
const SHOTS: Record<string, Shot> = {
  row: { pos: [3.5, 1.45, 4.3], target: [3.5, 1.05, 0] },
  door: { pos: [1.1, 1.25, 2.1], target: [1.1, 1.05, 0] },
  ajar: { pos: [3.3, 1.3, 1.9], target: [2.4, 1.0, 0] },
  double: { pos: [4.25, 1.3, 2.4], target: [4.25, 1.05, 0] },
  handle: { pos: [1.28, 1.12, 0.42], target: [1.5, 1.04, 0] },
  hinge: { pos: [0.55, 1.95, 0.5], target: [0.66, 1.85, 0] },
  back: { pos: [3.5, 1.45, -3.8], target: [3.5, 1.05, 0] },
  entryIn: { pos: [2.6, 1.4, 2.25], target: [0, 1.1, 2.25] },
  entryOut: { pos: [-2.8, 1.45, 2.25], target: [0, 1.1, 2.25] },
  entryPull: { pos: [-0.75, 1.2, 1.45], target: [0, 1.05, 1.85] },
};

function Rig({ shot }: { shot: string }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: { set: (x: number, y: number, z: number) => void }; update: () => void } | null;
  useEffect(() => {
    const s = SHOTS[shot];
    if (!s) return;
    camera.position.set(s.pos[0] - OFF.cx, s.pos[1], s.pos[2] - OFF.cz);
    const t: [number, number, number] = [s.target[0] - OFF.cx, s.target[1], s.target[2] - OFF.cz];
    camera.lookAt(...t);
    controls?.target.set(...t);
    controls?.update();
  }, [camera, controls, shot]);
  return null;
}

export default function DoorShowroom() {
  const scene = useSceneStore((s) => s.scene);
  const setScene = useSceneStore((s) => s.setScene);
  const setTimeOfDay = useSceneStore((s) => s.setTimeOfDay);
  const setEnvPreset = useSceneStore((s) => s.setEnvPreset);
  const setWallMode = useSceneStore((s) => s.setWallMode);
  const [shot, setShot] = useState("row");
  const [interior, setInterior] = useState<DoorLook>(DEFAULT_LOOKS.interior);
  const [entry, setEntry] = useState<DoorLook>(DEFAULT_LOOKS.entry);
  const [ui, setUi] = useState(true);
  const [hour, setHour] = useState(10);

  const built = useMemo(() => applyLookToKind(applyLookToKind(SHOWROOM, "interior", interior), "entry", entry), [interior, entry]);
  useEffect(() => setScene(built), [built, setScene]);
  useEffect(() => {
    setEnvPreset("suburb");
    setWallMode("full");
  }, [setEnvPreset, setWallMode]);
  useEffect(() => setTimeOfDay(hour), [hour, setTimeOfDay]);
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__setLooks = (l: { interior?: DoorLook; entry?: DoorLook }) => {
      if (l.interior) setInterior(l.interior);
      if (l.entry) setEntry(l.entry);
    };
    w.__setShot = setShot;
    w.__setUi = setUi;
    w.__setHour = setHour;
    w.__presets = LOOK_PRESETS;
  }, []);

  const btn = (on: boolean) => ({
    padding: "4px 8px", borderRadius: 6, border: "1px solid #3a3a44",
    background: on ? "#3f6fd8" : "transparent", color: "inherit", cursor: "pointer", fontSize: 11,
  });
  const presetNames = Object.keys(LOOK_PRESETS);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0b0b0e", color: "#e8e8ea", fontFamily: "ui-monospace, monospace" }}>
      <Canvas shadows={{ type: SHADOW.type }} camera={{ position: [0, 1.5, 5], fov: 45, near: 0.02 }} dpr={DPR} flat gl={{ preserveDrawingBuffer: true }}>
        <OrbitControls makeDefault />
        <Rig shot={shot} />
        <Suspense fallback={null}>
          <Environment3d span={14} halfX={7} halfZ={7} />
          <group position={[-OFF.cx, 0, -OFF.cz]}>
            <Floors scene={scene} />
            <Walls scene={scene} offset={OFF} />
          </group>
        </Suspense>
        <EffectComposer multisampling={0} enableNormalPass={false} frameBufferType={FRAME_BUFFER_TYPE}>
          <ToneMapping mode={TONE_MAPPING.operator} />
          <SMAA />
        </EffectComposer>
      </Canvas>
      {ui && (
        <div style={{ position: "absolute", top: 12, insetInlineStart: 12, display: "grid", gap: 6, background: "rgba(12,12,16,0.88)", padding: 10, borderRadius: 10, fontSize: 11, width: 330 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {Object.keys(SHOTS).map((s) => (
              <button key={s} style={btn(shot === s)} onClick={() => setShot(s)}>{s}</button>
            ))}
          </div>
          <label>interior&nbsp;
            <select onChange={(e) => setInterior(LOOK_PRESETS[e.target.value])} defaultValue="">
              <option value="" disabled>preset…</option>
              {presetNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label>entry&nbsp;
            <select onChange={(e) => setEntry(LOOK_PRESETS[e.target.value])} defaultValue="">
              <option value="" disabled>preset…</option>
              {presetNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label>hour {hour}
            <input type="range" min={6} max={18} step={0.5} value={hour} onChange={(e) => setHour(Number(e.target.value))} />
          </label>
        </div>
      )}
    </div>
  );
}
