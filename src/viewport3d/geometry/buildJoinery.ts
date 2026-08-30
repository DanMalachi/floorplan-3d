import * as THREE from "three";
import type { Opening, SlideSpec } from "@/schema/scene";
import { effectiveSlide, isDoubleDoor, leafWidths } from "@/render/doorStyle";

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
// Swing-door lever hardware (pushHandle, below) — deliberately separate from
// HANDLE above (that one sizes the sliding-door pull handles, a different
// fixture entirely).
const HANDLE_PLATE_W = 0.045; // backplate/rosette, flush against each face
const HANDLE_PLATE_H = 0.11;
const HANDLE_PLATE_D = 0.01;
const HANDLE_LEVER_LEN = 0.11; // the grip bar, parallel to the door
const HANDLE_LEVER_TH = 0.022;

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
 *
 * `widths` are the per-panel widths (bypass only), already summing to the
 * inner opening — an even split unless the opening carries a `leafSplit`.
 */
function slidingLeaves(s: SlideSpec, b: SlideBox, place: PlaceZ, widths: number[]): JoineryPiece[] {
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
  const n = widths.length;
  // Shut centres, left to right. Derived from the widths rather than a single
  // panel pitch so an uneven pair (a wide slider beside a narrow fixed light)
  // tiles the opening exactly the same way an even one does.
  const centers: number[] = [];
  let acc = b.iStart;
  for (const w of widths) {
    centers.push(acc + w / 2);
    acc += w;
  }
  // Where a panel ends up fully open: on top of the one at `side`, which is
  // itself fixed. Interpolating centre -> that target reduces to the old
  // "pitch x panels passed" travel when the widths are equal.
  const parked = centers[toStart ? 0 : n - 1];
  for (let k = 0; k < n; k++) {
    const cs = centers[k] + open * (parked - centers[k]);
    const z = (k - (n - 1) / 2) * TRACK_GAP;
    const panelW = widths[k] + PANEL_OVERLAP;
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

  const slide = effectiveSlide(opening);
  if (slide) {
    const panels = slide.style === "surface" ? 1 : Math.max(2, Math.round(slide.panels || 2));
    pieces.push(
      ...slidingLeaves(
        slide,
        { iStart, iEnd, iSill, iTop, iw, ih, th },
        localZ,
        leafWidths(iw, panels, opening.leafSplit),
      ),
    );
    return pieces;
  }

  const double = isDoubleDoor(opening);
  const hinge = opening.hinge ?? "start";
  const swing = ((opening.swingDeg ?? 0) * Math.PI) / 180;
  const leafYc = (iSill + iTop) / 2;

  /** A real lever, not a cube. Per face: a thin backplate flush against
   *  THAT face (not embedded through the door — the previous version's plate
   *  spanned slightly more than the leaf's own thickness, centered on it, so
   *  it sat almost entirely buried inside the door with barely anything
   *  showing) plus a bar whose inner end sits right against the plate's
   *  outer face and runs parallel to the door (along direction), the way a
   *  real push-down lever does. `along` is the leaf's own unit direction
   *  (rotated open or not), so this places correctly whether the leaf is
   *  closed or swung.
   *
   *  `sFromHinge` is the absolute distance hinge→handle, applied along the
   *  leaf's own hinge→latch direction. Signed subtraction here was the
   *  float-in-air bug: for hinge="end" it went negative and mirrored the
   *  handle to the wrong side of the hinge. */
  const pushHandle = (
    key: string,
    origin: readonly [number, number],
    along: readonly [number, number],
    sFromHinge: number,
  ): void => {
    const [ox, oy] = origin;
    const [ax_, ay_] = along;
    const across: [number, number] = [-ay_, ax_]; // this leaf's own +Z (thickness) direction
    const rot = rotY(ax_, ay_);
    const pos = (s: number, z: number): [number, number, number] => [
      ox + ax_ * s - across[0] * z,
      leafYc,
      oy + ay_ * s + across[1] * z,
    ];
    for (const face of [1, -1] as const) {
      const faceZ = face * (LEAF_THK / 2); // the leaf's actual face plane on this side
      const plateZ = faceZ + face * (HANDLE_PLATE_D / 2);
      pieces.push({
        key: `${key}Plate${face}`,
        role: "handle",
        position: pos(sFromHinge, plateZ),
        size: [HANDLE_PLATE_W, HANDLE_PLATE_H, HANDLE_PLATE_D],
        rotationY: rot,
      });
      const leverZ = faceZ + face * (HANDLE_PLATE_D + HANDLE_LEVER_TH / 2);
      // Grip bar pivots at the spindle (plate center) and extends toward the
      // hinge — centering it on the spindle made it stick out past the door
      // edge like a T-bar.
      pieces.push({
        key: `${key}Lever${face}`,
        role: "handle",
        position: pos(sFromHinge - HANDLE_LEVER_LEN / 2, leverZ),
        size: [HANDLE_LEVER_LEN, HANDLE_LEVER_TH, HANDLE_LEVER_TH],
        rotationY: rot,
      });
    }
  };

  /**
   * One hinged leaf filling the slot [`hingeS`, `hingeS + sign * slot`], with
   * its handle. `rot` is its own open angle, so a double door can hand its two
   * leaves opposite signs and have them swing to the SAME side of the wall
   * (each leaf's hinge→latch direction is already mirrored by `sign`).
   */
  const swingLeaf = (key: string, hingeS: number, sign: 1 | -1, slot: number, rot: number): void => {
    const leafLen = slot - LEAF_GAP;
    if (leafLen <= 1e-3) return;
    const hx = ax + ux * hingeS;
    const hy = ay + uy * hingeS;
    // Handle sits near the latch edge, 9 cm in from the leaf's free edge.
    const sFromHinge = slot - 0.09;
    if (Math.abs(rot) < 1e-3) {
      // Closed: leaf lies flush across its slot.
      pieces.push(
        local(key, "leaf", hingeS + sign * (slot / 2), leafYc, leafLen, ih, LEAF_THK),
      );
      // Origin is the HINGE, matching sFromHinge's frame — passing the wall's
      // node a here shifted every closed handle by hingeS along the wall.
      pushHandle(`${key}h`, [hx, hy], [ux * sign, uy * sign], sFromHinge);
      return;
    }
    // Open: leaf swings about a vertical hinge at its jamb (plan-space rotation).
    const dx0 = ux * sign;
    const dy0 = uy * sign;
    const c = Math.cos(rot);
    const sgn = Math.sin(rot);
    const dx = dx0 * c - dy0 * sgn;
    const dy = dx0 * sgn + dy0 * c;
    pieces.push({
      key,
      role: "leaf",
      position: [hx + dx * (leafLen / 2), leafYc, hy + dy * (leafLen / 2)],
      size: [leafLen, ih, LEAF_THK],
      rotationY: rotY(dx, dy),
    });
    // A swung-open door still has a handle — previously dropped entirely,
    // leaving every opened door in a walkthrough handle-less.
    pushHandle(`${key}h`, [hx, hy], [dx, dy], sFromHinge);
  };

  if (double) {
    // A pair meeting mid-opening: each leaf hangs on its own jamb, so `hinge`
    // has nothing to choose and `swingDeg` opens both. The end leaf takes the
    // opposite rotation sign purely so the two swing the same way, not apart.
    const [wA, wB] = leafWidths(iw, 2, opening.leafSplit);
    swingLeaf("lfA", iStart, 1, wA, swing);
    swingLeaf("lfB", iEnd, -1, wB, -swing);
  } else {
    swingLeaf("lf", hinge === "end" ? iEnd : iStart, hinge === "end" ? -1 : 1, iw, swing);
  }

  return pieces;
}

// --- Draw-call batching (perf-drawcalls.md §5.2) ----------------------------
//
// A unit box's 24 vertices + 36-index winding, read once off a real
// THREE.BoxGeometry so mergeJoineryBoxes doesn't hand-derive face winding.
// Template only — never rendered itself.
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_POS = UNIT_BOX.attributes.position.array as ArrayLike<number>;
const UNIT_UV = UNIT_BOX.attributes.uv.array as ArrayLike<number>;
const UNIT_IDX = UNIT_BOX.index!.array as ArrayLike<number>;

/**
 * Combine several boxes (as emitted by buildJoinery — a world-space
 * `position` + a `rotationY` shared by every piece on one straight wall)
 * into ONE flat-shaded BufferGeometry, baked at an identity transform so the
 * returned geometry drops straight onto a `<mesh position={[0,0,0]}
 * rotation={[0,0,0]}>`. This is how an opening's frame casing folds down to a
 * single draw call.
 *
 * NEVER call this on leaf, handle, track or sliding-panel pieces —
 * buildJoinery re-emits those at a new position every animation frame
 * mid-gesture (§4.7 of perf-drawcalls.md), and baking a position into vertex
 * data means rebuilding the whole geometry to move it, instead of just
 * writing a transform. Only pieces whose position never depends on swing/
 * slide state (frame, a window's static mullion grid) belong here — a door's
 * threshold is equally static but is deliberately NOT folded in here: it
 * carries its own distinct material (mats.threshold), and merging it into
 * frame's single-material mesh would mean either a second material group
 * (no draw-call win over leaving it separate — three submits one draw per
 * group regardless of geometry merging) or unifying its colour with the
 * frame casing's, which is a real, visible change nothing here signed off on.
 */
export function mergeJoineryBoxes(pieces: JoineryPiece[]): THREE.BufferGeometry {
  const position: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  let base = 0;
  for (const p of pieces) {
    const [sx, sy, sz] = p.size;
    const [cx, cy, cz] = p.position;
    const cos = Math.cos(p.rotationY);
    const sin = Math.sin(p.rotationY);
    for (let i = 0; i < 24; i++) {
      const lx = UNIT_POS[i * 3] * sx;
      const ly = UNIT_POS[i * 3 + 1] * sy;
      const lz = UNIT_POS[i * 3 + 2] * sz;
      // Same rotate-then-translate a <mesh rotation={[0,rotationY,0]}
      // position={p.position}> would apply to a boxGeometry(sx,sy,sz).
      position.push(cx + lx * cos + lz * sin, cy + ly, cz - lx * sin + lz * cos);
      uv.push(UNIT_UV[i * 2], UNIT_UV[i * 2 + 1]);
    }
    for (let i = 0; i < UNIT_IDX.length; i++) index.push(base + UNIT_IDX[i]);
    base += 24;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geom.setIndex(index);
  // Faces aren't shared between boxes (or between a box's own faces), so this
  // stays flat-shaded, same as wallGeometry.ts's own computeVertexNormals.
  geom.computeVertexNormals();
  return geom;
}
