// Shared plan-import helpers: one routing path for the rail button, the
// empty-state drop zone, and drag & drop. Pure utilities — the stateful
// orchestration lives in the store (importPlanFile).

// Raster plans below this can't support detection or precise tracing at all.
export const MIN_IMAGE_PX = 600;
// Below this, detection quality degrades noticeably — load, but say so.
export const WARN_IMAGE_PX = 1000;

/** Prose plus a status — never prose with a status glyph typed into the front
 *  of it.
 *
 *  The caller picks the icon. A `⚠`/`✓` baked into the message renders in
 *  whatever face the surrounding text uses (so it never matched the app's SVG
 *  icons), and it is also the exact thing that has to survive translation
 *  later. The store used to strip these back off with a regex at its own
 *  boundary; returning the status properly removes both the glyph and the
 *  regex. */
export function rasterQualityMsg(
  w: number,
  h: number,
  what: string,
): { msg: string; status: "ok" | "warn" } {
  const long = Math.max(w, h);
  if (long < WARN_IMAGE_PX)
    return {
      msg: `${what} (${w}×${h}px) — low resolution, wall suggestions may be poor. ≥${WARN_IMAGE_PX}px on the long edge works much better.`,
      status: "warn",
    };
  return { msg: `${what} (${w}×${h}px)`, status: "ok" };
}

export const isPdfFile = (f: File) =>
  f.type === "application/pdf" || /\.pdf$/i.test(f.name);

export const isImageFile = (f: File) =>
  /^image\//.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name);

// CAD vector plans. DXF is parsed directly in-browser; DWG (proprietary binary)
// is first converted to DXF server-side via the ODA File Converter.
export const isDxfFile = (f: File) => /\.dxf$/i.test(f.name);
export const isDwgFile = (f: File) => /\.dwg$/i.test(f.name);

/** Read an image file into a data URL + natural size. */
export function loadImageFile(
  file: File,
): Promise<{ src: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("could not read file"));
    reader.onload = () => {
      const src = reader.result as string;
      const img = new window.Image();
      img.onerror = () => reject(new Error("not a readable image"));
      img.onload = () =>
        resolve({ src, width: img.naturalWidth, height: img.naturalHeight });
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}
