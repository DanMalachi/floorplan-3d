"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type CameraControls from "camera-controls";

// -----------------------------------------------------------------------------
// A slow, hands-off orbit for presentation embeds — the marketing hero today.
//
// ── Why the camera is taken AWAY from the visitor here ──────────────────────
// Not for the look. `CameraControls` binds the wheel on the canvas, so a hero
// that owns the camera also owns the page's scroll: the visitor scrolls, the
// model dollies, and the page stays put. The same conflict hits the middle
// mouse button, which is TRUCK in the app's input map (CameraRig.tsx:136) and
// autoscroll in every browser. A marketing page cannot trap the scroll, so the
// hero gives the camera up entirely and moves it itself.
//
// That trade is only right for a presentation. The product's whole point is a
// camera you control, and `Viewport`'s default keeps it that way — see the
// `autoOrbit` prop's note there.
//
// ── How the input actually goes quiet ───────────────────────────────────────
// `Viewport` mounts this INSTEAD of <CameraRig> and <CameraKeyboardRig>, and
// passes `enabled={false}` to CameraControls. All three parts are needed:
//
//   * CameraRig writes `mouseButtons`/`touches` in an effect, so neutralising
//     the input map from out here would be undone the next time it re-runs.
//   * CameraKeyboardRig binds `keydown` on WINDOW, not the canvas — mounted on
//     a marketing page it would eat WASD/QE/T/F/Home for the whole document,
//     including anything a visitor types further down the page.
//   * `enabled={false}` gates only camera-controls' DOM handlers; `update()`
//     (camera-controls.module.js:2101) does not read `_enabled` at all, so the
//     programmatic `rotate()` below keeps working while every user gesture is
//     dead. That asymmetry is what makes this component possible.
// -----------------------------------------------------------------------------

const DEG = Math.PI / 180;

/** Degrees of azimuth per second. Slow enough to read as a held drone shot
 *  rather than a turntable — a full revolution takes about a minute and three
 *  quarters, so nothing visibly "spins" while a visitor reads the copy beside
 *  it. */
const SPEED_DEG_PER_SEC = 3.4;

/** Height of the orbit, in degrees above the floor plane. High enough to see
 *  into the room over the walls once the ceiling is off, low enough that it
 *  still reads as standing in the home rather than a plan view. */
const ELEVATION_DEG = 26;

/** Where the orbit starts. Off-axis on purpose: a room first seen square-on
 *  reads as an elevation drawing, and the corner view is what shows depth. */
const START_AZIMUTH_DEG = 38;

/** Orbit radius as a multiple of the model's span, plus a fixed margin so small
 *  rooms don't end up with the camera inside the wall.
 *
 *  TIGHTER than `FitCamera`'s 1.6, deliberately. The model's apparent quality
 *  on this page is just how many pixels it covers — there is no LOD and no
 *  dpr change between here and the editor — so a hero that frames the room
 *  small looks lower-resolution than the same room in the app, which is
 *  exactly the regression a half-width column caused. The canvas is full-bleed
 *  and the room is the only subject, so it can afford to fill the frame. */
const DIST_FACTOR = 1.28;
const DIST_MARGIN = 1.8;

/** How far left of centre the room sits, as a fraction of the visible width,
 *  so the floating controls on the right have empty ground to sit over rather
 *  than the model. Applied as a camera focal offset rather than by moving or
 *  widening the canvas: shifting a 100vw canvas would either reveal its edge
 *  (the "box" this hero must not have) or mean rendering pixels that are
 *  scrolled off-screen. */
const OFFSET_FRACTION = 0.13;

/** Below this canvas width the controls stack UNDER the room instead of beside
 *  it (see DemoStage's media query), so there is nothing to make room for and
 *  the model should be centred. Matches that breakpoint. */
const WIDE_PX = 900;

/** Vertical field of view of the Canvas, in degrees — set in Viewport.tsx and
 *  not exposed, so it is mirrored here. Only used to size the offset above; if
 *  the two ever disagree the room drifts off-centre, nothing worse. */
const FOV_DEG = 50;

/** A frame this long means the tab was backgrounded (a hidden tab gets zero
 *  rAF ticks, so `delta` on return is however long the visitor was away).
 *  Clamping stops that from arriving as one large jump in azimuth. */
const MAX_FRAME = 0.1;

/**
 * Frames the model once, then rotates it slowly forever.
 *
 * Honours `prefers-reduced-motion`: the framing still happens, so the hero is
 * never an empty box, but the rotation does not start. That is the accessible
 * reading of this control — the motion here is decorative, and nothing in the
 * demo requires it to have moved.
 */
export function AutoOrbitRig({ span }: { span: number }) {
  const controls = useThree((s) => s.controls) as CameraControls | null;
  // The canvas's own pixel size, so the rig can tell the beside-the-room layout
  // from the stacked one without the page having to tell it.
  const size = useThree((s) => s.size);

  /** Read in `useFrame` rather than as state: this changes at most once in a
   *  visit, and a re-render per change would remount nothing useful. */
  const reduced = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduced.current = mq.matches;
    const onChange = (e: MediaQueryListEvent) => {
      reduced.current = e.matches;
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // The opening shot. Runs after <FitCamera>'s own `setLookAt` because this
  // component is mounted after it, and camera-controls simply takes the last
  // target it was given — so this wins without FitCamera needing to know.
  useEffect(() => {
    if (!controls) return;
    const dist = Math.max(span * DIST_FACTOR, 5) + DIST_MARGIN;
    const y = dist * Math.sin(ELEVATION_DEG * DEG);
    const radius = dist * Math.cos(ELEVATION_DEG * DEG);
    const az = START_AZIMUTH_DEG * DEG;
    // The scene is recentred on the origin by the group above, so the model's
    // centre is always (0, 0, 0) regardless of where the plan sits in world
    // coordinates.
    void controls.setLookAt(
      Math.sin(az) * radius,
      y,
      Math.cos(az) * radius,
      0,
      0,
      0,
      true,
    );

    // Slide the room left of centre by offsetting the camera rather than the
    // target: the target stays the model, so the orbit still turns around the
    // room and not around a point beside it. The offset is in camera-local
    // space, so it stays "left on screen" for the whole revolution.
    const visibleWidth =
      2 * dist * Math.tan((FOV_DEG * DEG) / 2) * (size.width / Math.max(size.height, 1));
    const offset = size.width >= WIDE_PX ? visibleWidth * OFFSET_FRACTION : 0;
    void controls.setFocalOffset(offset, 0, 0, true);
  }, [controls, span, size.width, size.height]);

  useFrame((_, delta) => {
    if (!controls || reduced.current) return;
    // `false` = no easing on top of the step. The rotation IS the animation;
    // routing it through camera-controls' transition would add a lag that
    // reads as drift when the step is this small.
    void controls.rotate(SPEED_DEG_PER_SEC * DEG * Math.min(delta, MAX_FRAME), 0, false);
  });

  return null;
}
