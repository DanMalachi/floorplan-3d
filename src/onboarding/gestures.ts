// What the person just did to the 3D view, read from plain DOM events on the
// viewport canvas. The camera itself lives in the protected viewport3d layer
// and must not be edited, so the guides watch the same events it does and
// classify them with the camera's own vocabulary (inputVocabulary.ts) —
// the practice card can then never disagree with what the camera did.

import { useSceneStore } from "@/store/useSceneStore";
import { classifyWheel, PAN_MODIFIER_CODE, type WheelSignal } from "@/viewport3d/camera/inputVocabulary";

/** The three moves the "Move around in 3D" card teaches. */
export type CameraMove = "turn" | "zoom" | "slide";

/** A drag this far (px) counts: past a click's jitter, well short of a real
 *  look around. */
export const DRAG_MIN_PX = 24;
/** Trackpad two-finger turning arrives as many small wheel events; this much
 *  total movement (px of delta) counts as having turned. */
export const SWIPE_MIN = 40;

/** What a pointer press on the view will do, from its button and whether
 *  Space is held (CameraRig: right = orbit, middle = pan, Space+left = pan,
 *  plain left acts on the scene and never moves the camera). */
export function dragMove(button: number, spaceHeld: boolean): CameraMove | null {
  if (button === 2) return "turn";
  if (button === 1) return "slide";
  if (button === 0 && spaceHeld) return "slide";
  return null;
}

/** What a wheel event does: a pinch or a mouse wheel zooms, a two-finger
 *  swipe turns. */
export function wheelMove(e: WheelSignal): CameraMove {
  return classifyWheel(e) === "zoom" ? "zoom" : "turn";
}

/** The 3D viewport's canvas, not a thumbnail or the navigator art. */
export function isViewportCanvas(t: EventTarget | null): t is HTMLCanvasElement {
  if (!(t instanceof HTMLCanvasElement)) return false;
  const r = t.getBoundingClientRect();
  return r.width >= window.innerWidth * 0.5 && r.height >= window.innerHeight * 0.5;
}

export function viewportCanvas(): HTMLCanvasElement | null {
  for (const c of document.querySelectorAll("canvas")) if (isViewportCanvas(c)) return c;
  return null;
}

/** Whether Space, pressed now, turns the next left-drag into a pan. Mirrors
 *  CameraRig's own test line for line (it ignores Space while a control has
 *  focus, and in Trace or a walk), so the practice card can never tick a
 *  slide the camera refused. */
const spacePans = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  if (t?.closest?.('button, input, textarea, select, [contenteditable="true"]')) return false;
  const s = useSceneStore.getState();
  return !(s.gestureBase || s.walkthroughActive || s.appMode === "trace");
};

/**
 * Calls `onMove` for each camera move the person makes on the viewport.
 * Returns the unsubscribe. Only TRUSTED events count: CameraRig re-dispatches
 * every pinch as a synthetic plain wheel, which would otherwise read as a
 * second, wrong gesture.
 */
export function watchCameraMoves(onMove: (m: CameraMove) => void): () => void {
  let spaceHeld = false;
  let drag: { id: number; move: CameraMove; x: number; y: number } | null = null;
  let swipe = 0;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === PAN_MODIFIER_CODE && spacePans(e)) spaceHeld = true;
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === PAN_MODIFIER_CODE) spaceHeld = false;
  };
  const onBlur = () => {
    spaceHeld = false;
    drag = null;
  };
  const onPointerDown = (e: PointerEvent) => {
    if (!e.isTrusted || e.pointerType === "touch" || !isViewportCanvas(e.target)) return;
    const move = dragMove(e.button, spaceHeld);
    drag = move ? { id: e.pointerId, move, x: e.clientX, y: e.clientY } : null;
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) >= DRAG_MIN_PX) {
      onMove(drag.move);
      drag = null;
    }
  };
  const onPointerUp = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.id) drag = null;
  };
  const onWheel = (e: WheelEvent) => {
    if (!e.isTrusted || !isViewportCanvas(e.target)) return;
    const move = wheelMove(e);
    if (move === "zoom") {
      onMove("zoom");
      return;
    }
    swipe += Math.abs(e.deltaX) + Math.abs(e.deltaY);
    if (swipe >= SWIPE_MIN) {
      swipe = 0;
      onMove("turn");
    }
  };

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("blur", onBlur);
  // Capture on window: runs before CameraRig's canvas listeners, which stop
  // the original pinch event.
  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("pointermove", onPointerMove, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointercancel", onPointerUp, true);
  window.addEventListener("wheel", onWheel, { capture: true, passive: true });
  return () => {
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("pointermove", onPointerMove, true);
    window.removeEventListener("pointerup", onPointerUp, true);
    window.removeEventListener("pointercancel", onPointerUp, true);
    window.removeEventListener("wheel", onWheel, { capture: true });
  };
}

/** Where the last plain click on the 3D view landed. A placed piece lands
 *  under the click, so the "first piece placed" card points here. */
let lastViewClick: { x: number; y: number } | null = null;

export function lastViewportClick() {
  return lastViewClick;
}

/** Started once by GuideHost. */
export function trackViewportClicks(): () => void {
  const onUp = (e: PointerEvent) => {
    if (e.button === 0 && isViewportCanvas(e.target)) lastViewClick = { x: e.clientX, y: e.clientY };
  };
  window.addEventListener("pointerup", onUp, true);
  return () => window.removeEventListener("pointerup", onUp, true);
}

/** A plain left-button drag on the 3D view (Space not held): the gesture a
 *  first-timer tries to turn the view with, and the one that grabs walls.
 *  `onStart` fires at the press, `onEnd` at the release if the pointer
 *  travelled far enough to count as a drag. */
export function watchLeftDrags(onStart: () => void, onEnd: (at: { x: number; y: number }) => void): () => void {
  let spaceHeld = false;
  let drag: { id: number; x: number; y: number } | null = null;
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === PAN_MODIFIER_CODE && spacePans(e)) spaceHeld = true;
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === PAN_MODIFIER_CODE) spaceHeld = false;
  };
  const onDown = (e: PointerEvent) => {
    if (!e.isTrusted || e.button !== 0 || spaceHeld || e.pointerType === "touch" || !isViewportCanvas(e.target)) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    onStart();
  };
  const onUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const far = Math.hypot(e.clientX - drag.x, e.clientY - drag.y) >= DRAG_MIN_PX;
    drag = null;
    if (far) onEnd({ x: e.clientX, y: e.clientY });
  };
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("pointerdown", onDown, true);
  window.addEventListener("pointerup", onUp, true);
  return () => {
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
    window.removeEventListener("pointerdown", onDown, true);
    window.removeEventListener("pointerup", onUp, true);
  };
}
