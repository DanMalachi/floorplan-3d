import type { Candidate } from "./candidates";

// Colors match scripts/eval/overlay.py so the browser path and the CLI harness
// show the VLM the same picture.
const COLORS: Record<string, string> = {
  wall: "rgb(230,40,40)",
  door: "rgb(40,180,60)",
  window: "rgb(30,170,220)",
  stairs: "rgb(200,40,200)",
  dimension: "rgb(255,150,20)",
  furniture: "rgb(150,110,60)",
  reject: "rgb(130,130,130)",
};

/**
 * Compose the page render + numbered candidate overlay into one PNG data URL —
 * the single image sent to the VLM (halves image tokens vs sending two).
 */
export async function buildOverlayImage(
  imageSrc: string,
  candidates: Candidate[],
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("failed to load plan image"));
    el.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas context");
  ctx.drawImage(img, 0, 0);

  ctx.font = "11px sans-serif";
  for (const c of candidates) {
    const [x0, y0, x1, y1] = c.px;
    const color = COLORS[c.guess] ?? "rgb(255,255,0)";
    ctx.strokeStyle = color;
    ctx.lineWidth = c.keptByHeuristic ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const label = String(c.id);
    const w = ctx.measureText(label).width;
    ctx.fillStyle = "#fff";
    ctx.fillRect(mx + 3, my + 3, w + 4, 12);
    ctx.fillStyle = color;
    ctx.fillText(label, mx + 5, my + 13);
  }
  return canvas.toDataURL("image/png");
}
