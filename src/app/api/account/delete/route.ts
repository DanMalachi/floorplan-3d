import { Liveblocks } from "@liveblocks/node";
import { getServerUser } from "@/lib/supabase/server";
import { getAdminSupabase, serviceRoleConfigured } from "@/lib/supabase/admin";
import { logRequest } from "@/lib/api/log";
import { BUCKETS, listUserObjects, removeObjects, type Bucket } from "@/lib/supabase/accountData";

// -----------------------------------------------------------------------------
// POST /api/account/delete — erasure (GDPR Art. 17 / CCPA "delete my data").
//
// Irreversible and unrecoverable: there is no soft-delete tier behind this and no
// backup restore. Everything below is arranged around one rule — **never report
// success over data we did not manage to delete.**
//
// ORDER, and why this order:
//
//   0. Identify the caller from the session cookie. The uid is NEVER read from
//      the request body; if it were, any signed-in user could delete any other.
//   1. Enumerate first, delete second. Storage objects are listed by `<uid>/`
//      prefix rather than reconstructed from `plan_image_path`, because an upload
//      whose subsequent row push failed left an object with no row pointing at it
//      — still the user's data, still has to go.
//   2. Live rooms (Liveblocks) — the user's scene sitting on a third-party
//      processor, reachable by anyone holding a share link. Killed first: while
//      a room is alive a collaborator's client can keep writing to it, and a
//      mirror-back could otherwise resurrect a project row we are about to drop.
//   3. Storage objects, then RE-LIST to verify the buckets are empty for this
//      user. `remove()` reporting no error is not proof; the re-list is.
//   4. Database rows (project_docs, then projects).
//   5. The auth user — LAST, and only if every step above verified clean.
//
// Why the auth user is last: deleting it strands anything left behind. The paths
// are named after a uid that no longer resolves to anyone, and the user can no
// longer sign in to retry. Leaving the account alive on a partial failure keeps
// the operation retryable, and every step is idempotent, so Retry is safe.
//
// What we CANNOT delete, and say so instead of pretending:
//   • A collaborator's own copy. Opening a share link calls
//     registerSharedProject(), which writes a full copy into that person's
//     IndexedDB — and if they are signed in, their sync pushes it to rows owned
//     by THEIR uid. Those rows are their data; RLS gives us no access and no
//     ownership link back. The UI states this before the user confirms.
//   • Anything a collaborator exported or screenshotted.
// -----------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StageReport {
  stage: string;
  ok: boolean;
  detail: string;
}

interface DeleteReport {
  ok: boolean;
  stages: StageReport[];
  /** Present when something survived; these are what a retry will pick up. */
  remaining?: string[];
}

// Account deletion is irreversible and runs with the service role, so both
// outcomes are recorded. A partial failure especially: it leaves data behind
// under a uid the user may no longer be able to sign in as, and without a log
// line naming the stage there is nothing left to reconstruct it from.
// No email, no name, no plan content — the uid and the stage names only.
const fail = (report: DeleteReport, status: number) => {
  const failed = report.stages.find((s) => !s.ok);
  logRequest({
    route: "account/delete",
    status,
    ms: 0,
    reason: failed ? `stage:${failed.stage}` : "unknown",
  });
  return Response.json(report, { status });
};

export async function POST(request: Request) {
  const stages: StageReport[] = [];

  // ---- 0. who is asking, and did they mean it -------------------------------

  // Cross-site request forgery guard. Deletion is a cookie-authenticated state
  // change, so a page on another origin must not be able to trigger it. A JSON
  // content-type forces a CORS preflight, and the Origin check covers the rest.
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return fail({ ok: false, stages: [{ stage: "origin", ok: false, detail: "cross-origin request refused" }] }, 403);
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return fail({ ok: false, stages: [{ stage: "origin", ok: false, detail: "expected application/json" }] }, 415);
  }

  const user = await getServerUser();
  if (!user) {
    return fail({ ok: false, stages: [{ stage: "auth", ok: false, detail: "not signed in" }] }, 401);
  }

  const body = (await request.json().catch(() => ({}))) as { confirm?: unknown };
  const typed = typeof body.confirm === "string" ? body.confirm.trim() : "";
  // The deliberate gate: the user types their own email address. A single click
  // cannot produce this string, and neither can a mis-fired fetch.
  const expected = (user.email ?? "DELETE").trim();
  if (typed.toLowerCase() !== expected.toLowerCase()) {
    return fail(
      { ok: false, stages: [{ stage: "confirm", ok: false, detail: `type "${expected}" to confirm` }] },
      400,
    );
  }

  if (!serviceRoleConfigured) {
    // Loud, not silent: without the service-role key the auth user cannot be
    // deleted, so a "success" here would leave the account alive. Refuse the
    // whole operation rather than do the half of it we can.
    return fail(
      {
        ok: false,
        stages: [
          {
            stage: "config",
            ok: false,
            detail: "SUPABASE_SERVICE_ROLE_KEY is not set on this deployment; account deletion is unavailable",
          },
        ],
      },
      503,
    );
  }

  const admin = getAdminSupabase();
  const uid = user.id;

  // ---- 1. enumerate ---------------------------------------------------------

  let roomIds: string[] = [];
  let objects: { bucket: Bucket; path: string }[] = [];
  try {
    const { data: rows, error } = await admin
      .from("projects")
      .select("id,live_room_id")
      .eq("owner", uid);
    if (error) throw new Error(error.message);

    // Two sources, unioned. `public.live_rooms` (migration 0002) is the server's
    // own record of who claimed a room and is the more complete one: a room the
    // user claimed whose project row was since deleted still has a row there,
    // and it would otherwise survive as an orphaned live copy of their scene.
    const claimed = await admin.from("live_rooms").select("room_id").eq("owner", uid);
    if (claimed.error) throw new Error(claimed.error.message);

    roomIds = [
      ...new Set(
        [
          ...(rows ?? []).map((r) => r.live_room_id),
          ...(claimed.data ?? []).map((r) => r.room_id as string),
        ].filter((r): r is string => Boolean(r)),
      ),
    ];
    objects = (await listUserObjects(admin, uid)).map((o) => ({ bucket: o.bucket, path: o.path }));
    stages.push({
      stage: "enumerate",
      ok: true,
      detail: `${rows?.length ?? 0} project(s), ${objects.length} file(s), ${roomIds.length} live room(s)`,
    });
  } catch (e) {
    stages.push({ stage: "enumerate", ok: false, detail: message(e) });
    // Could not even see what we hold — deleting blind would be worse.
    return fail({ ok: false, stages }, 500);
  }

  // ---- 2. live rooms --------------------------------------------------------

  if (roomIds.length) {
    const secret = process.env.LIVEBLOCKS_SECRET_KEY;
    if (!secret) {
      stages.push({
        stage: "live-rooms",
        ok: false,
        detail: `${roomIds.length} shared room(s) hold this account's scenes, but LIVEBLOCKS_SECRET_KEY is not set — cannot delete them`,
      });
      return fail({ ok: false, stages, remaining: roomIds.map((r) => `liveblocks:${r}`) }, 500);
    }
    const liveblocks = new Liveblocks({ secret });
    const survived: string[] = [];
    for (const room of roomIds) {
      try {
        await liveblocks.deleteRoom(room);
      } catch (e) {
        // Already gone is the outcome we wanted; anything else is a failure.
        if (!isNotFound(e)) survived.push(room);
      }
    }
    stages.push({
      stage: "live-rooms",
      ok: survived.length === 0,
      detail: survived.length
        ? `${survived.length} of ${roomIds.length} room(s) could not be deleted`
        : `${roomIds.length} room(s) deleted; share links to them no longer resolve`,
    });
    if (survived.length) return fail({ ok: false, stages, remaining: survived.map((r) => `liveblocks:${r}`) }, 500);
  } else {
    stages.push({ stage: "live-rooms", ok: true, detail: "no shared rooms" });
  }

  // ---- 3. storage, then verify by re-listing ---------------------------------

  const storageErrors: string[] = [];
  for (const bucket of BUCKETS) {
    const paths = objects.filter((o) => o.bucket === bucket).map((o) => o.path);
    if (!paths.length) continue;
    const report = await removeObjects(admin, bucket, paths);
    storageErrors.push(...report.errors);
  }

  let leftover: string[] = [];
  try {
    leftover = (await listUserObjects(admin, uid)).map((o) => `${o.bucket}/${o.path}`);
  } catch (e) {
    // We cannot prove the buckets are empty, so we must not claim they are.
    stages.push({ stage: "storage", ok: false, detail: `deletion ran but verification failed: ${message(e)}` });
    return fail({ ok: false, stages }, 500);
  }

  if (storageErrors.length || leftover.length) {
    stages.push({
      stage: "storage",
      ok: false,
      detail: leftover.length
        ? `${leftover.length} file(s) still present after deletion`
        : storageErrors.join("; "),
    });
    // Stop here: the account stays alive so the user can retry, and so the
    // leftovers keep an owner rather than becoming anonymous orphans.
    return fail({ ok: false, stages, remaining: leftover }, 500);
  }
  stages.push({ stage: "storage", ok: true, detail: `${objects.length} file(s) deleted and verified gone` });

  // ---- 4. database rows -----------------------------------------------------

  try {
    // `projects` cascades to `project_docs`, but deleting docs explicitly means a
    // failure at the second statement still leaves no plan geometry behind.
    const docs = await admin.from("project_docs").delete().eq("owner", uid);
    if (docs.error) throw new Error(docs.error.message);
    const rows = await admin.from("projects").delete().eq("owner", uid);
    if (rows.error) throw new Error(rows.error.message);

    // `live_rooms.owner` cascades from auth.users, so step 5 would clear these
    // anyway — but only if step 5 succeeds. Deleting them here means a failure at
    // the auth stage still leaves no record of which rooms this user owned.
    const claims = await admin.from("live_rooms").delete().eq("owner", uid);
    if (claims.error) throw new Error(claims.error.message);

    const { count, error: countError } = await admin
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("owner", uid);
    if (countError) throw new Error(countError.message);
    if (count) throw new Error(`${count} project row(s) survived deletion`);

    stages.push({ stage: "database", ok: true, detail: "project rows, documents and room claims deleted" });
  } catch (e) {
    stages.push({ stage: "database", ok: false, detail: message(e) });
    return fail({ ok: false, stages }, 500);
  }

  // ---- 5. the auth user -----------------------------------------------------

  try {
    const { error } = await admin.auth.admin.deleteUser(uid);
    if (error) throw new Error(error.message);
    stages.push({ stage: "auth-user", ok: true, detail: "Supabase auth user deleted" });
  } catch (e) {
    stages.push({ stage: "auth-user", ok: false, detail: message(e) });
    // Everything else is already gone; the sign-in still exists. Retrying is
    // safe and cheap — the earlier stages are all no-ops the second time.
    return fail({ ok: false, stages }, 500);
  }

  logRequest({ route: "account/delete", status: 200, ms: 0, userId: uid, reason: "completed" });
  return Response.json({ ok: true, stages } satisfies DeleteReport);
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Liveblocks surfaces HTTP status on the error; a 404 means the room is already gone. */
function isNotFound(e: unknown): boolean {
  const status = (e as { status?: number } | null)?.status;
  return status === 404 || /404|not found/i.test(message(e));
}
