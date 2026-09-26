import type { SupabaseClient } from "@supabase/supabase-js";

// -----------------------------------------------------------------------------
// Pass C of the retention sweep: delete closed abuse reports 12 months after
// they were handled (`public.abuse_reports`, supabase/migrations/0006).
//
// The Privacy Policy (§7) promises exactly this, so it is enforced here rather
// than left to someone remembering. Only `actioned`/`dismissed` rows with a
// `resolved_at` are ever touched — `open`/`in_review` reports are kept however
// old they are, and a closed row with no `resolved_at` (never set by
// scripts/abuse-admin.ts, but possible via a hand edit) is left alone rather
// than guessed at.
// -----------------------------------------------------------------------------

export const ABUSE_REPORT_RETENTION_MONTHS = 12;
export const CLOSED_STATUSES = ["actioned", "dismissed"] as const;

/** Reports resolved strictly before this instant are due. Calendar months, UTC. */
export function abuseReportCutoff(now: Date): string {
  const d = new Date(now.getTime());
  d.setUTCMonth(d.getUTCMonth() - ABUSE_REPORT_RETENTION_MONTHS);
  return d.toISOString();
}

export interface AbusePurgeResult {
  /** Rows deleted (or, on a dry run, that would be). */
  count: number;
  /** Set when the pass could not run at all but that is not an error — the
   *  table does not exist yet on this database. */
  skipped?: string;
  error?: string;
}

// PostgREST reports a missing table as PGRST205 ("Could not find the table");
// raw Postgres as 42P01. Either means migration 0006 is not applied here.
function isMissingTable(error: { code?: string; message?: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|could not find the table/i.test(error.message ?? "");
}

/**
 * Never throws. Deletes at most `budget` rows per run, oldest-resolved first;
 * the next run continues where this one stopped.
 */
export async function purgeResolvedAbuseReports(
  admin: SupabaseClient,
  opts: { dryRun: boolean; budget: number; now?: Date },
): Promise<AbusePurgeResult> {
  if (opts.budget <= 0) return { count: 0 };
  const cutoff = abuseReportCutoff(opts.now ?? new Date());
  try {
    const due = await admin
      .from("abuse_reports")
      .select("id")
      .in("status", [...CLOSED_STATUSES])
      .not("resolved_at", "is", null)
      .lt("resolved_at", cutoff)
      .order("resolved_at", { ascending: true })
      .limit(opts.budget);
    if (due.error) {
      if (isMissingTable(due.error)) return { count: 0, skipped: "abuse_reports: table not present" };
      return { count: 0, error: `abuse_reports: ${due.error.message}` };
    }
    const ids = (due.data ?? []).map((r) => r.id as string);
    if (!ids.length || opts.dryRun) return { count: ids.length };

    // Re-assert every condition on the delete itself, so a report reopened
    // between the select and the delete is not removed.
    const del = await admin
      .from("abuse_reports")
      .delete()
      .in("id", ids)
      .in("status", [...CLOSED_STATUSES])
      .lt("resolved_at", cutoff)
      .select("id");
    if (del.error) return { count: 0, error: `abuse_reports delete: ${del.error.message}` };
    return { count: (del.data ?? []).length };
  } catch (e) {
    return { count: 0, error: `abuse_reports: ${e instanceof Error ? e.message : String(e)}` };
  }
}
