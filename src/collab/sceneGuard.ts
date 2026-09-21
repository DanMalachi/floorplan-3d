// A shape and size guard for a Scene that arrived from a live room.
//
// WHY: everything in a room's Yjs document is written by whoever holds an
// editing grant, and the browser of every other participant — the OWNER's
// included — reads it back with `readScene` and treats it as its own. The
// server cannot validate a Yjs update (Liveblocks relays it), so the receiving
// client is the only place a hostile or corrupt document can be stopped. Without
// this, an invited "decorate"/"build" collaborator (or anyone who obtained such a
// link) could write a scene with millions of items, NaN/Infinity coordinates,
// megabyte strings or a prototype-pollution key, and it would be applied to the
// owner's editor, mirrored into their local project, and pushed to their cloud
// account — corrupting the real plan, not just the live view.
//
// This is a bounds check, not a schema validator: it rejects what is impossible
// or abusive and deliberately tolerates unknown fields, because older and newer
// clients legitimately differ. Limits are far above any real plan.

import type { Scene } from "@/schema/scene";

export const SCENE_LIMITS = {
  /** Max items per collection. A large house has hundreds; these are abuse ceilings. */
  perCollection: {
    nodes: 5_000,
    walls: 5_000,
    openings: 5_000,
    rooms: 1_000,
    furniture: 5_000,
    stairs: 500,
    fixtures: 5_000,
  },
  /** Max length of any string value. */
  maxString: 4_000,
  /** Max entries in any array inside an item (a room loop, mullions, …). */
  maxArray: 10_000,
  /** Max nesting depth of a field value. */
  maxDepth: 8,
  /** |number| ceiling — plan pixels/metres are nowhere near this. */
  maxAbs: 1e7,
  /** Total values visited across the scene. */
  maxValues: 600_000,
} as const;

export type SceneVerdict = { ok: true } | { ok: false; reason: string };

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

class Reject extends Error {}

export function inspectScene(scene: Scene): SceneVerdict {
  const L = SCENE_LIMITS;
  let visited = 0;

  const walk = (value: unknown, depth: number, path: string): void => {
    if (++visited > L.maxValues) throw new Reject("too many values");
    if (depth > L.maxDepth) throw new Reject(`nested too deep at ${path}`);
    if (typeof value === "number") {
      if (!Number.isFinite(value) || Math.abs(value) > L.maxAbs) throw new Reject(`bad number at ${path}`);
    } else if (typeof value === "string") {
      if (value.length > L.maxString) throw new Reject(`string too long at ${path}`);
    } else if (Array.isArray(value)) {
      if (value.length > L.maxArray) throw new Reject(`array too long at ${path}`);
      for (let i = 0; i < value.length; i++) walk(value[i], depth + 1, `${path}[${i}]`);
    } else if (value !== null && typeof value === "object") {
      for (const key of Object.keys(value)) {
        if (FORBIDDEN_KEYS.has(key)) throw new Reject(`forbidden key at ${path}`);
        walk((value as Record<string, unknown>)[key], depth + 1, `${path}.${key}`);
      }
    } else if (value !== undefined && value !== null && typeof value !== "boolean") {
      throw new Reject(`unsupported value type at ${path}`);
    }
  };

  try {
    if (scene === null || typeof scene !== "object") throw new Reject("scene is not an object");
    for (const [name, max] of Object.entries(L.perCollection)) {
      const items = (scene as unknown as Record<string, unknown>)[name] ?? [];
      if (!Array.isArray(items)) throw new Reject(`${name} is not a list`);
      if (items.length > max) throw new Reject(`${name} has ${items.length} items (limit ${max})`);
      for (let i = 0; i < items.length; i++) {
        const item = items[i] as { id?: unknown } | null;
        if (item === null || typeof item !== "object") throw new Reject(`${name}[${i}] is not an object`);
        if (typeof item.id !== "string" || item.id.length === 0 || item.id.length > 128) {
          throw new Reject(`${name}[${i}] has no valid id`);
        }
        walk(item, 0, `${name}[${i}]`);
      }
    }
    if (scene.building !== undefined) walk(scene.building, 0, "building");
    return { ok: true };
  } catch (e) {
    if (e instanceof Reject) return { ok: false, reason: e.message };
    throw e;
  }
}
