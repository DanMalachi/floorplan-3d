// Transient arbitration for Space + left-drag camera panning.
//
// CameraControls and React Three Fiber both listen to the same canvas. Merely
// changing CameraControls' left-button action would therefore pan the camera
// AND begin whichever wall/furniture/fixture drag sits under the pointer. The
// viewport event manager consults this tiny module before dispatching scene
// events, while CameraRig still receives the native event and owns the camera.

let modifierActive = false;
let panPointerId: number | null = null;
let suppressNextClick = false;
let suppressDoubleClickUntil = 0;
let clickExpiry: ReturnType<typeof setTimeout> | null = null;
const suppressedEvents = new WeakSet<Event>();

export function setPanModifierActive(active: boolean) {
  modifierActive = active;
}

function expireSuppressedClick() {
  if (clickExpiry !== null) clearTimeout(clickExpiry);
  clickExpiry = setTimeout(() => {
    suppressNextClick = false;
    clickExpiry = null;
  }, 100);
}

/** Completes a Space-pan even when the pointer is released outside the canvas. */
export function finishPanPointer(pointerId: number, cancelled = false, expectCanvasClick = true) {
  if (pointerId !== panPointerId) return;
  panPointerId = null;
  suppressNextClick = !cancelled && expectCanvasClick;
  if (suppressNextClick) expireSuppressedClick();
}

export function resetPanModifier() {
  modifierActive = false;
  panPointerId = null;
  suppressNextClick = false;
  suppressDoubleClickUntil = 0;
  if (clickExpiry !== null) clearTimeout(clickExpiry);
  clickExpiry = null;
}

/** Returns true when an R3F scene event belongs to the camera pan gesture. */
export function suppressSceneEvent(name: string, event: Event): boolean {
  if (name === "onPointerDown") {
    const pointer = event as Partial<PointerEvent>;
    if (modifierActive && pointer.button === 0 && typeof pointer.pointerId === "number") {
      panPointerId = pointer.pointerId;
      suppressNextClick = false;
      if (clickExpiry !== null) clearTimeout(clickExpiry);
      clickExpiry = null;
      return true;
    }
  }

  // The same native Event passes through fixture capture handlers, R3F and
  // camera framing. WeakSet makes the claim one-shot per CLICK while every
  // listener that sees that exact event still agrees it belongs to the camera.
  if (suppressedEvents.has(event)) return true;
  if (name === "onClick" && suppressNextClick) {
    suppressNextClick = false;
    if (clickExpiry !== null) clearTimeout(clickExpiry);
    clickExpiry = null;
    suppressDoubleClickUntil = Date.now() + 500;
    suppressedEvents.add(event);
    return true;
  }
  // A dblclick is a third event after click(1) and click(2). Suppress only that
  // framing/finalize event for a short time; ordinary fast clicks remain live.
  if (name === "onDoubleClick" && Date.now() <= suppressDoubleClickUntil) {
    suppressDoubleClickUntil = 0;
    suppressedEvents.add(event);
    return true;
  }

  const pointer = event as Partial<PointerEvent>;
  if (typeof pointer.pointerId !== "number" || pointer.pointerId !== panPointerId) return false;

  if (name === "onPointerUp") finishPanPointer(pointer.pointerId);
  else if (name === "onPointerCancel" || name === "onLostPointerCapture") {
    finishPanPointer(pointer.pointerId, true);
  }

  return name === "onPointerMove" || name === "onPointerUp" ||
    name === "onPointerCancel" || name === "onLostPointerCapture";
}
