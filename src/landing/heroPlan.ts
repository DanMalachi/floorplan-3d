import type { Node, Opening, Room, Wall } from "@/schema/scene";
import { DEFAULT_THICKNESS } from "@/schema/constants";

// -----------------------------------------------------------------------------
// The hero's plan, as data — the ONE source of truth for both halves of the
// opening animation.
//
// The hero shows a plan being traced by hand and then generated into the 3D
// room. Those are two different renderers (an SVG overlay and the real
// Viewport), and if they each carried their own copy of the geometry they would
// drift the first time anyone nudged a wall: the visitor would watch one
// building get drawn and a different one stand up. So the coordinates live
// here, once, and `demoScene.ts` derives the Scene from them.
//
// ── This file must stay free of the 3D layer ────────────────────────────────
// It is imported by TraceOverlay.tsx, which is reached from DemoRoom.tsx — the
// light half of the hero, which must never pull in `useSceneStore` (see the
// header of DemoStage.tsx for why that boundary is load-bearing and how it is
// silently broken). Only two imports are allowed here: `@/schema/scene` for
// TYPES, which erase at build time, and `@/schema/constants`, which is plain
// numbers. Nothing else.
//
// ── The plan ────────────────────────────────────────────────────────────────
// A 6 x 5 m studio with a 1.8 x 1.8 m bathroom bumped off its left wall, so the
// whole model is 7.80 x 5.00 m — landscape, which is the shape of the hero's
// canvas. The bathroom hangs off the LEFT and not the top because the left wall
// is the one demoScene calls "blank, bed backs onto it": splitting it costs
// nothing, while every other wall carries an opening or furniture.
//
//      n9(-3.9,2.5)   n3(-2.1,2.5)                        n2(3.9,2.5)
//            +--------------+---------------------------------+
//            |     bath     |                                 |
//            |              |                              [ W2 patio ]
//   n8(-3.9,0.7)------------+ n7(-2.1,0.7)                     |
//                           |                                  |
//                           |            studio                |
//                           +---------------------------------+
//                   n0(-2.1,-2.5)   [ W1 ]   [ D1 ]     n1(3.9,-2.5)
// -----------------------------------------------------------------------------

// ── The plan is CENTRED ON THE ORIGIN, and that is load-bearing ─────────────
// Both cameras that ever look at this model aim at (0,0,0): AutoOrbitRig's
// `setLookAt(..., 0, 0, 0)` in the hero, and the editor's FitCamera on
// /design. The renderer's environment is origin-centred too — `loadIntoStore`
// warns in as many words that an off-origin model "floats away from the
// origin-centred environment".
//
// This plan used to run x 0..6 with the bathroom out to -1.8, putting its
// centre at (2.1, 2.5). Nothing crashed; it just sat off to one side of every
// camera that framed it, low in the hero's frame, and on /design it framed so
// far off that the viewport rendered black and looked like a scene that had
// failed to load. Subtracting the centre once fixes both.
//
// The SVG is unaffected: `TraceOverlay` projects through HERO_BOUNDS, so it
// normalises whatever range these coordinates cover. Shifting them all by the
// same amount changes the drawing by exactly nothing.
export const HERO_NODES: Node[] = [
  { id: "n0", x: -2.1, y: -2.5 },
  { id: "n1", x: 3.9, y: -2.5 },
  { id: "n2", x: 3.9, y: 2.5 },
  { id: "n3", x: -2.1, y: 2.5 },
  { id: "n7", x: -2.1, y: 0.7 }, // splits the left wall for the bathroom
  { id: "n8", x: -3.9, y: 0.7 },
  { id: "n9", x: -3.9, y: 2.5 },
];

/** The drawing area the plan occupies, in metres. Drives the SVG viewBox. */
export const HERO_BOUNDS = { minX: -3.9, maxX: 3.9, minY: -2.5, maxY: 2.5 };

/**
 * A wall segment, plus everything the trace animation needs to draw it by hand.
 *
 * The order of this array IS the order the pen draws in, and it is not
 * arbitrary. A person tracing a plan does not grow four walls out of four
 * corners at once; they run a continuous line and close it. So every segment
 * starts on the node the previous one ended on, and the array falls into two
 * unbroken strokes:
 *
 *   stroke 1  n0 -> n1 -> n2 -> n3 -> n7 -> n0   (the studio, closing on n0)
 *   stroke 2  n3 -> n9 -> n8 -> n7               (the bathroom, closing on n7)
 *
 * `travelBase` is the only pen lift, between the two strokes, and it is paired
 * with the long pause on `w3b` — together they read as the moment a person
 * sits back, looks at what they have, and starts the next room.
 *
 * Timings are BASE seconds at 1x. The overlay divides them by a phase rate
 * (walls run at 1.4x), so the whole stroke — draws, pauses and the lift —
 * speeds up together and keeps its rhythm instead of turning into fast lines
 * separated by unchanged gaps.
 */
export interface HeroSegment {
  id: string;
  a: string;
  b: string;
  /** Shown in the trace read-out. Plain language, not an id. */
  run: string;
  drawBase: number;
  pauseBase: number;
  /** Seconds spent lifting the pen to this segment's start. */
  travelBase?: number;
  /** This segment closes a loop onto a node already drawn — it snaps harder. */
  closes?: boolean;
}

export const HERO_SEGMENTS: HeroSegment[] = [
  { id: "w0", a: "n0", b: "n1", run: "bottom", drawBase: 0.7, pauseBase: 0.16 },
  { id: "w1", a: "n1", b: "n2", run: "right", drawBase: 0.62, pauseBase: 0.12 },
  { id: "w2", a: "n2", b: "n3", run: "top", drawBase: 0.68, pauseBase: 0.17 },
  { id: "w3a", a: "n3", b: "n7", run: "left, upper", drawBase: 0.34, pauseBase: 0.11 },
  { id: "w3b", a: "n7", b: "n0", run: "left, lower", drawBase: 0.46, pauseBase: 0.5, closes: true },
  { id: "w7", a: "n3", b: "n9", run: "bath, top", drawBase: 0.34, pauseBase: 0.12, travelBase: 0.42 },
  { id: "w8", a: "n9", b: "n8", run: "bath, outer", drawBase: 0.34, pauseBase: 0.1 },
  { id: "w9", a: "n8", b: "n7", run: "bath, lower", drawBase: 0.34, pauseBase: 0.3, closes: true },
];

/**
 * An opening, in the order the hand places it — four windows going around the
 * plan, then the two doors.
 *
 * `kind` is a DRAWING distinction, not a schema one: "patio" is still a window
 * in the Scene, it just gets a wider glazing line and a centre mullion in plan
 * so it reads as glass rather than a hole. `swing` is likewise overlay-only —
 * which side the door's arc sweeps, which the plan glyph needs and the 3D
 * derives for itself.
 */
export interface HeroOpening {
  id: string;
  /** The mark on the schedule — W1, D2. Shown in the trace read-out. */
  mark: string;
  kind: "window" | "patio" | "door";
  label: string;
  wall: string;
  offset: number;
  width: number;
  sill: number;
  height: number;
  swing?: 1 | -1;
}

export const HERO_OPENINGS: HeroOpening[] = [
  { id: "o4", mark: "W1", kind: "window", label: "window", wall: "w0", offset: 1.6, width: 1.2, sill: 0.9, height: 1.2 },
  // The patio window. 2.55 m is over half the length of the right wall, and it
  // spans y 2.18-4.73 with 0.28 m left to the corner — which is why the storage
  // cabinet had to move down that wall (see demoScene.ts). The head sits at
  // 2.20 m on a 2.40 m wall, so it is within 0.20 m of the ceiling: width was
  // the only dimension left to grow.
  { id: "o1", mark: "W2", kind: "patio", label: "patio window", wall: "w1", offset: 3.45, width: 2.55, sill: 0.1, height: 2.1 },
  { id: "o2", mark: "W3", kind: "window", label: "window", wall: "w2", offset: 2.3, width: 1.2, sill: 0.9, height: 1.2 },
  { id: "o5", mark: "W4", kind: "window", label: "window", wall: "w8", offset: 0.9, width: 0.6, sill: 1.2, height: 0.6 },
  { id: "o0", mark: "D1", kind: "door", label: "front door", wall: "w0", offset: 4.5, width: 0.9, sill: 0, height: 2, swing: -1 },
  { id: "o3", mark: "D2", kind: "door", label: "bathroom door", wall: "w3a", offset: 0.9, width: 0.8, sill: 0, height: 2, swing: 1 },
];

/** Room loops, in perimeter order. The bathroom closes on `w3a`, the shared wall. */
export const HERO_ROOMS: Room[] = [
  { id: "r0", name: "Studio", loop: ["n0", "n1", "n2", "n3", "n7"] },
  { id: "r1", name: "Bathroom", loop: ["n3", "n9", "n8", "n7"] },
];

/** The Scene's walls, derived so the traced line and the built wall are one thing. */
export function heroWalls(): Wall[] {
  return HERO_SEGMENTS.map((s) => ({
    id: s.id,
    a: s.a,
    b: s.b,
    thickness: DEFAULT_THICKNESS,
  }));
}

/**
 * The Scene's openings, derived from the same list the hand places.
 *
 * The patio window carries an explicit 2-column mullion. That is the schema's
 * own default for windows, but at 2.55 m it is load-bearing rather than
 * incidental — a pane that wide with no bar reads as a missing wall — so it is
 * stated rather than inherited.
 */
export function heroOpenings(): Opening[] {
  return HERO_OPENINGS.map((o) => ({
    id: o.id,
    type: o.kind === "door" ? ("door" as const) : ("window" as const),
    wallId: o.wall,
    offset: o.offset,
    width: o.width,
    height: o.height,
    sill: o.sill,
    ...(o.kind === "patio" ? { mullions: { cols: 2, rows: 1 } } : {}),
  }));
}

/** Metres of wall the hand draws, end to end. Used by the trace read-out. */
export function heroSegmentLength(s: HeroSegment): number {
  const a = HERO_NODES.find((n) => n.id === s.a);
  const b = HERO_NODES.find((n) => n.id === s.b);
  if (!a || !b) return 0;
  return Math.hypot(b.x - a.x, b.y - a.y);
}
