import type { Opening, SlideSpec } from "@/schema/scene";

// Real door/window joinery filling an opening's gap. Pure geometry: given an
// opening + its host wall's local frame, emit tagged boxes (frame lining, door
// leaf, glass pane, mullion bars, handle, threshold). NO CSG — same box-in-
// wall-local convention as buildWallSegments.ts, so it's correct at any angle.

/** The minimal host-wall frame joinery needs (a subset of WallMesh's WallFrame). */
export interface JoineryFrame {
  ax: number; // node a, plan x
  ay: number; // node a, plan y
  ux: number; // wall unit direction x
  uy: number; // wall unit direction y
  L: number; // wall length (m)
  th: number; // wall thickness (m)
  wallH: number; // wall height (m)
}

export type JoineryRole =
  | "frame" | "leaf" | "glass" | "mullion" | "handle" | "threshold" | "track";

export interface JoineryPiece {
  key: string;
  role: JoineryRole;
  position: [number, number, number]; // world center (x, y, z)
  size: [number, number, number]; // [along-wall, up, across-wall]
  rotationY: number; // yaw about world Y
}

// Proportions (meters). Kept here so the look is tuned in one place.
const FRAME_W = 0.06; // width of a frame/reveal member
const FRAME_PROUD = 1.06; // frame sits slightly proud of both wall faces
const LEAF_THK = 0.045; // door slab thickness
const LEAF_GAP = 0.012; // clearance around the leaf
const GLASS_THK = 0.02;
const MULLION_W = 0.03;
const THRESHOLD_H = 0.02;
const HANDLE = 0.045;

// Sliding gear.
const SLIDE_PANEL_THK = 0.035; // one sliding panel/sash
// Depth between bypass tracks. MUST exceed the panel thickness or the panels
// would intersect instead of passing each other.
const TRACK_GAP = 0.048;
const PANEL_OVERLAP = 0.02; // panels lap slightly so a shut door has no hairline
const TRACK_H = 0.035; // head rail
const TRACK_THK = 0.05;
const SURFACE_GAP = 0.018; // barn leaf standoff from the wall face
const SURFACE_OVERLAP = 1.08; // barn leaf is wider than the hole it covers
const STILE_W = 0.045; // sash stile on a glazed sliding panel

const rotY = (dx: number, dy: number) => -Math.atan2(dy, dx);

/** The inner opening a sliding door has to fill, in wall-local terms. */
interface SlideBox {
  iStart: number; // inner opening, along-wall
  iEnd: number;
  iSill: number; // inner opening, vertical
  iTop: number;
  iw: number;
  ih: number;
  th: number; // host wall thickness
}

type PlaceZ = (
  key: string, role: JoineryRole, s: number, yc: number,
  along: number, up: number, acr: number, z?: number,
) => JoineryPiece;

/**
 * Panels for a sliding door, plus its head track.
 *
 * The three types the product cares about are one parameterisation, not three
 * code paths: patio = bypass + glazed + 2, wardrobe = bypass + solid + 2..3,
 * barn = surface + solid + 1.
 */
function slidingLeaves(s: SlideSpec, b: SlideBox, place: PlaceZ): JoineryPiece[] {
  const out: JoineryPiece[] = [];
  const open = Math.min(1, Math.max(0, s.open ?? 0));
  const toStart = (s.side ?? "end") === "start";
  const dir = toStart ? -1 : 1;
  const glazed = s.glazed ?? false;
  const yc = (b.iSill + b.iTop) / 2;
  const mid = (b.iStart + b.iEnd) / 2;

  if (s.style === "surface") {
    // Barn door: one leaf on the wall face, wider than the hole, parking clear
    // of it. Sits proud of side A.
    const leafW = b.iw * SURFACE_OVERLAP;
    const z = b.th / 2 + SURFACE_GAP + SLIDE_PANEL_THK / 2;
    const cs = mid + dir * open * leafW;
    out.push(place("sl0", glazed ? "glass" : "leaf", cs, yc, leafW, b.ih, SLIDE_PANEL_THK, z));
    // The rail has to span the opening AND wherever the leaf parks.
    out.push(
      place("tk", "track", mid + (dir * leafW) / 2, b.iTop + TRACK_H, b.iw + leafW, TRACK_H, TRACK_THK, z),
    );
    out.push(place("hn", "handle", cs - dir * (leafW / 2 - 0.1), yc, HANDLE, HANDLE * 2.2, SLIDE_PANEL_THK + 0.05, z));
    return out;
  }

  // Bypass: panels tile the opening when shut and stack at `side` when open.
  // Each rides its own track depth, which is what lets them pass each other.
  const n = Math.max(2, Math.round(s.panels || 2));
  const pw = b.iw / n;
  for (let k = 0; k < n; k++) {
    // Distance THIS panel travels: the one already at `side` is fixed, and the
    // rest run up behind it. Falls out of the arithmetic — no special case.
    const steps = toStart ? k : n - 1 - k;
    const cs = b.iStart + pw * (k + 0.5) + dir * open * pw * steps;
    const z = (k - (n - 1) / 2) * TRACK_GAP;
    const panelW = pw + PANEL_OVERLAP;
    if (glazed) {
      // A glazed sash: pane plus the stiles that frame it.
      out.push(place(`sg${k}`, "glass", cs, yc, panelW, b.ih, GLASS_THK, z));
      for (const e of [-1, 1]) {
        out.push(
          place(`ss${k}${e}`, "mullion", cs + (e * (panelW - STILE_W)) / 2, yc, STILE_W, b.ih, SLIDE_PANEL_THK, z),
        );
      }
    } else {
      out.push(place(`sl${k}`, "leaf", cs, yc, panelW, b.ih, SLIDE_PANEL_THK, z));
    }
    out.push(
      place(`sh${k}`, "handle", cs - dir * (panelW / 2 - 0.08), yc, HANDLE * 0.7, HANDLE * 2.6, SLIDE_PANEL_THK + 0.03, z),
    );
  }
  out.push(place("tk", "track", (b.iStart + b.iEnd) / 2, b.iTop + TRACK_H / 2, b.iw, TRACK_H, n * TRACK_GAP));
  return out;
}

export function buildJoinery(opening: Opening, f: JoineryFrame): JoineryPiece[] {
  const { ax, ay, ux, uy, L, th, wallH } = f;
  const start = Math.max(0, opening.offset - opening.width / 2);
  const end = Math.min(L, opening.offset + opening.width / 2);
  const gw = end - start;
  const sillY = Math.max(0, opening.sill);
  const topY = Math.min(wallH, opening.sill + opening.height);
  if (gw <= 1e-3 || topY - sillY <= 1e-3) return [];

  const wallRot = rotY(ux, uy); // = -atan2(uy, ux), aligns box +X with the wall
  const across = th * FRAME_PROUD;

  // A wall-aligned box placed by its center distance `s` along the wall and,
  // optionally, `z` across it (the wall's plan normal) — sliding panels ride in
  // tracks at different depths, so they need to leave the centreline.
  const localZ = (
    key: string,
    role: JoineryRole,
    s: number,
    yc: number,
    along: number,
    up: number,
    acr: number,
    z = 0,
  ): JoineryPiece => ({
    key,
    role,
    position: [ax + ux * s - uy * z, yc, ay + uy * s + ux * z],
    size: [along, up, acr],
    rotationY: wallRot,
  });
  const local = (
    key: string,
    role: JoineryRole,
    s: number,
    yc: number,
    along: number,
    up: number,
    acr: number,
  ): JoineryPiece => localZ(key, role, s, yc, along, up, acr);

  const pieces: JoineryPiece[] = [];
  const isWindow = opening.type === "window";
  const isPassage = opening.type === "passage";
  // A passage is a hole with no door in it. Lined by default (jamb + head, a
  // proper cased opening); switch it off for a bare plaster reveal.
  const lined = !isPassage || opening.lining !== false;

  // --- Frame lining: jambs + head (+ sill ledge for windows) -----------------
  const openH = topY - sillY;
  if (gw > 2 * FRAME_W && lined) {
    pieces.push(local("jL", "frame", start + FRAME_W / 2, (sillY + topY) / 2, FRAME_W, openH, across));
    pieces.push(local("jR", "frame", end - FRAME_W / 2, (sillY + topY) / 2, FRAME_W, openH, across));
    pieces.push(local("hd", "frame", (start + end) / 2, topY - FRAME_W / 2, gw, FRAME_W, across));
    if (isWindow) {
      // Sill ledge sits a touch deeper so it reads as a shelf.
      pieces.push(local("sl", "frame", (start + end) / 2, sillY + FRAME_W / 2, gw, FRAME_W, th * 1.18));
    }
  }

  // A passage is finished here: the wall already carries the real hole, and
  // there is nothing to hang in it. THIS is "remove the door" — the opening
  // stays, the door goes.
  if (isPassage) return pieces;

  // Inner (glazed / leaf) opening inside the frame.
  const iStart = start + FRAME_W;
  const iEnd = end - FRAME_W;
  const iSill = sillY + (isWindow ? FRAME_W : 0);
  const iTop = topY - FRAME_W;
  const iw = iEnd - iStart;
  const ih = iTop - iSill;
  const hasInner = iw > 1e-3 && ih > 1e-3;

  if (isWindow) {
    if (hasInner) {
      // Glass pane.
      pieces.push(local("gl", "glass", (iStart + iEnd) / 2, (iSill + iTop) / 2, iw, ih, GLASS_THK));
      // Mullion grid — cols vertical bars, rows horizontal bars.
      const cols = Math.max(1, Math.round(opening.mullions?.cols ?? 2));
      const rows = Math.max(1, Math.round(opening.mullions?.rows ?? 1));
      for (let k = 1; k < cols; k++) {
        const s = iStart + (iw * k) / cols;
        pieces.push(local(`mv${k}`, "mullion", s, (iSill + iTop) / 2, MULLION_W, ih, GLASS_THK + 0.012));
      }
      for (let k = 1; k < rows; k++) {
        const yc = iSill + (ih * k) / rows;
        pieces.push(local(`mh${k}`, "mullion", (iStart + iEnd) / 2, yc, iw, MULLION_W, GLASS_THK + 0.012));
      }
    }
    return pieces;
  }

  // --- Door -----------------------------------------------------------------
  // Threshold strip on the floor across the opening (only for floor-level doors).
  if (sillY < 1e-3) {
    pieces.push(local("th", "threshold", (start + end) / 2, THRESHOLD_H / 2, gw, THRESHOLD_H, th));
  }
  if (!hasInner) return pieces;

  if (opening.slide) {
    pieces.push(
      ...slidingLeaves(opening.slide, { iStart, iEnd, iSill, iTop, iw, ih, th }, localZ),
    );
    return pieces;
  }

  const hinge = opening.hinge ?? "start";
  const swing = ((opening.swingDeg ?? 0) * Math.PI) / 180;
  const leafLen = iw - LEAF_GAP;
  const leafYc = (iSill + iTop) / 2;

  if (Math.abs(swing) < 1e-3) {
    // Closed: leaf lies flush across the inner opening.
    pieces.push(local("lf", "leaf", (iStart + iEnd) / 2, leafYc, leafLen, ih, LEAF_THK));
    // Handle near the latch edge (opposite the hinge), proud of both faces.
    const sh = hinge === "end" ? iStart + 0.09 : iEnd - 0.09;
    pieces.push(local("hn", "handle", sh, 1.0, HANDLE, HANDLE, LEAF_THK + 0.07));
  } else {
    // Open: leaf swings about a vertical hinge at one jamb (plan-space rotation).
    const hingeS = hinge === "end" ? iEnd : iStart;
    const sign = hinge === "end" ? -1 : 1; // closed direction toward the far jamb
    const dx0 = ux * sign;
    const dy0 = uy * sign;
    const c = Math.cos(swing);
    const sgn = Math.sin(swing);
    const dx = dx0 * c - dy0 * sgn;
    const dy = dx0 * sgn + dy0 * c;
    const hx = ax + ux * hingeS;
    const hy = ay + uy * hingeS;
    const cx = hx + dx * (leafLen / 2);
    const cy = hy + dy * (leafLen / 2);
    pieces.push({
      key: "lf",
      role: "leaf",
      position: [cx, leafYc, cy],
      size: [leafLen, ih, LEAF_THK],
      rotationY: rotY(dx, dy),
    });
  }

  return pieces;
}
