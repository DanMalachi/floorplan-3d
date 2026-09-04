"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type Konva from "konva";
import { Circle, Group, Image as KImage, Layer, Line, Shape, Stage, Text } from "react-konva";
import { useSceneStore } from "@/store/useSceneStore";
import type { ImportSegment, TraceStair } from "./types";
import type { Stair } from "@/schema/scene";
import {
  clampStairWidth,
  perpDistanceToFlight,
  stairLandings,
  stairMetrics,
} from "@/lib/stairs/stairGeometry";
import type { StairMetrics } from "@/lib/stairs/stairGeometry";
import { analyzeLoops } from "../lib/loops";
import { snapWallPoint } from "./snapWall";
import { useHover } from "@/ui/hoverT";
import { FitIcon, MinusIcon, PlusIcon } from "@/ui/planDock/icons";

// Group raw import segments by stroke color so the overlay draws each color in a
// single canvas path (fast redraws even with ~16k segments).
function groupByColor(segs: ImportSegment[]): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  for (const s of segs) {
    const c = s.color
      ? `rgb(${(s.color[0] * 255) | 0},${(s.color[1] * 255) | 0},${(s.color[2] * 255) | 0})`
      : "#888888";
    let arr = groups.get(c);
    if (!arr) {
      arr = [];
      groups.set(c, arr);
    }
    arr.push(s.x0, s.y0, s.x1, s.y1);
  }
  return groups;
}

const PAD = 24;
const MAX_UPSCALE = 6;
const DOOR_COLOR = "#e0852b";
const WINDOW_COLOR = "#2bd4e0";
const STAIR_COLOR = "#b98cff"; // violet — taken by nothing else on this canvas

interface StairFlightDrawing {
  envelope: number[]; // closed quad, image px
  treads: number[][]; // one line per interior step boundary, image px
  foot: { x: number; y: number };
  dir: { x: number; y: number };
}

interface StairDrawing {
  flights: StairFlightDrawing[];
  landings: number[][]; // derived footprints, closed polys in image px
  metrics: StairMetrics;
}

/**
 * Everything needed to draw one traced staircase, in image pixels.
 *
 * A traced stair mixes units on purpose (axis in px, width/rise in meters), so
 * the derivation makes one round trip through `src/lib/stairs` in METERS and
 * comes back to px. The canvas therefore draws the staircase the 3D mesh will
 * actually build — same step count, same landings — instead of a second,
 * drifting copy of the maths.
 */
function stairDrawing(stair: TraceStair, mpp: number): StairDrawing {
  const asScene: Stair = {
    id: stair.id,
    flights: stair.flights.map((f) => ({
      x0: f.x0 * mpp,
      y0: f.y0 * mpp,
      x1: f.x1 * mpp,
      y1: f.y1 * mpp,
    })),
    width: stair.width,
    rise: stair.rise,
    ...(stair.steps != null ? { steps: stair.steps } : {}),
  };
  const metrics = stairMetrics(asScene);
  const half = stair.width / mpp / 2; // half-width, back in pixels

  const flights = stair.flights.map((f, i) => {
    const dx = f.x1 - f.x0;
    const dy = f.y1 - f.y0;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy * half; // half-width offset across the run
    const ny = ux * half;

    const treads: number[][] = [];
    const steps = metrics.flights[i]?.steps ?? 0;
    // Interior boundaries only: the two ends are already drawn by the envelope.
    for (let k = 1; k < steps; k++) {
      const along = (len * k) / steps;
      const cx = f.x0 + ux * along;
      const cy = f.y0 + uy * along;
      treads.push([cx + nx, cy + ny, cx - nx, cy - ny]);
    }

    return {
      envelope: [
        f.x0 + nx, f.y0 + ny,
        f.x1 + nx, f.y1 + ny,
        f.x1 - nx, f.y1 - ny,
        f.x0 - nx, f.y0 - ny,
      ],
      treads,
      foot: { x: f.x0, y: f.y0 },
      dir: { x: ux, y: uy },
    };
  });

  const landings = stairLandings(asScene).map((l) =>
    l.poly.flatMap((p) => [p.x / mpp, p.y / mpp]),
  );

  return { flights, landings, metrics };
}

const zbtn = (hovered = false): CSSProperties => ({
  width: 30,
  height: 30,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: "1",
  borderRadius: 6,
  border: `1px solid ${hovered ? "#55555e" : "#3a3a40"}`,
  background: hovered ? "rgba(56,56,63,0.92)" : "rgba(38,38,43,0.85)",
  color: hovered ? "#ffffff" : "#e6e6e6",
  cursor: "pointer",
  transition: "background 140ms ease, border-color 140ms ease, color 140ms ease",
});

/** One of the three canvas zoom controls. Its own component so it can hold a
 *  hover flag: these float over the plan with nothing else to say they are
 *  live. */
function ZoomButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const [hov, bind] = useHover();
  return (
    <button style={zbtn(hov)} title={title} onClick={onClick} {...bind}>
      {children}
    </button>
  );
}

function useContainerSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  return { ref, size };
}

function useHtmlImage(src: string | null) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) {
      setImg(null);
      return;
    }
    const i = new window.Image();
    i.onload = () => setImg(i);
    i.src = src;
  }, [src]);
  return img;
}

interface SegHit {
  segmentId: string;
  t: number;
  dist: number;
}

function nearestSegment(
  px: number,
  py: number,
  pointMap: Map<string, { x: number; y: number }>,
  segments: { id: string; a: string; b: string }[],
): SegHit | null {
  let best: SegHit | null = null;
  for (const s of segments) {
    const a = pointMap.get(s.a);
    const b = pointMap.get(s.b);
    if (!a || !b) continue;
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len2 = abx * abx + aby * aby;
    if (len2 < 1e-9) continue;
    let t = ((px - a.x) * abx + (py - a.y) * aby) / len2;
    t = Math.min(1, Math.max(0, t));
    const projx = a.x + abx * t;
    const projy = a.y + aby * t;
    const dist = Math.hypot(px - projx, py - projy);
    if (!best || dist < best.dist) best = { segmentId: s.id, t, dist };
  }
  return best;
}

function projectTOnSegment(
  px: number,
  py: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-9) return 0;
  const t = ((px - a.x) * abx + (py - a.y) * aby) / len2;
  return Math.min(1, Math.max(0, t));
}

type Target =
  | { kind: "vertex"; nodeId: string; point: { x: number; y: number } }
  | { kind: "edge"; segmentId: string; point: { x: number; y: number } }
  | { kind: "free"; point: { x: number; y: number }; snapped?: boolean };

export default function TraceCanvas() {
  const { ref, size } = useContainerSize();
  const groupRef = useRef<Konva.Group>(null);
  const shiftRef = useRef(false);
  // Pan/zoom view transform (null = use the computed fit). Reset on new image.
  const [view, setView] = useState<{ scale: number; x: number; y: number } | null>(null);

  const [openingStart, setOpeningStart] = useState<{ segmentId: string; t0: number } | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);

  const image = useSceneStore((s) => s.image);
  const imageOpacity = useSceneStore((s) => s.imageOpacity);
  const importedSegments = useSceneStore((s) => s.importedSegments);
  const showImport = useSceneStore((s) => s.showImport);
  const wallSnap = useSceneStore((s) => s.wallSnap);
  const points = useSceneStore((s) => s.points);
  const segments = useSceneStore((s) => s.segments);
  const openings = useSceneStore((s) => s.openings);
  const selectedPointId = useSceneStore((s) => s.selectedPointId);
  const selectedOpeningId = useSceneStore((s) => s.selectedOpeningId);
  const activeLastPointId = useSceneStore((s) => s.activeLastPointId);
  const mode = useSceneStore((s) => s.mode);
  const ortho = useSceneStore((s) => s.ortho);
  const calibrationPts = useSceneStore((s) => s.calibrationPts);
  const metersPerPixel = useSceneStore((s) => s.metersPerPixel);

  const addPoint = useSceneStore((s) => s.addPoint);
  const connectToNode = useSceneStore((s) => s.connectToNode);
  const attachToSegment = useSceneStore((s) => s.attachToSegment);
  const movePoint = useSceneStore((s) => s.movePoint);
  const beginDrag = useSceneStore((s) => s.beginDrag);
  const selectPoint = useSceneStore((s) => s.selectPoint);
  const selectOpening = useSceneStore((s) => s.selectOpening);
  const addOpeningSpan = useSceneStore((s) => s.addOpeningSpan);
  const deleteSelected = useSceneStore((s) => s.deleteSelected);
  const finishChain = useSceneStore((s) => s.finishChain);
  const undo = useSceneStore((s) => s.undo);
  const addCalibrationPoint = useSceneStore((s) => s.addCalibrationPoint);
  const stairs = useSceneStore((s) => s.stairs);
  const stairDraft = useSceneStore((s) => s.stairDraft);
  const selectedStairId = useSceneStore((s) => s.selectedStairId);
  const drawStairWidth = useSceneStore((s) => s.drawStairWidth);
  const drawStairRise = useSceneStore((s) => s.drawStairRise);
  const stairClick = useSceneStore((s) => s.stairClick);
  const selectStair = useSceneStore((s) => s.selectStair);

  const htmlImg = useHtmlImage(image?.src ?? null);

  const fit = useMemo(() => {
    if (!image || size.w === 0 || size.h === 0) return { scale: 1, x: 0, y: 0 };
    const f = Math.min(
      (size.w - PAD * 2) / image.width,
      (size.h - PAD * 2) / image.height,
    );
    const scale = Math.min(Math.max(f, 0.01), MAX_UPSCALE);
    return {
      scale,
      x: (size.w - image.width * scale) / 2,
      y: (size.h - image.height * scale) / 2,
    };
  }, [image, size]);

  // Reset pan/zoom whenever a new background image loads.
  useEffect(() => {
    setView(null);
  }, [image?.src]);

  const scale = view ? view.scale : fit.scale;
  const offsetX = view ? view.x : fit.x;
  const offsetY = view ? view.y : fit.y;

  const pointMap = useMemo(() => new Map(points.map((p) => [p.id, p])), [points]);
  const segMap = useMemo(() => new Map(segments.map((s) => [s.id, s])), [segments]);
  const analysis = useMemo(() => analyzeLoops(points, segments), [points, segments]);
  const importGroups = useMemo(() => groupByColor(importedSegments), [importedSegments]);

  useEffect(() => {
    if (mode !== "door" && mode !== "window") setOpeningStart(null);
    setPointer(null);
  }, [mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "Delete" || e.key === "Backspace") deleteSelected();
      else if (e.key === "Escape") {
        finishChain();
        setOpeningStart(null);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSelected, undo, finishChain]);

  // Resolve a raw cursor position into a concrete target: snap to a nearby
  // vertex (magnet), else snap onto a nearby wall (magnet, splits it), else a
  // free point with optional 90° ortho constraint relative to the chain end.
  const resolveTarget = (pos: { x: number; y: number }, shift: boolean): Target => {
    const VSNAP = 12 / scale;
    const ESNAP = 10 / scale;

    let bestV: { id: string; x: number; y: number } | null = null;
    let bestVd = VSNAP;
    for (const p of points) {
      if (p.id === activeLastPointId) continue;
      const d = Math.hypot(p.x - pos.x, p.y - pos.y);
      if (d < bestVd) {
        bestVd = d;
        bestV = p;
      }
    }
    if (bestV) return { kind: "vertex", nodeId: bestV.id, point: { x: bestV.x, y: bestV.y } };

    // An existing traced wall outranks the imported plan underneath it. Traced
    // walls sit ON the imported centrelines, so if the CAD snap were tried first
    // it would always win and hand back a detached free point — the click would
    // look right but never join the graph, so the room could not close.
    const hit = nearestSegment(pos.x, pos.y, pointMap, segments);
    if (hit && hit.dist <= ESNAP) {
      const seg = segMap.get(hit.segmentId);
      const incident = seg && (seg.a === activeLastPointId || seg.b === activeLastPointId);
      if (seg && !incident) {
        const a = pointMap.get(seg.a);
        const b = pointMap.get(seg.b);
        if (a && b) {
          return {
            kind: "edge",
            segmentId: hit.segmentId,
            point: { x: a.x + (b.x - a.x) * hit.t, y: a.y + (b.y - a.y) * hit.t },
          };
        }
      }
    }

    // Hybrid: snap to a wall centerline / corner from an imported DXF/DWG. PDFs
    // never populate importedSegments, so this branch is dead for them.
    if (wallSnap && importedSegments.length > 0) {
      const ws = snapWallPoint(pos.x, pos.y, importedSegments);
      if (ws) return { kind: "free", point: { x: ws.x, y: ws.y }, snapped: true };
    }

    let x = pos.x;
    let y = pos.y;
    const effOrtho = ortho !== shift; // Shift inverts the ortho setting
    if (effOrtho && activeLastPointId) {
      const prev = pointMap.get(activeLastPointId);
      if (prev) {
        if (Math.abs(pos.x - prev.x) >= Math.abs(pos.y - prev.y)) y = prev.y;
        else x = prev.x;
      }
    }
    return { kind: "free", point: { x, y } };
  };

  // Ortho for the stair gesture. It constrains the HEAD click only — the run's
  // direction relative to the foot waiting in the draft — and Shift inverts it,
  // exactly as with walls. Shared with the preview so the rubber band shows the
  // flight the next click will actually commit.
  const stairHead = (
    pos: { x: number; y: number },
    foot: { x: number; y: number } | null | undefined,
    shift: boolean,
  ) => {
    if (!foot || ortho === shift) return pos;
    return Math.abs(pos.x - foot.x) >= Math.abs(pos.y - foot.y)
      ? { x: pos.x, y: foot.y }
      : { x: foot.x, y: pos.y };
  };

  const stairDraws = useMemo(() => {
    if (metersPerPixel == null) return [];
    return stairs.map((s) => ({ stair: s, draw: stairDrawing(s, metersPerPixel) }));
  }, [stairs, metersPerPixel]);

  // The staircase mid-gesture, drawn through the same function as a placed one:
  // the pending flight runs to the cursor, and the gap behind it previews as the
  // landing it will become.
  const draftDraw = useMemo(() => {
    if (metersPerPixel == null || !stairDraft) return null;
    const flights = [...stairDraft.flights];
    let width = stairDraft.width ?? drawStairWidth;

    if (stairDraft.foot && pointer) {
      const head = stairHead(pointer, stairDraft.foot, shiftRef.current);
      flights.push({
        x0: stairDraft.foot.x,
        y0: stairDraft.foot.y,
        x1: head.x,
        y1: head.y,
      });
    } else if (stairDraft.width == null && flights.length > 0 && pointer) {
      // Awaiting the width click: the envelope breathes with the cursor, so the
      // click is aimed at a shape rather than at a number.
      width = clampStairWidth(
        2 * perpDistanceToFlight(flights[0], pointer.x, pointer.y) * metersPerPixel,
      );
    }

    if (flights.length === 0) return null;
    return stairDrawing(
      { id: "draft", flights, width, rise: drawStairRise },
      metersPerPixel,
    );
    // shiftRef is a ref by design (no re-render on Shift); `pointer` moves with
    // the cursor and is what actually re-runs this.
  }, [stairDraft, pointer, metersPerPixel, drawStairWidth, drawStairRise, ortho]);

  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    const group = groupRef.current;
    if (!group) return;
    const pos = group.getRelativePointerPosition();
    if (!pos) return;

    // Scale-first gate: until a scale is set, only scale calibration is allowed.
    if (metersPerPixel == null && mode !== "calibrate") return;

    if (mode === "calibrate") {
      addCalibrationPoint(pos.x, pos.y);
      return;
    }

    if (mode === "wall") {
      const tgt = resolveTarget(pos, e.evt.shiftKey);
      if (tgt.kind === "vertex") connectToNode(tgt.nodeId);
      else if (tgt.kind === "edge") attachToSegment(tgt.segmentId, tgt.point.x, tgt.point.y);
      else addPoint(tgt.point.x, tgt.point.y);
      return;
    }

    // A stair is NOT resolved through resolveTarget: that snaps to vertices and
    // splits walls, and a stair must split nothing and join nothing.
    if (mode === "stair") {
      const p = stairHead(pos, stairDraft?.foot, e.evt.shiftKey);
      stairClick(p.x, p.y);
      setPointer(pos);
      return;
    }

    // door / window: two clicks define a line ALONG a wall (variable length).
    const onEmpty = e.target === stage || e.target.name() === "bg";
    if (!onEmpty) return; // opening markers handle their own clicks
    if (!openingStart) {
      const hit = nearestSegment(pos.x, pos.y, pointMap, segments);
      if (hit && hit.dist <= 40 / scale) {
        setOpeningStart({ segmentId: hit.segmentId, t0: hit.t });
        setPointer(pos);
      }
      return;
    }
    const seg = segMap.get(openingStart.segmentId);
    const a = seg && pointMap.get(seg.a);
    const b = seg && pointMap.get(seg.b);
    if (seg && a && b) {
      const t1 = projectTOnSegment(pos.x, pos.y, a, b);
      addOpeningSpan(mode, openingStart.segmentId, openingStart.t0, t1);
    }
    setOpeningStart(null);
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    shiftRef.current = !!e.evt.shiftKey;
    const drawingWall = mode === "wall" && activeLastPointId != null;
    const drawingOpening = (mode === "door" || mode === "window") && openingStart != null;
    // A stair draft previews from the very first click: the pending flight, and
    // then the envelope the width click is being aimed at.
    const drawingStair = mode === "stair" && stairDraft != null;
    // Track the cursor whenever a hover ring could be shown: over the imported
    // plan (wall snap) or over an already-traced wall (edge split).
    const hoverSnap =
      mode === "wall" &&
      ((wallSnap && importedSegments.length > 0) || segments.length > 0);
    if (drawingWall || drawingOpening || drawingStair || hoverSnap) {
      const pos = groupRef.current?.getRelativePointerPosition();
      if (pos) setPointer(pos);
    }
  };

  // Zoom toward a screen point, keeping that point fixed under the cursor.
  const zoomAt = (sx: number, sy: number, factor: number) => {
    const oldScale = scale;
    const newScale = Math.max(0.05, Math.min(40, oldScale * factor));
    const wx = (sx - offsetX) / oldScale;
    const wy = (sy - offsetY) / oldScale;
    setView({ scale: newScale, x: sx - wx * newScale, y: sy - wy * newScale });
  };

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const p = stage?.getPointerPosition();
    if (!p) return;
    zoomAt(p.x, p.y, e.evt.deltaY > 0 ? 1 / 1.1 : 1.1);
  };

  const onGroupDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target === groupRef.current) {
      setView({ scale, x: e.target.x(), y: e.target.y() });
    }
  };

  const handleR = 6 / scale;
  const stroke = 2.5 / scale;
  const drawing = activeLastPointId != null;

  // One staircase, placed or mid-gesture: the derived landings, each flight's
  // width envelope, the derived tread ladder, and an arrow at the foot so the
  // direction of travel is never in doubt. Listening is left to the caller's
  // wrapping Group — a draft must not be clickable.
  const stairShapes = (d: StairDrawing, draft: boolean, selected: boolean) => {
    const first = d.flights[0];
    const a = 9 / scale;
    return (
      <>
        {/* Landings are derived from the GAPS between flights, never traced. */}
        {d.landings.map((poly, i) => (
          <Line
            key={`sl${i}`}
            points={poly}
            closed
            fill={draft ? "rgba(185,140,255,0.10)" : "rgba(185,140,255,0.20)"}
            stroke={STAIR_COLOR}
            strokeWidth={stroke * 0.6}
            dash={[5 / scale, 4 / scale]}
            opacity={draft ? 0.75 : 1}
          />
        ))}
        {d.flights.map((f, i) => (
          <Group key={`sf${i}`}>
            <Line
              points={f.envelope}
              closed
              fill={selected ? "rgba(185,140,255,0.26)" : "rgba(185,140,255,0.13)"}
              stroke={STAIR_COLOR}
              strokeWidth={selected ? stroke * 1.3 : stroke * 0.9}
              dash={draft ? [6 / scale, 4 / scale] : undefined}
              opacity={draft ? 0.8 : 1}
              shadowColor={selected ? "#fff" : undefined}
              shadowBlur={selected ? 8 / scale : 0}
            />
            {f.treads.map((t, k) => (
              <Line
                key={k}
                points={t}
                stroke={STAIR_COLOR}
                strokeWidth={stroke * 0.5}
                opacity={0.85}
                listening={false}
              />
            ))}
          </Group>
        ))}
        {first && (
          <Line
            points={[
              first.foot.x + first.dir.x * a * 2.2,
              first.foot.y + first.dir.y * a * 2.2,
              first.foot.x - first.dir.y * a * 0.9,
              first.foot.y + first.dir.x * a * 0.9,
              first.foot.x + first.dir.y * a * 0.9,
              first.foot.y - first.dir.x * a * 0.9,
            ]}
            closed
            fill={STAIR_COLOR}
            opacity={draft ? 0.7 : 0.95}
            listening={false}
          />
        )}
      </>
    );
  };

  return (
    <div
      ref={ref}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        cursor: mode !== "wall" ? "crosshair" : "default",
      }}
    >
      {size.w > 0 && size.h > 0 && (
        <Stage
          width={size.w}
          height={size.h}
          onClick={handleStageClick}
          onMouseMove={handleMouseMove}
          onWheel={handleWheel}
        >
          <Layer>
            <Group
              ref={groupRef}
              x={offsetX}
              y={offsetY}
              scaleX={scale}
              scaleY={scale}
              draggable
              dragDistance={6}
              onDragEnd={onGroupDragEnd}
            >
            {htmlImg && (
              <KImage
                name="bg"
                image={htmlImg}
                width={image?.width}
                height={image?.height}
                opacity={imageOpacity}
              />
            )}

            {!image && (
              <Text
                x={20 - offsetX}
                y={20 - offsetY}
                text="Upload a floor plan to trace over (or just start clicking to place wall points)."
                fontSize={16}
                fill="#888"
              />
            )}

            {/* Imported CAD (DXF/DWG) overlay: every parsed segment, by stroke color */}
            {showImport && importedSegments.length > 0 && (
              <Shape
                listening={false}
                sceneFunc={(ctx) => {
                  const raw = (ctx as unknown as { _context: CanvasRenderingContext2D })._context;
                  raw.lineWidth = 1 / scale;
                  for (const [color, flat] of importGroups) {
                    raw.beginPath();
                    for (let i = 0; i < flat.length; i += 4) {
                      raw.moveTo(flat[i], flat[i + 1]);
                      raw.lineTo(flat[i + 2], flat[i + 3]);
                    }
                    raw.strokeStyle = color;
                    raw.stroke();
                  }
                }}
              />
            )}

            {/* Closed-room fills (extrusion-ready) */}
            {analysis.loops.map((loop, i) => {
              const flat: number[] = [];
              for (const id of loop.points) {
                const p = pointMap.get(id);
                if (p) flat.push(p.x, p.y);
              }
              return (
                <Line
                  key={`loop${i}`}
                  points={flat}
                  closed
                  fill="rgba(70, 220, 120, 0.18)"
                  stroke="#46dc78"
                  strokeWidth={stroke}
                  listening={false}
                />
              );
            })}

            {/* Wall segments. Rails teal + dashed (low, see-through); portals
                amber + finely dotted (no barrier — the line is a boundary, not
                a thing), so what you drew reads at a glance. */}
            {segments.map((seg) => {
              const a = pointMap.get(seg.a);
              const b = pointMap.get(seg.b);
              if (!a || !b) return null;
              const style =
                seg.type === "rail"
                  ? { stroke: "#2fe0c0", width: stroke * 0.7, dash: [stroke * 1.5, stroke * 1.2] }
                  : seg.type === "portal"
                    ? { stroke: "#ffb038", width: stroke * 0.5, dash: [stroke * 0.5, stroke * 1.1] }
                    : { stroke: "#37c2ff", width: stroke, dash: undefined };
              return (
                <Line
                  key={seg.id}
                  points={[a.x, a.y, b.x, b.y]}
                  stroke={style.stroke}
                  strokeWidth={Math.max(1, style.width)}
                  dash={style.dash}
                  lineCap="round"
                  listening={false}
                />
              );
            })}

            {/* Openings (traced spans along their host wall) */}
            {openings.map((o) => {
              const seg = segMap.get(o.segmentId);
              if (!seg) return null;
              const a = pointMap.get(seg.a);
              const b = pointMap.get(seg.b);
              if (!a || !b) return null;
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const pts = [
                a.x + dx * o.t0,
                a.y + dy * o.t0,
                a.x + dx * o.t1,
                a.y + dy * o.t1,
              ];
              const selected = o.id === selectedOpeningId;
              const color = o.type === "door" ? DOOR_COLOR : WINDOW_COLOR;
              return (
                <Line
                  key={o.id}
                  points={pts}
                  stroke={color}
                  strokeWidth={(selected ? 12 : 9) / scale}
                  lineCap="butt"
                  shadowColor={selected ? "#fff" : undefined}
                  shadowBlur={selected ? 8 / scale : 0}
                  listening={mode === "door" || mode === "window"}
                  onClick={(e) => {
                    e.cancelBubble = true;
                    selectOpening(o.id);
                  }}
                />
              );
            })}

            {/* Stairs. The tread ladder is the accuracy check: nudge Steps in
                the panel until it lines up with the treads printed on the plan
                and the model matches the drawing. Clickable in stair mode only,
                so a stair never competes with the wall pen for a click. */}
            {stairDraws.map(({ stair, draw }) => (
              <Group
                key={stair.id}
                listening={mode === "stair"}
                onClick={(e) => {
                  e.cancelBubble = true;
                  selectStair(stair.id);
                }}
              >
                {stairShapes(draw, false, stair.id === selectedStairId)}
              </Group>
            ))}

            {/* Staircase mid-gesture */}
            {draftDraw && (
              <Group listening={false}>{stairShapes(draftDraw, true, false)}</Group>
            )}

            {/* Opening trace preview */}
            {openingStart &&
              pointer &&
              (() => {
                const seg = segMap.get(openingStart.segmentId);
                const a = seg && pointMap.get(seg.a);
                const b = seg && pointMap.get(seg.b);
                if (!seg || !a || !b) return null;
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const t1 = projectTOnSegment(pointer.x, pointer.y, a, b);
                const color = mode === "door" ? DOOR_COLOR : WINDOW_COLOR;
                return (
                  <>
                    <Line
                      points={[
                        a.x + dx * openingStart.t0,
                        a.y + dy * openingStart.t0,
                        a.x + dx * t1,
                        a.y + dy * t1,
                      ]}
                      stroke={color}
                      strokeWidth={9 / scale}
                      dash={[6 / scale, 4 / scale]}
                      opacity={0.7}
                      listening={false}
                    />
                    <Circle
                      x={a.x + dx * openingStart.t0}
                      y={a.y + dy * openingStart.t0}
                      radius={handleR}
                      fill={color}
                      listening={false}
                    />
                  </>
                );
              })()}

            {/* Wall rubber-band preview (shows ortho + magnet target) */}
            {mode === "wall" &&
              activeLastPointId &&
              pointer &&
              (() => {
                const prev = pointMap.get(activeLastPointId);
                if (!prev) return null;
                const tgt = resolveTarget(pointer, shiftRef.current);
                return (
                  <>
                    <Line
                      points={[prev.x, prev.y, tgt.point.x, tgt.point.y]}
                      stroke="#37c2ff"
                      strokeWidth={stroke}
                      dash={[6 / scale, 4 / scale]}
                      opacity={0.75}
                      listening={false}
                    />
                    {(tgt.kind !== "free" || tgt.snapped) && (
                      <Circle
                        x={tgt.point.x}
                        y={tgt.point.y}
                        radius={handleR * 1.6}
                        stroke={tgt.kind === "free" ? "#37c2ff" : "#46dc78"}
                        strokeWidth={2 / scale}
                        listening={false}
                      />
                    )}
                  </>
                );
              })()}

            {/* Hover snap indicator before placing the first point. Resolved through
                the same function the click uses, so the ring always shows what will
                actually happen — green means "this splits the wall and joins in". */}
            {mode === "wall" &&
              !activeLastPointId &&
              pointer &&
              (() => {
                const tgt = resolveTarget(pointer, shiftRef.current);
                if (tgt.kind === "edge") {
                  return (
                    <Circle
                      x={tgt.point.x}
                      y={tgt.point.y}
                      radius={handleR * 1.6}
                      stroke="#4ade80"
                      strokeWidth={2 / scale}
                      listening={false}
                    />
                  );
                }
                if (tgt.kind === "free" && tgt.snapped) {
                  return (
                    <Circle
                      x={tgt.point.x}
                      y={tgt.point.y}
                      radius={handleR * 1.6}
                      stroke="#37c2ff"
                      strokeWidth={2 / scale}
                      listening={false}
                    />
                  );
                }
                return null;
              })()}

            {/* Calibration overlay */}
            {calibrationPts.length === 2 && (
              <Line
                points={[
                  calibrationPts[0].x,
                  calibrationPts[0].y,
                  calibrationPts[1].x,
                  calibrationPts[1].y,
                ]}
                stroke="#ffcc33"
                strokeWidth={stroke}
                dash={[8 / scale, 6 / scale]}
                listening={false}
              />
            )}
            {calibrationPts.map((c, i) => (
              <Circle
                key={`cal${i}`}
                x={c.x}
                y={c.y}
                radius={handleR}
                fill="#ffcc33"
                stroke="#7a5b00"
                strokeWidth={stroke * 0.6}
                listening={false}
              />
            ))}

            {/* Trace points */}
            {points.map((p) => {
              const selected = p.id === selectedPointId;
              const isActive = p.id === activeLastPointId;
              const connectTarget = drawing && !isActive && mode === "wall";
              return (
                <Circle
                  key={p.id}
                  x={p.x}
                  y={p.y}
                  radius={selected ? handleR * 1.5 : handleR}
                  fill={selected ? "#ff5d5d" : isActive ? "#37c2ff" : "#ffffff"}
                  stroke={connectTarget ? "#46dc78" : "#0a3d52"}
                  strokeWidth={(connectTarget ? 2 : 1) * stroke * 0.8}
                  hitStrokeWidth={14 / scale}
                  listening={mode === "wall"}
                  draggable={mode === "wall"}
                  onDragStart={(e) => {
                    e.cancelBubble = true;
                    selectPoint(p.id);
                    beginDrag();
                  }}
                  onDragMove={(e) => movePoint(p.id, e.target.x(), e.target.y())}
                />
              );
            })}
            </Group>
          </Layer>
        </Stage>
      )}
      {image && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <ZoomButton title="Zoom in" onClick={() => zoomAt(size.w / 2, size.h / 2, 1.2)}>
            <PlusIcon size={15} />
          </ZoomButton>
          <ZoomButton title="Zoom out" onClick={() => zoomAt(size.w / 2, size.h / 2, 1 / 1.2)}>
            <MinusIcon size={15} />
          </ZoomButton>
          <ZoomButton title="Reset view (fit)" onClick={() => setView(null)}>
            <FitIcon size={15} />
          </ZoomButton>
        </div>
      )}
    </div>
  );
}
