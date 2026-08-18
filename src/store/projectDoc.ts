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
  /** The rev last confirmed by the server (set by the sync engine, not here). */
  syncedRev?: number;
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
      doc: { schemaVersion: SCHEMA_VERSION, savedAt, state, worldModel: null, imageHash: hash },
      pendingImage: src,
      changed: true,
    };
  }

  if (doc.schemaVersion === SCHEMA_VERSION) {
    return {
      doc: {
        schemaVersion: SCHEMA_VERSION,
        savedAt,
        state: doc.state as ProjectState,
        worldModel: null,
        imageHash: doc.imageHash ?? null,
      },
      pendingImage: null,
      changed: false,
    };
  }

  return null; // unknown or newer-than-us — don't guess at its shape
}
