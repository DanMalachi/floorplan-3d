"use client";

/**
 * Dev-only furniture review scene (`/dev/furniture`).
 *
 * Every SOURCED catalog model — BlenderKit, Poly Haven, Sketchfab, Poly Pizza;
 * nothing parametric — standing on one floor, 40 cm apart, for a visual
 * approve/reject pass one item at a time.
 *
 * Rendering goes through the real, unmodified `FurnitureLayer` (protected), fed
 * a synthetic Scene that exists only in this component: the store's scene is
 * never written, so nothing here can reach autosave, a live room or cloud sync.
 * Items are laid out from each model's MEASURED normalized bounding box (same
 * math as `normalize()` in FurnitureLayer.tsx), so neighbours cannot clip even
 * where a model's proportions disagree with its catalog footprint.
 *
 * Decisions persist to `data/furniture-review.decisions.json` via the dev-only
 * `/api/dev/furniture-review` route, with localStorage as a fallback.
 */

import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { CameraControls, Html, useGLTF } from "@react-three/drei";
import { EffectComposer, SMAA, ToneMapping } from "@react-three/postprocessing";
import * as THREE from "three";
import { clone as cloneWithSkeletons } from "three/examples/jsm/utils/SkeletonUtils.js";
import { DPR, FRAME_BUFFER_TYPE, SHADOW, TONE_MAPPING } from "@/render/contract";
import {
  BLENDERKIT_ASSETS,
  CATEGORIES,
  POLYHAVEN_ASSETS,
  POLYPIZZA_ASSETS,
  SKETCHFAB_ASSETS,
  type FurnitureAsset,
} from "@/furniture/catalog";
import { assertKtx2TexturesResolved, useKtx2ExtendLoader } from "@/render/ktx2";
import { FurnitureLayer } from "@/viewport3d/FurnitureLayer";
import { Environment3d } from "@/viewport3d/environment/Environment3d";
import { useSceneStore, type EnvPreset } from "@/store/useSceneStore";
import type { Scene } from "@/schema/scene";
import { clearance, packRows, type Placed } from "./reviewLayout";

const GAP = 0.4;

type Source = "BlenderKit" | "Poly Haven" | "Sketchfab" | "Poly Pizza";
interface Entry {
  asset: FurnitureAsset;
  source: Source;
}

const ENTRIES: Entry[] = [
  ...BLENDERKIT_ASSETS.map((asset) => ({ asset, source: "BlenderKit" as const })),
  ...POLYHAVEN_ASSETS.map((asset) => ({ asset, source: "Poly Haven" as const })),
  ...SKETCHFAB_ASSETS.map((asset) => ({ asset, source: "Sketchfab" as const })),
  ...POLYPIZZA_ASSETS.map((asset) => ({ asset, source: "Poly Pizza" as const })),
].sort(
  (a, b) =>
    CATEGORIES.indexOf(a.asset.category) - CATEGORIES.indexOf(b.asset.category) ||
    a.asset.name.localeCompare(b.asset.name),
);

interface Size {
  w: number;
  d: number;
  h: number;
  /** No model could be loaded; FurnitureLayer draws its placeholder box. */
  failed?: boolean;
}

type Status = "approved" | "rejected";
interface Decision {
  status: Status;
  note?: string;
  at: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Measurement — mirrors normalize() in the protected FurnitureLayer.tsx
// ---------------------------------------------------------------------------

function measure(gltfScene: THREE.Object3D, asset: FurnitureAsset): Size {
  let obj = gltfScene;
  if (asset.modelRotation) {
    obj = cloneWithSkeletons(gltfScene);
    obj.rotation.set(...asset.modelRotation);
  }
  const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
  const k = Math.max(asset.footprint.w, asset.footprint.d) / (Math.max(size.x, size.z) || 1);
  return { w: size.x * k, d: size.z * k, h: size.y * k };
}

function Measure({ url, draco, asset, onSize }: {
  url: string;
  draco: boolean;
  asset: FurnitureAsset;
  onSize: (id: string, s: Size) => void;
}) {
  // Same loader arguments as FurnitureLayer's GlbModel, so both share drei's
  // cache entry and this costs no second download.
  const ext = useKtx2ExtendLoader();
  const gltf = useGLTF(url, draco ? "/draco/" : false, false, ext);
  assertKtx2TexturesResolved(gltf, url);
  useEffect(() => onSize(asset.assetId, measure(gltf.scene, asset)), [gltf, asset, onSize]);
  return null;
}

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Failed({ asset, onSize }: { asset: FurnitureAsset; onSize: (id: string, s: Size) => void }) {
  useEffect(() => {
    const { w, d } = asset.footprint;
    onSize(asset.assetId, { w, d, h: Math.min(w, d, 0.5), failed: true });
  }, [asset, onSize]);
  return null;
}

/** Same candidate chain as AssetModel: realModel (draco) → /furniture/<id>.glb → placeholder. */
function MeasureAsset({ asset, onSize }: { asset: FurnitureAsset; onSize: (id: string, s: Size) => void }) {
  const cands: { url: string; draco: boolean }[] = [];
  if (asset.realModel) cands.push({ url: asset.realModel, draco: true });
  cands.push({ url: `/furniture/${asset.model ?? asset.assetId}.glb`, draco: false });
  let node: ReactNode = <Failed asset={asset} onSize={onSize} />;
  for (let i = cands.length - 1; i >= 0; i--) {
    const c = cands[i];
    node = (
      <Boundary key={c.url} fallback={node}>
        <Suspense fallback={null}>
          <Measure url={c.url} draco={c.draco} asset={asset} onSize={onSize} />
        </Suspense>
      </Boundary>
    );
  }
  return <>{node}</>;
}

// ---------------------------------------------------------------------------
// Scene helpers
// ---------------------------------------------------------------------------

function BoundsBox({ p, h, color, opacity }: { p: Placed; h: number; color: string; opacity: number }) {
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(p.w, h, p.d)), [p.w, p.d, h]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <lineSegments geometry={geo} position={[p.x, h / 2, p.y]}>
      <lineBasicMaterial color={color} transparent opacity={opacity} depthTest={false} />
    </lineSegments>
  );
}

type View = "front" | "right" | "back" | "left" | "top";
const VIEW_DIR: Record<View, [number, number, number]> = {
  front: [0.35, 0.45, 1],
  right: [1, 0.45, -0.35],
  back: [-0.35, 0.45, -1],
  left: [-1, 0.45, 0.35],
  top: [0.001, 1, 0.02],
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const STORAGE_KEY = "done.dev.furnitureReview";

export default function FurnitureReview() {
  const [sizes, setSizes] = useState<Record<string, Size>>({});
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<View>("front");
  const [showBounds, setShowBounds] = useState(false);
  // Close-ups look across neighbouring rows, so by default only the item under
  // review is drawn. Overview always shows the whole floor.
  const [isolate, setIsolate] = useState(true);
  const [overview, setOverview] = useState(false);
  const [filter, setFilter] = useState<"all" | "unreviewed" | "approved" | "rejected">("all");
  const controls = useRef<CameraControls | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const envPreset = useSceneStore((s) => s.envPreset);
  const setEnvPreset = useSceneStore((s) => s.setEnvPreset);
  const setTimeOfDay = useSceneStore((s) => s.setTimeOfDay);
  const setWallMode = useSceneStore((s) => s.setWallMode);
  useEffect(() => {
    setEnvPreset("none");
    setTimeOfDay(11);
    setWallMode("full");
  }, [setEnvPreset, setTimeOfDay, setWallMode]);

  const onSize = useCallback((id: string, s: Size) => {
    setSizes((prev) => (prev[id] && !prev[id].failed === !s.failed ? prev : { ...prev, [id]: s }));
  }, []);

  // ── Decisions: file first, localStorage fallback ──────────────────────────
  useEffect(() => {
    let local: Record<string, Decision> = {};
    try {
      local = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    } catch {}
    fetch("/api/dev/furniture-review")
      .then((r) => (r.ok ? r.json() : {}))
      .then((file: Record<string, Decision>) => setDecisions({ ...local, ...file }))
      .catch(() => setDecisions(local))
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(decisions));
    } catch {}
    setSaveState("saving");
    const t = setTimeout(() => {
      fetch("/api/dev/furniture-review", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(decisions),
      })
        .then((r) => setSaveState(r.ok ? "saved" : "error"))
        .catch(() => setSaveState("error"));
    }, 400);
    return () => clearTimeout(t);
  }, [decisions, loaded]);

  // ── Layout, once every model is measured ──────────────────────────────────
  const measuredCount = Object.keys(sizes).length;
  const ready = measuredCount === ENTRIES.length;
  const layout = useMemo(() => {
    if (!ready) return null;
    const placed = packRows(
      ENTRIES.map((e) => ({
        id: e.asset.assetId,
        group: e.asset.category,
        w: sizes[e.asset.assetId].w,
        d: sizes[e.asset.assetId].d,
      })),
      GAP,
    );
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of placed) {
      minX = Math.min(minX, p.x - p.w / 2);
      maxX = Math.max(maxX, p.x + p.w / 2);
      minZ = Math.min(minZ, p.y - p.d / 2);
      maxZ = Math.max(maxZ, p.y + p.d / 2);
    }
    let minClear = Infinity;
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++) minClear = Math.min(minClear, clearance(placed[i], placed[j]));
    return {
      placed,
      byId: new Map(placed.map((p) => [p.id, p])),
      offset: { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 },
      halfX: (maxX - minX) / 2 + 2,
      halfZ: (maxZ - minZ) / 2 + 2,
      minClear,
    };
  }, [ready, sizes]);

  const soloId = isolate && !overview ? ENTRIES[index].asset.assetId : null;
  const scene: Scene | null = useMemo(
    () =>
      layout && {
        schemaVersion: 2,
        units: "meters",
        nodes: [],
        walls: [],
        openings: [],
        rooms: [],
        furniture: layout.placed
          .filter((p) => !soloId || p.id === soloId)
          .map((p) => ({ id: `review-${p.id}`, assetId: p.id, x: p.x, y: p.y, rotation: 0 })),
      },
    [layout, soloId],
  );

  useEffect(() => {
    if (!layout) return;
    (window as unknown as Record<string, unknown>).__furnitureReview = {
      count: layout.placed.length,
      minClearance: layout.minClear,
      failed: ENTRIES.filter((e) => sizes[e.asset.assetId]?.failed).map((e) => e.asset.assetId),
    };
  }, [layout, sizes]);

  const visible = useMemo(
    () =>
      ENTRIES.map((e, i) => ({ e, i })).filter(({ e }) => {
        const s = decisions[e.asset.assetId]?.status;
        return filter === "all" || (filter === "unreviewed" ? !s : s === filter);
      }),
    [decisions, filter],
  );

  const current = ENTRIES[index];
  const currentId = current.asset.assetId;
  const currentPlaced = layout?.byId.get(currentId);
  const currentSize = sizes[currentId];

  // ── Camera ────────────────────────────────────────────────────────────────
  const frame = useCallback(
    (overview = false) => {
      const c = controls.current;
      if (!c || !layout) return;
      if (overview) {
        const r = Math.max(layout.halfX, layout.halfZ);
        c.setLookAt(0, r * 1.5, r * 1.3, 0, 0, 0, true);
        return;
      }
      const p = layout.byId.get(currentId);
      const s = sizes[currentId];
      if (!p || !s) return;
      const tx = p.x - layout.offset.cx;
      const tz = p.y - layout.offset.cz;
      const ty = s.h / 2;
      const dist = Math.max(1.3, Math.max(s.w, s.d, s.h) * 1.9);
      const v = new THREE.Vector3(...VIEW_DIR[view]).normalize().multiplyScalar(dist);
      c.setLookAt(tx + v.x, ty + v.y, tz + v.z, tx, ty, tz, true);
    },
    [layout, currentId, sizes, view],
  );
  useEffect(() => {
    setOverview(false);
    frame();
  }, [frame]);
  const showOverview = useCallback(() => {
    setOverview(true);
    frame(true);
  }, [frame]);

  const decide = useCallback(
    (status: Status | null, advance = true) => {
      setDecisions((prev) => {
        const next = { ...prev };
        if (status === null) delete next[currentId];
        else next[currentId] = { status, note: prev[currentId]?.note, at: new Date().toISOString(), name: current.asset.name };
        return next;
      });
      if (advance && status) setIndex((i) => Math.min(ENTRIES.length - 1, i + 1));
    },
    [currentId, current],
  );

  const nextUnreviewed = useCallback(() => {
    for (let k = 1; k <= ENTRIES.length; k++) {
      const i = (index + k) % ENTRIES.length;
      if (!decisions[ENTRIES[i].asset.assetId]) return setIndex(i);
    }
  }, [index, decisions]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (k === "arrowright" || k === "j") setIndex((i) => Math.min(ENTRIES.length - 1, i + 1));
      else if (k === "arrowleft" || k === "k") setIndex((i) => Math.max(0, i - 1));
      else if (k === "a") decide("approved");
      else if (k === "r") decide("rejected");
      else if (k === "u") decide(null, false);
      else if (k === "n") nextUnreviewed();
      else if (k === "b") setShowBounds((b) => !b);
      else if (k === "o") showOverview();
      else if (k === "i") setIsolate((v) => !v);
      else if (k === "f") {
        setOverview(false);
        frame();
      }
      else if (k === "v") setView((v) => (["front", "right", "back", "left", "top"] as View[])[(["front", "right", "back", "left", "top"].indexOf(v) + 1) % 5]);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide, nextUnreviewed, frame, showOverview]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index, filter]);

  const pickAt = (e: ThreeEvent<MouseEvent>) => {
    if (!layout) return;
    const x = e.point.x + layout.offset.cx;
    const z = e.point.z + layout.offset.cz;
    const hit = layout.placed.find((p) => Math.abs(x - p.x) <= p.w / 2 && Math.abs(z - p.y) <= p.d / 2);
    if (!hit) return;
    e.stopPropagation();
    const i = ENTRIES.findIndex((en) => en.asset.assetId === hit.id);
    if (i === index) {
      setOverview(false);
      frame();
    } else setIndex(i);
  };

  const counts = useMemo(() => {
    let a = 0, r = 0;
    for (const e of ENTRIES) {
      const s = decisions[e.asset.assetId]?.status;
      if (s === "approved") a++;
      else if (s === "rejected") r++;
    }
    return { a, r, u: ENTRIES.length - a - r };
  }, [decisions]);

  const status = decisions[currentId]?.status;
  const btn = (on: boolean, color = "#3f6fd8") => ({
    padding: "6px 10px", borderRadius: 6, border: "1px solid #3a3a44",
    background: on ? color : "transparent", color: "inherit", cursor: "pointer", fontSize: 12,
  });
  const dot = (s?: Status) => (s === "approved" ? "#3fbf6f" : s === "rejected" ? "#e5534b" : "#555");

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", background: "#0b0b0e", color: "#e8e8ea", fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
      {/* ── List ── */}
      <div style={{ width: 290, display: "flex", flexDirection: "column", borderInlineEnd: "1px solid #24242c" }}>
        <div style={{ padding: 10, display: "grid", gap: 6, borderBottom: "1px solid #24242c" }}>
          <b style={{ fontSize: 13 }}>Sourced furniture review</b>
          <div>
            <span style={{ color: "#3fbf6f" }}>{counts.a} approved</span> · <span style={{ color: "#e5534b" }}>{counts.r} rejected</span> · {counts.u} left
          </div>
          <div style={{ opacity: 0.6 }}>
            {saveState === "saving" ? "saving…" : saveState === "saved" ? "saved to data/furniture-review.decisions.json" : saveState === "error" ? "file save FAILED (kept in localStorage)" : ""}
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {(["all", "unreviewed", "approved", "rejected"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={btn(filter === f)}>{f}</button>
            ))}
          </div>
        </div>
        <div ref={listRef} style={{ overflowY: "auto", flex: 1 }}>
          {visible.map(({ e, i }, n) => {
            const prevCat = n > 0 ? visible[n - 1].e.asset.category : null;
            const sz = sizes[e.asset.assetId];
            return (
              <div key={e.asset.assetId}>
                {prevCat !== e.asset.category && (
                  <div style={{ padding: "8px 10px 4px", opacity: 0.5, textTransform: "uppercase", fontSize: 10 }}>{e.asset.category}</div>
                )}
                <div
                  data-idx={i}
                  onClick={() => setIndex(i)}
                  style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 10px", cursor: "pointer", background: i === index ? "#1e2a44" : "transparent" }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: dot(decisions[e.asset.assetId]?.status), flex: "none" }} />
                  <span style={{ opacity: 0.45, width: 26, flex: "none" }}>{i + 1}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.asset.name}</span>
                  {sz?.failed && <span style={{ color: "#e8a33d" }}>!</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Viewport ── */}
      <div style={{ flex: 1, position: "relative" }}>
        <Canvas shadows={{ type: SHADOW.type }} camera={{ position: [0, 12, 16], fov: 45 }} dpr={DPR} flat gl={{ preserveDrawingBuffer: true }}>
          <CameraControls ref={controls} makeDefault />
          {/* Measure every model first; they share drei's cache with FurnitureLayer. */}
          {ENTRIES.map((e) => (
            <MeasureAsset key={e.asset.assetId} asset={e.asset} onSize={onSize} />
          ))}
          <Suspense fallback={null}>
            {layout && scene && (
              <>
                <Environment3d span={Math.max(layout.halfX, layout.halfZ) * 2} halfX={layout.halfX} halfZ={layout.halfZ} />
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
                  <planeGeometry args={[layout.halfX * 2, layout.halfZ * 2]} />
                  <meshStandardMaterial color="#b9b6b0" roughness={0.95} />
                </mesh>
                <group position={[-layout.offset.cx, 0, -layout.offset.cz]} onClick={pickAt}>
                  <FurnitureLayer scene={scene} offset={{ cx: 0, cz: 0 }} />
                  {showBounds &&
                    layout.placed.map((p) =>
                      p.id === currentId || (soloId && p.id !== soloId) ? null : <BoundsBox key={p.id} p={p} h={sizes[p.id].h} color="#8aa4ff" opacity={0.35} />,
                    )}
                  {currentPlaced && currentSize && (
                    <>
                      <BoundsBox p={currentPlaced} h={currentSize.h} color="#ffb020" opacity={0.9} />
                      <Html position={[currentPlaced.x, currentSize.h + 0.15, currentPlaced.y]} center style={{ pointerEvents: "none" }}>
                        <div style={{ background: "rgba(10,10,14,0.85)", color: "#fff", padding: "3px 7px", borderRadius: 5, whiteSpace: "nowrap", fontFamily: "ui-monospace, monospace", fontSize: 11 }}>
                          {index + 1}. {current.asset.name}
                        </div>
                      </Html>
                    </>
                  )}
                </group>
              </>
            )}
          </Suspense>
          <EffectComposer multisampling={0} enableNormalPass={false} frameBufferType={FRAME_BUFFER_TYPE}>
            <ToneMapping mode={TONE_MAPPING.operator} />
            <SMAA />
          </EffectComposer>
        </Canvas>

        {!ready && (
          <div style={{ position: "absolute", top: 14, insetInlineStart: 14, background: "rgba(12,12,16,0.9)", padding: "8px 12px", borderRadius: 8 }}>
            Loading models {measuredCount}/{ENTRIES.length}…
          </div>
        )}

        {/* ── Current item card ── */}
        <div style={{ position: "absolute", bottom: 14, insetInlineStart: 14, width: 380, display: "grid", gap: 8, background: "rgba(12,12,16,0.92)", padding: 12, borderRadius: 10 }}>
          <div style={{ display: "flex", gap: 10 }}>
            {current.asset.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.asset.thumbnail} alt="" style={{ width: 72, height: 72, objectFit: "contain", background: "#fff", borderRadius: 6, flex: "none" }} />
            )}
            <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
              <b style={{ fontSize: 13 }}>{index + 1}/{ENTRIES.length} · {current.asset.name}</b>
              <span style={{ opacity: 0.7 }}>{current.source} · {current.asset.category}{current.asset.subtitle ? ` · ${current.asset.subtitle}` : ""}</span>
              <span style={{ opacity: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentId}</span>
              {currentSize && (
                <span>
                  {currentSize.w.toFixed(2)} W × {currentSize.d.toFixed(2)} D × <b>{currentSize.h.toFixed(2)} H</b> m
                  {currentSize.failed && <span style={{ color: "#e8a33d" }}> — MODEL FAILED TO LOAD (placeholder)</span>}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => decide("approved")} style={{ ...btn(status === "approved", "#2f8f55"), flex: 1 }}>Approve (A)</button>
            <button onClick={() => decide("rejected")} style={{ ...btn(status === "rejected", "#b5403a"), flex: 1 }}>Reject (R)</button>
            <button onClick={() => decide(null, false)} style={btn(false)}>Clear (U)</button>
          </div>
          <input
            placeholder="note (optional, e.g. why rejected)"
            value={decisions[currentId]?.note ?? ""}
            onChange={(ev) => {
              const note = ev.target.value;
              setDecisions((prev) => ({
                ...prev,
                [currentId]: { status: prev[currentId]?.status ?? "rejected", note, at: new Date().toISOString(), name: current.asset.name },
              }));
            }}
            style={{ background: "#16161c", border: "1px solid #3a3a44", borderRadius: 6, color: "inherit", padding: "5px 8px", fontFamily: "inherit", fontSize: 12 }}
          />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <button onClick={() => setIndex((i) => Math.max(0, i - 1))} style={btn(false)}>← Prev</button>
            <button onClick={() => setIndex((i) => Math.min(ENTRIES.length - 1, i + 1))} style={btn(false)}>Next →</button>
            <button onClick={nextUnreviewed} style={btn(false)}>Next unreviewed (N)</button>
            {(["front", "right", "back", "left", "top"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} style={btn(view === v)}>{v}</button>
            ))}
            <button onClick={showOverview} style={btn(overview)}>Overview (O)</button>
            <button onClick={() => setIsolate((v) => !v)} style={btn(isolate)}>Isolate (I)</button>
            <button onClick={() => setShowBounds((b) => !b)} style={btn(showBounds)}>Bounds (B)</button>
            {(["none", "suburb"] as EnvPreset[]).map((p) => (
              <button key={p} onClick={() => setEnvPreset(p)} style={btn(envPreset === p)}>{p === "none" ? "studio" : p}</button>
            ))}
          </div>
          {layout && (
            <div style={{ opacity: 0.55 }}>
              {layout.placed.length} items · min edge gap {layout.minClear.toFixed(3)} m · click a model to select · V cycles view · drag to orbit
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
