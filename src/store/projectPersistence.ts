import { reserveIds, sceneIds, useSceneStore, type StoreState } from "./useSceneStore";
import { idbDel, idbGet, idbSet } from "./idb";
import {
  DURABLE_KEYS,
  SCHEMA_VERSION,
  attachImage,
  migrateDoc,
  stripImage,
  type ProjectDocument,
  type ProjectMetaBase,
  type ProjectState,
} from "./projectDoc";
import { deletePlanImage, deleteThumb, getPlanImage, getThumb, setPlanImage, setThumb } from "./planImageStore";
import type { GoLiveSeed } from "@/collab/goLiveHandoff";
import type { ShareRole } from "@/collab/share";

// -----------------------------------------------------------------------------
// Project persistence — a multi-project store in the browser's IndexedDB. Each
// project autosaves its working plan; a lightweight manifest of cards (id, name,
// timestamps, rev) powers the Projects gallery without loading the multi-MB
// image/geometry blobs. No dependency, SSR-safe.
//
// IndexedDB layout (all in the `kv` object store, see idb.ts):
//   projects:manifest   → StoredMeta[]                (small; drives the gallery)
//   projects:currentId  → string                      (which project reopens)
//   project:<id>        → ProjectDocument             (geometry; image-free)
//   image:<id>          → data URL of the plan image  (see planImageStore)
//   thumb:<id>          → data URL of the card thumb  (see planImageStore)
//   project:current     → legacy single-project doc, migrated in on first load
//
// The heavy base64 strings deliberately live OUTSIDE the two things this module
// rewrites on every autosave tick. A document is geometry only, so a save (and,
// later, a cloud push) stays small no matter how big the imported plan was.
// -----------------------------------------------------------------------------

const MANIFEST_KEY = "projects:manifest";
const CURRENT_KEY = "projects:currentId";
const LEGACY_KEY = "project:current";
const docKey = (id: string) => `project:${id}`;
const DEBOUNCE_MS = 600;

/** One card in the gallery. */
export interface ProjectMeta extends ProjectMetaBase {
  /** In-memory only — the JPEG lives under `thumb:<id>`, never inside the manifest. */
  thumb: string | null;
  liveRoomId?: string | null; // set once the project has gone live (opens into its room)
  liveRole?: ShareRole; // this browser's role in the shared room (owner = "build")
}

/** The manifest as it is written to disk: a card minus its thumbnail pixels. */
type StoredMeta = Omit<ProjectMeta, "thumb"> & { thumb?: string | null };

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
let lastSaved = ""; // durable fingerprint we last persisted (write de-dupe)
let timer: ReturnType<typeof setTimeout> | null = null;
/** projectId → hash of the plan image currently in the side store (skip re-writes). */
const imageWritten = new Map<string, string>();

// ---- observers (the gallery, and the cloud sync engine) ---------------------

const listeners = new Set<() => void>();

interface SyncHooks {
  /** A project's saved state changed on this device. */
  onWrite?: (projectId: string) => void;
  /** The user deleted a project here; it has to go on their other devices too. */
  onDelete?: (projectId: string) => void;
}
let hooks: SyncHooks = {};
const onDurableWrite = (id: string) => hooks.onWrite?.(id);

/** Fires whenever the gallery's contents change — including from a background pull. */
export function subscribeProjects(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyProjects(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* a listener's problem is not the save path's problem */
    }
  }
}

/**
 * Register the cloud sync engine's callbacks. Persistence stays unaware of what
 * sync does with them — and with none registered (guest, or no Supabase) the
 * save path behaves exactly as it did before accounts existed.
 */
export function setSyncHooks(next: SyncHooks): void {
  hooks = next;
}

function storedMeta(m: ProjectMeta): StoredMeta {
  const out: StoredMeta = {
    id: m.id,
    name: m.name,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    rev: m.rev,
  };
  if (m.syncedRev !== undefined) out.syncedRev = m.syncedRev;
  if (m.remoteRev !== undefined) out.remoteRev = m.remoteRev;
  if (m.cloudOnly !== undefined) out.cloudOnly = m.cloudOnly;
  if (m.syncedImageHash !== undefined) out.syncedImageHash = m.syncedImageHash;
  if (m.syncedThumbHash !== undefined) out.syncedThumbHash = m.syncedThumbHash;
  if (m.liveRoomId !== undefined) out.liveRoomId = m.liveRoomId;
  if (m.liveRole !== undefined) out.liveRole = m.liveRole;
  return out;
}

async function persistManifest(): Promise<void> {
  await idbSet(MANIFEST_KEY, manifest.map(storedMeta));
  notifyProjects();
}
const metaOf = (id: string | null) => manifest.find((m) => m.id === id) ?? null;

/**
 * Every id a saved project carries — the trace draft AND the generated scene.
 * The store's id counter restarts at 0 on each page load, so it has to be told
 * what a restored project already used before the user draws anything new.
 */
function* idsIn(state: ProjectState): Generator<string> {
  for (const p of state.points ?? []) yield p.id;
  for (const s of state.segments ?? []) yield s.id;
  for (const o of state.openings ?? []) yield o.id;
  for (const s of state.stairs ?? []) yield s.id;
  if (state.scene) yield* sceneIds(state.scene);
}

// ---- document read/write ----------------------------------------------------

/** The fingerprint used to skip no-op saves: geometry text + the image's identity. */
function durableFingerprint(state: ProjectState): string {
  const { state: stripped, hash } = stripImage(state);
  return `${hash ?? ""}|${JSON.stringify(stripped)}`;
}

/**
 * Read a project document, migrating it forward if it was saved by an older
 * version. Pass `withImage` when the pixels are actually needed (opening a
 * project) — every other caller works on geometry alone.
 */
async function readDoc(id: string, withImage = false): Promise<ProjectDocument | null> {
  const migrated = migrateDoc(await idbGet<unknown>(docKey(id)));
  if (!migrated) return null;
  const { doc, pendingImage } = migrated;

  if (pendingImage) {
    // v1 → v2: move the inline pixels into their own key, then rewrite the doc
    // without them. Done once, on the first open after the upgrade.
    await setPlanImage(id, pendingImage);
    if (doc.imageHash) imageWritten.set(id, doc.imageHash);
  }
  if (migrated.changed) await idbSet(docKey(id), doc);

  if (!withImage || !doc.state.image) return doc;
  const src = pendingImage ?? (await getPlanImage(id));
  if (src && doc.imageHash) imageWritten.set(id, doc.imageHash);
  return { ...doc, state: attachImage(doc.state, src) };
}

/**
 * Write a project document, keeping the plan image in its side key.
 *
 * `prevHash` carries the existing image's identity through writes whose state
 * came from disk (the live-room mirror), so merging a scene patch never orphans
 * the image.
 */
async function writeDoc(
  id: string,
  state: ProjectState,
  savedAt: number,
  prevHash: string | null = null,
): Promise<void> {
  const { state: stripped, src, hash } = stripImage(state);
  if (src !== null && hash !== null) {
    if (imageWritten.get(id) !== hash) {
      await setPlanImage(id, src);
      imageWritten.set(id, hash);
    }
  } else if (!state.image && imageWritten.has(id)) {
    imageWritten.delete(id);
    await deletePlanImage(id).catch(() => {});
  }
  await idbSet(docKey(id), {
    schemaVersion: SCHEMA_VERSION,
    savedAt,
    state: stripped,
    worldModel: null,
    imageHash: hash ?? prevHash,
  } satisfies ProjectDocument);
}

/**
 * Bump a card's freshness and revision after a durable write. Works both with the
 * manifest in memory (the editor) and without it (the live-room mirror runs on
 * /v, where initProjectPersistence never ran).
 */
async function touchMeta(id: string, savedAt: number, patch?: Partial<StoredMeta>): Promise<void> {
  const meta = metaOf(id);
  if (meta) {
    meta.updatedAt = savedAt;
    meta.rev = (meta.rev ?? 0) + 1;
    if (patch) Object.assign(meta, patch);
    await persistManifest();
    return;
  }
  const mani = (await idbGet<StoredMeta[]>(MANIFEST_KEY)) ?? [];
  const m = mani.find((x) => x.id === id);
  if (!m) return;
  m.updatedAt = savedAt;
  m.rev = (m.rev ?? 0) + 1;
  if (patch) Object.assign(m, patch);
  await idbSet(MANIFEST_KEY, mani);
}

/** Push the given project's saved (or pristine) state into the store. */
async function loadIntoStore(id: string): Promise<void> {
  const doc = await readDoc(id, true);
  const meta = metaOf(id);
  // Bump frameToken so the 3D view reframes/recenters onto THIS project's model.
  // Loading a project replaces `scene` directly (not via setScene), so without
  // this the viewport keeps the previous project's bounds and the model renders
  // off-origin — floating away from the origin-centred environment.
  if (doc?.state) {
    lastSaved = durableFingerprint(doc.state);
    reserveIds(idsIn(doc.state));
    useSceneStore.setState((s) => ({
      ...doc.state,
      // Explicit so switching from a live project to an older doc that predates
      // this field clears it, rather than carrying the previous project's room.
      liveRoomId: doc.state.liveRoomId ?? null,
      currentProjectId: id,
      projectName: meta?.name ?? "Untitled plan",
      projectRestored: true,
      projectSavedAt: doc.savedAt,
      frameToken: s.frameToken + 1,
    } as Partial<StoreState>));
  } else {
    lastSaved = "";
    useSceneStore.setState((s) => ({
      ...(defaults as ProjectState),
      currentProjectId: id,
      projectName: meta?.name ?? "Untitled plan",
      projectRestored: false,
      projectSavedAt: null,
      frameToken: s.frameToken + 1,
    } as Partial<StoreState>));
  }
}

/** Read the manifest, moving any v1 inline thumbnails out into their own keys. */
async function hydrateManifest(): Promise<ProjectMeta[]> {
  const stored = (await idbGet<StoredMeta[]>(MANIFEST_KEY)) ?? [];
  return Promise.all(
    stored.map(async (m) => {
      const inline = m.thumb ?? null; // v1 manifests kept the JPEG inline
      if (inline) await setThumb(m.id, inline).catch(() => {});
      return {
        ...m,
        rev: m.rev ?? 1,
        thumb: inline ?? (await getThumb(m.id).catch(() => null)),
      } satisfies ProjectMeta;
    }),
  );
}

/**
 * Load the manifest + last-open project, restore it into the store, then
 * autosave on change. Idempotent and browser-only. Safe to call from a React
 * effect. Migrates a legacy single-project save into the multi-project store.
 */
export function initProjectPersistence(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  ready ??= doInit();
  return ready;
}

/** Resolves once the manifest and the open project are loaded. Callers that need
 *  the gallery to exist (cloud sync) await this instead of racing the boot. */
export const whenProjectsReady = (): Promise<void> => ready ?? Promise.resolve();

let ready: Promise<void> | null = null;

async function doInit(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // Capture pristine defaults BEFORE restoring, so New Project can reset to them.
  defaults = snapshot(useSceneStore.getState());

  try {
    manifest = await hydrateManifest();
    currentId = await idbGet<string>(CURRENT_KEY);

    // One-time migration: fold a legacy `project:current` doc into a project.
    if (manifest.length === 0) {
      const legacy = migrateDoc(await idbGet<unknown>(LEGACY_KEY));
      if (legacy) {
        const id = uid();
        const at = legacy.doc.savedAt || Date.now();
        if (legacy.pendingImage) await setPlanImage(id, legacy.pendingImage);
        await idbSet(docKey(id), legacy.doc);
        manifest = [
          { id, name: deriveName(legacy.doc.state), createdAt: at, updatedAt: at, rev: 1, thumb: null },
        ];
        currentId = id;
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
    // Rewrite the manifest once, so a v1 one sheds its inline thumbnails for good.
    await persistManifest();
    await idbSet(CURRENT_KEY, currentId);
    await loadIntoStore(currentId);
  } catch {
    /* corrupt/blocked store — start fresh rather than crash */
  }

  useSceneStore.subscribe((s) => scheduleSave(s));

  // A debounced save loses up to DEBOUNCE_MS of edits when the tab goes away, so
  // take the last chance to write. Best-effort: IndexedDB may not finish during
  // teardown, but it usually does, and it costs nothing when it doesn't.
  const flushNow = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    void flushSave(useSceneStore.getState());
  };
  window.addEventListener("pagehide", flushNow);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushNow();
  });
}

function scheduleSave(s: StoreState): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flushSave(s), DEBOUNCE_MS);
}

async function flushSave(s: StoreState): Promise<void> {
  if (!currentId) return;
  const state = snapshot(s);
  const fingerprint = durableFingerprint(state);
  if (fingerprint === lastSaved) return; // nothing durable changed
  const savedAt = Date.now();
  try {
    await writeDoc(currentId, state, savedAt);
    lastSaved = fingerprint;
    await touchMeta(currentId, savedAt);
    useSceneStore.setState({ projectSavedAt: savedAt } as Partial<StoreState>);
    onDurableWrite?.(currentId);
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

// ---- direct import (used by the dev GT Lab) ---------------------------------

/**
 * Create a fully-formed saved project from a given durable state (e.g. a dropped
 * ground-truth model) and add it to the gallery — WITHOUT opening it or touching
 * the currently-open project. The GT lands as its own persistent project, so it
 * survives close/reopen. Only durable keys from `overrides` are kept; the rest of
 * the project starts from pristine defaults. Returns the new project's card.
 */
export async function importProject(name: string, overrides: Partial<StoreState>): Promise<ProjectMeta> {
  const base = defaults ?? snapshot(useSceneStore.getState());
  const state = { ...base } as ProjectState;
  for (const k of DURABLE_KEYS) {
    if (overrides[k] !== undefined) (state as Record<string, unknown>)[k] = overrides[k];
  }
  const id = uid();
  const now = Date.now();
  const meta: ProjectMeta = {
    id,
    name: name.trim() || nextUntitledName(),
    createdAt: now,
    updatedAt: now,
    rev: 1,
    thumb: null,
  };
  manifest.unshift(meta);
  await persistManifest();
  await writeDoc(id, state, now);
  return meta;
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
  const meta: ProjectMeta = {
    id,
    name: name?.trim() || nextUntitledName(),
    createdAt: now,
    updatedAt: now,
    rev: 1,
    thumb: null,
  };
  manifest.unshift(meta);
  await persistManifest();
  await writeDoc(id, defaults as ProjectState, now);
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
  hooks.onDelete?.(id);
  imageWritten.delete(id);
  await idbDel(docKey(id)).catch(() => {});
  await deletePlanImage(id).catch(() => {});
  await deleteThumb(id).catch(() => {});
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
  await setThumb(id, thumb).catch(() => {});
}

// ---- cloud sync surface -----------------------------------------------------
//
// Everything the sync engine needs to read and write a project WITHOUT going
// through the open-project path, so a background pull never disturbs what the
// user is currently editing.

export function getProjectMeta(id: string): ProjectMeta | null {
  return metaOf(id);
}

/** Update a card's sync bookkeeping. Deliberately does NOT bump `rev` — recording
 *  that we pushed is not itself a change worth pushing. */
export async function patchProjectMeta(id: string, patch: Partial<StoredMeta>): Promise<void> {
  const meta = metaOf(id);
  if (!meta) return;
  Object.assign(meta, patch);
  await persistManifest();
}

/** A project's saved geometry plus its image/thumbnail, ready to upload. */
export async function readProjectForSync(
  id: string,
): Promise<{ state: ProjectState; imageHash: string | null; planImage: string | null; thumb: string | null } | null> {
  const doc = await readDoc(id); // geometry only — the image comes from its own key
  if (!doc) return null;
  return {
    state: doc.state,
    imageHash: doc.imageHash,
    planImage: doc.imageHash ? await getPlanImage(id) : null,
    thumb: await getThumb(id).catch(() => null),
  };
}

/**
 * Write a project that came from the server into local storage.
 *
 * Never touches the open project's store state: if the user happens to be
 * looking at this project, `reopen` re-reads it once the write lands, rather
 * than mutating the scene under their cursor mid-edit.
 */
export async function applyRemoteProject(
  meta: Omit<ProjectMeta, "thumb"> & { thumb?: string | null },
  state: ProjectState,
  extras: { planImage?: string | null; thumb?: string | null; reopen?: boolean } = {},
): Promise<void> {
  const now = Date.now();
  if (extras.planImage) {
    await setPlanImage(meta.id, extras.planImage);
    imageWritten.delete(meta.id); // force the hash to be recomputed from the doc
  }
  if (extras.thumb) await setThumb(meta.id, extras.thumb).catch(() => {});

  await writeDoc(meta.id, state, now);

  const existing = metaOf(meta.id);
  if (existing) {
    Object.assign(existing, meta, { cloudOnly: false });
    if (extras.thumb) existing.thumb = extras.thumb;
  } else {
    manifest.unshift({ ...meta, cloudOnly: false, thumb: extras.thumb ?? meta.thumb ?? null });
  }
  await persistManifest();

  // loadIntoStore resets the save fingerprint from what it just read, so the
  // reload does not look like an edit and bounce straight back to the server.
  if (extras.reopen && meta.id === currentId) await loadIntoStore(meta.id);
}

/** Add a card for a project that lives on the account but not yet on this device. */
export async function addCloudStub(meta: Omit<ProjectMeta, "thumb">, thumb: string | null): Promise<void> {
  if (metaOf(meta.id)) return;
  manifest.unshift({ ...meta, cloudOnly: true, thumb });
  await persistManifest();
}

/** Drop a project from this device only (it was deleted on another one). */
export async function forgetProject(id: string): Promise<void> {
  if (id === currentId) return; // never yank the project the user is looking at
  manifest = manifest.filter((m) => m.id !== id);
  imageWritten.delete(id);
  await persistManifest();
  await idbDel(docKey(id)).catch(() => {});
  await deletePlanImage(id).catch(() => {});
  await deleteThumb(id).catch(() => {});
}

// ---- live projects (continuous, Google-Docs-style sharing) ------------------
//
// A project opts into "Go live" once; from then on it is a shared document backed
// by a Liveblocks room (id = liveRoomId). The room is the editing surface, and the
// owner's browser continuously MIRRORS the room's scene back into this project's
// IndexedDB doc, so the local copy (and gallery card) always reflect the latest
// collaborative state. Membership of a room to a local project is recorded in the
// owner map below, so only the owner's browser mirrors (share-link visitors don't).

const OWNER_MAP_KEY = "live:ownerRooms"; // { [roomId]: projectId } — this browser's owned rooms

/** Mark the OPEN project as live with `roomId`, persist it durably now (so a full
 *  reload into the room remembers it), and record this browser as the room owner.
 *  Idempotent: safe to call every time the user enters the room. */
export async function goLivePersist(roomId: string): Promise<void> {
  useSceneStore.setState({ liveRoomId: roomId } as Partial<StoreState>);
  await flushPending(); // writes the durable slice (now incl. liveRoomId) to `currentId`
  const meta = metaOf(currentId ?? "");
  if (meta && (meta.liveRoomId !== roomId || meta.liveRole !== "build")) {
    meta.liveRoomId = roomId; // so the gallery badges/routes it as live
    meta.liveRole = "build"; // the owner can always edit
    await persistManifest();
  }
  if (currentId) await setRoomOwner(roomId, currentId);
}

/** This browser's role in a live project's room (owner = "build"). Used to re-enter
 *  a shared room from the gallery with the same permissions it was joined with. */
export function getProjectLiveRole(projectId: string | null): ShareRole {
  return metaOf(projectId ?? "")?.liveRole ?? "build";
}

/**
 * Register a link receiver's LOCAL copy of a shared live doc: a project in their own
 * gallery backed by the same room id, tagged live, that mirrors continuously — so
 * both users see the same project (Google-Docs "shared with me"), not a fork.
 * Idempotent: if this browser already has a project for the room, returns it.
 */
export async function registerSharedProject(
  roomId: string,
  seed: GoLiveSeed,
  role: ShareRole,
): Promise<string> {
  const existing = await getRoomOwner(roomId);
  if (existing) return existing;
  const id = uid();
  await setRoomOwner(roomId, id); // reserve early so concurrent callers dedupe
  const now = Date.now();
  const base = snapshot(useSceneStore.getState()); // complete durable slice (defaults on /v)
  const state: ProjectState = {
    ...base,
    scene: seed.scene,
    envPreset: seed.envPreset,
    timeOfDay: seed.timeOfDay,
    weather: seed.weather,
    liveRoomId: roomId,
  };
  await writeDoc(id, state, now);
  // Manifest may not be loaded on /v — read/write it directly.
  const mani = (await idbGet<StoredMeta[]>(MANIFEST_KEY)) ?? [];
  if (!mani.some((m) => m.id === id)) {
    mani.unshift({
      id,
      name: seed.title?.trim() || "Shared plan",
      createdAt: now,
      updatedAt: now,
      rev: 1,
      liveRoomId: roomId,
      liveRole: role,
    });
    await idbSet(MANIFEST_KEY, mani);
  }
  return id;
}

/** Record (in IndexedDB) that this browser owns `roomId` on behalf of `projectId`. */
export async function setRoomOwner(roomId: string, projectId: string): Promise<void> {
  const map = (await idbGet<Record<string, string>>(OWNER_MAP_KEY)) ?? {};
  if (map[roomId] === projectId) return;
  map[roomId] = projectId;
  await idbSet(OWNER_MAP_KEY, map);
}

/** The local project this browser owns for `roomId`, or null if it isn't the owner. */
export async function getRoomOwner(roomId: string): Promise<string | null> {
  const map = await idbGet<Record<string, string>>(OWNER_MAP_KEY);
  return map?.[roomId] ?? null;
}

/** The persisted scene + presentation for a project, for (re)seeding its live room.
 *  This is the durable source of truth when the go-live handoff is absent (e.g. on
 *  reopening a live project) — so the room never falls back to the default sample. */
export async function getProjectSeed(projectId: string): Promise<GoLiveSeed | null> {
  const doc = await readDoc(projectId); // geometry only — the room never shows the plan image
  const st = doc?.state;
  if (!st?.scene) return null;
  const mani = (await idbGet<StoredMeta[]>(MANIFEST_KEY)) ?? [];
  return {
    scene: st.scene,
    envPreset: st.envPreset ?? "none",
    timeOfDay: st.timeOfDay ?? 13,
    weather: st.weather ?? "clear",
    wallMode: "full", // runtime view prefs (not persisted per-project) — sensible defaults
    showCeilings: true,
    title: mani.find((m) => m.id === projectId)?.name ?? null,
  };
}

// Room→project mirror: debounced, self-contained (works on the /v route where
// initProjectPersistence never ran), and de-duped so an unchanged scene is a no-op.
const mirrorTimers = new Map<string, ReturnType<typeof setTimeout>>();
const mirrorLast = new Map<string, string>();
const MIRROR_DEBOUNCE_MS = 800;

/** Continuously persist a live room's scene/presentation into its owning project. */
export function scheduleProjectMirror(projectId: string, patch: Partial<ProjectState>): void {
  const existing = mirrorTimers.get(projectId);
  if (existing) clearTimeout(existing);
  mirrorTimers.set(
    projectId,
    setTimeout(() => {
      mirrorTimers.delete(projectId);
      void writeProjectPatch(projectId, patch);
    }, MIRROR_DEBOUNCE_MS),
  );
}

async function writeProjectPatch(projectId: string, patch: Partial<ProjectState>): Promise<void> {
  try {
    const doc = await readDoc(projectId); // geometry only: the merge must not touch the image
    if (!doc?.state) return; // no base to merge into — owner's project must exist first
    const state = { ...doc.state, ...patch } as ProjectState;
    const serialized = JSON.stringify(state);
    if (serialized === mirrorLast.get(projectId)) return; // nothing changed
    const savedAt = Date.now();
    await writeDoc(projectId, state, savedAt, doc.imageHash);
    mirrorLast.set(projectId, serialized);
    // Bump the gallery card's freshness (manifest may not be loaded on /v).
    await touchMeta(projectId, savedAt, state.liveRoomId ? { liveRoomId: state.liveRoomId } : undefined);
    onDurableWrite?.(projectId);
  } catch {
    /* quota / blocked — keep the room running, local mirror just lags */
  }
}
