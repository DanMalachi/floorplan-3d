"use client";

// The guided trace rail (Phase 5 T1): the whole trace pipeline as five
// steps — Plan · Scale · Walls · Openings · Build — with exactly one step's
// controls visible at a time. Replaces the old all-at-once toolbar.

import { useEffect, useMemo, useRef, useState } from "react";
import { useSceneStore } from "@/store/useSceneStore";
import { analyzeLoops } from "@/lib/loops";
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
  const undo = useSceneStore((s) => s.undo);
  const finishChain = useSceneStore((s) => s.finishChain);
  const deleteSelected = useSceneStore((s) => s.deleteSelected);
  const selectedPointId = useSceneStore((s) => s.selectedPointId);
  const selectedOpeningId = useSceneStore((s) => s.selectedOpeningId);
  const icons = { wall: "✏️ Wall", door: "🚪 Door", window: "🪟 Window" } as const;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={microLabel()}>Draw by hand</div>
      <div style={{ display: "flex", gap: 4 }}>
        {tools.map((t) => (
          <button key={t} style={chip(mode === t, { flex: 1, textAlign: "center" })} onClick={() => setMode(t)}>
            {icons[t]}
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

  const suggestedWalls = useSceneStore((s) => s.suggestedWalls);
  const rejectedSuggestionIds = useSceneStore((s) => s.rejectedSuggestionIds);
  const clearSuggestions = useSceneStore((s) => s.clearSuggestions);
  const acceptSuggestions = useSceneStore((s) => s.acceptSuggestions);
  const runWallExtraction = useSceneStore((s) => s.runWallExtraction);
  const extractBusy = useSceneStore((s) => s.extractBusy);
  const extractMsg = useSceneStore((s) => s.extractMsg);
  const wallSnap = useSceneStore((s) => s.wallSnap);
  const setWallSnap = useSceneStore((s) => s.setWallSnap);
  const pickThickness = useSceneStore((s) => s.pickThickness);
  const setPickThickness = useSceneStore((s) => s.setPickThickness);
  const extractionTargets = useSceneStore((s) => s.extractionTargets);
  const clearThicknessTargets = useSceneStore((s) => s.clearThicknessTargets);

  const vlmModel = useSceneStore((s) => s.vlmModel);
  const setVlmModel = useSceneStore((s) => s.setVlmModel);
  const planHint = useSceneStore((s) => s.planHint);
  const setPlanHint = useSceneStore((s) => s.setPlanHint);
  const vlmBusy = useSceneStore((s) => s.vlmBusy);
  const aiClassify = useSceneStore((s) => s.aiClassify);

  const suggestedOpenings = useSceneStore((s) => s.suggestedOpenings);
  const rejectedOpeningIds = useSceneStore((s) => s.rejectedOpeningIds);
  const detectOpeningsOnTrace = useSceneStore((s) => s.detectOpeningsOnTrace);
  const acceptOpenings = useSceneStore((s) => s.acceptOpenings);
  const clearOpenings = useSceneStore((s) => s.clearOpenings);

  const points = useSceneStore((s) => s.points);
  const segments = useSceneStore((s) => s.segments);
  const openings = useSceneStore((s) => s.openings);
  const clearTrace = useSceneStore((s) => s.clearTrace);
  const setScene = useSceneStore((s) => s.setScene);
  const setAppMode = useSceneStore((s) => s.setAppMode);

  const traceStep = useSceneStore((s) => s.traceStep);
  const setTraceStep = useSceneStore((s) => s.setTraceStep);

  const [distance, setDistance] = useState("");
  const [aiMsg, setAiMsg] = useState<string | null>(null);
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

  const keptWalls = suggestedWalls.length - rejectedSuggestionIds.length;
  const keptOpenings = suggestedOpenings.length - rejectedOpeningIds.length;
  const doorCount = suggestedOpenings.filter((o) => o.type === "door").length;

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
      status: segments.length > 0 ? `${segments.length} traced` : "auto-detect or draw",
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
    const m = Number(distance);
    if (m > 0) {
      applyCalibration(m);
      setDistance("");
    }
  };

  const generate = () => {
    if (metersPerPixel == null) return;
    setScene(traceToScene({ points, segments, openings, metersPerPixel }));
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
                        type="number" step="0.01" min="0" autoFocus
                        value={distance}
                        placeholder="meters"
                        onChange={(e) => setDistance(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && applyScale()}
                        style={field({ width: 90 })}
                      />
                      <button style={chip(true)} onClick={applyScale}>Apply</button>
                      <button style={chip(false)} onClick={cancelCalibration}>Cancel</button>
                    </div>
                  </>
                )}
                <div style={hintText}>A doorway is ~0.9 m; a dimension line from the plan is even better.</div>
              </>
            )}
          </>
        );
      case 3:
        return (
          <>
            <button style={primaryBtn(!extractBusy)} disabled={extractBusy} onClick={runWallExtraction}>
              {extractBusy ? "✨ Detecting…" : "✨ Auto-detect walls"}
            </button>
            {extractMsg && <div style={statusText(extractMsg.startsWith("✓"))}>{extractMsg}</div>}
            {suggestedWalls.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 9px", borderRadius: T.radiusS, background: T.accentSoft }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>
                  {keptWalls} wall{keptWalls === 1 ? "" : "s"} suggested
                  {rejectedSuggestionIds.length > 0 && <span style={{ color: T.textDim, fontWeight: 400 }}> · {rejectedSuggestionIds.length} rejected</span>}
                </div>
                <div style={hintText}>Click a suggested wall on the plan to reject it, click again to restore.</div>
                <div style={{ display: "flex", gap: 5 }}>
                  <button
                    style={chip(true, { flex: 1, textAlign: "center", fontWeight: 600, background: T.ok, opacity: keptWalls ? 1 : 0.4 })}
                    disabled={!keptWalls}
                    onClick={() => {
                      acceptSuggestions();
                      setTraceStep(4);
                    }}
                  >
                    ✓ Accept {keptWalls}
                  </button>
                  <button style={chip(false, { flex: 1, textAlign: "center" })} onClick={clearSuggestions}>Discard</button>
                </div>
              </div>
            )}
            <Disclosure label="AI assist">
              <button
                style={railBtn(false, { opacity: vlmBusy ? 0.5 : 1 })}
                disabled={vlmBusy}
                onClick={async () => {
                  setAiMsg("🤖 Asking the model — this can take a minute or two…");
                  setAiMsg(await aiClassify());
                }}
              >
                {vlmBusy ? "🤖 Classifying…" : "🤖 AI classify candidates"}
              </button>
              <select value={vlmModel} onChange={(e) => setVlmModel(e.target.value)} style={field()}>
                <option value="claude-opus-4-8">Opus 4.8 · best</option>
                <option value="claude-sonnet-5">Sonnet 5 · faster</option>
                <option value="claude-haiku-4-5">Haiku 4.5 · cheapest</option>
              </select>
              <input
                type="text"
                value={planHint}
                onChange={(e) => setPlanHint(e.target.value)}
                placeholder="Describe the plan (optional)"
                title="One line about the plan — rooms, decks, door types. Helps the AI tell walls from railings."
                style={field()}
              />
              {aiMsg && <div style={statusText(aiMsg.startsWith("✓"))}>{aiMsg}</div>}
            </Disclosure>
            {hasPdf && (
              <Disclosure label="Advanced (PDF)">
                <button style={railBtn(pickThickness)} onClick={() => setPickThickness(!pickThickness)}>
                  🎯 Learn wall thickness {pickThickness ? "— click a wall" : ""}
                </button>
                {extractionTargets.length > 0 && (
                  <div style={{ ...hintText, display: "flex", gap: 6, alignItems: "center" }}>
                    ≈ {extractionTargets.map((t) => `${t}px`).join(", ")}
                    <button style={chip(false, { padding: "1px 7px" })} onClick={clearThicknessTargets}>reset</button>
                  </div>
                )}
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
            {hasPdf && (
              <button style={primaryBtn(segments.length > 0)} disabled={segments.length === 0} onClick={detectOpeningsOnTrace}>
                ✨ Detect doors & windows
              </button>
            )}
            {!hasPdf && suggestedOpenings.length === 0 && (
              <div style={hintText}>
                Openings from auto-detect appear here for review. You can also draw them: pick a tool below, then click two points along a wall.
              </div>
            )}
            {suggestedOpenings.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 9px", borderRadius: T.radiusS, background: T.accentSoft }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>
                  {doorCount} door{doorCount === 1 ? "" : "s"} · {suggestedOpenings.length - doorCount} window{suggestedOpenings.length - doorCount === 1 ? "" : "s"}
                  {rejectedOpeningIds.length > 0 && <span style={{ color: T.textDim, fontWeight: 400 }}> · {rejectedOpeningIds.length} rejected</span>}
                </div>
                <div style={hintText}>Amber = doors, cyan = windows. Click one on the plan to reject it.</div>
                <div style={{ display: "flex", gap: 5 }}>
                  <button
                    style={chip(true, { flex: 1, textAlign: "center", fontWeight: 600, background: T.ok, opacity: keptOpenings ? 1 : 0.4 })}
                    disabled={!keptOpenings}
                    onClick={() => {
                      acceptOpenings();
                      setTraceStep(5);
                    }}
                  >
                    ✓ Accept {keptOpenings}
                  </button>
                  <button style={chip(false, { flex: 1, textAlign: "center" })} onClick={clearOpenings}>Discard</button>
                </div>
              </div>
            )}
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
