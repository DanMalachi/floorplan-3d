// Shared plan-import helpers: one routing path for the rail button, the
// empty-state drop zone, and drag & drop. Pure utilities — the stateful
// orchestration lives in the store (importPlanFile).

// Raster plans below this can't support detection or precise tracing at all.
export const MIN_IMAGE_PX = 600;
// Below this, detection quality degrades noticeably — load, but say so.
export const WARN_IMAGE_PX = 1000;

export function rasterQualityMsg(w: number, h: number, what: string): string {
  const long = Math.max(w, h);
  if (long < WARN_IMAGE_PX)
    return `⚠ ${what} (${w}×${h}px) — low resolution, wall suggestions may be poor. ≥${WARN_IMAGE_PX}px on the long edge works much better.`;
  return `✓ ${what} (${w}×${h}px)`;
}

export const isPdfFile = (f: File) =>
  f.type === "application/pdf" || /\.pdf$/i.test(f.name);

export const isImageFile = (f: File) =>
  /^image\//.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name);

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
