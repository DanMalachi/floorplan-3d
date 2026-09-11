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
  // Browsers expose mouse wheels and trackpad swipes through the same event,
  // so runtime routing uses the event's tick/granularity characteristics.
  { device: "trackpad", verb: "orbit", gesture: "two-finger swipe" },
  { device: "trackpad", verb: "orbit", gesture: "right-drag" },
  { device: "trackpad", verb: "pan", gesture: "space + drag" },
  { device: "trackpad", verb: "pan", gesture: "arrow keys / WASD" },
  { device: "trackpad", verb: "zoom", gesture: "pinch" },

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

export type WheelSource = "mouse" | "trackpad";
export type WheelIntent = "zoom" | "orbit";

export interface WheelSignal {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  /** Chromium/WebKit legacy tick signal. A conventional wheel notch is 120;
   *  precision trackpads produce non-notch values. Firefox instead exposes a
   *  mouse wheel through line-mode deltas, handled above this signal. */
  wheelDeltaY?: number;
  /** WebKit forwards macOS's natural-scroll setting on real wheel events. */
  webkitDirectionInvertedFromDevice?: boolean;
}

/** Best available browser-side source classification.
 *
 *  There is no standard device-kind field on WheelEvent. The strong signals
 *  are line/page deltas and 120-unit legacy ticks for a conventional wheel;
 *  horizontal, fractional and small pixel deltas indicate precision input.
 *  Smooth-scroll mice remain inherently indistinguishable from trackpads and
 *  intentionally follow the precision-input behavior. */
export function classifyWheelSource(e: WheelSignal): WheelSource {
  if (e.deltaMode !== 0) return "mouse";
  const legacyTick = Math.abs(e.wheelDeltaY ?? 0);
  if (e.deltaX === 0 && legacyTick >= 120 && legacyTick % 120 === 0) return "mouse";
  if (e.deltaX !== 0 || !Number.isInteger(e.deltaY)) return "trackpad";
  return Math.abs(e.deltaY) < 40 ? "trackpad" : "mouse";
}

/** What a wheel event means.
 *
 *  `ctrlKey` is the browser's cross-platform trackpad-pinch signal, so pinch
 *  always zooms. Otherwise a conventional wheel zooms and precision
 *  two-finger movement orbits. Shift deliberately has no special meaning. */
export function classifyWheel(e: WheelSignal): WheelIntent {
  if (e.ctrlKey) return "zoom";
  return classifyWheelSource(e) === "mouse" ? "zoom" : "orbit";
}

/** Compensate for macOS natural scrolling only on a classified mouse wheel.
 *  WebKit exposes the real setting. Other Mac browsers fall back to the OS
 *  default (natural scrolling on); trackpad orbit and pinch never reverse. */
export function shouldReverseMacMouseZoom(e: WheelSignal, isMac: boolean): boolean {
  if (!isMac || e.ctrlKey || classifyWheelSource(e) !== "mouse") return false;
  return typeof e.webkitDirectionInvertedFromDevice === "boolean"
    ? e.webkitDirectionInvertedFromDevice
    : true;
}

/** Held-space turns the left button into pan for as long as it is down. A
 *  modifier, not a rebinding — left still "acts on the world", space just
 *  makes the world be the camera for a moment, which is why this does not
 *  violate Law 2. Same key and same feel as Figma, Photoshop and Illustrator,
 *  so it needs no teaching. */
export const PAN_MODIFIER_CODE = "Space";
