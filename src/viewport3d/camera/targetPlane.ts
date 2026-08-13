// Camera P3a: which SURFACE is the armed tool aiming at, and can the camera
// currently see it well enough to aim?
//
// Placement targets in this app live on one of four planes, and each wants a
// different camera. Arming a wall tool while in Top view is not "awkward" — the
// wall is a line, so the task is impossible. Arming a rug tool at near-horizon
// is the same failure with the axes swapped. Today nothing notices, so the tool
// arms and the user discovers the problem by failing at it.
//
// The whole test reduces to ONE number. Every plane here is either horizontal
// (floor, counter, ceiling) or vertical (wall), so how squarely the camera
// faces it is decided by the camera's polar angle alone:
//
//   horizontal planes   incidence = cos(polar)   top-down 1.0, horizon 0.0
//   vertical planes     incidence = sin(polar)   top-down 0.0, horizon 1.0
//
// which is why the two are exact complements, and why a view that is good for
// floors is bad for walls at the extremes and fine for both in the middle. The
// default orbit works for almost everything precisely because it sits in that
// middle band — this module makes that accident explicit and testable.
//
// PURE — no THREE scene access, no store, no React. The scene-reading resolver
// and the UI that offers a camera move are separate; this file is the part
// that has to be right, so it is the part that has a test.

/** The four surfaces a placement can target. */
export type TargetPlane = "floor" | "wall" | "counter" | "ceiling";

/** Is this plane's normal vertical (floor/counter/ceiling) or horizontal (wall)?
 *  The only fact about a plane that the incidence math needs. */
export function isHorizontal(plane: TargetPlane): boolean {
  return plane !== "wall";
}

/** How squarely the camera faces the plane, 0..1. 1 = looking straight at it,
 *  0 = looking exactly along it (edge-on, zero screen area, cannot aim).
 *
 *  `polarRad` is camera-controls' polar angle: measured from +Y, so 0 is
 *  directly overhead and PI/2 is level with the target.
 *
 *  For WALLS this is deliberately the BEST case over all wall orientations
 *  rather than a specific wall's normal. The question being asked is "could the
 *  user work on some wall from here", and if no wall orientation could work,
 *  none does — which is exactly the top-down case. Picking a specific wall
 *  would report "impossible" for a wall the user was never trying to reach. */
export function incidence(plane: TargetPlane, polarRad: number): number {
  return Math.abs(isHorizontal(plane) ? Math.cos(polarRad) : Math.sin(polarRad));
}

/** How usable the current view is for this plane. Three bands, not two,
 *  because the gap between them is the whole interaction design: `impossible`
 *  earns a prominent offer of a camera move, `poor` earns a quiet one, and
 *  `clear` must stay silent — a suggestion that fires when nothing is wrong is
 *  how an assistive affordance becomes noise. */
export type Legibility = "clear" | "poor" | "impossible";

/** Incidence below this and the plane is edge-on enough that aiming at it is
 *  guesswork: at 0.15 a wall seen from above occupies ~8.6 degrees off pure
 *  edge-on, which on screen is a few pixels of thickness. */
export const IMPOSSIBLE_BELOW = 0.15;
/** Above `IMPOSSIBLE_BELOW` but below this, the surface is workable but the
 *  foreshortening is bad enough to make placement fiddly. */
export const POOR_BELOW = 0.4;

/** Facing a surface squarely is necessary but NOT sufficient — you also have
 *  to be on the side its working face points at, and for one plane you never
 *  are.
 *
 *  This was a real hole in the first version of this model, caught by the test
 *  below asserting that a ceiling is hard to work on from a default orbit: the
 *  incidence math cheerfully rated it `clear`, because to an orbit camera a
 *  ceiling and a floor are the SAME horizontal plane at the same angle. What
 *  separates them is not geometry, it is sidedness. A floor's working face
 *  points up, so looking down at it works. A ceiling's points down, so looking
 *  down shows you its back — and the mesh itself sits between the camera and
 *  the room it belongs to.
 *
 *  No camera angle fixes that, which is the useful conclusion: a ceiling is
 *  reachable only once its mesh is out of the way, and then it is worked
 *  through the gap from a plan-like view, exactly like a floor. So ceiling
 *  legibility is gated on the ceilings being hidden and otherwise scores like
 *  a floor — and `needsCeilingsHidden` below is a consequence of this rule
 *  rather than a separate assertion that could drift out of step with it. */
export function legibility(
  plane: TargetPlane,
  polarRad: number,
  opts?: { ceilingsHidden?: boolean },
): Legibility {
  if (plane === "ceiling" && !opts?.ceilingsHidden) return "impossible";
  const i = incidence(plane, polarRad);
  if (i < IMPOSSIBLE_BELOW) return "impossible";
  if (i < POOR_BELOW) return "poor";
  return "clear";
}

/** Polar angle (degrees from +Y) that suits each plane.
 *
 *  These are NOT the extremes. A wall pose at 90 would be a perfect head-on
 *  elevation and also a useless one — you lose all sense of the room's depth,
 *  and the floor the furniture stands on vanishes. Each value is the shallowest
 *  angle that reads as "facing the thing" while keeping the room legible around
 *  it, which is what makes the offered move feel like a good camera rather than
 *  a correct one. */
export const PLANE_POSE_POLAR_DEG: Record<TargetPlane, number> = {
  /** Looking down at a layout, near the default orbit — a rug or a sofa is read
   *  as a footprint, and its relationship to the room matters as much as it. */
  floor: 55,
  /** Steeper than floor: a worktop is a small horizontal target, and the item's
   *  own front face matters (a hob's controls, a sink's tap), so the pose has to
   *  show the surface AND some elevation. */
  counter: 62,
  /** Near-square to the wall without going fully flat — 78 keeps enough floor
   *  in frame to judge how high a picture hangs relative to the furniture. */
  wall: 78,
  /** Near-overhead. A ceiling is only reachable from a plan-like view; the room
   *  below has to be visible through it, which is the ceilings-off case. */
  ceiling: 15,
};

/** Does an offered pose for this plane need to change the camera's AZIMUTH too?
 *
 *  Only walls. Spinning the camera around the model is the most disorienting
 *  thing a camera can do — the user loses which way is which and has to
 *  re-find their bearings — so azimuth is preserved for every horizontal plane,
 *  where it carries no information about the task. A wall is the one case where
 *  it does: facing the wall square-on IS the pose. */
export function needsAzimuth(plane: TargetPlane): boolean {
  return plane === "wall";
}

/** Ceiling work needs the ceilings hidden as well as the camera moved — an
 *  offer that repositions the camera and leaves the room capped has not
 *  actually made the task possible. Falls out of the sidedness rule in
 *  `legibility`: this is the one plane no camera angle can rescue on its own. */
export function needsCeilingsHidden(plane: TargetPlane): boolean {
  return plane === "ceiling";
}

/** Human-readable name of the surface, for the offer chip's label. Lowercase:
 *  these are substituted into a sentence, not used as titles. */
export const PLANE_NOUN: Record<TargetPlane, string> = {
  floor: "floor",
  wall: "wall",
  counter: "worktop",
  ceiling: "ceiling",
};

// ---------------------------------------------------------------------------
// Resolving which plane an armed tool targets.
//
// Every branch below reads a field the schema ALREADY carries for its own
// reasons — `wallMounted`/`counterItem` drive placement, `FixtureCategory`
// drives the lighting dock, `Brush.kind` drives the applicator. Nothing here
// introduces a new field to be kept in sync, which is deliberate: a parallel
// "what plane is this" flag would be a second source of truth that silently
// rots the first time a generator is added and only this list is forgotten.
// ---------------------------------------------------------------------------

/** The armed tool, reduced to only what decides its target plane. Callers
 *  build this from the store; keeping it a plain descriptor is what lets the
 *  resolution rules be tested without a scene, a canvas or a React tree. */
export type ArmedTarget =
  | { source: "parametric"; wallMounted: boolean; counterItem: boolean }
  | { source: "catalog"; defaultElevation?: number }
  | { source: "fixture"; category: "Ceiling" | "Wall" }
  | { source: "brush"; kind: "paint" | "floor" }
  | { source: "opening" };

/** A catalog (non-parametric) item declares no mounting type — the schema has
 *  no PlacementType field for them — so elevation is the only signal available.
 *  At or above roughly chest height nothing stands on the floor: it is hung.
 *  Same reasoning and the same order of magnitude as walkthrough's
 *  `furnitureElevationCutoffM`, which decides what a person can walk under. */
export const HUNG_ELEVATION_M = 1.0;

export function resolveTargetPlane(t: ArmedTarget): TargetPlane {
  switch (t.source) {
    case "parametric":
      // Order matters: a counter item is mounted on a worktop even though some
      // of them also hang (an extractor over an island), so counter wins.
      if (t.counterItem) return "counter";
      return t.wallMounted ? "wall" : "floor";
    case "catalog":
      return (t.defaultElevation ?? 0) >= HUNG_ELEVATION_M ? "wall" : "floor";
    case "fixture":
      return t.category === "Ceiling" ? "ceiling" : "wall";
    case "brush":
      // Painting a wall from a top-down view fails for exactly the same reason
      // hanging a picture does — the surface is edge-on. A brush is a placement
      // tool as far as the camera is concerned.
      return t.kind === "paint" ? "wall" : "floor";
    case "opening":
      // Doors and windows are cut into walls.
      return "wall";
  }
}
