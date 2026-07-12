// Grab the live 3D frame as a small JPEG data URL, for project thumbnails.
// The R3F <Canvas> registers its WebGL canvas here on creation. Capturing a
// WebGL canvas with toDataURL/drawImage requires `preserveDrawingBuffer: true`
// on the context (set where the Canvas is created), otherwise the buffer is
// cleared after compositing and we'd read back blank.

let canvasEl: HTMLCanvasElement | null = null;

export function registerViewportCanvas(el: HTMLCanvasElement | null): void {
  canvasEl = el;
}

/** The current 3D view, downscaled to a ~`maxW`px-wide JPEG data URL, or null. */
export function captureViewportThumb(maxW = 480): string | null {
  if (!canvasEl) return null;
  const sw = canvasEl.width;
  const sh = canvasEl.height;
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
    ctx.drawImage(canvasEl, 0, 0, w, h);
    return off.toDataURL("image/jpeg", 0.6);
  } catch {
    return null; // tainted/lost context — fall back to placeholder
  }
}
