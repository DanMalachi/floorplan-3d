import type { SupabaseClient } from "@supabase/supabase-js";
import { logError } from "@/lib/api/log";

// -----------------------------------------------------------------------------
// Persisting one retention-sweep run to `public.retention_runs`
// (supabase/migrations/0008_retention_runs.sql).
//
// Vercel Hobby keeps roughly 12 hours of function logs, and this route runs
// once a day — so the HTTP response body was, until now, the ONLY record that a
// run happened at all. This module is what makes a run auditable after the
// logs have rotated away.
//
// Kept separate from route.ts so `summaryToRunRow` — the part worth unit
// testing — has no Next.js request/response plumbing around it.
// -----------------------------------------------------------------------------

/** The shape route.ts already builds and returns as JSON. Duplicated here
 *  (rather than imported) so this module has no dependency on route.ts; keep
 *  it in sync with the `Summary` interface there. */
export interface RetentionSummary {
  ok: boolean;
  dryRun: boolean;
  windows: { purgeAfterDays: number; orphanGraceHours: number };
  purged: { projects: number; files: number };
  orphans: { files: number; bytes: number };
  foreignRooms: number;
  skipped: string[];
  errors: string[];
  wouldDelete?: string[];
  capped?: boolean;
}

export type RetentionTrigger = "cron" | "manual";

export interface RetentionRunRow {
  started_at: string;
  finished_at: string;
  dry_run: boolean;
  ok: boolean;
  capped: boolean;
  trigger: RetentionTrigger;
  purged_projects: number;
  purged_files: number;
  orphan_files: number;
  orphan_bytes: number;
  foreign_rooms: number;
  errors_count: number;
  skipped_count: number;
  summary: Record<string, unknown>;
}

/**
 * Vercel Cron requests this route with `Authorization: Bearer $CRON_SECRET`
 * (already required to get this far) and a `vercel-cron/…` User-Agent. Nothing
 * else the app controls sets that header, so its presence is a reasonable
 * (not cryptographic) signal that this was the scheduled run rather than
 * someone curling the endpoint by hand.
 */
export function retentionTrigger(request: Request): RetentionTrigger {
  return /vercel-cron/i.test(request.headers.get("user-agent") ?? "") ? "cron" : "manual";
}

/**
 * Map a run's Summary to the row this module persists. Pure and side-effect
 * free so it can be unit tested without a database.
 *
 * PRIVACY: deliberately drops `wouldDelete` (a dry run's concrete list of
 * project ids, room ids and `<user id>/<file>` storage paths — see the
 * migration's header comment) and collapses `errors`/`skipped` — which
 * interpolate project/room ids into free text — down to counts. Everything
 * else in Summary is already a count or a boolean and is kept as-is.
 */
export function summaryToRunRow(
  summary: RetentionSummary,
  startedAt: Date,
  finishedAt: Date,
  trigger: RetentionTrigger,
): RetentionRunRow {
  const redactedSummary = {
    ok: summary.ok,
    dryRun: summary.dryRun,
    windows: summary.windows,
    purged: summary.purged,
    orphans: summary.orphans,
    foreignRooms: summary.foreignRooms,
    capped: Boolean(summary.capped),
    errorsCount: summary.errors.length,
    skippedCount: summary.skipped.length,
  };

  return {
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    dry_run: summary.dryRun,
    ok: summary.ok,
    capped: Boolean(summary.capped),
    trigger,
    purged_projects: summary.purged.projects,
    purged_files: summary.purged.files,
    orphan_files: summary.orphans.files,
    orphan_bytes: summary.orphans.bytes,
    foreign_rooms: summary.foreignRooms,
    errors_count: summary.errors.length,
    skipped_count: summary.skipped.length,
    summary: redactedSummary,
  };
}

/** How long a row is kept. Matches the migration's stated policy — change
 *  both together. */
const RETENTION_RUNS_MAX_AGE_DAYS = 180;

/**
 * Insert this run's row and prune anything older than
 * RETENTION_RUNS_MAX_AGE_DAYS, so the audit table itself stays bounded rather
 * than growing forever.
 *
 * Never throws: a logging failure must not turn a successful (or already-
 * failed) sweep into a 500 the caller didn't cause. Failures are reported to
 * Sentry/console via `logError` and to the caller via the returned result, so
 * the gap is visible without being fatal.
 */
export async function persistRetentionRun(
  admin: SupabaseClient,
  row: RetentionRunRow,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await admin.from("retention_runs").insert(row);
    if (error) throw new Error(error.message);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logError("api/account/retention:log", e, { stage: "insert" });
    return { ok: false, error: message };
  }

  try {
    const cutoff = new Date(Date.now() - RETENTION_RUNS_MAX_AGE_DAYS * 86_400_000).toISOString();
    const { error } = await admin.from("retention_runs").delete().lt("started_at", cutoff);
    if (error) throw new Error(error.message);
  } catch (e) {
    // The new row is already written; failing to prune old ones is a growth
    // problem, not a data-loss one, so it is reported but does not flip `ok`.
    logError("api/account/retention:log", e, { stage: "prune" });
  }

  return { ok: true };
}
