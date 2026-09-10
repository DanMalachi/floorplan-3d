import type { FixtureItem } from "@/schema/scene";
import { FIXTURE_CATALOG_BY_ID } from "./catalog";
import { ROOM_LIGHT } from "@/render/contract";
import { pointInPolygon } from "@/lib/rooms/roomArea";

export type LightPoint = { x: number; y: number };
export const STRIP_WIDTH_M = 0.06;
export const STRIP_HEIGHT_M = 0.05;
export const STRIP_MIN_SEGMENT_M = 0.1;
export const STRIP_MAX_POINTS = 64;
export const fixtureDropM = (assetId: string) =>
  FIXTURE_CATALOG_BY_ID.get(assetId)?.sourceDropM ?? ROOM_LIGHT.dropBelowCeilingM;

/** First leg picks the nearest axis. Each fixed corner changes to the
 * perpendicular axis; the cursor picks its positive/negative direction. */
export function extendLightPath(fixed: LightPoint[], cursor: LightPoint): LightPoint[] {
  if (!fixed.length || fixed.length >= STRIP_MAX_POINTS) return fixed;
  const a = fixed[fixed.length - 1];
  const prev = fixed[fixed.length - 2];
  const horizontal = prev
    ? Math.abs(a.y - prev.y) > Math.abs(a.x - prev.x)
    : Math.abs(cursor.x - a.x) >= Math.abs(cursor.y - a.y);
  const distance = Math.round(((horizontal ? cursor.x - a.x : cursor.y - a.y)) / 0.05) * 0.05;
  if (Math.abs(distance) < STRIP_MIN_SEGMENT_M - 1e-6) return fixed;
  return [...fixed, horizontal ? { x: a.x + distance, y: a.y } : { x: a.x, y: a.y + distance }];
}

export function lightPath(item: Pick<FixtureItem, "path">): LightPoint[] {
  const path = item.path;
  if (!path || path.length < 2 || path.length > STRIP_MAX_POINTS ||
      path.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return [];
  return path;
}

export function pathLength(path: LightPoint[]): number {
  return path.slice(1).reduce((sum, b, i) => sum + Math.hypot(b.x - path[i].x, b.y - path[i].y), 0);
}

export function toFixtureLocal(p: LightPoint, origin: LightPoint, rotation: number): LightPoint {
  const dx = p.x - origin.x, dy = p.y - origin.y;
  return { x: dx * Math.cos(rotation) + dy * Math.sin(rotation), y: -dx * Math.sin(rotation) + dy * Math.cos(rotation) };
}

export function toFixtureWorld(p: LightPoint, origin: LightPoint, rotation: number): LightPoint {
  return { x: origin.x + p.x * Math.cos(rotation) - p.y * Math.sin(rotation), y: origin.y + p.x * Math.sin(rotation) + p.y * Math.cos(rotation) };
}

/** Mitered outline of the orthogonal profile, including square end caps. */
export function stripOutline(path: LightPoint[], width: number): LightPoint[] {
  if (path.length === 1) {
    const { x, y } = path[0], h = width / 2;
    return [{ x: x - h, y: y - h }, { x: x + h, y: y - h }, { x: x + h, y: y + h }, { x: x - h, y: y + h }];
  }
  if (path.length < 2) return [];
  const dirs = path.slice(1).map((p, i) => {
    const len = Math.hypot(p.x - path[i].x, p.y - path[i].y) || 1;
    return { x: (p.x - path[i].x) / len, y: (p.y - path[i].y) / len };
  });
  const side = (sign: number) => path.map((p, i) => {
    const a = dirs[Math.max(0, i - 1)], b = dirs[Math.min(i, dirs.length - 1)];
    const denom = Math.max(1e-6, 1 + a.x * b.x + a.y * b.y);
    const cap = i === 0 ? -width / 2 : i === path.length - 1 ? width / 2 : 0;
    return { x: p.x - (a.y + b.y) * sign * width / 2 / denom + b.x * cap,
      y: p.y + (a.x + b.x) * sign * width / 2 / denom + b.y * cap };
  });
  return [...side(1), ...side(-1).reverse()];
}

/** Check every interval between polygon crossings, including concave rooms:
 * endpoints alone can be inside while the middle crosses an open courtyard. */
export function pathInsideRoom(path: LightPoint[], loop: LightPoint[]): boolean {
  if (!path.length || path.some((p) => !pointInPolygon(p.x, p.y, loop))) return false;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const cuts = [0, 1];
    for (let j = 0; j < loop.length; j++) {
      const c = loop[j], d = loop[(j + 1) % loop.length];
      const ex = d.x - c.x, ey = d.y - c.y;
      const det = dx * ey - dy * ex;
      if (Math.abs(det) < 1e-9) continue;
      const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / det;
      const u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / det;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
    }
    cuts.sort((x, y) => x - y);
    for (let j = 1; j < cuts.length; j++) {
      const t = (cuts[j - 1] + cuts[j]) / 2;
      if (!pointInPolygon(a.x + dx * t, a.y + dy * t, loop)) return false;
    }
  }
  return true;
}

/** One continuous rectangular beam per straight section, weighted by length. */
export function stripLightSegments(item: FixtureItem) {
  if (item.mount.kind !== "ceiling") return [];
  const origin = item.mount;
  const path = lightPath(item);
  const total = pathLength(path);
  return path.slice(1).flatMap((b, i) => {
    const a = path[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < STRIP_MIN_SEGMENT_M) return [];
    return [{ ...toFixtureWorld({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, origin, item.rotation),
      length, rotation: Math.atan2(b.y - a.y, b.x - a.x) + item.rotation, weight: length / total }];
  });
}
