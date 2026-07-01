// Minimal 2D vector helpers for plan-space math.

export interface V2 {
  x: number;
  y: number;
}

export const sub = (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: V2, b: V2): V2 => ({ x: a.x + b.x, y: a.y + b.y });
export const scale = (a: V2, s: number): V2 => ({ x: a.x * s, y: a.y * s });
export const len = (v: V2): number => Math.hypot(v.x, v.y);
export const dist = (a: V2, b: V2): number => len(sub(a, b));
export const norm = (v: V2): V2 => {
  const l = len(v) || 1;
  return { x: v.x / l, y: v.y / l };
};
