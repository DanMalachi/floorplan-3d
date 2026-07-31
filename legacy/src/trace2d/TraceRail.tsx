"use client";

// The guided trace rail (Phase 5 T1): the whole trace pipeline as five
// steps — Plan · Scale · Walls · Openings · Build — with exactly one step's
// controls visible at a time. Replaces the old all-at-once toolbar.

import { useEffect, useMemo, useRef, useState } from "react";
import { useSceneStore } from "@/store/useSceneStore";
import type { SegmentKind } from "./types";
import { analyzeLoops } from "../lib/loops";
import { T, glass, chip, field, microLabel } from "@/ui/tokens";
import { traceToScene } from "./traceToScene";
import { buildGroundTruth, downloadGroundTruth } from "./exportGroundTruth";

const railBtn = (active = false, extra?: React.CSSProperties): React.CSSProperties =>
  chip(active, { width: "100%", textAlign: "left", padding: "7px 11px", ...extra });

const primaryBtn = (enabled = true): React.CSSProperties => ({
  ...chip(enabled),
  width: "100%",
  textAlign: "center",
  fontWeight: 600,
  padding: "9px 11px",
  opacity: enabled ? 1 : 0.45,
  cursor: enabled ? "pointer" : "not-allowed",
});

const hintText: React.CSSProperties = { fontSize: 11.5, lineHeight: 1.45, color: T.textFaint };
const statusText = (ok: boolean): React.CSSProperties => ({
  fontSize: 11.5,
  lineHeight: 1.45,
  color: ok ? T.ok : T.warn,
});

/** Collapsible secondary controls ("AI assist", "Advanced"). */
function Disclosure({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: "none",
          border: "none",
          color: T.textDim,
          fontSize: 11.5,
          cursor: "pointer",
          padding: 0,
          fontFamily: T.font,
        }}
      >
        {open ? "▾" : "▸"} {label}
      </button>
      {open && <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>{children}</div>}
    </div>
  );
}

/** Manual drawing tools shared by the Walls and Openings steps. */
function DrawTools({ tools }: { tools: ("wall" | "door" | "window")[] }) {
  const mode = useSceneStore((s) => s.mode);
  const setMode = useSceneStore((s) => s.setMode);
  const ortho = useSceneStore((s) => s.ortho);
  const setOrtho = useSceneStore((s) => s.setOrtho);
  const drawKind = useSceneStore((s) => s.drawKind);
  const setDrawKind = useSceneStore((s) => s.setDrawKind);
  const undo = useSceneStore((s) => s.undo);
  const finishChain = useSceneStore((s) => s.finishChain);
  const deleteSelected = useSceneStore((s) => s.deleteSelected);
  const selectedPointId = useSceneStore((s) => s.selectedPointId);
  const selectedOpeningId = useSceneStore((s) => s.selectedOpeningId);
  const icons = { door: "🚪 Door", window: "🪟 Window" } as const;
  const pickWall = (kind: SegmentKind) => {
    setMode("wall");
    setDrawKind(kind);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={microLabel()}>Draw by hand</div>
      <div style={{ display: "flex", gap: 4 }}>
        {tools.includes("wall") && (
          <>
            <button
              style={chip(mode === "wall" && drawKind === "wall", { flex: 1, textAlign: "center" })}
              onClick={() => pickWall("wall")}
            >
              ✏️ Wall
            </button>
            <button
              style={chip(mode === "wall" && drawKind === "rail", { flex: 1, textAlign: "center" })}
              onClick={() => pickWall("rail")}
              title="Balcony/terrace railing — low, see-through barrier that bounds an outdoor space"
            >
              ▭ Rail
            </button>
            <button
              style={chip(mode === "wall" && drawKind === "portal", { flex: 1, textAlign: "center" })}
              onClick={() => pickWall("portal")}
              title="Open boundary — closes the room without building anything. Use where a space simply gives onto the next (living room to corridor); no wall, no door needed."
            >
              ⇿ Open
            </button>
          </>
        )}
        {tools.filter((t) => t !== "wall").map((t) => (
          <button
            key={t}
            style={chip(mode === t, { flex: 1, textAlign: "center" })}
            onClick={() => {
              setMode(t);
              setDrawKind("wall");
            }}
          >
            {icons[t as "door" | "window"]}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {tools.includes("wall") && (
          <button style={chip(ortho, { flex: 1 })} onClick={() => setOrtho(!ortho)} title="Constrain walls to 90° (Shift inverts per click)">
            ⊾ 90°
          </button>
        )}
        <button style={chip(false, { flex: 1 })} onClick={undo}>↶ Undo</button>
        <button style={chip(false, { flex: 1 })} onClick={finishChain}>Finish</button>
        <button
          style={chip(false, { flex: 1, opacity: selectedPointId || selectedOpeningId ? 1 : 0.4 })}
          onClick={deleteSelected}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

interface StepDef {
  n: number;
  label: string;
  done: boolean;
  locked: boolean;
  status?: string;
}

export function TraceRail() {
  const image = useSceneStore((s) => s.image);
  const imageOpacity = useSceneStore((s) => s.imageOpacity);
  const setImageOpacity = useSceneStore((s) => s.setImageOpacity);
  const importedSegments = useSceneStore((s) => s.importedSegments);
  const showImport = useSceneStore((s) => s.showImport);
  const setShowImport = useSceneStore((s) => s.setShowImport);
  const importBusy = useSceneStore((s) => s.importBusy);
  const importMsg = useSceneStore((s) => s.importMsg);
  const importPlanFile = useSceneStore((s) => s.importPlanFile);
  const sourcePdfName = useSceneStore((s) => s.sourcePdfName);

  const metersPerPixel = useSceneStore((s) => s.metersPerPixel);
  const calibrationPts = useSceneStore((s) => s.calibrationPts);
  const applyCalibration = useSceneStore((s) => s.applyCalibration);
  const cancelCalibration = useSceneStore((s) => s.cancelCalibration);
  const mode = useSceneStore((s) => s.mode);
  const setMode = useSceneStore((s) => s.setMode);

  const wallSnap = useSceneStore((s) => s.wallSnap);
  const setWallSnap = useSceneStore((s) => s.setWallSnap);

  const points = useSceneStore((s) => s.points);
  const segments = useSceneStore((s) => s.segments);
  const openings = useSceneStore((s) => s.openings);
  const clearTrace = useSceneStore((s) => s.clearTrace);
  const setScene = useSceneStore((s) => s.setScene);
  const setAppMode = useSceneStore((s) => s.setAppMode);

  const traceStep = useSceneStore((s) => s.traceStep);
  const setTraceStep = useSceneStore((s) => s.setTraceStep);

  const [distance, setDistance] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const scaleSet = metersPerPixel != null;
  const hasPdf = importedSegments.length > 0;
  const analysis = useMemo(() => analyzeLoops(points, segments), [points, segments]);
  const canGenerate = analysis.loops.length > 0 && scaleSet;

  // Auto-advance: the rail follows your progress.
  const prevScale = useRef(scaleSet);
  useEffect(() => {
    if (!prevScale.current && scaleSet && traceStep === 2) setTraceStep(3);
    prevScale.current = scaleSet;
  }, [scaleSet, traceStep, setTraceStep]);

  const steps: StepDef[] = [
    {
      n: 1, label: "Plan", done: !!image, locked: false,
      status: image ? (sourcePdfName ?? "loaded") : "import a floor plan",
    },
    {
      n: 2, label: "Scale", done: scaleSet, locked: !image,
      status: scaleSet ? `1 m ≈ ${(1 / metersPerPixel!).toFixed(0)} px` : "two clicks + a distance",
    },
    {
      n: 3, label: "Walls", done: segments.length > 0, locked: !scaleSet,
      status: segments.length > 0 ? `${segments.length} traced` : "draw the walls by hand",
    },
    {
      n: 4, label: "Openings", done: openings.length > 0, locked: !scaleSet,
      status: openings.length > 0 ? `${openings.length} placed` : "doors & windows",
    },
    {
      n: 5, label: "Build", done: false, locked: !scaleSet,
      status: analysis.loops.length > 0 ? `${analysis.loops.length} room${analysis.loops.length > 1 ? "s" : ""} ready` : "close a room loop",
    },
  ];

  const applyScale = () => {
    const cm = Number(distance);
    if (cm > 0) {
      applyCalibration(cm / 100);
      setDistance("");
    }
  };

  const generate = () => {
    if (metersPerPixel == null) return;
    const texts = useSceneStore.getState().importedTexts;
    setScene(traceToScene({ points, segments, openings, metersPerPixel, texts }));
    setAppMode("build");
  };

  const stepBody = (n: number): React.ReactNode => {
    switch (n) {
      case 1:
        return (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp,application/pdf,.pdf"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importPlanFile(f);
                e.target.value = "";
              }}
            />
            <button style={primaryBtn(!importBusy)} disabled={importBusy} onClick={() => fileRef.current?.click()}>
              {importBusy ? "Importing…" : image ? "Replace plan…" : "Import plan…"}
            </button>
            <div style={hintText}>Image (PNG/JPG/WebP) or PDF — CAD PDFs import their vectors, scans go through the image pipeline.</div>
            {importMsg && <div style={statusText(importMsg.startsWith("✓"))}>{importMsg}</div>}
            {image && (
              <>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: T.textDim }}>
                  Plan opacity
                  <input
                    type="range"
                    min={0} max={1} step={0.05}
                    value={imageOpacity}
                    onChange={(e) => setImageOpacity(Number(e.target.value))}
                    style={{ flex: 1 }}
                  />
                </label>
                {hasPdf && (
                  <button style={railBtn(showImport)} onClick={() => setShowImport(!showImport)}>
                    {showImport ? "✓ " : ""}Vector overlay
                  </button>
                )}
              </>
            )}
          </>
        );
      case 2:
        return (
          <>
            {scaleSet && mode !== "calibrate" ? (
              <>
                <div style={statusText(true)}>✓ Scale set — 1 m ≈ {(1 / metersPerPixel!).toFixed(1)} px</div>
                <button style={railBtn()} onClick={() => setMode("calibrate")}>📏 Redo scale</button>
              </>
            ) : (
              <>
                {mode !== "calibrate" && (
                  <button style={primaryBtn()} onClick={() => setMode("calibrate")}>📏 Set scale</button>
                )}
                {mode === "calibrate" && calibrationPts.length < 2 && (
                  <div style={{ ...statusText(false), fontWeight: 600 }}>
                    Click two points a known distance apart on the plan ({calibrationPts.length}/2)
                  </div>
                )}
                {mode === "calibrate" && calibrationPts.length >= 2 && (
                  <>
                    <div style={hintText}>Real distance between the two points:</div>
                    <div style={{ display: "flex", gap: 5 }}>
                      <input
                        type="number" step="1" min="0" autoFocus
                        value={distance}
                        placeholder="cm"
                        onChange={(e) => setDistance(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && applyScale()}
                        onWheel={(e) => {
                          e.preventDefault();
                          const dir = e.deltaY < 0 ? 1 : -1;
                          const cur = Number(distance) || 0;
                          setDistance(String(Math.max(0, cur + dir)));
                        }}
                        style={field({ width: 90 })}
                      />
                      <span style={{ color: T.textFaint, fontSize: 11.5 }}>cm</span>
                      <button style={chip(true)} onClick={applyScale}>Apply</button>
                      <button style={chip(false)} onClick={cancelCalibration}>Cancel</button>
                    </div>
                  </>
                )}
                <div style={hintText}>A doorway is ~90 cm; a dimension line from the plan is even better.</div>
              </>
            )}
          </>
        );
      case 3:
        return (
          <>
            {hasPdf && (
              <Disclosure label="Advanced (PDF)">
                <button style={railBtn(wallSnap)} onClick={() => setWallSnap(!wallSnap)}>
                  🧲 Snap tracing to PDF centerlines
                </button>
              </Disclosure>
            )}
            <DrawTools tools={["wall"]} />
            <button style={{ ...hintText, background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }} onClick={clearTrace}>
              Clear the whole trace…
            </button>
          </>
        );
      case 4:
        return (
          <>
            <div style={hintText}>
              Draw doors and windows by hand: pick a tool below, then click two points along a wall.
            </div>
            <DrawTools tools={["door", "window"]} />
          </>
        );
      case 5:
        return (
          <>
            <div style={{ fontSize: 12, color: T.textDim, lineHeight: 1.6 }}>
              {segments.length} wall{segments.length === 1 ? "" : "s"} · {openings.length} opening{openings.length === 1 ? "" : "s"} ·{" "}
              <span style={{ color: analysis.loops.length ? T.ok : T.warn }}>
                {analysis.loops.length} room{analysis.loops.length === 1 ? "" : "s"}
              </span>
              {analysis.hasOpenChain && <span style={{ color: T.warn }}> · open chain</span>}
            </div>
            {!canGenerate && (
              <div style={hintText}>Close at least one room loop — walls must connect back on themselves to make a floor.</div>
            )}
            <button style={primaryBtn(canGenerate)} disabled={!canGenerate} onClick={generate}>
              Generate 3D model →
            </button>
            <div style={hintText}>Builds the model and takes you to Build mode. Everything stays editable in 3D.</div>
            <button
              style={{ ...hintText, background: "none", border: "none", cursor: segments.length ? "pointer" : "default", textAlign: "left", padding: 0, opacity: segments.length ? 1 : 0.4 }}
              disabled={!segments.length}
              onClick={() =>
                downloadGroundTruth(
                  buildGroundTruth({
                    sourcePdf: sourcePdfName,
                    metersPerPixel,
                    imageSize: image ? { width: image.width, height: image.height } : null,
                    points,
                    segments,
                    openings,
                  }),
                )
              }
            >
              ⬇ Export ground truth (eval)
            </button>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        left: 14,
        top: 64,
        bottom: 14,
        width: 264,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        padding: 8,
        gap: 4,
        ...glass(),
      }}
    >
      {steps.map((s) => {
        const active = traceStep === s.n;
        return (
          <div key={s.n}>
            <button
              onClick={() => !s.locked && setTraceStep(s.n)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "8px 9px",
                borderRadius: T.radiusS,
                border: "none",
                background: active ? "rgba(255,255,255,0.07)" : "transparent",
                cursor: s.locked ? "default" : "pointer",
                opacity: s.locked ? 0.38 : 1,
                textAlign: "left",
                fontFamily: T.font,
                transition: `background ${T.dur} ${T.ease}`,
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  flexShrink: 0,
                  background: s.done ? T.ok : active ? T.accent : T.inputBg,
                  color: s.done || active ? "#fff" : T.textDim,
                }}
              >
                {s.done ? "✓" : s.n}
              </span>
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: T.text }}>{s.label}</span>
                {s.status && (
                  <span style={{ fontSize: 10.5, color: T.textFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
                    {s.status}
                  </span>
                )}
              </span>
            </button>
            {active && !s.locked && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "6px 9px 12px 41px" }}>
                {stepBody(s.n)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
