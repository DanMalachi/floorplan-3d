/**
 * Abuse/takedown admin helper — service role, run locally by Dan. NOT an app
 * route: this app has no admin-auth model yet, so the only thing standing
 * between "anyone" and this data is possessing SUPABASE_SERVICE_ROLE_KEY,
 * which already bypasses every RLS policy in the database (see
 * src/lib/supabase/admin.ts). Running this script IS holding that key.
 *
 * UNVERIFIED: written in a worktree with no node_modules (see the branch this
 * shipped on) and never executed. Read a command's code before trusting it,
 * especially disable-room and remove-asset, which delete real data.
 *
 * Setup: needs the same env vars the app's own service-role routes need —
 * NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — plus
 * LIVEBLOCKS_SECRET_KEY for disable-room. Node 20.6+'s --env-file loads a
 * .env.local without adding a dependency (this repo has no dotenv):
 *
 *   npx tsx --env-file=.env.local scripts/abuse-admin.ts <command> [args]
 *
 * Commands:
 *   list [status]                     Reports, newest first. status defaults
 *                                      to "open,in_review"; pass "all" for
 *                                      every status, or a comma list.
 *   show <report-id>                  Full detail of one report, plus a
 *                                      best-effort correlation to a room and
 *                                      the project that owns it.
 *   set-status <id> <status> [note]   status: open | in_review | actioned |
 *                                      dismissed. note is optional free text,
 *                                      wrap it in quotes.
 *   find-room <room-or-url>           Resolve a floorplan-<id> room (or a
 *                                      pasted .../v/floorplan-<id>?g=... share
 *                                      URL) to its live_rooms claim and the
 *                                      project that references it.
 *   find-project <project-id>         Look up one project and its owner.
 *   disable-room <room-or-url> [--yes]
 *                                      Delete the Liveblocks room (kills live
 *                                      collaboration on it right now) and
 *                                      detach it from its project. Dry-run
 *                                      unless --yes is passed. Does NOT touch
 *                                      the owner's saved plan — only the live
 *                                      session.
 *   remove-asset <bucket> <path> [--yes]
 *                                      Delete one object from the plans/thumbs
 *                                      bucket (path is `<uid>/<id>.<ext>`, as
 *                                      shown by find-project). Dry-run unless
 *                                      --yes. Permanent — there is no backup.
 *
 * See docs/TAKEDOWN.md for the runbook these commands support.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { Liveblocks } from "@liveblocks/node";
import { getAdminSupabase, serviceRoleConfigured } from "../src/lib/supabase/admin";
import { BUCKETS, listObjects, removeObjects, type Bucket } from "../src/lib/supabase/accountData";

const STATUSES = ["open", "in_review", "actioned", "dismissed"] as const;

/** Matches ROOM_RE in src/lib/api/roomPolicy.ts, but as a substring search so
 *  a whole pasted share URL (`.../v/floorplan-xxxx?g=...`) also resolves. */
const ROOM_IN_TEXT = /floorplan-[A-Za-z0-9][A-Za-z0-9_-]{3,63}/;
const roomIdFrom = (input: string): string => ROOM_IN_TEXT.exec(input)?.[0] ?? input;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }
  if (!serviceRoleConfigured) {
    fail("SUPABASE_SERVICE_ROLE_KEY (and NEXT_PUBLIC_SUPABASE_URL) must be set in the environment. See docs/TAKEDOWN.md.");
  }
  const admin = getAdminSupabase();
  const yes = rest.includes("--yes");

  switch (command) {
    case "list":
      return list(admin, rest[0]);
    case "show":
      return show(admin, requireArg(rest[0], "report-id"));
    case "set-status":
      return setStatus(admin, requireArg(rest[0], "report-id"), requireArg(rest[1], "status"), rest.slice(2).join(" ").trim() || null);
    case "find-room":
      return findRoom(admin, requireArg(rest[0], "room-or-url"));
    case "find-project":
      return findProject(admin, requireArg(rest[0], "project-id"));
    case "disable-room":
      return disableRoom(admin, requireArg(rest[0], "room-or-url"), yes);
    case "remove-asset":
      return removeAsset(admin, requireArg(rest[0], "bucket") as Bucket, requireArg(rest[1], "path"), yes);
    default:
      console.error(`Unknown command "${command}".\n`);
      printHelp();
      process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

async function list(admin: SupabaseClient, statusArg?: string): Promise<void> {
  const statuses = !statusArg ? ["open", "in_review"] : statusArg === "all" ? null : statusArg.split(",").map((s) => s.trim());

  let query = admin
    .from("abuse_reports")
    .select("id,created_at,target_kind,target_id,reason,status")
    .order("created_at", { ascending: false })
    .limit(200);
  if (statuses) query = query.in("status", statuses);

  const { data, error } = await query;
  if (error) fail(error.message);
  const rows = (data ?? []) as Array<{
    id: string;
    created_at: string;
    target_kind: string;
    target_id: string;
    reason: string;
    status: string;
  }>;
  if (!rows.length) {
    console.log("No reports.");
    return;
  }
  for (const r of rows) {
    console.log(`${r.created_at}  ${pad(r.status, 10)} ${pad(r.target_kind, 11)} ${pad(r.reason, 16)} ${r.id}  ${truncate(r.target_id, 60)}`);
  }
  console.log(`\n${rows.length} report(s). Use "show <id>" for full detail.`);
}

async function show(admin: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await admin.from("abuse_reports").select("*").eq("id", id).maybeSingle();
  if (error) fail(error.message);
  if (!data) fail(`No report with id ${id}.`);
  console.log(JSON.stringify(data, null, 2));

  const row = data as { target_kind: string; target_id: string };
  if (row.target_kind === "project" && /^[0-9a-f-]{36}$/i.test(row.target_id)) {
    console.log("\n--- target looks like a project id ---");
    await findProject(admin, row.target_id);
  }
  if (ROOM_IN_TEXT.test(row.target_id)) {
    console.log("\n--- target contains a room id ---");
    await findRoom(admin, row.target_id);
  }
}

async function setStatus(admin: SupabaseClient, id: string, status: string, note: string | null): Promise<void> {
  if (!(STATUSES as readonly string[]).includes(status)) {
    fail(`status must be one of: ${STATUSES.join(", ")}`);
  }
  const patch: Record<string, unknown> = { status };
  if (note) patch.operator_note = note;
  if (status === "actioned" || status === "dismissed") patch.resolved_at = new Date().toISOString();

  const { data, error } = await admin.from("abuse_reports").update(patch).eq("id", id).select("id,status").maybeSingle();
  if (error) fail(error.message);
  if (!data) fail(`No report with id ${id}.`);
  console.log(`Report ${id} -> ${status}${note ? ` (note recorded)` : ""}`);
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

async function findProject(admin: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await admin
    .from("projects")
    .select("id,owner,name,created_at,updated_at,deleted_at,plan_image_path,thumb_path,live_room_id")
    .eq("id", id)
    .maybeSingle();
  if (error) fail(error.message);
  if (!data) {
    console.log(`No project with id ${id}.`);
    return;
  }
  console.log("Project:", JSON.stringify(data, null, 2));

  const owner = (data as { owner: string }).owner;
  const { data: userData } = await admin.auth.admin.getUserById(owner);
  if (userData?.user) console.log(`Owner: ${userData.user.email ?? "(no email on file)"} (${owner})`);
}

async function findRoom(admin: SupabaseClient, input: string): Promise<void> {
  const room = roomIdFrom(input);
  console.log(`Room id: ${room}`);

  const { data: claim } = await admin.from("live_rooms").select("room_id,owner,created_at").eq("room_id", room).maybeSingle();
  if (claim) {
    console.log(`live_rooms claim: owner=${(claim as { owner: string }).owner} created=${(claim as { created_at: string }).created_at}`);
  } else {
    console.log("No claim row in public.live_rooms for this room (an older 8-character room, or never opened while signed in).");
  }

  const { data: proj } = await admin.from("projects").select("id,owner,name,deleted_at").eq("live_room_id", room).maybeSingle();
  if (proj) {
    const p = proj as { id: string; owner: string; name: string; deleted_at: string | null };
    console.log(`Project referencing this room: ${p.id} "${p.name}" owner=${p.owner}${p.deleted_at ? ` (deleted_at=${p.deleted_at})` : ""}`);
  } else {
    console.log("No project currently has live_room_id set to this room.");
  }
}

// ---------------------------------------------------------------------------
// Actions — everything below writes or deletes. Dry-run unless --yes.
// ---------------------------------------------------------------------------

async function disableRoom(admin: SupabaseClient, input: string, apply: boolean): Promise<void> {
  const room = roomIdFrom(input);
  console.log(`${apply ? "Disabling" : "[dry run] Would disable"} room ${room}\n`);
  await findRoom(admin, room);

  if (!apply) {
    console.log("\nRe-run with --yes to actually delete the Liveblocks room and detach it from its project.");
    return;
  }

  const secret = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!secret) fail("LIVEBLOCKS_SECRET_KEY is not set; cannot delete the Liveblocks room.");
  const liveblocks = new Liveblocks({ secret });
  try {
    await liveblocks.deleteRoom(room);
    console.log(`\nLiveblocks room ${room} deleted (or was already gone).`);
  } catch (e) {
    const status = (e as { status?: number } | null)?.status;
    if (status !== 404) fail(`Could not delete the Liveblocks room: ${message(e)}`);
    console.log(`\nLiveblocks room ${room} was already gone.`);
  }

  // Detach so the owner's next "Go live" mints a fresh room instead of
  // resurrecting this one under the same id.
  const detached = await admin.from("projects").update({ live_room_id: null }).eq("live_room_id", room).select("id");
  if (detached.error) fail(`Room deleted, but could not detach the project: ${detached.error.message}`);
  console.log(`Detached ${detached.data?.length ?? 0} project row(s) from this room id.`);

  const claim = await admin.from("live_rooms").delete().eq("room_id", room);
  if (claim.error) console.warn(`Room deleted and detached, but could not clear the live_rooms claim: ${claim.error.message}`);
  else console.log("Cleared the live_rooms ownership claim, if any.");

  console.log("\nDone. The owner's saved plan (projects/project_docs rows and files) is untouched — only the live collaboration session was removed.");
}

async function removeAsset(admin: SupabaseClient, bucket: Bucket, path: string, apply: boolean): Promise<void> {
  if (!(BUCKETS as readonly string[]).includes(bucket)) {
    fail(`bucket must be one of: ${BUCKETS.join(", ")}`);
  }
  console.log(`${apply ? "Removing" : "[dry run] Would remove"} ${bucket}/${path}`);
  if (!apply) {
    console.log("Re-run with --yes to actually delete it. This is permanent — there is no backup to restore from.");
    return;
  }

  const report = await removeObjects(admin, bucket, [path]);
  if (report.errors.length) fail(report.errors.join("; "));

  // Verify by re-listing rather than trusting the response — same reasoning
  // as src/app/api/account/delete/route.ts: remove() reporting no error is
  // not proof, the re-list is.
  const owner = path.split("/")[0];
  const remaining = await listObjects(admin, bucket, owner);
  const stillThere = remaining.some((o) => o.path === path);
  console.log(stillThere ? `WARNING: ${path} still appears in the bucket listing after removal.` : `Confirmed gone: ${bucket}/${path}`);
  console.log(
    "\nNote: this only removes the file from storage. If the project row still points at it (plan_image_path/thumb_path), " +
      "the app will show a broken image until the owner re-uploads or the project is otherwise fixed up. " +
      "See docs/TAKEDOWN.md for when that tradeoff is the right call.",
  );
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function requireArg(v: string | undefined, name: string): string {
  if (!v) fail(`missing argument: <${name}>`);
  return v;
}

function fail(msg: string): never {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function printHelp(): void {
  console.log(`Abuse/takedown admin helper. See the docblock at the top of this file, or docs/TAKEDOWN.md.

Usage:
  npx tsx --env-file=.env.local scripts/abuse-admin.ts <command> [args]

Commands:
  list [status]
  show <report-id>
  set-status <report-id> <open|in_review|actioned|dismissed> [note]
  find-room <room-or-url>
  find-project <project-id>
  disable-room <room-or-url> [--yes]
  remove-asset <plans|thumbs> <path> [--yes]`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
