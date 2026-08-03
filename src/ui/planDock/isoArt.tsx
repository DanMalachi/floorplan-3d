"use client";

// Shared isometric ("3/4 view") drawing kit for Plan Dock room scenes.
// Extracted from the first KitchenScene pass so Phase C's 5 new rooms reuse
// the same projection, extrusion, hotspot/hover mechanics, and a small
// library of recognizable-shape composites (per Dan's review: "only
// features boxes... make it look like the actual things they represent").

import { useState, type ReactNode } from "react";
import { PD } from "./tokens";

/** Depth-skew ratio shared by every extruded shape so a whole scene reads as
 *  one consistent 3/4 projection: a depth of D contributes (D*RX, D*RY)
 *  toward the vanishing direction (up + right). */
export const RX = 0.486;
export const RY = -0.371;

export type Pt = [number, number];

export interface IsoBox {
  top: string;
  front: string;
  right: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  /** Raw front-face rect, for positioning decorative detail (handles, seams,
   *  burners, …) without redoing the projection math. */
  face: { x: number; yFront: number; w: number; h: number };
}

/** Three-face extrusion (top, front, right) of a box whose front-bottom-left
 *  corner is (x, yFront), width w along the wall, height h, receding by
 *  `depth` into the room. h=0 degenerates to a flat floor-plane quad. */
export function isoBox(x: number, yFront: number, w: number, h: number, depth: number): IsoBox {
  const dx = depth * RX;
  const dy = depth * RY;
  const fbl: Pt = [x, yFront];
  const fbr: Pt = [x + w, yFront];
  const ftl: Pt = [x, yFront - h];
  const ftr: Pt = [x + w, yFront - h];
  const bbl: Pt = [x + dx, yFront + dy];
  const bbr: Pt = [x + w + dx, yFront + dy];
  const btl: Pt = [x + dx, yFront - h + dy];
  const btr: Pt = [x + w + dx, yFront - h + dy];
  const poly = (pts: Pt[]) => pts.map((p) => p.join(",")).join(" ");
  return {
    top: poly(h === 0 ? [fbl, fbr, bbr, bbl] : [ftl, ftr, btr, btl]),
    front: h === 0 ? "" : poly([fbl, fbr, ftr, ftl]),
    right: h === 0 ? "" : poly([fbr, bbr, btr, ftr]),
    bbox: { x0: x, y0: yFront - h + dy, x1: x + w + dx, y1: yFront },
    face: { x, yFront, w, h },
  };
}

export const FACE_TOP = "oklch(0.62 0.03 90 / 0.9)";
export const FACE_FRONT = "oklch(0.5 0.025 90 / 0.85)";
export const FACE_RIGHT = "oklch(0.38 0.02 90 / 0.85)";
export const FACE_STROKE = "oklch(0.2 0.01 90 / 0.6)";
export const DETAIL_LINE = "oklch(0.22 0.01 90 / 0.65)";
export const DETAIL_LIGHT = "oklch(0.85 0.02 90 / 0.55)";

export function Extrusion({ box, top = FACE_TOP, front = FACE_FRONT, right = FACE_RIGHT }: { box: IsoBox; top?: string; front?: string; right?: string }) {
  return (
    <>
      <polygon points={box.top} fill={top} stroke={FACE_STROKE} strokeWidth={0.6} />
      {box.front && <polygon points={box.front} fill={front} stroke={FACE_STROKE} strokeWidth={0.6} />}
      {box.right && <polygon points={box.right} fill={right} stroke={FACE_STROKE} strokeWidth={0.6} />}
    </>
  );
}

// ── Recognizable-shape detail helpers — small SVG overlays on a box's front/
// top face, positioned straight off the box's own (x, yFront, w, h) inputs
// (the front face is never skewed, so no extra projection math is needed). ──

/** Vertical seam + handle dot — fridge doors, wardrobe doors. */
export function DoorSeam({ box, at = 0.62 }: { box: IsoBox; at?: number }) {
  const { x, yFront, w, h } = box.face;
  const sx = x + w * at;
  return (
    <>
      <line x1={sx} y1={yFront - h + 3} x2={sx} y2={yFront - 2} stroke={DETAIL_LINE} strokeWidth={0.6} />
      <circle cx={sx - 2} cy={yFront - h * 0.45} r={0.9} fill={DETAIL_LIGHT} />
    </>
  );
}

/** Horizontal drawer/shelf lines — cabinets, dressers, bookcases. */
export function ShelfLines({ box, count = 2 }: { box: IsoBox; count?: number }) {
  const { x, yFront, w, h } = box.face;
  const lines = [];
  for (let i = 1; i <= count; i++) {
    const ly = yFront - (h * i) / (count + 1);
    lines.push(<line key={i} x1={x + 2} y1={ly} x2={x + w - 2} y2={ly} stroke={DETAIL_LINE} strokeWidth={0.5} />);
  }
  return <>{lines}</>;
}

/** Round knob/dial row on a front face — stove controls, washer dial. */
export function KnobRow({ box, count = 3, atH = 0.28 }: { box: IsoBox; count?: number; atH?: number }) {
  const { x, yFront, w, h } = box.face;
  const knobs = [];
  for (let i = 0; i < count; i++) {
    const kx = x + (w * (i + 1)) / (count + 1);
    knobs.push(<circle key={i} cx={kx} cy={yFront - h * atH} r={0.9} fill="none" stroke={DETAIL_LIGHT} strokeWidth={0.5} />);
  }
  return <>{knobs}</>;
}

/** Inset rounded rect on the top face — sink/vanity basin. */
export function BasinCutout({ box, inset = 3 }: { box: IsoBox; inset?: number }) {
  const dx = 0; // top face already covers the box footprint; basin sits centered on it
  const { x, yFront, w, h } = box.face;
  const tdx = 16 * RX; // depth of this item's own top-face skew, approximated
  return (
    <rect
      x={x + inset + dx}
      y={yFront - h - 5}
      width={Math.max(2, w - inset * 2 - tdx * 0.3)}
      height={5}
      rx={1.4}
      fill="oklch(0.72 0.02 90 / 0.55)"
      stroke={DETAIL_LINE}
      strokeWidth={0.5}
    />
  );
}

/** Burner ring circles on a top face — stove. */
export function BurnerRings({ box }: { box: IsoBox }) {
  const { x, yFront, w } = box.face;
  const positions: Pt[] = [
    [x + w * 0.28, yFront - 4],
    [x + w * 0.72, yFront - 4],
    [x + w * 0.28, yFront - 9],
    [x + w * 0.72, yFront - 9],
  ];
  return (
    <>
      {positions.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={1.6} fill="none" stroke={DETAIL_LINE} strokeWidth={0.55} />
      ))}
    </>
  );
}

/** Simple cylinder (ellipse top + body) — stools, lamp bases, pots. */
export function isoCylinder(cx: number, yFront: number, r: number, h: number) {
  return { cx, yFront, r, h };
}
export function Cylinder({ c, fill = FACE_FRONT }: { c: ReturnType<typeof isoCylinder>; fill?: string }) {
  const { cx, yFront, r, h } = c;
  return (
    <>
      <rect x={cx - r} y={yFront - h} width={r * 2} height={h} fill={fill} stroke={FACE_STROKE} strokeWidth={0.5} />
      <ellipse cx={cx} cy={yFront - h} rx={r} ry={r * 0.45} fill={FACE_TOP} stroke={FACE_STROKE} strokeWidth={0.5} />
      <ellipse cx={cx} cy={yFront} rx={r} ry={r * 0.45} fill="none" stroke={FACE_STROKE} strokeWidth={0.4} opacity={0.5} />
    </>
  );
}

/** Thin tabletop + four short legs — dining/coffee/side tables, desks. */
export function TableWithLegs({ x, yFront, w, depth, topH = 4, legH = 20 }: { x: number; yFront: number; w: number; depth: number; topH?: number; legH?: number }) {
  const top = isoBox(x, yFront - legH, w, topH, depth);
  const dx = depth * RX;
  const dy = depth * RY;
  const legXs = [x + 2, x + w - 2];
  const legZs = [0.12, 0.88];
  return (
    <>
      {legXs.flatMap((lx, i) =>
        legZs.map((z, j) => {
          const gx = lx + dx * z;
          const gy = yFront + dy * z;
          return <line key={`${i}-${j}`} x1={gx} y1={gy} x2={gx} y2={gy - legH} stroke={DETAIL_LINE} strokeWidth={1.1} />;
        }),
      )}
      <Extrusion box={top} />
    </>
  );
}

/** Low seat box + tall back box + two arm boxes — sofas / armchairs. */
export function Sofa({ x, yFront, w, depth }: { x: number; yFront: number; w: number; depth: number }) {
  const seatH = 10;
  const seat = isoBox(x, yFront, w, seatH, depth);
  const backH = 20;
  const backDepth = 4;
  const back = isoBox(x, yFront - seatH + backDepth, w, backH, backDepth);
  const armW = Math.min(6, w * 0.16);
  const armH = 16;
  const armDepth = depth;
  const armL = isoBox(x, yFront, armW, armH, armDepth);
  const armR = isoBox(x + w - armW, yFront, armW, armH, armDepth);
  return (
    <>
      <Extrusion box={seat} />
      <Extrusion box={armL} top="oklch(0.58 0.03 90 / 0.9)" />
      <Extrusion box={armR} top="oklch(0.58 0.03 90 / 0.9)" />
      <Extrusion box={back} top="oklch(0.56 0.03 90 / 0.9)" />
    </>
  );
}

/** Low mattress box + headboard + two pillows — beds. */
export function Bed({ x, yFront, w, depth }: { x: number; yFront: number; w: number; depth: number }) {
  const mattressH = 9;
  const mattress = isoBox(x, yFront, w, mattressH, depth);
  const headboardH = 22;
  const headboardYFront = yFront + depth * RY + 3;
  const headboard = isoBox(x, headboardYFront, w, headboardH, 3);
  const pillowW = w * 0.32;
  const pillow1 = isoBox(x + w * 0.08, yFront - mattressH + 3 - depth * 0.55, pillowW, 4, 6);
  const pillow2 = isoBox(x + w * 0.56, yFront - mattressH + 3 - depth * 0.55, pillowW, 4, 6);
  return (
    <>
      <Extrusion box={mattress} top="oklch(0.66 0.02 90 / 0.9)" />
      <Extrusion box={headboard} />
      <Extrusion box={pillow1} top="oklch(0.9 0.01 90 / 0.9)" front="oklch(0.8 0.01 90 / 0.85)" />
      <Extrusion box={pillow2} top="oklch(0.9 0.01 90 / 0.9)" front="oklch(0.8 0.01 90 / 0.85)" />
    </>
  );
}

/** Pot cylinder + a small cluster of canopy circles — potted plants. */
export function Plant({ x, yFront, r = 6, potH = 8, canopyR = 9 }: { x: number; yFront: number; r?: number; potH?: number; canopyR?: number }) {
  const c = isoCylinder(x, yFront, r, potH);
  const topY = yFront - potH;
  return (
    <>
      <Cylinder c={c} fill="oklch(0.45 0.03 60 / 0.85)" />
      <circle cx={x - canopyR * 0.35} cy={topY - canopyR * 0.5} r={canopyR * 0.55} fill="oklch(0.45 0.08 145 / 0.85)" />
      <circle cx={x + canopyR * 0.4} cy={topY - canopyR * 0.55} r={canopyR * 0.6} fill="oklch(0.5 0.09 145 / 0.85)" />
      <circle cx={x} cy={topY - canopyR * 0.95} r={canopyR * 0.65} fill="oklch(0.55 0.1 145 / 0.85)" />
    </>
  );
}

/** Small tank box + narrower bowl box — toilet. */
export function Toilet({ x, yFront, w, depth }: { x: number; yFront: number; w: number; depth: number }) {
  const tank = isoBox(x, yFront - depth * 0.5, w, 18, depth * 0.5);
  const bowl = isoBox(x + w * 0.12, yFront, w * 0.76, 10, depth);
  return (
    <>
      <Extrusion box={bowl} />
      <Extrusion box={tank} />
      <ellipse cx={x + w / 2} cy={yFront - 10} rx={w * 0.3} ry={2.4} fill="none" stroke={DETAIL_LINE} strokeWidth={0.5} />
    </>
  );
}

/** Low elongated box with an inset top line — bathtub. */
export function Bathtub({ x, yFront, w, depth }: { x: number; yFront: number; w: number; depth: number }) {
  const tub = isoBox(x, yFront, w, 14, depth);
  return (
    <>
      <Extrusion box={tub} top="oklch(0.72 0.02 90 / 0.9)" />
      <BasinCutout box={tub} inset={4} />
    </>
  );
}

/** Vertical screen rectangle standing on a low stand — TV + TV stand. */
export function TvOnStand({ x, yFront, w, depth }: { x: number; yFront: number; w: number; depth: number }) {
  const stand = isoBox(x, yFront, w, 14, depth);
  const screenW = w * 0.7;
  const screen = isoBox(x + (w - screenW) / 2, yFront - 14 - 2, screenW, 16, 2);
  return (
    <>
      <Extrusion box={stand} />
      <Extrusion box={screen} top="oklch(0.2 0.01 260 / 0.9)" front="oklch(0.16 0.01 260 / 0.92)" right="oklch(0.12 0.01 260 / 0.92)" />
    </>
  );
}

// ── Shared scene shell: floor + wall + hotspot items + hover label. ──

export interface RoomItem {
  id: string;
  label: string;
  keywords: string[];
  box: IsoBox;
  art: ReactNode;
}

/** Invisible oversized hit target + accent outline on hover/active, sized
 *  from the box's bounding box so thin shapes stay easy to hit. */
function HitArea({
  id,
  box,
  active,
  hovered,
  onEnter,
  onLeave,
  onClick,
}: {
  id: string;
  box: IsoBox;
  active: boolean;
  hovered: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onClick: () => void;
}) {
  const { x0, y0, x1, y1 } = box.bbox;
  const pad = 2;
  return (
    <g role="button" aria-label={id} onMouseEnter={onEnter} onMouseLeave={onLeave} onClick={onClick} style={{ cursor: "pointer" }}>
      <rect x={x0 - pad} y={y0 - pad} width={x1 - x0 + pad * 2} height={y1 - y0 + pad * 2} fill="transparent" />
      {(active || hovered) && (
        <rect
          x={x0 - pad}
          y={y0 - pad}
          width={x1 - x0 + pad * 2}
          height={y1 - y0 + pad * 2}
          fill="none"
          rx={3}
          stroke={PD.accent}
          strokeWidth={active ? 2 : 1.3}
          strokeDasharray={active ? undefined : "3 3"}
        />
      )}
    </g>
  );
}

/** Room bounds shared by every scene (viewBox is always 0 0 220 170) — the
 *  floor's front edge sits FLOOR_MARGIN past the items' front edge, so
 *  there's real open floor in front of the furniture row that isn't covered
 *  by any item's hit-rect (the Kitchen-pass bug: items back onto the wall,
 *  so with equal front edges the floor had almost no exposed hit area). */
export const ITEMS_Y = 128;
export const FLOOR_MARGIN = 28;
export const FLOOR_Y = ITEMS_Y + FLOOR_MARGIN;
export const WALL_H = 60;

export function roomFloor(x0: number, width: number) {
  return isoBox(x0, FLOOR_Y, width, 0, 100);
}

export function RoomWall({ x0, width }: { x0: number; width: number }) {
  const dx = 78 * RX;
  const dy = 78 * RY;
  const bl: Pt = [x0 + dx, ITEMS_Y + dy];
  const br: Pt = [x0 + width + dx, ITEMS_Y + dy];
  const tl: Pt = [x0 + dx, ITEMS_Y + dy - WALL_H];
  const tr: Pt = [x0 + width + dx, ITEMS_Y + dy - WALL_H];
  return <polygon points={`${bl.join(",")} ${br.join(",")} ${tr.join(",")} ${tl.join(",")}`} fill="oklch(0.34 0.015 90 / 0.4)" stroke={FACE_STROKE} strokeWidth={0.6} />;
}

export function RoomSceneShell({
  x0,
  width,
  items,
  activeHotspot,
  onHotspotClick,
  onFloorClick,
}: {
  x0: number;
  width: number;
  items: RoomItem[];
  activeHotspot: string | null;
  onHotspotClick: (id: string) => void;
  onFloorClick: () => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const floor = roomFloor(x0, width);
  const hoveredItem = items.find((i) => i.id === hovered);
  const hoveredLabel = hovered === "floor" ? "Floor — click to pick material" : hoveredItem?.label ?? null;
  const hoveredBox = hovered === "floor" ? floor : hoveredItem?.box ?? null;

  return (
    <svg viewBox="0 0 220 170" width="100%" height="100%" style={{ display: "block", overflow: "visible" }}>
      <g role="button" aria-label="floor" onMouseEnter={() => setHovered("floor")} onMouseLeave={() => setHovered((h) => (h === "floor" ? null : h))} onClick={onFloorClick} style={{ cursor: "pointer" }}>
        <polygon points={floor.top} fill="oklch(0.3 0.015 90 / 0.5)" stroke={FACE_STROKE} strokeWidth={0.6} />
        {hovered === "floor" && <polygon points={floor.top} fill="none" stroke={PD.accent} strokeWidth={1.5} strokeDasharray="3 3" />}
      </g>

      <RoomWall x0={x0} width={width} />

      {items.map((it) => (
        <g key={it.id}>
          {it.art}
          <HitArea
            id={it.id}
            box={it.box}
            active={activeHotspot === it.id}
            hovered={hovered === it.id}
            onEnter={() => setHovered(it.id)}
            onLeave={() => setHovered((cur) => (cur === it.id ? null : cur))}
            onClick={() => onHotspotClick(it.id)}
          />
        </g>
      ))}

      {hoveredLabel && hoveredBox && (
        <g style={{ pointerEvents: "none" }}>
          <rect
            x={Math.max(2, hoveredBox.bbox.x0)}
            y={Math.max(2, hoveredBox.bbox.y0 - 16)}
            width={Math.min(216, hoveredLabel.length * 4.6 + 10)}
            height={13}
            rx={4}
            fill="oklch(0.12 0.01 260 / 0.92)"
          />
          <text x={Math.max(2, hoveredBox.bbox.x0) + 5} y={Math.max(2, hoveredBox.bbox.y0 - 16) + 9.5} fontSize={8.5} fontFamily={PD.fontUi} fill={PD.textPrimary}>
            {hoveredLabel}
          </text>
        </g>
      )}
    </svg>
  );
}
