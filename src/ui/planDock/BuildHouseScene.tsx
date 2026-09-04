"use client";

// Build-tab illustrated navigator (Plan Dock P4 / v2 Phase D): a house
// cutaway on the same isoArt.tsx projection kit the Decorate room scenes use,
// but its own layout — a house cutaway isn't "floor + one backdrop wall +
// a row of furniture" (RoomSceneShell's shape), it's three distinct wall
// treatments (plain / door / window) plus a floor and two small floor-level
// glyphs (paint roller, tape measure) and a stair stack, each its own
// hotspot. Built directly from isoArt's primitives (isoBox/Extrusion/HitArea)
// rather than forcing RoomSceneShell to fit a shape it wasn't designed for.
//
// Hotspots ARM TOOLS instead of filtering a catalog (Decorate's hotspots
// filter FurnitureItemsForRoom by keyword) — BuildNavigator.tsx owns that
// dispatch; this file only draws the picture and reports which id was
// clicked/hovered.

import { useState, type ReactNode } from "react";
import {
  isoBox,
  isoCylinder,
  Cylinder,
  Extrusion,
  HitArea,
  RX,
  RY,
  FACE_STROKE,
  DETAIL_LINE,
  DETAIL_LIGHT,
  type IsoBox,
} from "./isoArt";
import { PD } from "./tokens";

export type BuildHotspotId = "walls" | "doors" | "windows" | "measure" | "floors" | "paint" | "stairs";

export interface BuildHotspot {
  id: BuildHotspotId;
  label: string;
}

// `id: "doors"` stays — it is a local UI key that BuildNavigator dispatches on
// and isoArt's HitArea feeds to `aria-label`. Only the visible label changes,
// because a door at or past PATIO_MIN_WIDTH is drawn as a glazed patio slider.
export const BUILD_HOTSPOTS: BuildHotspot[] = [
  { id: "walls", label: "Walls" },
  { id: "doors", label: "Doors & patios" },
  { id: "windows", label: "Windows" },
  { id: "measure", label: "Measure" },
  { id: "floors", label: "Floors" },
  { id: "paint", label: "Paint" },
  { id: "stairs", label: "Stairs (trace only)" },
];

const ITEMS_Y = 118;
const WALL_H = 58;
const WALL_DEPTH = 16;
const FLOOR_Y = ITEMS_Y + 30;

/** Plain solid wall — the Walls hotspot. */
function WallSegment({ box }: { box: IsoBox }) {
  return <Extrusion box={box} />;
}

/** Wall with a doorway gap cut into the front face + a swing-leaf arc, read
 *  as a door without needing real opening geometry (that's the OpeningTool
 *  ghost's job once armed). */
function DoorSegment({ box }: { box: IsoBox }) {
  const { x, yFront, w, h } = box.face;
  const doorW = w * 0.42;
  const doorX = x + w * 0.5;
  return (
    <>
      <Extrusion box={box} />
      <rect x={doorX} y={yFront - h + 3} width={doorW} height={h - 3} fill="oklch(0.14 0.012 260 / 0.94)" />
      <line x1={doorX} y1={yFront} x2={doorX} y2={yFront - doorW} stroke={DETAIL_LIGHT} strokeWidth={1} />
      <path
        d={`M ${doorX} ${yFront} A ${doorW} ${doorW} 0 0 1 ${doorX + doorW} ${yFront - doorW}`}
        fill="none"
        stroke={DETAIL_LIGHT}
        strokeWidth={0.6}
        strokeDasharray="2 2"
      />
    </>
  );
}

/** Wall with an inset mullion-grid window. */
function WindowSegment({ box }: { box: IsoBox }) {
  const { x, yFront, w, h } = box.face;
  const winW = w * 0.56;
  const winH = h * 0.46;
  const wx = x + (w - winW) / 2;
  const wy = yFront - h * 0.6;
  return (
    <>
      <Extrusion box={box} />
      <rect x={wx} y={wy} width={winW} height={winH} fill="oklch(0.62 0.09 230 / 0.4)" stroke={DETAIL_LINE} strokeWidth={0.6} />
      <line x1={wx + winW / 2} y1={wy} x2={wx + winW / 2} y2={wy + winH} stroke={DETAIL_LINE} strokeWidth={0.5} />
      <line x1={wx} y1={wy + winH / 2} x2={wx + winW} y2={wy + winH / 2} stroke={DETAIL_LINE} strokeWidth={0.5} />
    </>
  );
}

/** Ascending step stack, drawn desaturated — there's no Build-mode stair
 *  tool (v1 scope cut, see the plan's Risks). The hotspot stays clickable
 *  (a toast points at Trace) rather than vanishing, so the shape people
 *  associate with "stairs" doesn't just silently disappear from the house. */
function StairArt({ x0, yFront }: { x0: number; yFront: number }) {
  const steps = 5;
  const tread = 6.5;
  const riser = 8;
  const depth = 9;
  const boxes: IsoBox[] = [];
  for (let i = 0; i < steps; i++) {
    boxes.push(isoBox(x0 + i * tread, yFront - i * riser, tread * (steps - i) + 2, riser, depth));
  }
  return (
    <>
      {boxes.map((b, i) => (
        <Extrusion key={i} box={b} top="oklch(0.5 0.01 90 / 0.55)" front="oklch(0.4 0.008 90 / 0.5)" right="oklch(0.32 0.006 90 / 0.5)" />
      ))}
    </>
  );
}

/** Paint roller: a cylinder "drum" on a thin handle — the Paint hotspot. */
function PaintRollerArt({ x, yFront }: { x: number; yFront: number }) {
  const drum = isoCylinder(x, yFront, 5, 11);
  return (
    <>
      <line x1={x} y1={yFront - 11} x2={x + 9} y2={yFront - 24} stroke={DETAIL_LINE} strokeWidth={1.4} />
      <circle cx={x + 9} cy={yFront - 24} r={1.6} fill={DETAIL_LIGHT} />
      <Cylinder c={drum} fill="oklch(0.58 0.14 25 / 0.85)" />
    </>
  );
}

/** Tape measure: a flat ruler on the floor with tick marks — the Measure
 *  hotspot. Flat (h=0) like a floor-plane object, not a standing box. */
function MeasureArt({ x, yFront }: { x: number; yFront: number }) {
  const w = 32;
  const ruler = isoBox(x, yFront, w, 0, 8);
  const dx = 8 * RX;
  const dy = 8 * RY;
  const ticks = [];
  for (let i = 1; i < 6; i++) {
    const tx = x + (w * i) / 6;
    ticks.push(<line key={i} x1={tx} y1={yFront + dy * 0.15} x2={tx} y2={yFront + dy * 0.85} stroke={DETAIL_LINE} strokeWidth={0.5} />);
  }
  return (
    <>
      <polygon points={ruler.top} fill="oklch(0.78 0.13 95 / 0.85)" stroke={FACE_STROKE} strokeWidth={0.6} />
      {ticks}
      <line x1={x + dx * 0.5} y1={yFront + dy * 0.5} x2={x + w - dx * 0.5} y2={yFront + dy * 0.5} stroke={DETAIL_LINE} strokeWidth={0.5} />
    </>
  );
}

interface HotspotDef {
  id: BuildHotspotId;
  label: string;
  box: IsoBox;
  art: ReactNode;
  disabled?: boolean;
}

export function BuildHouseScene({
  activeHotspot,
  onHotspotClick,
}: {
  activeHotspot: string | null;
  onHotspotClick: (id: BuildHotspotId) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  const wallBox = isoBox(14, ITEMS_Y, 56, WALL_H, WALL_DEPTH);
  const doorBox = isoBox(74, ITEMS_Y, 46, WALL_H, WALL_DEPTH);
  const windowBox = isoBox(124, ITEMS_Y, 54, WALL_H, WALL_DEPTH);
  const floor = isoBox(14, FLOOR_Y, 194, 0, 100);
  const stairBox: IsoBox = { ...isoBox(178, FLOOR_Y - 2, 40, 44, 9), bbox: { x0: 176, y0: FLOOR_Y - 46, x1: 220, y1: FLOOR_Y } };
  const paintBox: IsoBox = { ...isoBox(30, FLOOR_Y - 6, 0, 0, 0), bbox: { x0: 20, y0: FLOOR_Y - 42, x1: 46, y1: FLOOR_Y - 4 } };
  const measureBox: IsoBox = { ...isoBox(96, FLOOR_Y - 4, 32, 0, 8), bbox: { x0: 92, y0: FLOOR_Y - 12, x1: 138, y1: FLOOR_Y } };

  const items: HotspotDef[] = [
    { id: "walls", label: "Walls — draw new walls", box: wallBox, art: <WallSegment box={wallBox} /> },
    { id: "doors", label: "Doors & patios — drop on a wall", box: doorBox, art: <DoorSegment box={doorBox} /> },
    { id: "windows", label: "Windows — drop on a wall", box: windowBox, art: <WindowSegment box={windowBox} /> },
    { id: "floors", label: "Floor — pick a material", box: floor, art: <></> },
    { id: "paint", label: "Paint — pick a colour", box: paintBox, art: <PaintRollerArt x={30} yFront={FLOOR_Y - 6} /> },
    { id: "measure", label: "Measure a span", box: measureBox, art: <MeasureArt x={96} yFront={FLOOR_Y - 4} /> },
    { id: "stairs", label: "Stairs — traced only, not Build mode", box: stairBox, art: <StairArt x0={178} yFront={FLOOR_Y - 2} />, disabled: true },
  ];

  const hoveredItem = items.find((i) => i.id === hovered);

  return (
    <svg viewBox="0 0 220 170" width="100%" height="100%" style={{ display: "block", overflow: "visible" }}>
      {/* Floor drawn first so every other hotspot layers on top of it. */}
      <polygon points={floor.top} fill="oklch(0.3 0.015 90 / 0.5)" stroke={FACE_STROKE} strokeWidth={0.6} />

      {items
        .filter((i) => i.id !== "floors")
        .map((it) => (
          <g key={it.id} style={{ opacity: it.disabled ? 0.55 : 1 }}>
            {it.art}
          </g>
        ))}

      {items.map((it) => (
        <HitArea
          key={it.id}
          id={it.id}
          box={it.box}
          active={activeHotspot === it.id}
          hovered={hovered === it.id}
          onEnter={() => setHovered(it.id)}
          onLeave={() => setHovered((cur) => (cur === it.id ? null : cur))}
          onClick={() => onHotspotClick(it.id)}
        />
      ))}

      {hoveredItem && (
        <g style={{ pointerEvents: "none" }}>
          <rect
            x={Math.max(2, hoveredItem.box.bbox.x0)}
            y={Math.max(2, hoveredItem.box.bbox.y0 - 16)}
            width={Math.min(216, hoveredItem.label.length * 4.6 + 10)}
            height={13}
            rx={4}
            fill="oklch(0.12 0.01 260 / 0.92)"
          />
          <text
            x={Math.max(2, hoveredItem.box.bbox.x0) + 5}
            y={Math.max(2, hoveredItem.box.bbox.y0 - 16) + 9.5}
            fontSize={8.5}
            fontFamily={PD.fontUi}
            fill={PD.textPrimary}
          >
            {hoveredItem.label}
          </text>
        </g>
      )}
    </svg>
  );
}
