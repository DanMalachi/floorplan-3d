// The shared scene, modeled as a Yjs document. This is the multiplayer source of
// truth: the plan's `Scene` (+ presentation settings) mapped into Yjs types so
// concurrent edits merge instead of clobbering.
//
// Layout: doc.getMap("scene") root holds
//   nodes|walls|openings|rooms|furniture : Y.Map<id, Y.Map<field, value>>
//   presentation                         : Y.Map<field, value>
//   schemaVersion, units, building       : scalars / opaque JSON
//
// Items are keyed by id so two people editing DIFFERENT items never conflict;
// item fields are last-writer-wins per field. Complex field values (room.loop,
// semantics, mullions, building) are stored as opaque JSON — fine, since they're
// edited as a unit. S1 only reads this; S2 mutates it through the diff-bridge.

import * as Y from "yjs";
import type { Scene } from "@/schema/scene";
import type { EnvPreset, Weather, WallViewMode } from "@/store/useSceneStore";

export interface Presentation {
  envPreset: EnvPreset;
  timeOfDay: number;
  weather: Weather;
  wallMode: WallViewMode;
  showCeilings: boolean;
}

const ROOT = "scene";
export const COLLECTIONS = ["nodes", "walls", "openings", "rooms", "furniture"] as const;
type Collection = (typeof COLLECTIONS)[number];

export const sceneRoot = (doc: Y.Doc): Y.Map<unknown> => doc.getMap(ROOT);

function collectionMap(root: Y.Map<unknown>, name: Collection): Y.Map<Y.Map<unknown>> {
  let m = root.get(name);
  if (!(m instanceof Y.Map)) {
    m = new Y.Map();
    root.set(name, m);
  }
  return m as Y.Map<Y.Map<unknown>>;
}

function itemMap(fields: Record<string, unknown>): Y.Map<unknown> {
  const im = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) im.set(k, v);
  return im;
}

/** True when nothing has been written to the room's scene yet. */
export function isSceneEmpty(doc: Y.Doc): boolean {
  return sceneRoot(doc).size === 0;
}

/** Populate an empty doc from a Scene + presentation. Idempotent for fixed ids.
 *  `title` (the owner's project name) is stored so link receivers can name their
 *  own local copy of the shared doc the same thing. */
export function seedSceneDoc(doc: Y.Doc, scene: Scene, pres: Presentation, title?: string | null): void {
  doc.transact(() => {
    const root = sceneRoot(doc);
    root.set("schemaVersion", 2);
    root.set("units", "meters");
    if (title) root.set("title", title);
    if (scene.building !== undefined) root.set("building", scene.building);
    for (const name of COLLECTIONS) {
      const m = collectionMap(root, name);
      for (const item of scene[name] as Array<{ id: string }>) {
        m.set(item.id, itemMap(item as unknown as Record<string, unknown>));
      }
    }
    const p = new Y.Map<unknown>();
    p.set("envPreset", pres.envPreset);
    p.set("timeOfDay", pres.timeOfDay);
    p.set("weather", pres.weather);
    p.set("wallMode", pres.wallMode);
    p.set("showCeilings", pres.showCeilings);
    root.set("presentation", p);
  }, "seed");
}

function readCollection<T>(root: Y.Map<unknown>, name: Collection): T[] {
  const m = root.get(name);
  if (!(m instanceof Y.Map)) return [];
  const out: T[] = [];
  m.forEach((im) => {
    if (im instanceof Y.Map) out.push(im.toJSON() as T);
  });
  return out;
}

/** Reconstruct a plain Scene from the Yjs doc. */
export function readScene(doc: Y.Doc): Scene {
  const root = sceneRoot(doc);
  return {
    schemaVersion: 2,
    units: "meters",
    nodes: readCollection(root, "nodes"),
    walls: readCollection(root, "walls"),
    openings: readCollection(root, "openings"),
    rooms: readCollection(root, "rooms"),
    furniture: readCollection(root, "furniture"),
    building: (root.get("building") as Scene["building"]) ?? undefined,
  };
}

const PRESENTATION_DEFAULT: Presentation = {
  envPreset: "city",
  timeOfDay: 13,
  weather: "clear",
  wallMode: "full",
  showCeilings: true,
};

/** Read presentation settings, falling back to sensible defaults. */
export function readPresentation(doc: Y.Doc): Presentation {
  const p = sceneRoot(doc).get("presentation");
  if (!(p instanceof Y.Map)) return PRESENTATION_DEFAULT;
  const j = p.toJSON() as Partial<Presentation>;
  return { ...PRESENTATION_DEFAULT, ...j };
}

/** The owner's project name stored at seed time, for naming receivers' local copies. */
export function readSceneTitle(doc: Y.Doc): string | null {
  const t = sceneRoot(doc).get("title");
  return typeof t === "string" ? t : null;
}

/** Subscribe to any deep change in the shared scene. Returns an unsubscribe. */
export function observeSceneDoc(doc: Y.Doc, cb: () => void): () => void {
  const root = sceneRoot(doc);
  root.observeDeep(cb);
  return () => root.unobserveDeep(cb);
}
