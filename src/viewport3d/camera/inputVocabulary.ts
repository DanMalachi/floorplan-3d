// Camera P3b: the input vocabulary, stated once so it can be checked.
//
// P0 moved orbit to the right button and pan to the middle button. That is
// correct for a mouse and it quietly broke the trackpad, which has no middle
// button — so trackpad users were left with orbit and zoom and no pan at all.
// That is the same class of bug P0 fixed (a device with a missing capability),
// one input device over, and it is exactly the kind of thing that is obvious
// in hindsight and invisible in review.
//
// So the invariant gets mechanized instead of remembered. Law 1 says the
// camera must never have zero inputs; the honest version of that is stronger:
// EVERY device must be able to orbit, pan AND zoom, or the camera is crippled
// on that device even though it technically responds. `inputVocabulary.test.ts`
// asserts exactly that over the table below, so removing a binding fails a
// test rather than shipping.
//
// PURE — a description of the vocabulary plus the wheel classifier. Wiring
// lives in CameraRig.tsx.

/** The three things a camera must be able to do. Anything less than all three
 *  on a given device is a crippled camera on that device. */
export type CameraVerb = "orbit" | "pan" | "zoom";

/** Input devices this app actually has to serve. Trackpad is listed separately
 *  from mouse ON PURPOSE — treating it as "a mouse with fewer buttons" is what
 *  produced the gap this file exists to close. */
export type InputDevice = "mouse" | "trackpad" | "touch";

/** One way to perform one verb on one device. */
export interface Binding {
  device: InputDevice;
  verb: CameraVerb;
  /** How the user does it, in the words they would use. */
  gesture: string;
  /** True when an armed tool can take this binding away (only ever the plain
   *  left button — see Law 2). A verb whose ONLY binding on a device is
   *  suppressible is a camera that can still die on that device, so the test
   *  rejects it. */
  suppressible?: boolean;
}

/** The whole vocabulary. Adding a device means adding its three verbs here and
 *  the test will tell you which one you forgot. */
export const VOCABULARY: Binding[] = [
  // --- mouse -------------------------------------------------------------
  // Left is deliberately absent from every row. It used to also orbit on empty
  // space, which meant left and right did the same job most of the time and a
  // button's meaning depended on what happened to be under the cursor — the
  // exact thing Law 2 forbids. Left acts on the world and only on the world.
  { device: "mouse", verb: "orbit", gesture: "right-drag" },
  { device: "mouse", verb: "pan", gesture: "middle-drag" },
  { device: "mouse", verb: "pan", gesture: "space + left-drag" },
  { device: "mouse", verb: "pan", gesture: "arrow keys / WASD" },
  { device: "mouse", verb: "zoom", gesture: "wheel" },

  // --- trackpad ----------------------------------------------------------
  // Right-drag is a two-finger click-drag, which every trackpad has.
  { device: "trackpad", verb: "orbit", gesture: "two-finger click + drag" },
  // Space-drag is the load-bearing one: it is the Figma/Photoshop convention,
  // it needs no device detection at all, and it works identically on a mouse.
  // Guessing "is this a trackpad?" from wheel deltas is a heuristic that
  // misfires on some mice, and a mouse whose wheel suddenly pans is a worse
  // bug than the one being fixed.
  { device: "trackpad", verb: "pan", gesture: "space + drag" },
  { device: "trackpad", verb: "pan", gesture: "two-finger swipe sideways" },
  { device: "trackpad", verb: "pan", gesture: "arrow keys / WASD" },
  { device: "trackpad", verb: "zoom", gesture: "pinch" },
  { device: "trackpad", verb: "zoom", gesture: "two-finger swipe up/down" },

  // --- touch -------------------------------------------------------------
  // One finger acts on the world in edit modes (P0), so orbit has to live on a
  // gesture a drag can never claim. Touch has no hover, so the press cannot be
  // disambiguated the way the mouse's is — see the note in the test.
  { device: "touch", verb: "orbit", gesture: "one-finger drag on empty space", suppressible: true },
  { device: "touch", verb: "orbit", gesture: "three-finger drag" },
  { device: "touch", verb: "pan", gesture: "two-finger drag" },
  { device: "touch", verb: "zoom", gesture: "pinch" },
];

// ---------------------------------------------------------------------------
// Wheel classification
// ---------------------------------------------------------------------------

export type WheelIntent = "zoom" | "panX";

/** What a wheel event means.
 *
 *  Deliberately only two outcomes, and deliberately no device sniffing:
 *
 *  - `ctrlKey` is the browser's own signal for a trackpad pinch (and for
 *    browser zoom, which is why it must be consumed). Unambiguous on every
 *    platform, so pinch maps straight to zoom.
 *  - Horizontal delta means horizontal pan. A conventional mouse wheel cannot
 *    produce `deltaX`, and the tilt wheels that can are asking for exactly
 *    this. So the binding is free: it gives trackpads a pan gesture without
 *    changing what a single mouse does.
 *  - Everything else is vertical, and vertical stays zoom for BOTH devices.
 *    That preserves mouse behaviour exactly, and it matches what a trackpad
 *    user already expects from every map application.
 *
 *  Vertical pan is the one gesture deliberately not claimed here — it is
 *  covered by space-drag and the arrow keys, neither of which can misfire on
 *  somebody else's hardware. */
export function classifyWheel(e: {
  deltaX: number;
  deltaY: number;
  ctrlKey: boolean;
}): WheelIntent {
  if (e.ctrlKey) return "zoom";
  return Math.abs(e.deltaX) > Math.abs(e.deltaY) ? "panX" : "zoom";
}

/** Held-space turns the left button into pan for as long as it is down. A
 *  modifier, not a rebinding — left still "acts on the world", space just
 *  makes the world be the camera for a moment, which is why this does not
 *  violate Law 2. Same key and same feel as Figma, Photoshop and Illustrator,
 *  so it needs no teaching. */
export const PAN_MODIFIER_CODE = "Space";
