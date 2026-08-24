import type { StoreState } from "./useSceneStore";

// -----------------------------------------------------------------------------
// The saved shape of a project, and the migrations between its versions.
//
// Everything here is PURE — no IndexedDB, no store access — so the migration
// ladder can be tested directly (see projectDoc.test.ts). projectPersistence
// owns the I/O; this module owns the shape.
//
// v1 → v2: the plan image (a base64 data URL of up to a 3000px page render) used
// to live inline in `state.image.src`, which made every document multi-MB and
// every save a multi-MB rewrite. From v2 the document carries only the image's
// dimensions plus a `imageHash`, and the pixels live under their own key. That
// keeps a document ~100-500KB — small enough to sync over the network on every
// edit, which is what the whole split is for.
// -----------------------------------------------------------------------------

export const SCHEMA_VERSION = 2;

// The durable slice of the store — the actual "project". Transient UI (busy
// flags, messages, selections, derived suggestions, proposals) is intentionally
// excluded so it regenerates fresh.
export const DURABLE_KEYS = [
  "scene",
  "appMode",
  "traceStep",
  "mode",
  "envPreset",
  "timeOfDay",
  "weather",
  "image",
  "imageOpacity",
  "sourcePdfName",
  "importedSegments",
  "importedArcs",
  "importedTexts",
  "showImport",
  "wallSnap",
  "points",
  "segments",
  "openings",
  "stairs",
  "metersPerPixel",
  "liveRoomId",
] as const satisfies readonly (keyof StoreState)[];

export type DurableKey = (typeof DURABLE_KEYS)[number];
export type ProjectState = Pick<StoreState, DurableKey>;

export interface ProjectDocument {
  schemaVersion: number;
  savedAt: number;
  /** The durable slice. From v2, `state.image.src` is always "" — see `imageHash`. */
  state: ProjectState;
  /** Reserved for the reasoning engine's belief event log (Phase C+). */
  worldModel: null;
  /** Identifies the plan image held in the side store, or null when there is none. */
  imageHash: string | null;
}

/** One card in the gallery — small enough to hold every project in memory. */
export interface ProjectMetaBase {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Bumped on every durable write. The change token cloud sync compares against. */
  rev: number;
  // ---- cloud sync bookkeeping (written by syncEngine, meaningless offline) ----
  /** Local `rev` at the last successful push. rev > syncedRev = unpushed edits. */
  syncedRev?: number;
  /** The server's own rev counter as of our last exchange with it. */
  remoteRev?: number;
  /** Hash of the plan image already uploaded — skips re-sending megabytes. */
  syncedImageHash?: string;
  /** Same idea for the card thumbnail. */
  syncedThumbHash?: string;
  /** A card pulled from the account whose document hasn't been downloaded yet. */
  cloudOnly?: boolean;
}

// ---- hashing ----------------------------------------------------------------

/**
 * cyrb53 — a fast non-cryptographic string hash. Used to tell "is this the same
 * plan image as the one already stored?" without re-writing megabytes, so it only
 * needs to be collision-resistant enough for one project's own history.
 */
export function hashString(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// Hashing a multi-MB data URL costs real milliseconds, and the autosave path runs
// every 600ms. The image object is replaced only when a new plan is imported, so
// keying the cache on its identity means we hash each image exactly once.
const hashCache = new WeakMap<object, string>();

export function imageHashOf(img: { src: string }): string {
  const cached = hashCache.get(img);
  if (cached) return cached;
  const h = hashString(img.src);
  hashCache.set(img, h);
  return h;
}

// ---- image split ------------------------------------------------------------

export interface SplitState {
  /** The state as it is written to disk: same as the input, minus the image pixels. */
  state: ProjectState;
  /** The pixels to hand to the side store, or null when there is nothing new to write. */
  src: string | null;
  /** Hash of `src`, or null when the project has no image at all. */
  hash: string | null;
}

/**
 * Separate the plan image's pixels from the rest of a project's state.
 *
 * An already-stripped state (src "") comes back untouched with `src: null` — that
 * is the signal to LEAVE the stored image alone, which is what makes the live-room
 * mirror path safe: it reads a document without pixels, merges a scene patch, and
 * writes it back without ever blanking the image.
 */
export function stripImage(state: ProjectState): SplitState {
  const img = state.image;
  if (!img) return { state, src: null, hash: null };
  if (!img.src) return { state, src: null, hash: null };
  return {
    state: { ...state, image: { ...img, src: "" } },
    src: img.src,
    hash: imageHashOf(img),
  };
}

/** Put the pixels back into a state read from disk. */
export function attachImage(state: ProjectState, src: string | null): ProjectState {
  if (!state.image || !src) return state;
  return { ...state, image: { ...state.image, src } };
}

// ---- repairs ----------------------------------------------------------------

/**
 * Drop the vector overlay from a project imported from a PDF.
 *
 * PDF import stopped extracting drawing geometry (2026-08-24): on real AutoCAD
 * exports it landed offset from the rendered page, so it fought the pen instead
 * of guiding it. New imports never store any; projects saved BEFORE that still
 * carry theirs, and would put the overlay straight back on the canvas at load.
 *
 * Deliberately NOT a schema bump. The rule below only recognises what a
 * previous version of the importer wrote, so it costs nothing to re-run and
 * leaves the document readable by an older build — which a version bump would
 * not: `migrateDoc` resets anything newer than it understands to defaults, and
 * with cloud sync a doc written here can reach a device still on the old code.
 *
 * DXF/DWG projects keep their vectors: theirs are correctly registered and
 * carry real-world scale. `sourcePdfName` holds whatever file was imported, so
 * its extension is what separates the two. A project with segments but no
 * recorded source name is left alone — unattributable, so not ours to clear.
 */
export function dropPdfVectors(state: ProjectState): { state: ProjectState; changed: boolean } {
  const src = state.sourcePdfName;
  if (!src || !/\.pdf$/i.test(src)) return { state, changed: false };
  // Documents predating these keys exist, so read them as possibly-absent
  // rather than trusting the type: this runs on whatever is on disk.
  const segs = state.importedSegments?.length ?? 0;
  const arcs = state.importedArcs?.length ?? 0;
  if (segs === 0 && arcs === 0) return { state, changed: false };
  // `importedTexts` survives: room labels are a naming cue read at Generate,
  // never drawn on the canvas, so they were never part of the complaint.
  return {
    state: { ...state, importedSegments: [], importedArcs: [], showImport: false },
    changed: true,
  };
}

// ---- migration --------------------------------------------------------------

export interface MigratedDoc {
  doc: ProjectDocument;
  /** Pixels the caller must move into the side store before the doc is authoritative. */
  pendingImage: string | null;
  /** True when the document changed shape and should be written back. */
  changed: boolean;
}

/**
 * Bring a stored document up to SCHEMA_VERSION, or return null if it is not a
 * project document we understand.
 *
 * Returning null resets the project to pristine defaults, so it must only happen
 * for genuinely unreadable input — never for an old-but-readable version. (The v1
 * code compared `schemaVersion === SCHEMA_VERSION` and silently wiped anything
 * else, which would have destroyed every existing project the moment this bump
 * shipped.)
 */
export function migrateDoc(raw: unknown): MigratedDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const doc = raw as Partial<ProjectDocument>;
  if (!doc.state || typeof doc.state !== "object") return null;
  const savedAt = typeof doc.savedAt === "number" ? doc.savedAt : Date.now();

  if (doc.schemaVersion === 1) {
    const { state, src, hash } = stripImage(doc.state as ProjectState);
    return {
      doc: {
        schemaVersion: SCHEMA_VERSION,
        savedAt,
        state: dropPdfVectors(state).state,
        worldModel: null,
        imageHash: hash,
      },
      pendingImage: src,
      changed: true,
    };
  }

  if (doc.schemaVersion === SCHEMA_VERSION) {
    // Same version, but possibly written by an importer that still stored PDF
    // vectors — repair in place and mark it dirty so the fix is persisted.
    const repaired = dropPdfVectors(doc.state as ProjectState);
    return {
      doc: {
        schemaVersion: SCHEMA_VERSION,
        savedAt,
        state: repaired.state,
        worldModel: null,
        imageHash: doc.imageHash ?? null,
      },
      pendingImage: null,
      changed: repaired.changed,
    };
  }

  return null; // unknown or newer-than-us — don't guess at its shape
}
