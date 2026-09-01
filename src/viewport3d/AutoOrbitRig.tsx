"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import CameraControlsImpl from "camera-controls";
import type CameraControls from "camera-controls";
import {
  getOrbitPlaying,
  getOrbitPlayingServer,
  setOrbitPlaying,
  subscribeOrbitPlaying,
} from "./autoOrbitPlayback";

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
// ── What the visitor keeps, and what is taken away ──────────────────────────
// Drag orbits. Everything else is off. That split is the whole design:
//
//   * LEFT DRAG  → ROTATE. A drag is not a scroll on any device's desktop
//     input, so orbiting costs the page nothing.
//   * WHEEL      → NONE. This is the one that mattered. camera-controls'
//     wheel handler returns on `mouseButtons.wheel === ACTION.NONE` BEFORE it
//     calls preventDefault (camera-controls.module.js:797), so the event
//     reaches the document untouched and the page scrolls normally.
//   * MIDDLE/RIGHT → NONE. Middle is TRUCK in the app and autoscroll in the
//     browser; right is a context menu a visitor did not ask to lose.
//   * TOUCH      → NONE, all finger counts. One finger has to stay page-scroll
//     on a phone, and once one-finger is gone the other gestures have no
//     coherent story. The canvas ALSO needs `touch-action: pan-y` in CSS
//     (DemoStage.tsx): enabling camera-controls sets `touch-action: none` on
//     the element itself (line 1199), which blocks scrolling regardless of
//     what the action map says.
//
// `Viewport` mounts this INSTEAD of <CameraRig> and <CameraKeyboardRig>, and
// both omissions are load-bearing:
//
//   * CameraRig writes `mouseButtons`/`touches` in an effect, so the map set
//     below would be silently undone the next time it re-ran.
//   * CameraKeyboardRig binds `keydown` on WINDOW, not the canvas — mounted on
//     a marketing page it would eat WASD/QE/T/F/Home for the whole document,
//     including anything a visitor types further down the page.
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

/** Vertical field of view of the Canvas, in degrees — set in Viewport.tsx and
 *  not exposed, so it is mirrored here. */
const FOV_DEG = 50;

/** The model's bounding-sphere radius as a multiple of `span`.
 *
 *  `span` is the larger PLAN dimension, so it misses both the other plan axis
 *  and the wall height. For a room, half the span plus those two contributions
 *  lands a little over 0.7; 0.72 is that with room to spare. Over-estimating
 *  costs a slightly wider frame, under-estimating clips the model — so it
 *  rounds up. */
const RADIUS_OF_SPAN = 0.72;

/** Breathing room around the fitted sphere. 1.0 would put the model's extreme
 *  corner exactly on the frame edge at every aspect ratio. */
const FIT_MARGIN = 1.10;

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

  /** True between `controlstart` and `controlend` — see the listener below for
   *  why this is tracked here instead of read from `controls.active`. */
  const dragging = useRef(false);

  const playing = useSyncExternalStore(
    subscribeOrbitPlaying,
    getOrbitPlaying,
    getOrbitPlayingServer,
  );

  // Restrict the input map. This is the only writer of it while autoOrbit is on
  // — <CameraRig>, which owns it in the app, is not mounted (see the header).
  useEffect(() => {
    if (!controls) return;
    const A = CameraControlsImpl.ACTION;
    controls.mouseButtons.left = A.ROTATE;
    controls.mouseButtons.middle = A.NONE;
    controls.mouseButtons.right = A.NONE;
    controls.mouseButtons.wheel = A.NONE;
    controls.touches.one = A.NONE;
    controls.touches.two = A.NONE;
    controls.touches.three = A.NONE;
    // The app turns this on so a wheel-zoom pulls toward the cursor. With the
    // wheel disabled it has nothing to act on, and leaving it set would only
    // matter if a later change re-enabled dollying without revisiting this.
    controls.dollyToCursor = false;
  }, [controls]);

  // A drag is the visitor taking over, so the orbit stops rather than fighting
  // them for the camera — and it STAYS stopped, because that is what makes the
  // play button mean something. Resuming automatically after a drag would turn
  // it into a control that undoes itself a second later.
  //
  // `dragging` is tracked from these two events rather than read off
  // `controls.active`, and that is a bug fix, not a preference. `active` is
  // `!_hasRested`, and `_hasRested` is only restored to true inside update()'s
  // `else if (updated)` branch (camera-controls.module.js:2280) — so if
  // `_needsUpdate` goes false before the rest threshold is met, which a settling
  // drag can do, it stays false FOREVER and `active` never returns to false
  // again. Gating the orbit on it meant Play did nothing once you had dragged.
  useEffect(() => {
    if (!controls) return;
    const onStart = () => {
      dragging.current = true;
      setOrbitPlaying(false);
    };
    const onEnd = () => {
      dragging.current = false;
    };
    controls.addEventListener("controlstart", onStart);
    controls.addEventListener("controlend", onEnd);
    return () => {
      controls.removeEventListener("controlstart", onStart);
      controls.removeEventListener("controlend", onEnd);
    };
  }, [controls]);

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

    // FIT the model, rather than placing the camera at a hand-tuned multiple of
    // span. A fixed distance only frames correctly at the one aspect ratio it
    // was chosen against: make the window narrower, or zoom the page, and the
    // horizontal field shrinks while the distance does not, so the room runs
    // off the sides. Solving for the frame instead is correct at every viewport
    // size, zoom level and device.
    //
    // Fit a sphere of radius R in a frustum: the limiting half-angle is the
    // SMALLER of the two, which is horizontal on a portrait-ish canvas and
    // vertical on a wide one. `d = R / sin(halfAngle)` is the distance at which
    // the sphere exactly touches that edge.
    const aspect = size.width / Math.max(size.height, 1);
    const vHalf = (FOV_DEG * DEG) / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * aspect);
    const radiusOfModel = span * RADIUS_OF_SPAN;
    const dist = (radiusOfModel / Math.sin(Math.min(vHalf, hHalf))) * FIT_MARGIN;

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

    // Centred, with no focal offset. The controls used to float ON the canvas,
    // so the room was pushed left to clear them; they now occupy their own grid
    // column (DemoStage.tsx), and an offset that no longer has anything to
    // avoid just walks the model towards the edge it eventually falls off.
  }, [controls, span, size.width, size.height]);

  useFrame((_, delta) => {
    // Adding rotation on top of the visitor's own drag would read as the model
    // sliding out from under the cursor.
    if (!controls || reduced.current || !playing || dragging.current) return;
    // `false` = no easing on top of the step. The rotation IS the animation;
    // routing it through camera-controls' transition would add a lag that
    // reads as drift when the step is this small.
    void controls.rotate(SPEED_DEG_PER_SEC * DEG * Math.min(delta, MAX_FRAME), 0, false);
  });

  return null;
}
