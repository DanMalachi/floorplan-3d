import { Liveblocks } from "@liveblocks/node";
import { getAdminSupabase, serviceRoleConfigured } from "@/lib/supabase/admin";
import {
  BUCKETS,
  listObjects,
  listUserFolders,
  projectIdFromPath,
  removeObjects,
  type Bucket,
  type StoredObject,
} from "@/lib/supabase/accountData";

// -----------------------------------------------------------------------------
// GET /api/account/retention — the scheduled retention sweep.
//
// Runs on a server-side cron with NO user session, which is the whole point: the
// data that most needs a lifecycle belongs to accounts nobody is opening. A
// client-side cleanup would only ever fire for users who are still active — the
// exact population whose files are still in use.
//
// Two passes, both idempotent, both safe to run twice in a row:
//
//   A. PURGE — a project the user deleted is soft-deleted (`deleted_at` set) so
//      their other devices learn it is gone. That tombstone is a sync mechanism,
//      not a retention policy: without this pass the row and its plan image live
//      forever. After RETENTION_PURGE_DAYS the files are deleted and the row goes
//      with them.
//
//   B. ORPHAN SWEEP — files in the buckets that no live project points at:
//        • uploads whose row push failed or conflicted (syncEngine uploads the
//          image BEFORE writing the row, so this window genuinely exists);
//        • superseded uploads — re-importing a JPEG over a PNG writes a new path
//          and leaves `<id>.png` behind, referenced by nothing;
//        • leftovers under a uid with no auth user, i.e. an account deletion that
//          failed partway.
//      Only files older than RETENTION_ORPHAN_GRACE_HOURS are touched, so a file
//      uploaded seconds before its row is never mistaken for an orphan.
//
// SAFETY RAILS, because this deletes things nobody is watching:
//   • `?dryRun=1` reports exactly what it would delete and deletes nothing. Run
//     this first after deploying, and after changing either window.
//   • MAX_DELETES_PER_RUN caps the blast radius of a bug. Hitting the cap is
//     reported, and the next run continues where this one stopped.
//   • A bucket whose listing errored is SKIPPED entirely. "I couldn't read it"
//     must never be evaluated as "it has nothing in it".
//   • A project row is only deleted after its files are verifiably gone; a file
//     whose owner we could not resolve is left alone.
// -----------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PURGE_DAYS = num(process.env.RETENTION_PURGE_DAYS, 30);
const GRACE_HOURS = num(process.env.RETENTION_ORPHAN_GRACE_HOURS, 48);
const MAX_DELETES_PER_RUN = 5000;

function num(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

interface Summary {
  ok: boolean;
  dryRun: boolean;
  windows: { purgeAfterDays: number; orphanGraceHours: number };
  purged: { projects: number; files: number };
  orphans: { files: number; bytes: number };
  skipped: string[];
  errors: string[];
  /** Populated on a dry run — the actual list, so it can be eyeballed. */
  wouldDelete?: string[];
  capped?: boolean;
}

export async function GET(request: Request) {
  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET` on every scheduled
  // invocation once CRON_SECRET is set in the project. Without the secret set we
  // refuse rather than run open: this endpoint deletes data, so an unauthenticated
  // caller must never be able to trigger it (or to time it, to widen the race
  // against an in-flight upload).
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET is not set; retention sweep disabled", { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("forbidden", { status: 403 });
  }
  if (!serviceRoleConfigured) {
    return new Response("SUPABASE_SERVICE_ROLE_KEY is not set; retention sweep disabled", { status: 503 });
  }

  const dryRun = new URL(request.url).searchParams.has("dryRun");
  const admin = getAdminSupabase();
  const summary: Summary = {
    ok: true,
    dryRun,
    windows: { purgeAfterDays: PURGE_DAYS, orphanGraceHours: GRACE_HOURS },
    purged: { projects: 0, files: 0 },
    orphans: { files: 0, bytes: 0 },
    skipped: [],
    errors: [],
  };
  const wouldDelete: string[] = [];
  let budget = MAX_DELETES_PER_RUN;

  // ---- pass A: purge soft-deleted projects past the window ------------------

  const purgeCutoff = new Date(Date.now() - PURGE_DAYS * 86_400_000).toISOString();
  try {
    const { data, error } = await admin
      .from("projects")
      .select("id,owner,deleted_at,live_room_id")
      .not("deleted_at", "is", null)
      .lt("deleted_at", purgeCutoff);
    if (error) throw new Error(error.message);

    for (const row of data ?? []) {
      if (budget <= 0) break;
      const owner = row.owner as string;
      const id = row.id as string;

      // Find the files by prefix rather than by column: a row's
      // `plan_image_path` can be stale or null while an object still exists.
      let files: StoredObject[];
      try {
        files = (await Promise.all(BUCKETS.map((b) => listObjects(admin, b, owner)))).flat();
      } catch (e) {
        summary.errors.push(`purge ${id}: ${msg(e)}`);
        summary.ok = false;
        continue;
      }
      const mine = files.filter((f) => projectIdFromPath(f.path) === id);

      if (dryRun) {
        wouldDelete.push(
          `purge project ${id} (+${mine.length} file(s)${row.live_room_id ? `, live room ${row.live_room_id}` : ""})`,
        );
        summary.purged.projects++;
        summary.purged.files += mine.length;
        budget -= mine.length + 1;
        continue;
      }

      let failed = false;
      for (const bucket of BUCKETS) {
        const paths = mine.filter((f) => f.bucket === bucket).map((f) => f.path);
        if (!paths.length) continue;
        const report = await removeObjects(admin, bucket, paths);
        if (report.errors.length) {
          summary.errors.push(...report.errors);
          failed = true;
        }
      }
      // Files first, row second. If the row went first, the surviving files
      // would still be caught by pass B — but only after they had lost the
      // last record of who they belonged to.
      if (failed) {
        summary.ok = false;
        summary.skipped.push(`project ${id}: files failed to delete, row kept for the next run`);
        continue;
      }
      // A plan that had gone live left its scene in a Liveblocks room. Deleting
      // the row without deleting the room would leave a full copy of the plan
      // live on a third party for ever, still reachable by any share link that
      // has not yet expired — the deletion the user asked for, not honoured.
      const room = row.live_room_id as string | null;
      if (room) {
        const deleted = await deleteLiveRoom(room);
        if (!deleted) {
          summary.errors.push(`purge ${id}: live room ${room} could not be deleted`);
          summary.ok = false;
          summary.skipped.push(`project ${id}: row kept so the room is retried next run`);
          continue;
        }
        const claim = await admin.from("live_rooms").delete().eq("room_id", room).eq("owner", owner);
        if (claim.error) summary.errors.push(`purge ${id}: room claim ${room}: ${claim.error.message}`);
      }

      const del = await admin.from("projects").delete().eq("id", id).eq("owner", owner);
      if (del.error) {
        summary.errors.push(`purge row ${id}: ${del.error.message}`);
        summary.ok = false;
        continue;
      }
      summary.purged.projects++;
      summary.purged.files += mine.length;
      budget -= mine.length + 1;
    }
  } catch (e) {
    summary.errors.push(`purge pass: ${msg(e)}`);
    summary.ok = false;
  }

  // ---- pass B: orphaned objects ---------------------------------------------

  const graceCutoff = Date.now() - GRACE_HOURS * 3_600_000;
  // uid → set of project ids that still exist (any state), plus the paths those
  // rows actually reference. Cached per run; a sweep touches each owner once.
  const known = new Map<string, { ids: Set<string>; paths: Set<string>; exists: boolean }>();

  async function ownerFacts(uid: string) {
    const cached = known.get(uid);
    if (cached) return cached;
    const { data, error } = await admin
      .from("projects")
      .select("id,plan_image_path,thumb_path")
      .eq("owner", uid);
    if (error) throw new Error(`owner ${uid}: ${error.message}`);
    const ids = new Set<string>();
    const paths = new Set<string>();
    for (const row of data ?? []) {
      ids.add(row.id as string);
      if (row.plan_image_path) paths.add(row.plan_image_path as string);
      if (row.thumb_path) paths.add(row.thumb_path as string);
    }
    // No rows at all is ambiguous — a brand-new account mid-first-upload looks
    // identical to a deleted one. Ask the auth system which it is.
    let exists = true;
    if (ids.size === 0) {
      const { data: u } = await admin.auth.admin.getUserById(uid);
      exists = Boolean(u?.user);
    }
    const facts = { ids, paths, exists };
    known.set(uid, facts);
    return facts;
  }

  for (const bucket of BUCKETS) {
    let folders: string[];
    try {
      folders = await listUserFolders(admin, bucket);
    } catch (e) {
      // Cannot enumerate this bucket — skip it whole. Deleting on the basis of a
      // partial listing is how a sweep eats live data.
      summary.skipped.push(`bucket ${bucket}: ${msg(e)}`);
      summary.ok = false;
      continue;
    }

    for (const uid of folders) {
      if (budget <= 0) break;
      let objects: StoredObject[];
      let facts: { ids: Set<string>; paths: Set<string>; exists: boolean };
      try {
        objects = await listObjects(admin, bucket as Bucket, uid);
        facts = await ownerFacts(uid);
      } catch (e) {
        summary.skipped.push(`${bucket}/${uid}: ${msg(e)}`);
        summary.ok = false;
        continue;
      }

      const doomed: StoredObject[] = [];
      for (const object of objects) {
        // Unknown age: we cannot prove the grace period has passed, so leave it.
        if (object.createdAt === null || object.createdAt > graceCutoff) continue;
        const projectId = projectIdFromPath(object.path);
        const referenced = facts.paths.has(object.path);
        const orphan = !facts.exists || projectId === null || !facts.ids.has(projectId) || !referenced;
        if (orphan) doomed.push(object);
      }
      if (!doomed.length) continue;

      const take = doomed.slice(0, Math.max(0, budget));
      if (take.length < doomed.length) summary.capped = true;
      budget -= take.length;
      summary.orphans.files += take.length;
      summary.orphans.bytes += take.reduce((sum, o) => sum + (o.size ?? 0), 0);

      if (dryRun) {
        wouldDelete.push(...take.map((o) => `${o.bucket}/${o.path}`));
        continue;
      }
      const report = await removeObjects(admin, bucket as Bucket, take.map((o) => o.path));
      if (report.errors.length) {
        summary.errors.push(...report.errors);
        summary.ok = false;
      }
    }
  }

  if (budget <= 0) summary.capped = true;
  if (dryRun) summary.wouldDelete = wouldDelete;
  return Response.json(summary, { status: summary.ok ? 200 : 500 });
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Delete a Liveblocks room. True means it is gone (including "was already gone"
 * — a 404 is the outcome we wanted). False means it may still be there, and the
 * caller keeps the project row so the next run retries.
 *
 * Returns false rather than throwing when the key is missing: a deployment
 * without Liveblocks has no rooms to delete, but if a row names one we must not
 * pretend it was removed.
 */
async function deleteLiveRoom(roomId: string): Promise<boolean> {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!secret) return false;
  try {
    await new Liveblocks({ secret }).deleteRoom(roomId);
    return true;
  } catch (e) {
    const status = (e as { status?: number } | null)?.status;
    return status === 404 || /404|not found/i.test(msg(e));
  }
}
