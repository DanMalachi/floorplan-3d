"use client";

import { useMemo, useState } from "react";
import { useSceneStore } from "@/store/useSceneStore";
import { analyzeLoops } from "@/lib/loops";
import { traceToScene } from "./traceToScene";
import { importPdf } from "./importPdf";

const btn = (active = false): React.CSSProperties => ({
  padding: "6px 10px",
  fontSize: 13,
  borderRadius: 6,
  border: "1px solid #3a3a40",
  background: active ? "#2f6f8f" : "#26262b",
  color: "#e6e6e6",
  cursor: "pointer",
});

// A labeled cluster of controls. `disabled` hard-gates the whole group
// (dimmed + non-interactive); `highlight` draws attention (used for Scale).
function Section({
  label,
  disabled = false,
  highlight = false,
  children,
}: {
  label: string;
  disabled?: boolean;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 3,
        opacity: disabled ? 0.4 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      <span
        style={{
          fontSize: 9,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          fontWeight: 700,
          color: highlight ? "#ffcc33" : "#70707a",
          paddingLeft: 2,
        }}
      >
        {label}
      </span>
      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          padding: highlight ? "3px 6px" : "3px 0",
          border: `1px solid ${highlight ? "#ffcc33" : "transparent"}`,
          borderRadius: 6,
          background: highlight ? "rgba(255,204,51,0.09)" : "transparent",
        }}
      >
        {children}
      </div>
    </div>
  );
}

const Sep = () => <span style={{ width: 1, alignSelf: "stretch", background: "#2f2f35" }} />;

export function Toolbar() {
  const image = useSceneStore((s) => s.image);
  const imageOpacity = useSceneStore((s) => s.imageOpacity);
  const setImage = useSceneStore((s) => s.setImage);
  const setImageOpacity = useSceneStore((s) => s.setImageOpacity);
  const importedSegments = useSceneStore((s) => s.importedSegments);
  const showImport = useSceneStore((s) => s.showImport);
  const setImportedSegments = useSceneStore((s) => s.setImportedSegments);
  const setImportedArcs = useSceneStore((s) => s.setImportedArcs);
  const setShowImport = useSceneStore((s) => s.setShowImport);
  const suggestedWalls = useSceneStore((s) => s.suggestedWalls);
  const rejectedSuggestionIds = useSceneStore((s) => s.rejectedSuggestionIds);
  const clearSuggestions = useSceneStore((s) => s.clearSuggestions);
  const acceptSuggestions = useSceneStore((s) => s.acceptSuggestions);
  const runWallExtraction = useSceneStore((s) => s.runWallExtraction);
  const suggestedOpenings = useSceneStore((s) => s.suggestedOpenings);
  const rejectedOpeningIds = useSceneStore((s) => s.rejectedOpeningIds);
  const detectOpeningsOnTrace = useSceneStore((s) => s.detectOpeningsOnTrace);
  const acceptOpenings = useSceneStore((s) => s.acceptOpenings);
  const clearOpenings = useSceneStore((s) => s.clearOpenings);
  const extractionTargets = useSceneStore((s) => s.extractionTargets);
  const clearThicknessTargets = useSceneStore((s) => s.clearThicknessTargets);
  const pickThickness = useSceneStore((s) => s.pickThickness);
  const setPickThickness = useSceneStore((s) => s.setPickThickness);
  const wallSnap = useSceneStore((s) => s.wallSnap);
  const setWallSnap = useSceneStore((s) => s.setWallSnap);
  const mode = useSceneStore((s) => s.mode);
  const setMode = useSceneStore((s) => s.setMode);
  const ortho = useSceneStore((s) => s.ortho);
  const setOrtho = useSceneStore((s) => s.setOrtho);
  const undo = useSceneStore((s) => s.undo);
  const finishChain = useSceneStore((s) => s.finishChain);
  const clearTrace = useSceneStore((s) => s.clearTrace);
  const deleteSelected = useSceneStore((s) => s.deleteSelected);
  const selectedPointId = useSceneStore((s) => s.selectedPointId);
  const selectedOpeningId = useSceneStore((s) => s.selectedOpeningId);
  const metersPerPixel = useSceneStore((s) => s.metersPerPixel);
  const calibrationPts = useSceneStore((s) => s.calibrationPts);
  const applyCalibration = useSceneStore((s) => s.applyCalibration);
  const cancelCalibration = useSceneStore((s) => s.cancelCalibration);
  const points = useSceneStore((s) => s.points);
  const segments = useSceneStore((s) => s.segments);
  const openings = useSceneStore((s) => s.openings);
  const activeLastPointId = useSceneStore((s) => s.activeLastPointId);
  const setScene = useSceneStore((s) => s.setScene);

  const [distance, setDistance] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const analysis = useMemo(() => analyzeLoops(points, segments), [points, segments]);

  const onImportPdf = async (file: File) => {
    setImporting(true);
    setImportMsg(null);
    try {
      const r = await importPdf(file);
      setImage(r.image);
      if (!r.isVector) {
        setImportedSegments([]);
        setImportedArcs([]);
        setImageOpacity(0.8);
        setImportMsg(
          "⚠ This PDF looks rasterized/scanned — vector extraction is out of scope. The page is loaded as a background so you can trace it manually.",
        );
      } else {
        setImageOpacity(0.45);
        setImportedSegments(r.segments);
        setImportedArcs(r.arcs);
        setShowImport(true);
        setImportMsg(
          `✓ Vector PDF: parsed ${r.stats.segments} segments + ${r.stats.arcs} arcs${r.pageCount > 1 ? ` (page 1 of ${r.pageCount})` : ""}.`,
        );
      }
      // Step ①: a plan without a scale can't become a real model — go set it now.
      if (metersPerPixel == null) setMode("calibrate");
    } catch (e) {
      setImportMsg("Import failed: " + (e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const scaleSet = metersPerPixel != null;
  const canGenerate = analysis.loops.length > 0 && scaleSet;

  const generate = () => {
    if (metersPerPixel == null) return;
    setScene(traceToScene({ points, segments, openings, metersPerPixel }));
  };

  const applyScale = () => {
    const m = Number(distance);
    if (m > 0) {
      applyCalibration(m);
      setDistance("");
    }
  };

  const keptCount = suggestedWalls.length - rejectedSuggestionIds.length;
  const keptOpenings = suggestedOpenings.length - rejectedOpeningIds.length;
  const openDoors = suggestedOpenings.filter((o) => o.type === "door").length;
  const openWindows = suggestedOpenings.length - openDoors;
  const hasPdf = importedSegments.length > 0;

  const onUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const img = new window.Image();
      img.onload = () => {
        setImage({ src, width: img.naturalWidth, height: img.naturalHeight });
        if (metersPerPixel == null) setMode("calibrate");
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const hint = (() => {
    if (mode === "calibrate") return null; // its own row below
    if (mode === "door" || mode === "window")
      return `Click two points along a wall to trace a ${mode} — its width is the span between them. Click a marker to select, Delete to remove.`;
    const orthoNote = ortho ? "Ortho on (Shift = free angle)." : "Ortho off (Shift = 90°).";
    if (activeLastPointId)
      return `Click to extend. Snap onto a wall to add an internal wall (splits it → new room) or a corner to close. Esc/Finish to stop. ${orthoNote}`;
    return `Click empty space to start a wall, or click an existing point/wall to start from there. Drag a point to move, Delete to remove. ${orthoNote}`;
  })();

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        alignItems: "flex-start",
        padding: "8px 10px",
        borderBottom: "1px solid #2a2a2e",
        background: "#1a1a1d",
      }}
    >
      {/* ── Plan ────────────────────────────────────────────────── */}
      <Section label="Plan">
        <label style={btn()}>
          Upload
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = "";
            }}
          />
        </label>
        <label style={{ ...btn(), background: importing ? "#26262b" : "#3a4d6b", borderColor: "#4a6088" }}>
          {importing ? "Importing…" : "⤓ Import PDF"}
          <input
            type="file"
            accept="application/pdf,.pdf"
            disabled={importing}
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportPdf(f);
              e.target.value = "";
            }}
          />
        </label>
        {hasPdf && (
          <button style={btn(showImport)} onClick={() => setShowImport(!showImport)}>
            Overlay {showImport ? "on" : "off"}
          </button>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#aaa" }}>
          Opacity
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={imageOpacity}
            disabled={!image}
            onChange={(e) => setImageOpacity(Number(e.target.value))}
          />
        </label>
      </Section>

      <Sep />

      {/* ── ① Scale (must be set before anything else) ───────────── */}
      <Section label="① Scale" highlight={!scaleSet}>
        <button
          style={btn(mode === "calibrate")}
          onClick={() => setMode("calibrate")}
          title="Click two points a known distance apart, then type the real distance."
        >
          📏 {scaleSet ? "Redo scale" : "Set scale"}
        </button>
        <span style={{ fontSize: 12, fontWeight: 600, color: scaleSet ? "#46dc78" : "#ffcc33" }}>
          {scaleSet ? `✓ 1 m ≈ ${(1 / metersPerPixel!).toFixed(1)} px` : "not set"}
        </span>
      </Section>

      <Sep />

      {/* ── Walls (from PDF) ─────────────────────────────────────── */}
      {hasPdf && (
        <>
          <Section label="Walls (PDF)" disabled={!scaleSet}>
            <button
              style={{ ...btn(), background: "#5a3f7a", borderColor: "#7a5aa0", color: "#fff" }}
              onClick={runWallExtraction}
              title="Detect walls from the imported PDF (double-line → centerline)"
            >
              🧱 Extract
            </button>
            <button
              style={btn(pickThickness)}
              onClick={() => setPickThickness(!pickThickness)}
              title="Click a real wall in the plan to learn its thickness; extraction then keeps only walls of calibrated thicknesses."
            >
              🎯 Calibrate {pickThickness ? "(click a wall)" : ""}
            </button>
            <button
              style={btn(wallSnap)}
              onClick={() => setWallSnap(!wallSnap)}
              title="In Wall mode, snap clicks to the wall centerline/corner computed from the imported PDF."
            >
              🧲 Snap {wallSnap ? "on" : "off"}
            </button>
            {extractionTargets.length > 0 && (
              <span style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 12, color: "#bcd" }}>
                ≈ {extractionTargets.map((t) => `${t}px`).join(", ")}
                <button style={{ ...btn(), padding: "2px 6px" }} onClick={clearThicknessTargets}>
                  reset
                </button>
              </span>
            )}
            {suggestedWalls.length > 0 && (
              <>
                <button
                  style={{ ...btn(), background: "#2e8b57", borderColor: "#3fae6f", color: "#fff", fontWeight: 600 }}
                  onClick={acceptSuggestions}
                  disabled={keptCount === 0}
                >
                  ✓ Accept {keptCount}
                </button>
                <button style={btn()} onClick={clearSuggestions}>Discard</button>
              </>
            )}
          </Section>

          <Sep />

          {/* ── Openings (doors + windows) ─────────────────────────── */}
          <Section label="Openings" disabled={!scaleSet}>
            <button
              style={{ ...btn(), background: "#7a5a2f", borderColor: "#a07a3a", color: "#fff" }}
              onClick={detectOpeningsOnTrace}
              disabled={segments.length === 0}
              title="Scan the imported PDF along your traced/accepted walls for doors (breaks) and windows (cramped triple-lines)."
            >
              🚪 Detect
            </button>
            {suggestedOpenings.length > 0 && (
              <>
                <button
                  style={{ ...btn(), background: "#2e8b57", borderColor: "#3fae6f", color: "#fff", fontWeight: 600 }}
                  onClick={acceptOpenings}
                  disabled={keptOpenings === 0}
                >
                  ✓ Accept {keptOpenings}
                </button>
                <button style={btn()} onClick={clearOpenings}>Discard</button>
              </>
            )}
          </Section>

          <Sep />
        </>
      )}

      {/* ── Draw ─────────────────────────────────────────────────── */}
      <Section label="Draw" disabled={!scaleSet}>
        <button style={btn(mode === "wall")} onClick={() => setMode("wall")}>✏️ Wall</button>
        <button style={btn(mode === "door")} onClick={() => setMode("door")}>🚪 Door</button>
        <button style={btn(mode === "window")} onClick={() => setMode("window")}>🪟 Window</button>
        <button
          style={btn(ortho)}
          onClick={() => setOrtho(!ortho)}
          title="Constrain walls to 90°. Hold Shift while clicking to temporarily invert."
        >
          ⊾ Ortho {ortho ? "on" : "off"}
        </button>
      </Section>

      <Sep />

      {/* ── Edit ─────────────────────────────────────────────────── */}
      <Section label="Edit" disabled={!scaleSet}>
        <button style={btn()} onClick={undo}>↶ Undo</button>
        <button style={btn()} onClick={finishChain}>Finish</button>
        <button style={btn()} onClick={deleteSelected} disabled={!selectedPointId && !selectedOpeningId}>
          Delete
        </button>
        <button style={btn()} onClick={clearTrace}>Clear</button>
      </Section>

      <Sep />

      {/* ── Build ────────────────────────────────────────────────── */}
      <Section label="Build" disabled={!scaleSet}>
        <button
          onClick={generate}
          disabled={!canGenerate}
          title={
            canGenerate
              ? "Build the 3D model from the traced rooms"
              : "Close at least one room loop first"
          }
          style={{
            ...btn(),
            background: canGenerate ? "#2e8b57" : "#26262b",
            borderColor: canGenerate ? "#3fae6f" : "#3a3a40",
            color: canGenerate ? "#fff" : "#777",
            fontWeight: 600,
            cursor: canGenerate ? "pointer" : "not-allowed",
          }}
        >
          🧱 Generate 3D →
        </button>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: analysis.loops.length > 0 ? "#46dc78" : "#c9a14a",
          }}
        >
          {analysis.loops.length > 0
            ? `✓ ${analysis.loops.length} room${analysis.loops.length > 1 ? "s" : ""}`
            : "no room yet"}
          {analysis.hasOpenChain && " · ⌁ open"}
        </span>
      </Section>

      {/* ══ status + hint rows (full width) ══════════════════════════ */}

      {/* Scale-first banner */}
      {!scaleSet && (
        <span
          style={{
            flexBasis: "100%",
            fontSize: 12.5,
            fontWeight: 600,
            color: "#ffcc33",
            background: "rgba(255,204,51,0.08)",
            border: "1px solid rgba(255,204,51,0.4)",
            borderRadius: 6,
            padding: "6px 10px",
          }}
        >
          ① Set the scale first. Everything else stays locked until then. Click{" "}
          <b>📏 Set scale</b>, click two points a known distance apart, then type the real distance.
        </span>
      )}

      {/* PDF import status */}
      {importMsg && (
        <span
          style={{
            flexBasis: "100%",
            fontSize: 12,
            color: importMsg.startsWith("✓") ? "#9fe0a0" : "#e0b85a",
          }}
        >
          {importMsg}
        </span>
      )}

      {/* Suggested-walls review hint */}
      {suggestedWalls.length > 0 && (
        <span style={{ flexBasis: "100%", fontSize: 12, color: "#c9a0ff" }}>
          {suggestedWalls.length} suggested walls (orange) — click any to reject (turns dim);{" "}
          {rejectedSuggestionIds.length} rejected. Accept welds the rest into editable walls; then snapping + room detection take over.
        </span>
      )}

      {/* Suggested-openings review hint */}
      {suggestedOpenings.length > 0 && (
        <span style={{ flexBasis: "100%", fontSize: 12, color: "#e0b878" }}>
          {openDoors} door{openDoors === 1 ? "" : "s"} (amber) + {openWindows} window
          {openWindows === 1 ? "" : "s"} (cyan) suggested — click any to reject;{" "}
          {rejectedOpeningIds.length} rejected. Accept carves them into the walls they sit on.
        </span>
      )}

      {/* Per-mode hint */}
      {scaleSet && hint && (
        <span style={{ flexBasis: "100%", fontSize: 12, color: "#7f8a93" }}>{hint}</span>
      )}

      {/* Calibration distance entry */}
      {mode === "calibrate" && (
        <div
          style={{
            flexBasis: "100%",
            display: "flex",
            gap: 8,
            alignItems: "center",
            fontSize: 12,
            color: "#ffcc33",
          }}
        >
          {calibrationPts.length < 2 ? (
            <span>Click two points a known distance apart on the plan ({calibrationPts.length}/2)…</span>
          ) : (
            <>
              <span>Real distance between the two points:</span>
              <input
                type="number"
                step="0.01"
                min="0"
                autoFocus
                value={distance}
                placeholder="meters"
                onChange={(e) => setDistance(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyScale();
                }}
                style={{ width: 90, padding: "3px 6px", borderRadius: 4, border: "1px solid #555", background: "#222", color: "#eee" }}
              />
              <button style={btn(true)} onClick={applyScale}>Apply</button>
              <button style={btn()} onClick={cancelCalibration}>Cancel</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
