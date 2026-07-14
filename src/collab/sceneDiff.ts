// Diff-bridge: turn a whole-scene replace (prev -> next, how the editor already
// works) into the MINIMAL set of Yjs ops. Only changed items/fields are touched,
// so a concurrent edit to a different item (or a different field of the same
// item) is preserved instead of clobbered — this is what makes merges work.

import * as Y from "yjs";
import type { Scene } from "@/schema/scene";
import { COLLECTIONS, sceneRoot } from "./sceneDoc";

type Item = { id: string } & Record<string, unknown>;

function eq(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function newItemMap(item: Item): Y.Map<unknown> {
  const im = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(item)) if (v !== undefined) im.set(k, v);
  return im;
}

/** Apply only the fields that changed between two versions of one item. */
function patchItem(im: Y.Map<unknown>, before: Item, after: Item): void {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    const av = after[k];
    if (av === undefined) {
      if (im.has(k)) im.delete(k);
    } else if (!eq(before[k], av)) {
      im.set(k, av);
    }
  }
}

/**
 * Apply prev->next as granular ops on the shared doc, tagged with `origin` so the
 * Yjs UndoManager can track this client's edits for per-user undo. Runs in one
 * transaction (one undo step, one network update).
 */
export function applySceneDiff(doc: Y.Doc, prev: Scene, next: Scene, origin: unknown): void {
  doc.transact(() => {
    const root = sceneRoot(doc);
    for (const coll of COLLECTIONS) {
      let m = root.get(coll);
      if (!(m instanceof Y.Map)) {
        m = new Y.Map();
        root.set(coll, m);
      }
      const map = m as Y.Map<Y.Map<unknown>>;
      const prevItems = new Map((prev[coll] as unknown as Item[]).map((it) => [it.id, it]));
      const nextItems = new Map((next[coll] as unknown as Item[]).map((it) => [it.id, it]));

      for (const id of prevItems.keys()) if (!nextItems.has(id)) map.delete(id);

      for (const [id, after] of nextItems) {
        const before = prevItems.get(id);
        if (before === after) continue; // ref-equal — editor reuses refs for unchanged items
        const im = map.get(id);
        if (!before || !(im instanceof Y.Map)) {
          map.set(id, newItemMap(after));
        } else {
          patchItem(im, before, after);
        }
      }
    }
    if (!eq(prev.building, next.building)) {
      if (next.building === undefined) root.delete("building");
      else root.set("building", next.building);
    }
  }, origin);
}
