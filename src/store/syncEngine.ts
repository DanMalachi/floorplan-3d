import {
  addCloudStub,
  applyRemoteProject,
  forgetProject,
  getProjectMeta,
  listProjects,
  patchProjectMeta,
  readProjectForSync,
  setSyncHooks,
  type ProjectMeta,
} from "./projectPersistence";
import {
  downloadPlanImage,
  downloadThumb,
  listRemote,
  pullDoc,
  pushProject,
  softDeleteRemote,
  uploadPlanImage,
  uploadThumb,
  type RemoteProject,
} from "./cloudProjects";
import { SCHEMA_VERSION, hashString } from "./projectDoc";
import { useSyncStore } from "./useSyncStore";

// -----------------------------------------------------------------------------
// Cloud sync: the thing that makes a project follow the user to another machine.
//
// Local-first. IndexedDB stays the working copy and the editor never waits on
// the network; this engine pushes a few seconds after edits settle and pulls on
// sign-in, on tab focus, and when the connection comes back.
//
// Ordering is settled by the server's `rev` counter, never by clocks — client
// clocks disagree, and "newest wins" with a wrong clock silently eats work. A
// push states the rev it was based on; if the server has moved on, the two
// versions are BOTH kept (the remote one arrives as a separate "(from another
// device)" project) rather than one overwriting the other.
// -----------------------------------------------------------------------------

const PUSH_DELAY_MS = 3000; // after edits settle — the local save already happened
const REFRESH_MIN_GAP_MS = 30_000; // don't re-list the account on every tab focus

let userId: string | null = null;
let started = false;
const dirty = new Set<string>();
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let lastReconcileAt = 0;

const sync = () => useSyncStore.getState();

/**
 * One lock over the whole engine — reconciles and pushes run one at a time.
 *
 * They cannot overlap: a reconcile decides what to do by comparing a card's
 * syncedRev/remoteRev against the server, and a push in flight is precisely the
 * window where those two are stale. Overlapping them makes a project look like
 * it changed on both sides at once, and the engine dutifully "keeps both" —
 * conjuring a phantom "(from another device)" copy on a single device.
 */
let chain: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

// ---- lifecycle --------------------------------------------------------------

/** Begin syncing for a signed-in user. Idempotent per user. */
export async function startSync(id: string): Promise<void> {
  if (started && userId === id) return;
  stopSync();
  userId = id;
  started = true;

  setSyncHooks({
    onWrite: (projectId) => {
      dirty.add(projectId);
      sync().setPending(dirty.size);
      schedulePush();
    },
    onDelete: (projectId) => {
      dirty.delete(projectId);
      void softDeleteRemote(projectId);
    },
  });

  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);

  await reconcile();
}

/** Stop syncing (sign-out). Local projects stay exactly where they are. */
export function stopSync(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  if (started) {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
  }
  setSyncHooks({});
  dirty.clear();
  userId = null;
  started = false;
  lastReconcileAt = 0;
  sync().setStatus("off");
  sync().setPending(0);
}

const onOnline = () => {
  void reconcile();
};

const onVisible = () => {
  if (document.visibilityState !== "visible") return;
  if (Date.now() - lastReconcileAt < REFRESH_MIN_GAP_MS) return;
  void reconcile();
};

function schedulePush(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void withLock(pushLoop);
  }, PUSH_DELAY_MS);
}

// ---- reconcile: what does the account have that this device doesn't, and vice versa

/**
 * Compare this device's gallery with the account's, project by project, and
 * queue whatever each side is missing. Runs on sign-in, on tab focus, and when
 * the network returns.
 */
export function reconcile(): Promise<void> {
  return withLock(reconcileInner);
}

async function reconcileInner(): Promise<void> {
  if (!userId) return;
  sync().setStatus("syncing");
  const remote = await listRemote();
  if (!remote) {
    sync().setStatus(navigator.onLine ? "error" : "offline");
    return;
  }
  lastReconcileAt = Date.now();

  const remoteById = new Map(remote.map((r) => [r.id, r]));
  const local = listProjects();
  const localIds = new Set(local.map((m) => m.id));

  // On the account but not on this device — show the card now, fetch the plan
  // when it's opened. A gallery of cards is what "my projects followed me" looks
  // like; downloading every project up front would not be.
  for (const r of remote) {
    if (localIds.has(r.id)) continue;
    const thumb = r.thumbPath ? await downloadThumb(r.thumbPath) : null;
    await addCloudStub(metaFromRemote(r, { syncedRev: 0, rev: 0 }), thumb);
  }

  for (const m of local) {
    const r = remoteById.get(m.id);

    if (!r) {
      // Never been pushed → this is the first sign-in claiming local work.
      // Previously synced and now absent → deleted from another device.
      if (m.remoteRev === undefined) markDirty(m.id);
      else await forgetProject(m.id);
      continue;
    }

    const localAhead = (m.rev ?? 0) > (m.syncedRev ?? 0);
    const remoteAhead = r.rev > (m.remoteRev ?? 0);

    if (localAhead && remoteAhead) await keepBoth(m, r);
    else if (remoteAhead) await pull(r, m);
    else if (localAhead) markDirty(m.id);
    else if (m.remoteRev !== r.rev) await patchProjectMeta(m.id, { remoteRev: r.rev });
  }

  await pushLoop();
}

function markDirty(id: string): void {
  dirty.add(id);
  sync().setPending(dirty.size);
}

function metaFromRemote(r: RemoteProject, over: Partial<ProjectMeta> = {}): Omit<ProjectMeta, "thumb"> {
  return {
    id: r.id,
    name: r.name,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    rev: 1,
    syncedRev: 1,
    remoteRev: r.rev,
    syncedImageHash: r.planImageHash ?? undefined,
    liveRoomId: r.liveRoomId,
    liveRole: (r.liveRole as ProjectMeta["liveRole"]) ?? undefined,
    ...over,
  };
}

// ---- pull -------------------------------------------------------------------

async function pull(r: RemoteProject, local: ProjectMeta | null): Promise<boolean> {
  const doc = await pullDoc(r.id);
  if (!doc) return false;
  const planImage = r.planImagePath ? await downloadPlanImage(r.planImagePath) : null;
  const thumb = r.thumbPath ? await downloadThumb(r.thumbPath) : null;

  // rev === syncedRev, so the freshly pulled copy doesn't look like a local edit
  // and immediately push itself back.
  const rev = (local?.rev ?? 0) + 1;
  await applyRemoteProject(
    metaFromRemote(r, { rev, syncedRev: rev, remoteRev: doc.rev, cloudOnly: false }),
    doc.state,
    { planImage, thumb, reopen: true },
  );
  return true;
}

/** Download a project this device only has a card for. Returns false if it can't. */
export function ensureDownloaded(projectId: string): Promise<boolean> {
  return withLock(() => ensureDownloadedInner(projectId));
}

async function ensureDownloadedInner(projectId: string): Promise<boolean> {
  const meta = getProjectMeta(projectId);
  if (!meta) return false;
  if (!meta.cloudOnly) return true;
  if (!userId) return false;
  sync().setStatus("syncing");
  const remote = await listRemote();
  const r = remote?.find((x) => x.id === projectId);
  if (!r) {
    sync().setStatus(navigator.onLine ? "error" : "offline");
    return false;
  }
  const ok = await pull(r, meta);
  sync().setStatus(ok ? "idle" : "error");
  return ok;
}

/**
 * Both sides changed since they last agreed. Keep the remote version as its own
 * project and let the local one continue as itself — the user sorts out which
 * they want, with neither edit thrown away.
 */
async function keepBoth(local: ProjectMeta, r: RemoteProject): Promise<void> {
  const doc = await pullDoc(r.id);
  if (!doc) return;
  const planImage = r.planImagePath ? await downloadPlanImage(r.planImagePath) : null;
  const thumb = r.thumbPath ? await downloadThumb(r.thumbPath) : null;
  const copyName = `${r.name} (from another device)`;

  await applyRemoteProject(
    {
      id: crypto.randomUUID(),
      name: copyName,
      createdAt: r.createdAt,
      updatedAt: Date.now(),
      rev: 1,
      cloudOnly: false,
    },
    doc.state,
    { planImage, thumb },
  );

  // The local copy has now accounted for everything the server holds, so its
  // next push is based on the current rev and goes through cleanly.
  await patchProjectMeta(local.id, { remoteRev: r.rev });
  markDirty(local.id);
  sync().setStatus("conflict", copyName);
}

// ---- push -------------------------------------------------------------------

async function pushLoop(): Promise<void> {
  if (!userId) return;
  while (dirty.size) {
    const id = dirty.values().next().value as string;
    dirty.delete(id);
    sync().setStatus("syncing");
    const outcome = await pushOne(id);
    if (outcome === "retry") {
      dirty.add(id); // put it back; the next online/focus pass picks it up
      sync().setStatus(navigator.onLine ? "error" : "offline");
      sync().setPending(dirty.size);
      return;
    }
    sync().setPending(dirty.size);
  }
  if (sync().status !== "conflict") sync().markSynced();
}

type PushOutcome = "ok" | "retry" | "skip";

async function pushOne(id: string): Promise<PushOutcome> {
  if (!userId) return "skip";
  const meta = getProjectMeta(id);
  if (!meta || meta.cloudOnly) return "skip";

  const snap = await readProjectForSync(id);
  if (!snap) return "skip";

  // Capture the rev the upload is based on: the user keeps editing while this
  // is in flight, and anything after this point has to stay queued.
  const revAtSnapshot = meta.rev ?? 0;

  let planImagePath: string | null = null;
  let planImageHash: string | null = null;
  if (snap.planImage && snap.imageHash && snap.imageHash !== meta.syncedImageHash) {
    planImagePath = await uploadPlanImage(userId, id, snap.planImage);
    if (!planImagePath) return "retry";
    planImageHash = snap.imageHash;
  }

  let thumbPath: string | null = null;
  const thumbHash = snap.thumb ? hashString(snap.thumb) : null;
  if (snap.thumb && thumbHash !== meta.syncedThumbHash) {
    thumbPath = await uploadThumb(userId, id, snap.thumb);
    if (!thumbPath) return "retry";
  }

  const result = await pushProject({
    id,
    expectedRev: meta.remoteRev ?? 0,
    name: meta.name,
    state: snap.state,
    schemaVersion: SCHEMA_VERSION,
    planImagePath,
    planImageHash,
    thumbPath,
    liveRoomId: meta.liveRoomId ?? null,
    liveRole: meta.liveRole ?? null,
    createdAt: meta.createdAt,
  });

  if (!result) return "retry";

  if (result.conflict) {
    // Someone else got there first. Re-listing sorts it out (pull, or keep both).
    // Called directly, not through withLock — we already hold it.
    await reconcileInner();
    return "ok";
  }

  await patchProjectMeta(id, {
    syncedRev: revAtSnapshot,
    remoteRev: result.rev,
    ...(planImageHash ? { syncedImageHash: planImageHash } : {}),
    ...(thumbPath && thumbHash ? { syncedThumbHash: thumbHash } : {}),
  });
  return "ok";
}

/** Push everything outstanding now (used on sign-in and by the status line). */
export async function syncNow(): Promise<void> {
  await reconcile();
}
