import { z } from "zod";
import { readJson, KB } from "@/lib/api/body";
import { optionalUser } from "@/lib/api/auth";
import { apiError, unavailable } from "@/lib/api/http";
import { enforceRateLimit, rateLimitIdentity } from "@/lib/api/rateLimit";
import { logRequest } from "@/lib/api/log";
import { getAdminSupabase, serviceRoleConfigured } from "@/lib/supabase/admin";
import { abuseReasonSchema, abuseTargetKindSchema } from "@/lib/api/schemas";

// -----------------------------------------------------------------------------
// POST /api/abuse-report — file a takedown/abuse report. Unauthenticated by
// design: most people who need this have no account and should never be asked
// to make one. See docs/TAKEDOWN.md for how Dan works a report once filed.
//
// THIS IS THE ONE ABUSE-FACING ENDPOINT IN THE APP THAT NEEDS NO PRIOR STATE AT
// ALL. /api/share and /api/liveblocks-auth are reachable without an account too,
// but both require either room ownership or an already-valid signed grant before
// they do anything — this route requires nothing but a POST. That makes it the
// obvious spam target, so unlike those two ("abuse" rate-limit class, degrades
// to per-instance memory limiting if Upstash isn't configured — see
// rateLimit.ts), this route is classed "cost": in production, no durable
// rate-limit backend means the route refuses to run rather than falling back to
// a per-instance counter that is "near-useless on serverless" (rateLimit.ts's
// own words). A reporting feature that is briefly unavailable is a much smaller
// problem than an unbounded public insert into the database.
//
// FAIL CLOSED, EVERYWHERE:
//   - no SUPABASE_SERVICE_ROLE_KEY  -> 503, nothing written
//   - no rate-limit backend in prod -> 503, nothing written
//   - bad body                      -> 400, nothing written
//   - insert fails                  -> 500, generic message
// Every success and every refusal returns the SAME shape regardless of what was
// reported, and the route never queries projects/live_rooms/storage to check
// whether the target exists — doing that would let a caller binary-search
// arbitrary ids into existence/non-existence via this endpoint. Existence is
// something Dan checks by hand afterward (docs/TAKEDOWN.md), not something this
// route reveals.
// -----------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  targetKind: abuseTargetKindSchema,
  // Free text: a project id, a `floorplan-<id>` room id, a full share/live URL,
  // or a description. See the column comment in
  // supabase/migrations/0003_abuse_reports.sql for why this isn't parsed.
  targetId: z.string().trim().min(1, "required").max(2000),
  reason: abuseReasonSchema,
  detail: z.string().trim().min(1, "required").max(5000),
  reporterContact: z.string().trim().max(320).optional(),
  // Honeypot. A real visitor never sees or fills this field (see
  // src/app/report/page.tsx) — a script that fills every input in the form
  // does. Filling it does not change the HTTP response in any way; it only
  // makes the route skip the database write. Never surfaced as an error,
  // because telling a bot "you got caught" just teaches it to leave this one
  // field blank.
  website: z.string().max(200).optional(),
});

const ACK = { ok: true, message: "Report received. Thank you." } as const;

export async function POST(req: Request) {
  const started = Date.now();

  if (!serviceRoleConfigured) {
    return unavailable(
      "reporting is not configured",
      "set SUPABASE_SERVICE_ROLE_KEY so reports can be recorded",
    );
  }

  const user = await optionalUser();
  const identity = rateLimitIdentity(req, user?.id);

  // Two tiers: tight per-caller (IP, or account if signed in), and a coarse
  // system-wide ceiling so a botnet spreading requests across many IPs still
  // can't turn this into an unbounded insert stream. Per-identity is checked
  // first since it is the more informative refusal for a real person who is
  // just impatient.
  const perCaller = await enforceRateLimit("abuse-report", identity, {
    limit: 5,
    windowSec: 600, // 5 reports per 10 minutes per caller
    kind: "cost",
  });
  if (perCaller) return perCaller;

  const global = await enforceRateLimit("abuse-report:global", "all", {
    limit: 200,
    windowSec: 3600, // 200 reports per hour, system-wide
    kind: "cost",
  });
  if (global) return global;

  const parsed = await readJson(req, bodySchema, 64 * KB);
  if (!parsed.ok) return parsed.response;
  const { targetKind, targetId, reason, detail, reporterContact, website } = parsed.data;

  // Honeypot tripped: behave exactly as success, write nothing. Do not log a
  // distinct reason either at info level — logging it is fine (this log never
  // leaves the server), but keeping the code path identical to the real
  // success path below reduces the chance a future edit accidentally makes the
  // two observably different.
  if (website) {
    logRequest({ route: "abuse-report", status: 200, ms: Date.now() - started, userId: user?.id ?? null, reason: "honeypot" });
    return Response.json(ACK);
  }

  try {
    const admin = getAdminSupabase();
    const { error } = await admin.from("abuse_reports").insert({
      target_kind: targetKind,
      target_id: targetId,
      reason,
      detail,
      reporter_contact: reporterContact || null,
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    logRequest({
      route: "abuse-report",
      status: 500,
      ms: Date.now() - started,
      userId: user?.id ?? null,
      reason: "insert-failed",
    });
    // Generic on purpose — an internal error message here must not become a
    // side channel for probing the schema or the database's health.
    return apiError(500, "could not submit report", "please try again in a moment");
  }

  // TODO(email): send the reporter an acknowledgement here, once
  // src/lib/email/ exists (owned by a separate branch as of this writing).
  // Only do this when reporterContact was actually given — most reporters
  // leave it blank on purpose (see src/app/report/page.tsx) — and keep the
  // content as neutral as this route's own response: an ack that a report was
  // received, never confirmation of what it was about or what happens next.
  logRequest({ route: "abuse-report", status: 200, ms: Date.now() - started, userId: user?.id ?? null });
  return Response.json(ACK);
}
