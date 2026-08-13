// Camera P3a: when the app offers to fix the view, and what it is allowed to
// do about it.
//
// The rule this whole file defends: OFFER, NEVER SEIZE. A camera that moves on
// its own is the fastest way to make a tool feel like it is operating you, and
// the product's own UX law is that it must never feel like operating an AI. So
// nothing here moves anything. It decides whether a chip appears; a click or a
// keypress is the only thing that acts.
//
// Two constraints do most of the work, and both are stricter than they look:
//
//  1. THE REMEDY MAY ONLY PRESS BUTTONS THE USER ALREADY HAS. Every field of
//     `Remedy` maps onto an existing control — an orbit the user could perform,
//     or the Ceiling toggle sitting in WallModeToggle. Nothing is offered that
//     the user could not have done manually, which is what keeps this reading
//     as a shortcut rather than a magic hand. It also makes every remedy
//     self-documenting: accepting one visibly flips the same toggle the user
//     would have flipped, so they learn where the control lives instead of
//     being handed an outcome they cannot reproduce.
//
//  2. SILENCE IS THE DEFAULT AND `clear` IS NEVER INTERRUPTED. An affordance
//     that fires when nothing is wrong is not an affordance, it is noise, and
//     users learn to ignore it long before it ever helps.
//
// PURE — no React, no store, no THREE. Presentation lives elsewhere.

import {
  legibility,
  needsAzimuth,
  needsCeilingsHidden,
  PLANE_POSE_POLAR_DEG,
  PLANE_NOUN,
  type Legibility,
  type TargetPlane,
} from "./targetPlane";

/** Accepting the offer is one keystroke, and Enter is the one key that already
 *  means "take the obvious action" everywhere else. It also cannot collide:
 *  Viewport.tsx's handler already spends R, Escape, Delete and the undo pair,
 *  and the P2 camera keys take T / F / Home / WASD / arrows. */
export const ACCEPT_KEY = "Enter";

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

export interface OfferState {
  /** Plane the armed tool targets. `null` when nothing is armed. */
  plane: TargetPlane | null;
  legibility: Legibility;
  /** The user closed this offer. Reset by the caller when a tool is armed, so
   *  a dismissal lasts exactly as long as the arming it belonged to — never
   *  longer. Remembering dismissals across armings would be the app quietly
   *  learning from the user, which is the behaviour this design refuses. */
  dismissed: boolean;
}

/** Should the offer chip be on screen?
 *
 *  The three legibility bands do double duty here, and this is the part worth
 *  reading twice. Legibility changes CONTINUOUSLY as the user orbits, so a
 *  single threshold would flicker the chip on and off around it — which is
 *  both ugly and, worse, an interface that appears to react to every small
 *  movement. The bands supply their own hysteresis instead:
 *
 *      impossible  raises the offer
 *      poor        sustains it, but can never raise it
 *      clear       withdraws it
 *
 *  So `poor` IS the dead zone, at no cost in extra constants, and the middle
 *  band's real job turns out to be stability rather than severity. It also
 *  means a merely-fiddly view is never interrupted: only an impossible one
 *  ever speaks first.
 *
 *  The withdrawal rule is the respectful half. The instant the user solves the
 *  problem themselves the chip leaves without being dismissed, because they
 *  have just demonstrated they did not need it. */
export function offerVisible(previouslyVisible: boolean, s: OfferState): boolean {
  if (s.plane === null) return false;
  if (s.dismissed) return false;
  switch (s.legibility) {
    case "clear":
      return false;
    case "impossible":
      return true;
    case "poor":
      return previouslyVisible;
  }
}

// ---------------------------------------------------------------------------
// The remedy
// ---------------------------------------------------------------------------

export interface Remedy {
  /** Polar angle to glide to, degrees from +Y. `null` leaves the camera where
   *  it is — the ceiling-capped case, where the view is fine and only the mesh
   *  is in the way. */
  polarDeg: number | null;
  /** Turn the camera to face the target wall. Only ever true for walls:
   *  changing azimuth is the single most disorienting thing a camera can do,
   *  so it is spent only where facing the surface IS the task. */
  faceTargetWall: boolean;
  /** Switch the Ceiling toggle off — the same control in WallModeToggle the
   *  user can reach themselves, which is the point. */
  hideCeilings: boolean;
  /** Verb-led, present tense, says exactly what pressing it does. */
  label: string;
  /** The obstacle, in the user's words. Never an apology, never a hedge. */
  reason: string;
}

export interface ViewContext {
  /** Current camera polar angle, radians from +Y. */
  polarRad: number;
  /** Whether ceiling meshes are currently drawn. */
  ceilingsShown: boolean;
}

/** What to offer for this plane, given what is actually wrong right now.
 *
 *  Context-dependent on purpose: a ceiling with the caps already off needs a
 *  camera move, and a ceiling with them on needs the caps off first. Offering
 *  the same fixed remedy for a plane regardless of which of its preconditions
 *  is unmet would produce an offer that visibly does not fix the problem, and
 *  one of those costs more trust than ten offers never made. */
export function remedyFor(plane: TargetPlane, ctx: ViewContext): Remedy {
  const noun = PLANE_NOUN[plane];

  // A capped ceiling is not an angle problem, so it must not be answered with
  // an angle. Uncapping alone restores it, because looking down at a ceiling
  // through the gap is geometrically the same view as looking at a floor.
  if (needsCeilingsHidden(plane) && ctx.ceilingsShown) {
    const angleAlsoWrong = legibility(plane, ctx.polarRad, { ceilingsHidden: true }) !== "clear";
    return {
      polarDeg: angleAlsoWrong ? PLANE_POSE_POLAR_DEG[plane] : null,
      faceTargetWall: false,
      hideCeilings: true,
      label: angleAlsoWrong ? "Hide ceilings and look down" : "Hide ceilings",
      reason: "the ceiling is capping the room",
    };
  }

  return {
    polarDeg: PLANE_POSE_POLAR_DEG[plane],
    faceTargetWall: needsAzimuth(plane),
    hideCeilings: false,
    label: needsAzimuth(plane) ? "Face the wall" : "Look down",
    reason: `the ${noun} is edge-on from here`,
  };
}

/** Does applying this remedy actually make the plane workable?
 *
 *  Exported because it is a runtime guard, not only a test helper: an offer
 *  that would not fix the problem must never be shown at all. Cheaper to check
 *  than to apologise for. */
export function remedyResolves(plane: TargetPlane, r: Remedy, ctx: ViewContext): boolean {
  const polarRad = r.polarDeg !== null ? (r.polarDeg * Math.PI) / 180 : ctx.polarRad;
  const ceilingsHidden = r.hideCeilings || !ctx.ceilingsShown;
  return legibility(plane, polarRad, { ceilingsHidden }) === "clear";
}
