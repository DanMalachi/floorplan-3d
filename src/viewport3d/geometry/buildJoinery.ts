import type { Opening } from "@/schema/scene";

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

export type JoineryRole = "frame" | "leaf" | "glass" | "mullion" | "handle" | "threshold";

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

const rotY = (dx: number, dy: number) => -Math.atan2(dy, dx);

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

  // A wall-aligned box placed by its center distance `s` along the wall.
  const local = (
    key: string,
    role: JoineryRole,
    s: number,
    yc: number,
    along: number,
    up: number,
    acr: number,
  ): JoineryPiece => ({
    key,
    role,
    position: [ax + ux * s, yc, ay + uy * s],
    size: [along, up, acr],
    rotationY: wallRot,
  });

  const pieces: JoineryPiece[] = [];
  const isWindow = opening.type === "window";

  // --- Frame lining: jambs + head (+ sill ledge for windows) -----------------
  const openH = topY - sillY;
  if (gw > 2 * FRAME_W) {
    pieces.push(local("jL", "frame", start + FRAME_W / 2, (sillY + topY) / 2, FRAME_W, openH, across));
    pieces.push(local("jR", "frame", end - FRAME_W / 2, (sillY + topY) / 2, FRAME_W, openH, across));
    pieces.push(local("hd", "frame", (start + end) / 2, topY - FRAME_W / 2, gw, FRAME_W, across));
    if (isWindow) {
      // Sill ledge sits a touch deeper so it reads as a shelf.
      pieces.push(local("sl", "frame", (start + end) / 2, sillY + FRAME_W / 2, gw, FRAME_W, th * 1.18));
    }
  }

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
