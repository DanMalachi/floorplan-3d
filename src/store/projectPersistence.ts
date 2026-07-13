import { useSceneStore, type StoreState } from "./useSceneStore";

// -----------------------------------------------------------------------------
// Project persistence — a multi-project store in the browser's IndexedDB. Each
// project autosaves its working plan; a lightweight manifest of cards (id, name,
// thumbnail, timestamps) powers the Projects gallery without loading the multi-MB
// image/geometry blobs. No dependency, SSR-safe.
//
// IndexedDB layout (all in the `kv` object store):
//   projects:manifest   → ProjectMeta[]              (small; drives the gallery)
//   projects:currentId  → string                     (which project reopens)
//   project:<id>        → ProjectDocument             (the heavy per-project state)
//   project:current     → legacy single-project doc, migrated in on first load
//
// The image data URL + parsed geometry are multi-MB, so we debounce writes and
// skip saves when the durable slice is byte-for-byte unchanged.
// -----------------------------------------------------------------------------

const DB_NAME = "floorplan3d";
const STORE = "kv";
const MANIFEST_KEY = "projects:manifest";
const CURRENT_KEY = "projects:currentId";
const LEGACY_KEY = "project:current";
const docKey = (id: string) => `project:${id}`;
const SCHEMA_VERSION = 1;
const DEBOUNCE_MS = 600;

// The durable slice of the store — the actual "project". Transient UI (busy
// flags, messages, selections, derived suggestions, proposals) is intentionally
// excluded so it regenerates fresh.
const DURABLE_KEYS = [
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
  "extractionTargets",
  "wallSnap",
  "points",
  "segments",
  "openings",
  "metersPerPixel",
] as const satisfies readonly (keyof StoreState)[];

type DurableKey = (typeof DURABLE_KEYS)[number];
type ProjectState = Pick<StoreState, DurableKey>;

interface ProjectDocument {
  schemaVersion: number;
  savedAt: number;
  state: ProjectState;
  /** Reserved for the reasoning engine's belief event log (Phase C+). */
  worldModel: null;
}

/** One card in the gallery — small enough to hold every project in memory. */
export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  thumb: string | null; // small JPEG data URL of the 3D view, or null
}

// ---- IndexedDB key/value (dep-free, browser-only) ---------------------------

function hasIDB(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  if (!hasIDB()) return null;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    tx.onsuccess = () => resolve((tx.result as T) ?? null);
    tx.onerror = () => reject(tx.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  if (!hasIDB()) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDel(key: string): Promise<void> {
  if (!hasIDB()) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---- module state -----------------------------------------------------------

function snapshot(s: StoreState): ProjectState {
  const out = {} as ProjectState;
  for (const k of DURABLE_KEYS) (out as Record<string, unknown>)[k] = s[k];
  return out;
}

const uid = (): string =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function deriveName(state: Partial<ProjectState>): string {
  const pdf = state.sourcePdfName;
  if (pdf) return pdf.replace(/\.[a-z0-9]+$/i, "");
  return nextUntitledName();
}

function nextUntitledName(): string {
  const used = new Set(manifest.map((m) => m.name));
  for (let n = 1; ; n++) {
    const name = n === 1 ? "Untitled plan" : `Untitled plan ${n}`;
    if (!used.has(name)) return name;
  }
}

let initialized = false;
let defaults: ProjectState | null = null; // pristine durable slice, for New Project
let manifest: ProjectMeta[] = []; // in-memory mirror of projects:manifest
let currentId: string | null = null;
let lastSaved = ""; // serialized durable slice we last persisted (write de-dupe)
let timer: ReturnType<typeof setTimeout> | null = null;

const persistManifest = () => idbSet(MANIFEST_KEY, manifest);
const metaOf = (id: string | null) => manifest.find((m) => m.id === id) ?? null;

/** Push the given project's saved (or pristine) state into the store. */
async function loadIntoStore(id: string): Promise<void> {
  const doc = await idbGet<ProjectDocument>(docKey(id));
  const meta = metaOf(id);
  if (doc?.state && doc.schemaVersion === SCHEMA_VERSION) {
    lastSaved = JSON.stringify(doc.state);
    useSceneStore.setState({
      ...doc.state,
      currentProjectId: id,
      projectName: meta?.name ?? "Untitled plan",
      projectRestored: true,
      projectSavedAt: doc.savedAt,
    } as Partial<StoreState>);
  } else {
    lastSaved = "";
    useSceneStore.setState({
      ...(defaults as ProjectState),
      currentProjectId: id,
      projectName: meta?.name ?? "Untitled plan",
      projectRestored: false,
      projectSavedAt: null,
    } as Partial<StoreState>);
  }
}

/**
 * Load the manifest + last-open project, restore it into the store, then
 * autosave on change. Idempotent and browser-only. Safe to call from a React
 * effect. Migrates a legacy single-project save into the multi-project store.
 */
export async function initProjectPersistence(): Promise<void> {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  // Capture pristine defaults BEFORE restoring, so New Project can reset to them.
  defaults = snapshot(useSceneStore.getState());

  try {
    manifest = (await idbGet<ProjectMeta[]>(MANIFEST_KEY)) ?? [];
    currentId = await idbGet<string>(CURRENT_KEY);

    // One-time migration: fold a legacy `project:current` doc into a project.
    if (manifest.length === 0) {
      const legacy = await idbGet<ProjectDocument>(LEGACY_KEY);
      if (legacy?.state) {
        const id = uid();
        const at = legacy.savedAt || Date.now();
        await idbSet(docKey(id), legacy);
        manifest = [{ id, name: deriveName(legacy.state), createdAt: at, updatedAt: at, thumb: null }];
        currentId = id;
        await persistManifest();
        await idbSet(CURRENT_KEY, id);
        await idbDel(LEGACY_KEY).catch(() => {});
      }
    }

    // Ensure there's always exactly one open project.
    if (!currentId || !metaOf(currentId)) {
      currentId = manifest[0]?.id ?? null;
    }
    if (!currentId) {
      const meta = await createProjectMeta();
      currentId = meta.id;
    }
    await idbSet(CURRENT_KEY, currentId);
    await loadIntoStore(currentId);
  } catch {
    /* corrupt/blocked store — start fresh rather than crash */
  }

  useSceneStore.subscribe((s) => scheduleSave(s));
}

function scheduleSave(s: StoreState): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flushSave(s), DEBOUNCE_MS);
}

async function flushSave(s: StoreState): Promise<void> {
  if (!currentId) return;
  const state = snapshot(s);
  const serialized = JSON.stringify(state);
  if (serialized === lastSaved) return; // nothing durable changed
  const savedAt = Date.now();
  try {
    await idbSet(docKey(currentId), {
      schemaVersion: SCHEMA_VERSION,
      savedAt,
      state,
      worldModel: null,
    } satisfies ProjectDocument);
    lastSaved = serialized;
    const meta = metaOf(currentId);
    if (meta) {
      meta.updatedAt = savedAt;
      await persistManifest();
    }
    useSceneStore.setState({ projectSavedAt: savedAt } as Partial<StoreState>);
  } catch {
    /* quota/blocked — keep working in-memory */
  }
}

/** Flush any pending debounced save immediately (before switching projects). */
async function flushPending(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  await flushSave(useSceneStore.getState());
}

// ---- public API (used by the Projects gallery) ------------------------------

/** All projects, newest-edited first. Returns a copy. */
export function listProjects(): ProjectMeta[] {
  return [...manifest].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getCurrentProjectId(): string | null {
  return currentId;
}

/** Create a manifest entry + blank saved doc, without switching to it. */
async function createProjectMeta(name?: string): Promise<ProjectMeta> {
  const id = uid();
  const now = Date.now();
  const meta: ProjectMeta = { id, name: name?.trim() || nextUntitledName(), createdAt: now, updatedAt: now, thumb: null };
  manifest.unshift(meta);
  await persistManifest();
  await idbSet(docKey(id), {
    schemaVersion: SCHEMA_VERSION,
    savedAt: now,
    state: defaults as ProjectState,
    worldModel: null,
  } satisfies ProjectDocument);
  return meta;
}

/** Create a fresh project and open it. */
export async function createProject(name?: string): Promise<ProjectMeta> {
  await flushPending();
  const meta = await createProjectMeta(name);
  currentId = meta.id;
  await idbSet(CURRENT_KEY, currentId);
  await loadIntoStore(currentId);
  return meta;
}

/** Switch to an existing project (saving the current one first). */
export async function openProject(id: string): Promise<void> {
  if (id === currentId || !metaOf(id)) return;
  await flushPending();
  currentId = id;
  await idbSet(CURRENT_KEY, id);
  await loadIntoStore(id);
}

/** Delete a project; if it was open, fall back to another (or a fresh blank). */
export async function deleteProject(id: string): Promise<void> {
  manifest = manifest.filter((m) => m.id !== id);
  await persistManifest();
  await idbDel(docKey(id)).catch(() => {});
  if (id === currentId) {
    currentId = null;
    if (manifest.length) await openProject(manifest[0].id);
    else await createProject();
  }
}

/** Rename a project (updates the open project's display name too). */
export async function renameProject(id: string, name: string): Promise<void> {
  const meta = metaOf(id);
  if (!meta) return;
  meta.name = name.trim() || meta.name;
  await persistManifest();
  if (id === currentId) useSceneStore.setState({ projectName: meta.name } as Partial<StoreState>);
}

/** Store a fresh thumbnail for a project (small JPEG data URL). */
export async function setProjectThumb(id: string, thumb: string): Promise<void> {
  const meta = metaOf(id);
  if (!meta) return;
  meta.thumb = thumb;
  await persistManifest();
}
