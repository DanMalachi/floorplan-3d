"use client";

// The guided trace rail (Phase 5 T1): the whole trace pipeline as six
// steps — Plan · Scale · Walls · Openings · Stairs · Build — with exactly one
// step's controls visible at a time. Replaces the old all-at-once toolbar.

import { useEffect, useMemo, useRef, useState } from "react";
import { useSceneStore } from "@/store/useSceneStore";
import type { SegmentKind } from "./types";
import { analyzeLoops } from "../lib/loops";
import type React from "react";
import { PD, pdGlass, pdChip, pdMicroLabel, pdGhostBtn, pdHoverTransition } from "@/ui/planDock/tokens";
import { useHover } from "@/ui/planDock/useHover";
import { Tooltip } from "@/ui/planDock/Tooltip";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DoorIcon,
  DownloadIcon,
  MagnetIcon,
  MeasureIcon,
  OrthoIcon,
  PassageIcon,
  PencilIcon,
  RailIcon,
  UndoIcon,
  WallToolIcon,
  WarnIcon,
  WindowIcon,
} from "@/ui/planDock/icons";
import { NumField } from "@/ui/NumField";
import { DEFAULT_THICKNESS } from "@/schema/constants";
import { MAX_STAIR_WIDTH, MIN_STAIR_WIDTH, stairMetrics } from "@/lib/stairs/stairGeometry";
import { traceToScene } from "./traceToScene";
import { preserveSceneEdits } from "@/lib/scene/preserveEdits";
import { squareUpScene } from "@/lib/scene/squareUp";
import { reglueKitchen } from "@/parametric/kitchenAttach";
import { pdToast } from "@/ui/planDock/toast";
import { buildGroundTruth, downloadGroundTruth } from "./exportGroundTruth";

// Precedent pair from src/dev/gtToScene.ts (interior 0.1 / exterior 0.2) —
// not a new number, just reused as the Exterior preset here.
const EXTERIOR_THICKNESS = 0.2;

// ── Local shims onto the Plan Dock token set ────────────────────────────────
// This file used to compose src/ui/tokens.ts (`T`), the app's second design
// language — the one that painted an active chip a SOLID #0a84ff while the
// dock painted the same control a 22% tint. Everything is on `PD` now.
//
// `chip` and `field` are shimmed rather than swapped at each call site for one
// specific reason: **`pdChip` accepts an `extra` argument and DROPS it**, while
// the `chip()` these seven call sites were written against SPREAD it. A bare
// substitution would have silently lost every override in this file. Spreading
// once, here, is safer than rewriting seven call sites into the
// `{ ...pdChip(a), ...extra }` form and hoping none was missed.
const chip = (active = false, extra?: React.CSSProperties): React.CSSProperties => ({
  ...pdChip(active),
  ...extra,
});
const glass = pdGlass;
const microLabel = pdMicroLabel;
const field = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: PD.inputBg,
  border: `1px solid ${PD.hairline}`,
  borderRadius: PD.radiusS,
  color: PD.textPrimary,
  padding: "4px 8px",
  fontSize: 12.5,
  fontFamily: PD.fontUi,
  outline: "none",
  ...extra,
});
/** Hover overlay for a `chip()`-shaped button. Replaces hoverT's `tChipHover`:
 *  an active chip is already tinted, so hover only lifts the REST state —
 *  deepening an active tint reads as "pressed", not "under the cursor". */
const tChipHover = (hovered: boolean, active: boolean): React.CSSProperties =>
  active || !hovered
    ? { transition: pdHoverTransition(hovered) }
    : { background: PD.surfaceMutedHover, color: PD.textPrimary, transition: pdHoverTransition(hovered) };
const tGhostBtn = (hovered: boolean, extra?: React.CSSProperties): React.CSSProperties =>
  pdGhostBtn(hovered, extra);

const railBtn = (active = false, extra?: React.CSSProperties): React.CSSProperties =>
  chip(active, { width: "100%", textAlign: "left", padding: "7px 11px", ...extra });

/** Shared shape for the "Draw by hand" tool strip — five equal chips, each an
 *  icon plus a word. Tighter than the default chip on purpose: the rail has
 *  ~196px of content width, and "Door / Patio" has to sit beside "Window". */
const toolChip: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  padding: "5px 6px",
  fontSize: 11.5,
  minWidth: 0,
  whiteSpace: "nowrap",
};

const primaryBtn = (enabled = true): React.CSSProperties => ({
  ...chip(enabled),
  width: "100%",
  textAlign: "center",
  fontWeight: 600,
  padding: "9px 11px",
  opacity: enabled ? 1 : 0.45,
  cursor: enabled ? "pointer" : "not-allowed",
});

/**
 * "Finish" — the control that ends a live drawing gesture. It is the only
 * button in the rail whose moment matters: it does something exactly while a
 * chain or a stair draft is open, and nothing at all otherwise. Sitting in a
 * row of four identical chips it was easy to miss, so ARMED it turns green and
 * glows (`.fp-armed` in globals.css). Green, not the rail's accent blue —
 * blue everywhere else means "this mode is selected", not "commit this".
 * Idle it dims, which is honest: clicking it then does nothing.
 */
const finishBtn = (armed: boolean): React.CSSProperties => ({
  ...chip(false, {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    whiteSpace: "nowrap",
  }),
  // `border` (shorthand), never `borderColor`: `chip` already sets the
  // shorthand, and React warns — correctly — that dropping a longhand on
  // rerender while a conflicting shorthand stays is how stale borders happen.
  ...(armed
    ? { background: PD.ok, border: "1px solid transparent", color: "#0a2e14", fontWeight: 700 }
    : { opacity: 0.5 }),
});

const hintText: React.CSSProperties = { fontSize: 11.5, lineHeight: 1.45, color: PD.textTertiary };
const statusText = (ok: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "flex-start",
  gap: 5,
  fontSize: 11.5,
  lineHeight: 1.45,
  color: ok ? PD.ok : PD.warnText,
});

/** The ✓ / ⚠ that used to be typed into the front of a status string. Kept as
 *  one component so every status line in the rail reads the same, and so the
 *  MESSAGE stays a plain sentence — the store no longer bakes a glyph into it
 *  (see useSceneStore.importStatus). */
function StatusIcon({ ok }: { ok: boolean }) {
  return (
    <span style={{ flex: "0 0 auto", lineHeight: 0, paddingTop: 1 }}>
      {ok ? <CheckIcon size={12} /> : <WarnIcon size={12} />}
    </span>
  );
}

/** A `chip()` button with hover. `useHover` is a hook, so every chip rendered
 *  in a loop (or simply repeated) needs its own component to hold the flag —
 *  that is the whole reason this wrapper exists. */
function Chip({
  active = false,
  extra,
  styler = chip,
  tip,
  children,
  ...rest
}: {
  active?: boolean;
  extra?: React.CSSProperties;
  /** `chip` (default) or `railBtn` / `primaryBtn`-shaped variants. */
  styler?: (active: boolean, extra?: React.CSSProperties) => React.CSSProperties;
  /** Hover explanation, rendered in the app's glass Tooltip. Deliberately not
   *  `title`: a native title is the white browser window that matches nothing
   *  in the app, and several of these are full sentences that it renders in a
   *  single unwrapped line. */
  tip?: string;
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "style">) {
  const [hov, bind] = useHover();
  const btn = (
    <button {...rest} {...bind} style={styler(active, { ...extra, ...tChipHover(hov, active) })}>
      {children}
    </button>
  );
  return tip ? <Tooltip label={tip}>{btn}</Tooltip> : btn;
}

/** The step's primary action (Import plan / Set scale / Generate). Enabled-ness
 *  rides on `active` here because that is what `primaryBtn` already keyed off. */
function PrimaryButton({
  enabled = true,
  children,
  ...rest
}: { enabled?: boolean; children: React.ReactNode } & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "style"
>) {
  const [hov, bind] = useHover();
  return (
    <button {...rest} {...bind} style={{ ...primaryBtn(enabled), ...(enabled ? tChipHover(hov, true) : {}) }}>
      {children}
    </button>
  );
}

/** A text-only action that is styled like a hint line (Clear the trace, Export
 *  ground truth). */
function TextAction({
  children,
  extra,
  ...rest
}: { children: React.ReactNode; extra?: React.CSSProperties } & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "style"
>) {
  const [hov, bind] = useHover();
  return (
    <button
      {...rest}
      {...bind}
      style={{
        ...hintText,
        ...tGhostBtn(hov, {
          justifyContent: "flex-start",
          textAlign: "left",
          padding: "2px 4px",
          margin: "0 -4px",
          fontSize: 11.5,
          color: hov ? PD.textSecondary : PD.textTertiary,
        }),
        ...extra,
      }}
    >
      {children}
    </button>
  );
}

/** The wrapping four-chip action row (90° · Undo · Finish · Delete). */
const rowChip: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  whiteSpace: "nowrap",
};

/** "Finish" — the one control in the rail whose moment matters. Armed it turns
 *  green and grows a tick; idle it dims, which is honest. */
function FinishButton({
  armed,
  onClick,
  kind,
}: {
  armed: boolean;
  onClick: () => void;
  kind: "walls" | "stair";
}) {
  const [hov, bind] = useHover();
  const tip =
    kind === "walls"
      ? armed
        ? "End this run of walls — the next click starts a fresh one (Esc does the same)"
        : "Ends a run of walls once you've started one"
      : armed
        ? "Commit this staircase (Esc does the same)"
        : "Commits a staircase once you've started one";
  return (
    <Tooltip label={tip}>
      <button
        className={armed ? "fp-armed" : undefined}
        onClick={onClick}
        {...bind}
        style={{ ...finishBtn(armed), ...(hov ? { filter: "brightness(1.1)" } : {}) }}
      >
        {armed && <CheckIcon size={13} />} Finish
      </button>
    </Tooltip>
  );
}

/** Collapsible secondary controls ("AI assist", "Advanced"). */
function Disclosure({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [hov, bind] = useHover();
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        {...bind}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          background: "none",
          border: "none",
          color: hov ? PD.textPrimary : PD.textSecondary,
          fontSize: 11.5,
          cursor: "pointer",
          padding: 0,
          fontFamily: PD.fontUi,
          transition: `color ${PD.dur} ${PD.ease}`,
        }}
      >
        {open ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />} {label}
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
  const drawThickness = useSceneStore((s) => s.drawThickness);
  const setDrawThickness = useSceneStore((s) => s.setDrawThickness);
  const drawHeight = useSceneStore((s) => s.drawHeight);
  const setDrawHeight = useSceneStore((s) => s.setDrawHeight);
  const undo = useSceneStore((s) => s.undo);
  const finishChain = useSceneStore((s) => s.finishChain);
  const deleteSelected = useSceneStore((s) => s.deleteSelected);
  const selectedPointId = useSceneStore((s) => s.selectedPointId);
  const selectedOpeningId = useSceneStore((s) => s.selectedOpeningId);
  // A wall chain is open: every further click extends it until Finish (or Esc).
  const drawingChain = useSceneStore((s) => s.activeLastPointId) != null;
  // "Door / Patio", not "Door": `effectiveSlide()` (src/render/doorStyle.ts)
  // turns any door at or past PATIO_MIN_WIDTH into a glazed patio slider, so
  // this one tool genuinely places either. The stored enum stays `"door"`.
  const openings = {
    door: { Icon: DoorIcon, label: "Door / Patio" },
    window: { Icon: WindowIcon, label: "Window" },
  } as const;
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
            <Chip
              active={mode === "wall" && drawKind === "wall"}
              extra={toolChip}
              onClick={() => pickWall("wall")}
            >
              <WallToolIcon size={13} /> Wall
            </Chip>
            <Chip
              active={mode === "wall" && drawKind === "rail"}
              extra={toolChip}
              onClick={() => pickWall("rail")}
              tip="Balcony/terrace railing — low, see-through barrier that bounds an outdoor space"
            >
              <RailIcon size={13} /> Rail
            </Chip>
            <Chip
              active={mode === "wall" && drawKind === "portal"}
              extra={toolChip}
              onClick={() => pickWall("portal")}
              tip="Open boundary — closes the room without building anything. Use where a space simply gives onto the next (living room to corridor); no wall, no door needed."
            >
              <PassageIcon size={13} /> Open
            </Chip>
          </>
        )}
        {tools.filter((t) => t !== "wall").map((t) => {
          const { Icon, label } = openings[t as "door" | "window"];
          return (
            <Chip
              key={t}
              active={mode === t}
              extra={toolChip}
              onClick={() => {
                setMode(t);
                setDrawKind("wall");
              }}
            >
              <Icon size={13} /> {label}
            </Chip>
          );
        })}
      </div>
      {tools.includes("wall") && drawKind !== "portal" && (
        <>
          <div style={{ display: "flex", gap: 4 }}>
            <Chip
              active={drawThickness === DEFAULT_THICKNESS}
              extra={{ flex: 1, textAlign: "center" }}
              onClick={() => setDrawThickness(DEFAULT_THICKNESS)}
            >
              Interior
            </Chip>
            <Chip
              active={drawThickness === EXTERIOR_THICKNESS}
              extra={{ flex: 1, textAlign: "center" }}
              onClick={() => setDrawThickness(EXTERIOR_THICKNESS)}
            >
              Exterior
            </Chip>
          </div>
          <NumField
            label="Height"
            value={drawHeight}
            onCommit={(v) => setDrawHeight(Math.min(6, Math.max(0.5, v)))}
            displayScale={100}
            unit="cm"
          />
          <NumField
            label="Thickness"
            value={drawThickness}
            onCommit={(v) => setDrawThickness(Math.min(1, Math.max(0.05, v)))}
            displayScale={100}
            unit="cm"
          />
        </>
      )}
      {/* Four chips do not fit the rail's ~196px of content width (they want
          ~224), so this row has always clipped Delete. Wrapping is the honest
          fix — and required now that Finish grows a tick mark when armed. */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {tools.includes("wall") && (
          <Chip active={ortho} extra={rowChip} onClick={() => setOrtho(!ortho)} tip="Constrain walls to 90° (Shift inverts per click)">
            <OrthoIcon size={13} /> 90°
          </Chip>
        )}
        <Chip extra={rowChip} onClick={undo}>
          <UndoIcon size={13} /> Undo
        </Chip>
        <FinishButton armed={drawingChain} onClick={finishChain} kind="walls" />
        <Chip
          extra={{ ...rowChip, opacity: selectedPointId || selectedOpeningId ? 1 : 0.4 }}
          onClick={deleteSelected}
        >
          Delete
        </Chip>
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

/** One row of the rail's step list. Its own component so it can hold a hover
 *  flag — the six step headers are the rail's navigation and had none. */
function StepHeader({ step, active, onOpen }: { step: StepDef; active: boolean; onOpen: () => void }) {
  const [hov, bind] = useHover();
  return (
    <button
      onClick={onOpen}
      {...bind}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "8px 9px",
        borderRadius: PD.radiusS,
        border: "none",
        background: active
          ? "rgba(255,255,255,0.07)"
          : hov && !step.locked
            ? "rgba(255,255,255,0.045)"
            : "transparent",
        cursor: step.locked ? "default" : "pointer",
        opacity: step.locked ? 0.38 : 1,
        textAlign: "left",
        fontFamily: PD.fontUi,
        transition: `background ${PD.dur} ${PD.ease}`,
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
          background: step.done ? PD.ok : active ? PD.accent : PD.inputBg,
          color: step.done || active ? "#fff" : PD.textSecondary,
        }}
      >
        {step.done ? <CheckIcon size={13} /> : step.n}
      </span>
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: PD.textPrimary }}>{step.label}</span>
        {step.status && (
          <span
            style={{
              fontSize: 10.5,
              color: PD.textTertiary,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 180,
            }}
          >
            {step.status}
          </span>
        )}
      </span>
    </button>
  );
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
  const importStatus = useSceneStore((s) => s.importStatus);
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
  const stairs = useSceneStore((s) => s.stairs);
  const stairDrafting = useSceneStore((s) => s.stairDraft) != null;
  const selectedStairId = useSceneStore((s) => s.selectedStairId);
  const drawStairWidth = useSceneStore((s) => s.drawStairWidth);
  const drawStairRise = useSceneStore((s) => s.drawStairRise);
  const setDrawStairWidth = useSceneStore((s) => s.setDrawStairWidth);
  const setDrawStairRise = useSceneStore((s) => s.setDrawStairRise);
  const updateStair = useSceneStore((s) => s.updateStair);
  const finishChain = useSceneStore((s) => s.finishChain);
  const deleteSelected = useSceneStore((s) => s.deleteSelected);
  const clearTrace = useSceneStore((s) => s.clearTrace);
  const setScene = useSceneStore((s) => s.setScene);
  const setAppMode = useSceneStore((s) => s.setAppMode);

  const traceStep = useSceneStore((s) => s.traceStep);
  const setTraceStep = useSceneStore((s) => s.setTraceStep);

  const [distance, setDistance] = useState("");
  const [squareUp, setSquareUp] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const scaleSet = metersPerPixel != null;
  // DXF/DWG only. PDFs no longer carry vectors — theirs landed offset from the
  // page render, so they made tracing harder (see importPdfClient.ts).
  const hasVectors = importedSegments.length > 0;
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
      n: 5, label: "Stairs", done: stairs.length > 0, locked: !scaleSet,
      status: stairs.length > 0 ? `${stairs.length} placed` : "optional — steps & levels",
    },
    {
      n: 6, label: "Build", done: false, locked: !scaleSet,
      status: analysis.loops.length > 0 ? `${analysis.loops.length} room${analysis.loops.length > 1 ? "s" : ""} ready` : "close a room loop",
    },
  ];

  // Edits land on the SELECTED stair; with nothing selected they set the
  // pending values the next traced stair starts from (the drawThickness /
  // drawHeight contract). Committing a stair selects it, so in practice the
  // fields are already pointed at the one just drawn.
  const selectedStair = stairs.find((s) => s.id === selectedStairId) ?? null;
  const stairWidth = selectedStair ? selectedStair.width : drawStairWidth;
  const stairRise = selectedStair ? selectedStair.rise : drawStairRise;

  const commitStairWidth = (v: number) => {
    const w = Math.min(MAX_STAIR_WIDTH, Math.max(MIN_STAIR_WIDTH, v));
    if (selectedStair) updateStair(selectedStair.id, { width: w });
    setDrawStairWidth(w); // sticky, as after a width click
  };
  const commitStairRise = (v: number) => {
    const r = Math.min(6, Math.max(0.1, v));
    if (selectedStair) updateStair(selectedStair.id, { rise: r });
    setDrawStairRise(r);
  };

  // The stair the readout describes: the selected one, else the last placed.
  // Its numbers come from src/lib/stairs on a METERS copy of the traced axis —
  // the same call the canvas and the 3D mesh make, so all three agree.
  const stairTarget = useMemo(() => {
    const t = stairs.find((s) => s.id === selectedStairId) ?? stairs[stairs.length - 1];
    if (!t || metersPerPixel == null) return null;
    const mpp = metersPerPixel;
    return {
      stair: t,
      metrics: stairMetrics({
        id: t.id,
        flights: t.flights.map((f) => ({
          x0: f.x0 * mpp, y0: f.y0 * mpp, x1: f.x1 * mpp, y1: f.y1 * mpp,
        })),
        width: t.width,
        rise: t.rise,
        ...(t.steps != null ? { steps: t.steps } : {}),
      }),
    };
  }, [stairs, selectedStairId, metersPerPixel]);

  const applyScale = () => {
    const cm = Number(distance);
    if (cm > 0) {
      applyCalibration(cm / 100);
      setDistance("");
    }
  };

  const generate = () => {
    if (metersPerPixel == null) return;
    const prev = useSceneStore.getState();
    const texts = prev.importedTexts;
    const traced = traceToScene({ points, segments, openings, stairs, metersPerPixel, texts });
    // Square up before anything downstream sees the geometry. A hand trace
    // leaves a tail of near-square walls (the ortho lock doesn't apply on the
    // vertex/wall/CAD snap branches), and everything that runs ALONG a wall
    // pays for it — worst of all the kitchen, whose L-runs turn exact right
    // angles. Real diagonals are left alone; see src/lib/scene/squareUp.ts.
    const squared = squareUp ? squareUpScene(traced) : null;
    // Re-derive everything the trace owns, but keep what only 3D knows: paint,
    // floors, door joinery, stair style, furniture. Without this, correcting one
    // wall in the trace would throw away every decision made in Build/Decorate.
    const merged = preserveSceneEdits(prev.scene, squared?.scene ?? traced);
    // The walls just moved under a kitchen that was already built, so re-glue
    // it rather than leaving runs floating a centimetre off their wall.
    setScene(squared?.report.straightened ? reglueKitchen(merged) : merged);
    setAppMode("build");
    const r = squared?.report;
    if (r?.straightened) {
      const shift = Math.round(r.maxShift * 100);
      pdToast(
        `Squared up ${r.straightened} wall${r.straightened === 1 ? "" : "s"}` +
          (r.diagonals ? `, kept ${r.diagonals} angled` : "") +
          (shift >= 10 ? ` — moved a corner by ${shift}cm, worth a look` : ""),
      );
    }
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
            <PrimaryButton enabled={!importBusy} disabled={importBusy} onClick={() => fileRef.current?.click()}>
              {importBusy ? "Importing…" : image ? "Replace plan…" : "Import plan…"}
            </PrimaryButton>
            <div style={hintText}>Image (PNG/JPG/WebP) or PDF — every PDF imports as a page you trace over. CAD vectors come from DXF/DWG.</div>
            {importMsg && (
              <div style={statusText(importStatus === "ok")}>
                <StatusIcon ok={importStatus === "ok"} />
                <span>{importMsg}</span>
              </div>
            )}
            {image && (
              <>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: PD.textSecondary }}>
                  Plan opacity
                  <input
                    type="range"
                    min={0} max={1} step={0.05}
                    value={imageOpacity}
                    onChange={(e) => setImageOpacity(Number(e.target.value))}
                    style={{ flex: 1 }}
                  />
                </label>
                {hasVectors && (
                  <Chip
                    styler={railBtn}
                    active={showImport}
                    extra={{ display: "flex", alignItems: "center", gap: 5 }}
                    onClick={() => setShowImport(!showImport)}
                  >
                    {showImport && <CheckIcon size={12} />} CAD vector overlay
                  </Chip>
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
                <div style={statusText(true)}>
                  <StatusIcon ok />
                  <span>Scale set — 1 m ≈ {(1 / metersPerPixel!).toFixed(1)} px</span>
                </div>
                <Chip
                  styler={railBtn}
                  extra={{ display: "flex", alignItems: "center", gap: 6 }}
                  onClick={() => setMode("calibrate")}
                >
                  <MeasureIcon size={13} /> Redo scale
                </Chip>
              </>
            ) : (
              <>
                {mode !== "calibrate" && (
                  <PrimaryButton
                    onClick={() => setMode("calibrate")}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <MeasureIcon size={13} /> Set scale
                    </span>
                  </PrimaryButton>
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
                      <span style={{ color: PD.textTertiary, fontSize: 11.5 }}>cm</span>
                      <Chip active onClick={applyScale}>Apply</Chip>
                      <Chip onClick={cancelCalibration}>Cancel</Chip>
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
            {hasVectors && (
              <Disclosure label="Advanced (CAD)">
                <Chip
                  styler={railBtn}
                  active={wallSnap}
                  extra={{ display: "flex", alignItems: "center", gap: 6 }}
                  onClick={() => setWallSnap(!wallSnap)}
                >
                  <MagnetIcon size={13} />
                  <span>Snap tracing to CAD centerlines</span>
                </Chip>
              </Disclosure>
            )}
            <DrawTools tools={["wall"]} />
            <TextAction onClick={clearTrace}>Clear the whole trace…</TextAction>
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
            <div style={hintText}>
              Click the foot of the run, then its head, then either long edge to set
              the width. Keep clicking to add flights — the flat gap you leave between
              two of them becomes the landing. Esc finishes the staircase.
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <Chip active={mode === "stair"} extra={rowChip} onClick={() => setMode("stair")}>
                <PencilIcon size={13} /> Stair
              </Chip>
              <FinishButton armed={stairDrafting} onClick={finishChain} kind="stair" />
              <Chip
                extra={{ ...rowChip, opacity: selectedStair ? 1 : 0.4 }}
                onClick={deleteSelected}
              >
                Delete
              </Chip>
            </div>
            <NumField label="Width" value={stairWidth} onCommit={commitStairWidth} displayScale={100} unit="cm" />
            <NumField label="Rise" value={stairRise} onCommit={commitStairRise} displayScale={100} unit="cm" />
            <div style={hintText}>
              Rise is the TOTAL climb of the whole staircase — a full storey by default,
              less for a terrace, a stoop or a split level.
            </div>
            {stairTarget && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <NumField
                      label="Steps"
                      value={stairTarget.metrics.steps}
                      unit=""
                      disabled={!selectedStair}
                      onCommit={(v) =>
                        selectedStair &&
                        updateStair(selectedStair.id, { steps: Math.max(1, Math.round(v)) })
                      }
                    />
                  </div>
                  <Chip
                    active={stairTarget.stair.steps == null}
                    extra={{ opacity: selectedStair ? 1 : 0.4 }}
                    tip="Derive the step count from the rise again"
                    onClick={() => selectedStair && updateStair(selectedStair.id, { steps: null })}
                  >
                    Auto
                  </Chip>
                </div>
                <div style={hintText}>
                  Nudge Steps until the ladder on the canvas lines up with the treads
                  drawn on the plan — then the model matches the drawing.
                </div>
                <div style={{ fontSize: 12, color: PD.textSecondary, lineHeight: 1.6 }}>
                  {stairTarget.stair.flights.length} flight
                  {stairTarget.stair.flights.length === 1 ? "" : "s"} ·{" "}
                  {stairTarget.metrics.steps} steps · riser{" "}
                  {Math.round(stairTarget.metrics.riser * 100)} cm · tread{" "}
                  {Math.round(stairTarget.metrics.going * 100)} cm ·{" "}
                  {Math.round(
                    (Math.atan2(stairTarget.metrics.riser, stairTarget.metrics.going) * 180) / Math.PI,
                  )}
                  °
                </div>
                {/* Advisory only: a plan may legitimately show a stair that
                    fails a rule of thumb, so nothing here blocks Generate. */}
                {stairTarget.metrics.warnings.map((w, i) => (
                  <div key={i} style={statusText(false)}>
                    <StatusIcon ok={false} />
                    <span>{w}</span>
                  </div>
                ))}
              </>
            )}
          </>
        );
      case 6:
        return (
          <>
            <div style={{ fontSize: 12, color: PD.textSecondary, lineHeight: 1.6 }}>
              {segments.length} wall{segments.length === 1 ? "" : "s"} · {openings.length} opening{openings.length === 1 ? "" : "s"} ·{" "}
              <span style={{ color: analysis.loops.length ? PD.ok : PD.warnText }}>
                {analysis.loops.length} room{analysis.loops.length === 1 ? "" : "s"}
              </span>
              {analysis.hasOpenChain && <span style={{ color: PD.warnText }}> · open chain</span>}
            </div>
            {!canGenerate && (
              <div style={hintText}>Close at least one room loop — walls must connect back on themselves to make a floor.</div>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: PD.textSecondary }}>
              <input type="checkbox" checked={squareUp} onChange={(e) => setSquareUp(e.target.checked)} />
              Square up near-square walls
            </label>
            <div style={hintText}>
              Straightens walls traced a degree or two out — the ortho lock lets them
              through whenever you click onto an existing corner or the plan underneath.
              Genuinely angled walls are left as drawn.
            </div>
            <PrimaryButton enabled={canGenerate} disabled={!canGenerate} onClick={generate}>
              Generate 3D model →
            </PrimaryButton>
            <div style={hintText}>Builds the model and takes you to Build mode. Everything stays editable in 3D.</div>
            <TextAction
              extra={{ cursor: segments.length ? "pointer" : "default", opacity: segments.length ? 1 : 0.4 }}
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
              <DownloadIcon size={12} /> Export ground truth (eval)
            </TextAction>
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
      {steps.map((s) => (
        <div key={s.n}>
          <StepHeader step={s} active={traceStep === s.n} onOpen={() => !s.locked && setTraceStep(s.n)} />
          {traceStep === s.n && !s.locked && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "6px 9px 12px 41px" }}>
              {stepBody(s.n)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
