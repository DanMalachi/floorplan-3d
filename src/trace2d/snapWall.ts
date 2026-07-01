import type { ImportSegment } from "@/store/useSceneStore";
import { NOISE_LAYERS } from "./extractWalls";

// Architectural line = black stroke and not on a furniture/landscape/plumbing layer.
const isArch = (s: ImportSegment) =>
  s.color != null &&
  s.color[0] < 0.22 &&
  s.color[1] < 0.22 &&
  s.color[2] < 0.22 &&
  !NOISE_LAYERS.has(s.layer);

const fold = (a: number) => {
  let t = a % Math.PI;
  if (t < 0) t += Math.PI;
  if (t >= Math.PI - 1e-9) t -= Math.PI;
  return t;
};

function pointSegDist(px: number, py: number, s: ImportSegment): number {
  const abx = s.x1 - s.x0;
  const aby = s.y1 - s.y0;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-9) return Math.hypot(px - s.x0, py - s.y0);
  let t = ((px - s.x0) * abx + (py - s.y0) * aby) / len2;
  t = Math.min(1, Math.max(0, t));
  return Math.hypot(px - (s.x0 + abx * t), py - (s.y0 + aby * t));
}

export interface WallSnap {
  x: number;
  y: number;
  dir: number; // wall direction (radians)
  corner: boolean;
}

interface CL {
  theta: number;
  off: number;
  ux: number;
  uy: number;
  vx: number;
  vy: number;
  dist: number;
}

/**
 * Snap a clicked point to a wall centerline computed LOCALLY from the imported
 * PDF lines: find the double-line wall under the cursor, return the point on its
 * centerline. If a perpendicular wall is also near, return the corner
 * intersection. This does the double-line→centerline collapse exactly where the
 * user clicks (reliable), instead of globally (brittle).
 */
export function snapWallPoint(
  px: number,
  py: number,
  segs: ImportSegment[],
  opts?: {
    thinMin?: number;
    thickMax?: number;
    snapDist?: number;
    cornerDist?: number;
    targets?: number[];
    tol?: number;
  },
): WallSnap | null {
  const thinMin = opts?.thinMin ?? 5;
  const thickMax = opts?.thickMax ?? 60;
  const snapDist = opts?.snapDist ?? 16;
  const cornerDist = opts?.cornerDist ?? 24;
  const targets = opts?.targets ?? [];
  const tol = opts?.tol ?? 4;
  const thickAccept = (d: number) =>
    targets.length ? targets.some((t) => Math.abs(d - t) <= tol) : d >= thinMin && d <= thickMax;

  const R = thickMax + 40;
  const near = segs.filter((s) => isArch(s) && pointSegDist(px, py, s) < R);
  if (near.length === 0) return null;

  const angleTol = (4 * Math.PI) / 180;
  const buckets = new Map<number, ImportSegment[]>();
  for (const s of near) {
    const th = fold(Math.atan2(s.y1 - s.y0, s.x1 - s.x0));
    const k = Math.round(th / angleTol);
    let arr = buckets.get(k);
    if (!arr) {
      arr = [];
      buckets.set(k, arr);
    }
    arr.push(s);
  }

  const cls: CL[] = [];
  for (const [k, arr] of buckets) {
    const theta = k * angleTol;
    const ux = Math.cos(theta);
    const uy = Math.sin(theta);
    const vx = -uy;
    const vy = ux;
    const offP = px * vx + py * vy;
    const sP = px * ux + py * uy;
    const faces = arr
      .map((s) => ({
        off: s.x0 * vx + s.y0 * vy,
        s0: Math.min(s.x0 * ux + s.y0 * uy, s.x1 * ux + s.y1 * uy),
        s1: Math.max(s.x0 * ux + s.y0 * uy, s.x1 * ux + s.y1 * uy),
      }))
      .filter((f) => sP >= f.s0 - 6 && sP <= f.s1 + 6);

    for (let i = 0; i < faces.length; i++) {
      for (let j = i + 1; j < faces.length; j++) {
        const d = Math.abs(faces[i].off - faces[j].off);
        if (!thickAccept(d)) continue;
        const lo = Math.min(faces[i].off, faces[j].off);
        const hi = Math.max(faces[i].off, faces[j].off);
        if (offP < lo - 3 || offP > hi + 3) continue; // click must be inside the wall
        const c = (faces[i].off + faces[j].off) / 2;
        const dist = Math.abs(offP - c);
        if (dist > snapDist) continue;
        cls.push({ theta, off: c, ux, uy, vx, vy, dist });
      }
    }
  }
  if (cls.length === 0) return null;
  cls.sort((a, b) => a.dist - b.dist);
  const best = cls[0];

  // Corner: a near-perpendicular centerline whose intersection is close to the click.
  for (const c of cls) {
    let da = Math.abs(c.theta - best.theta);
    da = Math.min(da, Math.PI - da);
    if (da > Math.PI / 2 - 0.3) {
      const det = best.vx * c.vy - best.vy * c.vx;
      if (Math.abs(det) > 1e-6) {
        const ix = (best.off * c.vy - c.off * best.vy) / det;
        const iy = (c.off * best.vx - best.off * c.vx) / det;
        if (Math.hypot(ix - px, iy - py) <= cornerDist) {
          return { x: ix, y: iy, dir: best.theta, corner: true };
        }
      }
    }
  }

  const sP = px * best.ux + py * best.uy;
  return {
    x: best.ux * sP + best.vx * best.off,
    y: best.uy * sP + best.vy * best.off,
    dir: best.theta,
    corner: false,
  };
}
