// Ephemeral trace-editor types shared between the legacy trace2d pipeline and
// the app store's trace-draft state. Moved out of useSceneStore.ts in Phase 0
// to make that dependency one-directional (store -> legacy, not circular):
// the store still imports these to type its trace-draft slice, but nothing
// in this file imports back from the store.
//
// These never live inside Scene. Trace coordinates are in "image-local
// pixels" (the background image's natural pixel space, or raw stage pixels
// when no image is loaded). Conversion to meters happens using
// metersPerPixel from scale calibration.

export interface TracePoint {
  id: string;
  x: number;
  y: number;
}

/** What kind of boundary a traced edge is. Mirrors Wall.kind — see the notes
 *  there. Every kind closes a room the same way; they differ only in what gets
 *  built on the line. */
export type SegmentKind = "wall" | "rail" | "portal";

export interface TraceSegment {
  id: string;
  a: string; // point id
  b: string; // point id
  // A traced edge is a full-height WALL unless tagged otherwise. A RAIL is a
  // low, see-through divider (balcony railing, glass balustrade, low parapet).
  // A PORTAL is no barrier at all — the line where one space becomes another,
  // so you can close a room without drawing a wall you'd only have to punch a
  // fake door through. Both bound rooms exactly like walls. Absent = wall.
  type?: SegmentKind;
}

// An opening is traced as a line ALONG its host wall: t0..t1 are the normalized
// endpoints of that line on the segment (0 = point a, 1 = point b). Width is
// derived from |t1 - t0| * wallLength at generate time, so it's scale-independent
// and any length. height/sill stay in METERS (vertical extent isn't traced).
export interface TraceOpening {
  id: string;
  type: "door" | "window";
  segmentId: string;
  t0: number;
  t1: number;
  height: number;
  sill: number;
}

// Raw segment parsed from an imported vector PDF, already converted to the
// background-image pixel space. Rendered as the M1 "what was parsed" overlay.
export interface ImportSegment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: [number, number, number] | null; // stroke color 0..1, or null
  width: number; // pt
  layer: string; // CAD layer name (e.g. "0", "KIROT", "RIHUT", "PETACH")
}

// A curved path (cubic) parsed from the PDF, in background-image px. Door-swing
// arcs (big chords) are used to confirm/locate doors.
export interface ImportArc {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  chord: number; // straight-line distance between endpoints (px)
  color: [number, number, number] | null;
  width: number;
  layer: string;
}
