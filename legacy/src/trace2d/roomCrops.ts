// Building Knowledge Layer — client-side image evidence for the VLM pass.
//
// Rooms live in meters; the plan image lives in pixels (px = meters / mpp).
// For each escalated room we cut a native-resolution crop (fixture symbols and
// printed labels survive), plus one downscaled whole-plan overview for context.

import type { Room, Scene } from "@/schema/scene";
import { nodeMap } from "@/lib/rooms/roomArea";

const OVERVIEW_MAX = 1200; // px long edge for the whole-plan context image
const CROP_MAX = 800; // px long edge per room crop
const CROP_MARGIN = 0.15; // fraction of bbox added on each side

export interface RoomCrop {
  roomId: string;
  image: string; // PNG data URL
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("plan image failed to load"));
    img.src = src;
  });
}

function drawRegion(
  img: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  maxEdge: number,
): string {
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

/** Whole-plan overview + native-res crops of the given rooms. */
export async function buildRoomCrops(
  imageSrc: string,
  scene: Scene,
  rooms: Room[],
  metersPerPixel: number,
): Promise<{ overview: string; crops: RoomCrop[] }> {
  const img = await loadImage(imageSrc);
  const nodes = nodeMap(scene.nodes);

  const overview = drawRegion(img, 0, 0, img.naturalWidth, img.naturalHeight, OVERVIEW_MAX);

  const crops: RoomCrop[] = [];
  for (const room of rooms) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const id of room.loop) {
      const n = nodes.get(id);
      if (!n) continue;
      const px = n.x / metersPerPixel;
      const py = n.y / metersPerPixel;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    if (!Number.isFinite(minX) || maxX - minX < 4 || maxY - minY < 4) continue;

    const mx = (maxX - minX) * CROP_MARGIN + 20;
    const my = (maxY - minY) * CROP_MARGIN + 20;
    const sx = Math.max(0, Math.floor(minX - mx));
    const sy = Math.max(0, Math.floor(minY - my));
    const sw = Math.min(img.naturalWidth - sx, Math.ceil(maxX - minX + mx * 2));
    const sh = Math.min(img.naturalHeight - sy, Math.ceil(maxY - minY + my * 2));
    if (sw < 4 || sh < 4) continue;

    crops.push({ roomId: room.id, image: drawRegion(img, sx, sy, sw, sh, CROP_MAX) });
  }

  return { overview, crops };
}
