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

/**
 * Pedal bin — a tapered body with a lid that reads as a separate part.
 *
 * Every room that shows a bin uses this one, so a bin looks like the same
 * object wherever you meet it. The plain `Cylinder` it replaces was a straight
 * tube with a disc on top, which read as a tin can: what makes a bin a bin is
 * the taper toward the floor, the lid sitting proud of the body with a shadow
 * line under it, and the pedal at the foot.
 */
export function Bin({ x, yFront, w, h, pedal = true }: { x: number; yFront: number; w: number; h: number; pedal?: boolean }) {
  const rTop = w / 2;
  const rBot = rTop * 0.84;
  const cx = x + rTop;
  const ryTop = rTop * 0.42;
  const bodyTop = yFront - h;
  return (
    <>
      {/* Tapered body between the two ellipses. */}
      <path
        d={`M ${cx - rTop} ${bodyTop} L ${cx - rBot} ${yFront} A ${rBot} ${rBot * 0.42} 0 0 0 ${cx + rBot} ${yFront} L ${cx + rTop} ${bodyTop} Z`}
        fill={FACE_FRONT}
        stroke={FACE_STROKE}
        strokeWidth={0.6}
      />
      {/* Shadow line under the lid — the gap that says it opens. */}
      <ellipse cx={cx} cy={bodyTop} rx={rTop} ry={ryTop} fill="oklch(0.24 0.01 90 / 0.85)" stroke={FACE_STROKE} strokeWidth={0.5} />
      {/* Lid, a touch wider than the body and lifted off it. */}
      <ellipse cx={cx} cy={bodyTop - 1.6} rx={rTop * 1.06} ry={ryTop * 1.06} fill={FACE_TOP} stroke={FACE_STROKE} strokeWidth={0.6} />
      {pedal && (
        <path
          d={`M ${cx + rBot * 0.2} ${yFront - 1} l ${rBot * 0.9} 0`}
          stroke={DETAIL_LINE}
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      )}
    </>
  );
}

/**
 * Rug lying ON the floor plane — shared by every room that shows one, so a rug
 * is the same object wherever you meet it (same reasoning as `Bin`).
 *
 * It is drawn as a floor quad (`isoBox` with h=0), not as a low box: a rug has
 * no elevation to speak of, and giving it one makes it read as a plinth. What
 * carries the read instead is what a real rug has — an inset border for the
 * bound edge, and fringe ticks off the two short ends.
 */
export function Rug({ x, yFront, w, depth }: { x: number; yFront: number; w: number; depth: number }) {
  const quad = isoBox(x, yFront, w, 0, depth);
  const inset = 3.2;
  // The bound border is an inset on both axes: `inset` in from the left/right
  // edges, and `inset` ALONG the depth axis (RX, RY) in from the near/far ones.
  const fieldQuad = isoBox(x + inset + inset * RX, yFront + inset * RY, w - inset * 2, 0, depth - inset * 2);
  const fringe = [];
  const ticks = Math.max(3, Math.round(w / 7));
  for (let i = 0; i <= ticks; i++) {
    const t = i / ticks;
    // Front short edge (running along +x) gets ticks pointing at the viewer;
    // the far edge gets the same, offset along the depth axis.
    const px = x + w * t;
    fringe.push(<line key={`f${i}`} x1={px} y1={yFront} x2={px} y2={yFront + 2.4} stroke={DETAIL_LINE} strokeWidth={0.7} opacity={0.7} />);
    const bx = px + depth * RX;
    const by = yFront + depth * RY;
    fringe.push(<line key={`b${i}`} x1={bx} y1={by} x2={bx} y2={by - 2.4} stroke={DETAIL_LINE} strokeWidth={0.7} opacity={0.55} />);
  }
  return (
    <>
      <polygon points={quad.top} fill="oklch(0.55 0.035 75 / 0.9)" stroke={FACE_STROKE} strokeWidth={0.6} />
      <polygon points={fieldQuad.top} fill="oklch(0.63 0.045 75 / 0.9)" stroke={FACE_STROKE} strokeWidth={0.4} />
      {fringe}
    </>
  );
}

/** Wall-mounted rail with towels folded over it — the bathroom's towel spot. */
export function TowelRail({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <>
      <line x1={x} y1={y} x2={x + w} y2={y} stroke={DETAIL_LINE} strokeWidth={1.4} strokeLinecap="round" />
      <line x1={x + 1} y1={y} x2={x + 1} y2={y - 3} stroke={DETAIL_LINE} strokeWidth={1} />
      <line x1={x + w - 1} y1={y} x2={x + w - 1} y2={y - 3} stroke={DETAIL_LINE} strokeWidth={1} />
      {[0.14, 0.55].map((f) => (
        <path
          key={f}
          d={`M ${x + w * f} ${y} v 14 a 2.1 2.1 0 0 0 4 0 v -14`}
          fill="oklch(0.74 0.03 200 / 0.5)"
          stroke={DETAIL_LINE}
          strokeWidth={0.7}
        />
      ))}
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

/**
 * A television hanging FLAT ON THE WALL — the way most sets are actually
 * mounted, and the shape the three wall-mounted cards place. Drawn like the
 * bathroom mirror: a face on the wall band with no extrusion, because a 6cm
 * panel seen in this projection has no visible side.
 *
 * The chin is deliberately deeper than the sides and carries the standby dot;
 * that asymmetry is what separates "TV" from "dark rectangle" at glyph size.
 */
export function WallTv({ box }: { box: IsoBox }) {
  const { x, w, h } = box.face;
  const y0 = box.face.yFront - h;
  const bez = Math.min(2, w * 0.045);
  return (
    <>
      <rect x={x} y={y0} width={w} height={h} rx={1.2} fill="oklch(0.19 0.012 260 / 0.95)" stroke={FACE_STROKE} strokeWidth={0.7} />
      <rect
        x={x + bez}
        y={y0 + bez}
        width={w - bez * 2}
        height={h - bez * 2.8}
        fill="oklch(0.26 0.018 250 / 0.92)"
        stroke={DETAIL_LINE}
        strokeWidth={0.4}
        opacity={0.85}
      />
      {/* One soft sheen across the glass — the same cue the mirror uses to say
          "this is a reflective surface", angled the other way so a TV over a
          sideboard doesn't read as a second mirror. */}
      <line
        x1={x + w * 0.62}
        y1={y0 + bez + 1.5}
        x2={x + w * 0.9}
        y2={y0 + h - bez * 3}
        stroke={DETAIL_LIGHT}
        strokeWidth={0.9}
        opacity={0.35}
      />
      <circle cx={x + w / 2} cy={y0 + h - bez * 1.2} r={0.7} fill={DETAIL_LIGHT} opacity={0.6} />
    </>
  );
}

/**
 * A framed picture on the wall band. Like the mirror and the wall TV it is a
 * flat face with no extrusion — a 45mm frame seen in this projection has no
 * side worth drawing — but unlike them it is LIGHT, because a picture is the
 * one thing on a wall that is brighter than the wall.
 *
 * Three rings, and all three earn their place at this size: the moulding, the
 * mount inside it (what makes a print read as framed rather than taped up),
 * and a horizon line in the opening so the middle is a picture and not a hole.
 */
export function FramedArt({
  x,
  yTop,
  w,
  h,
  scene = "landscape",
}: {
  x: number;
  yTop: number;
  w: number;
  h: number;
  /** What is drawn inside the mount. "landscape" reads as a painting at any
   *  size; "abstract" keeps a set of three from being three copies of one
   *  picture, which is exactly the failure the 3D gallery card avoids too. */
  scene?: "landscape" | "abstract";
}) {
  const frame = Math.max(1.2, Math.min(w, h) * 0.075);
  const mount = frame * 1.5;
  const ix = x + frame + mount;
  const iy = yTop + frame + mount;
  const iw = Math.max(1, w - 2 * (frame + mount));
  const ih = Math.max(1, h - 2 * (frame + mount));
  return (
    <>
      <rect x={x} y={yTop} width={w} height={h} rx={0.8} fill={FACE_FRONT} stroke={FACE_STROKE} strokeWidth={0.7} />
      <rect x={x + frame} y={yTop + frame} width={w - 2 * frame} height={h - 2 * frame} fill="oklch(0.93 0.012 90 / 0.95)" stroke={DETAIL_LINE} strokeWidth={0.4} />
      <rect x={ix} y={iy} width={iw} height={ih} fill="oklch(0.72 0.045 220 / 0.75)" stroke={DETAIL_LINE} strokeWidth={0.4} />
      {scene === "landscape" ? (
        <>
          <path
            d={`M${ix} ${iy + ih * 0.68} L${ix + iw * 0.34} ${iy + ih * 0.3} L${ix + iw * 0.58} ${iy + ih * 0.62} L${ix + iw * 0.76} ${iy + ih * 0.45} L${ix + iw} ${iy + ih * 0.72} L${ix + iw} ${iy + ih} L${ix} ${iy + ih} Z`}
            fill="oklch(0.45 0.05 200 / 0.8)"
          />
          <circle cx={ix + iw * 0.78} cy={iy + ih * 0.24} r={Math.min(iw, ih) * 0.11} fill={DETAIL_LIGHT} opacity={0.75} />
        </>
      ) : (
        <>
          <rect x={ix + iw * 0.12} y={iy + ih * 0.18} width={iw * 0.34} height={ih * 0.34} fill="oklch(0.55 0.09 40 / 0.8)" />
          <circle cx={ix + iw * 0.66} cy={iy + ih * 0.62} r={Math.min(iw, ih) * 0.2} fill="oklch(0.5 0.07 150 / 0.8)" />
        </>
      )}
    </>
  );
}

/** A picture ledge: the shelf, plus two frames leaning on it. Drawn wherever a
 *  room's wall band has width but not height — the pair reads as "wall art"
 *  faster than one frame does, and the shelf says which card it is. */
export function ArtLedge({ x, yTop, w, h }: { x: number; yTop: number; w: number; h: number }) {
  const shelfT = Math.max(1.4, h * 0.09);
  const frameH = h - shelfT;
  const bigW = Math.min(w * 0.42, frameH * 0.8);
  const smallW = Math.min(w * 0.34, frameH * 0.75);
  return (
    <>
      <FramedArt x={x + w * 0.04} yTop={yTop + (h - shelfT - frameH)} w={bigW} h={frameH} scene="landscape" />
      <FramedArt x={x + w * 0.04 + bigW * 0.85} yTop={yTop + h - shelfT - frameH * 0.76} w={smallW} h={frameH * 0.76} scene="abstract" />
      <rect x={x} y={yTop + h - shelfT} width={w} height={shelfT} rx={0.6} fill={FACE_TOP} stroke={FACE_STROKE} strokeWidth={0.7} />
    </>
  );
}

/** A wall clock: rim, dial, and hands at ten past ten — the same time the 3D
 *  geometry shows, so the picture and the object agree. */
export function WallClockArt({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="oklch(0.9 0.012 90 / 0.95)" stroke={FACE_STROKE} strokeWidth={0.8} />
      <circle cx={cx} cy={cy} r={r * 0.82} fill="none" stroke={DETAIL_LINE} strokeWidth={0.4} opacity={0.7} />
      {/* Hands: hour to 10, minute to 2 — the pair frames the dial instead of
          stacking into one stick, which is why every catalogue shows it. */}
      <line x1={cx} y1={cy} x2={cx - r * 0.42} y2={cy - r * 0.3} stroke={DETAIL_LINE} strokeWidth={1.1} strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={cx + r * 0.5} y2={cy - r * 0.48} stroke={DETAIL_LINE} strokeWidth={0.9} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={r * 0.09} fill={DETAIL_LINE} />
    </>
  );
}

/** One hit target covering two drawn objects — a wall TV and the console under
 *  it are one button ("TV & storage"), so the hotspot rect has to reach both.
 *  Only the bbox merges; the faces stay whichever box was passed first. */
export function unionBox(a: IsoBox, b: IsoBox): IsoBox {
  return {
    ...a,
    bbox: {
      x0: Math.min(a.bbox.x0, b.bbox.x0),
      y0: Math.min(a.bbox.y0, b.bbox.y0),
      x1: Math.max(a.bbox.x1, b.bbox.x1),
      y1: Math.max(a.bbox.y1, b.bbox.y1),
    },
  };
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
 *  from the box's bounding box so thin shapes stay easy to hit. Exported
 *  (Plan Dock P4) so BuildHouseScene can build its own custom hotspot layout
 *  — a house cutaway's wall/door/window/stair hotspots don't fit
 *  RoomSceneShell's one-backdrop-wall-plus-floor-row shape, but the hit-area
 *  mechanics are identical. */
export function HitArea({
  id,
  label,
  box,
  active,
  hovered,
  onEnter,
  onLeave,
  onClick,
}: {
  id: string;
  /** Human wording for the hotspot ("Stove & oven", "Doors — drop on a wall").
   *  A11y: the accessible name used to be the raw `id` ("stove", "doors"), and
   *  the readable label only ever existed inside the hover bubble drawn in
   *  SVG, which nothing but a sighted mouse user can see. Optional so a caller
   *  that genuinely has no better wording still gets the id. */
  label?: string;
  box: IsoBox;
  active: boolean;
  hovered: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onClick: () => void;
}) {
  const { x0, y0, x1, y1 } = box.bbox;
  const pad = 2;
  // A11y: these hotspots carried role="button" but no tabindex and no key
  // handler, so the whole illustrated navigator — every room's hotspots and
  // the entire Build cutaway — was unreachable without a pointer. Focus +
  // Enter/Space now work. `onEnter`/`onLeave` double as focus/blur so the
  // hover outline and label bubble appear for a keyboard user too.
  const onKeyDown = (e: React.KeyboardEvent<SVGGElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    onClick();
  };
  return (
    <g
      role="button"
      aria-label={label ?? id}
      aria-pressed={active}
      tabIndex={0}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onKeyDown={onKeyDown}
      onClick={onClick}
      style={{ cursor: "pointer" }}
    >
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
      <g
        role="button"
        aria-label="Floor — pick a material"
        tabIndex={0}
        onMouseEnter={() => setHovered("floor")}
        onMouseLeave={() => setHovered((h) => (h === "floor" ? null : h))}
        onFocus={() => setHovered("floor")}
        onBlur={() => setHovered((h) => (h === "floor" ? null : h))}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          onFloorClick();
        }}
        onClick={onFloorClick}
        style={{ cursor: "pointer" }}
      >
        <polygon points={floor.top} fill="oklch(0.3 0.015 90 / 0.5)" stroke={FACE_STROKE} strokeWidth={0.6} />
        {hovered === "floor" && <polygon points={floor.top} fill="none" stroke={PD.accent} strokeWidth={1.5} strokeDasharray="3 3" />}
      </g>

      <RoomWall x0={x0} width={width} />

      {items.map((it) => (
        <g key={it.id}>
          {it.art}
          <HitArea
            id={it.id}
            label={it.label}
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
