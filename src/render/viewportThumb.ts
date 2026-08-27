/**
 * Project thumbnails, captured on request instead of by keeping every frame
 * alive.
 *
 * The old path called `toDataURL`/`drawImage` on the WebGL canvas at an
 * arbitrary moment, which only works if the context was created with
 * `preserveDrawingBuffer: true`. That flag is paid on EVERY frame, forever, so
 * that one 480px JPEG can be taken once when the Projects overlay opens: the
 * browser has to keep the drawing buffer alive past compositing rather than
 * discarding it, which on a tile-based GPU (Apple silicon) means a full colour
 * store to system memory every frame instead of leaving the tile resident.
 *
 * So: ask for the frame, and let `<ThumbCaptureRig>` hand it back from inside
 * the render loop, where the buffer is legitimately still readable. See that
 * file for why the timing works.
 */

type Request = { maxW: number; settle: (v: string | null) => void };

let pending: Request[] = [];
/** Set while a `<ThumbCaptureRig>` is mounted; also the hook we use to wake a
 *  loop that may not be scheduling frames on its own. */
let wake: (() => void) | null = null;

/** Called by the rig on mount/unmount. Not part of the public surface. */
export function registerThumbRig(invalidate: (() => void) | null): void {
  wake = invalidate;
  if (!invalidate) {
    // The rig went away with requests outstanding — nobody is going to answer
    // them, so settle rather than leave callers awaiting forever.
    for (const r of pending) r.settle(null);
    pending = [];
  }
}

/** Drained by the rig, once per frame. Not part of the public surface. */
export function takePendingThumbRequests(): Request[] {
  if (!pending.length) return pending;
  const out = pending;
  pending = [];
  return out;
}

/**
 * The current 3D view as a ~`maxW`px-wide JPEG data URL, or null if no viewport
 * is mounted or no frame arrives in time.
 *
 * Resolves on the next rendered frame. `timeoutMs` exists because a frame is
 * not guaranteed: a backgrounded tab stops servicing rAF entirely, and a caller
 * awaiting a thumbnail must not hang because the user switched tabs.
 */
export function requestViewportThumb(maxW = 480, timeoutMs = 1000): Promise<string | null> {
  // Captured before the closure: `wake` is module state and TS cannot carry the
  // null-check across the Promise callback, but more to the point the rig could
  // genuinely unmount between the two.
  const scheduleFrame = wake;
  if (!scheduleFrame) return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    const settle = (v: string | null) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    pending.push({ maxW, settle });
    // Under `frameloop="demand"` nothing else may be scheduling frames; under
    // "always" this is a no-op. Calling it either way means this module does not
    // have to know which mode the app is in.
    scheduleFrame();
    window.setTimeout(() => settle(null), timeoutMs);
  });
}

/** Downscale the live drawing buffer into a JPEG data URL. Must be called while
 *  the buffer is still readable — i.e. from inside the rig's frame callback. */
export function grabCanvasThumb(canvas: HTMLCanvasElement, maxW: number): string | null {
  const sw = canvas.width;
  const sh = canvas.height;
  if (!sw || !sh) return null;
  try {
    const scale = Math.min(1, maxW / sw);
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(canvas, 0, 0, w, h);
    return off.toDataURL("image/jpeg", 0.6);
  } catch {
    return null; // tainted or lost context — the caller falls back to a placeholder
  }
}
