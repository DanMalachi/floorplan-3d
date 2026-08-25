-- Abuse / takedown reports: the one place anyone — signed in or not — can flag
-- a project, a share link, a live room, or an uploaded plan/thumbnail image as
-- infringing, abusive, or otherwise reportable. Run this once in the Supabase
-- SQL editor. See docs/TAKEDOWN.md for how Dan works a report end to end.
--
-- UNVERIFIED: this migration has not been run against any Supabase project.
-- Read it before applying — see docs/TAKEDOWN.md "Before you run this".
--
-- ---------------------------------------------------------------------------
-- WHO CAN WRITE HERE
--
-- Nobody, directly. There is deliberately no INSERT grant and no RLS policy for
-- `anon` or `authenticated` on this table. If there were — even one gated by a
-- check constraint — a caller could skip the app's rate limiter entirely and
-- POST straight at PostgREST, since Supabase's REST API is just another door
-- onto the same table. The ONLY way a row is written is
-- src/app/api/abuse-report/route.ts, which is rate-limited hard and writes
-- with the service-role client — the same pattern account deletion
-- (src/app/api/account/delete/route.ts) and the retention sweep already use.
-- See src/lib/supabase/admin.ts.
--
-- WHO CAN READ HERE
--
-- Also nobody but the service role. A report names a target the reporter does
-- not own, and its free-text fields may contain a real name, an address, or
-- other detail about a stranger (the uploader) or about the reporter. There is
-- no "owner" column this could sensibly be scoped to — an owner-scoped policy
-- would in fact be backwards, since letting the reported party read reports
-- filed against them is the opposite of what this table is for. So: RLS
-- enabled, zero policies, nothing granted to anon or authenticated. Dan reads
-- and updates reports with scripts/abuse-admin.ts (service role, run locally),
-- never through an authenticated app route — see CLAUDE.md-adjacent note in
-- that script and docs/TAKEDOWN.md for why no admin route exists yet.
-- ---------------------------------------------------------------------------

create table if not exists public.abuse_reports (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),

  -- What is being reported. target_id's shape depends on target_kind: a
  -- project uuid, a `floorplan-<id>` room id, the full share/live URL, a
  -- description of an uploaded image, or free text for "other". Kept as
  -- unconstrained text on purpose — the reporter cannot see storage paths
  -- (the `plans`/`thumbs` buckets are private, no public URLs, per
  -- docs/DATA_RETENTION.md §2.1), so whatever they can paste is whatever we
  -- get, and refusing a report because its id doesn't parse would just lose
  -- the report. Dan correlates it by hand — docs/TAKEDOWN.md "Finding the
  -- target". Values here MUST match abuseTargetKindSchema /
  -- abuseReasonSchema in src/lib/api/schemas.ts — change both together.
  target_kind      text not null check (target_kind in ('project', 'share_link', 'live_room', 'asset', 'other')),
  target_id        text not null check (char_length(target_id) between 1 and 2000),

  reason           text not null check (reason in
                     ('copyright', 'privacy', 'illegal_content', 'harassment', 'malware', 'spam', 'other')),
  detail           text not null check (char_length(detail) between 1 and 5000),

  -- Optional: how to reach the reporter about the outcome. Never required —
  -- an abuse-reporting flow that forces identification suppresses reports.
  reporter_contact text check (reporter_contact is null or char_length(reporter_contact) <= 320),

  status           text not null default 'open' check (status in ('open', 'in_review', 'actioned', 'dismissed')),
  -- Set by Dan via scripts/abuse-admin.ts when he changes status; never
  -- written by the public report route.
  operator_note    text check (operator_note is null or char_length(operator_note) <= 5000),
  resolved_at      timestamptz
);

-- Triage queue (open/in_review first, newest first) and "everything reported
-- about this target" respectively.
create index if not exists abuse_reports_status_idx on public.abuse_reports (status, created_at desc);
create index if not exists abuse_reports_target_idx on public.abuse_reports (target_kind, target_id);

alter table public.abuse_reports enable row level security;

-- No policies at all. RLS with zero policies denies every row to every role
-- except the service role, which bypasses RLS entirely (see
-- src/lib/supabase/admin.ts) — the same "deny by omission" public.live_rooms
-- uses for writes in migration 0002. Explicit revoke below is belt-and-braces:
-- even if a future migration adds a grant here by copy-paste mistake, RLS
-- still has no policy to let it through.
revoke all on public.abuse_reports from anon, authenticated;

-- ...but bypassing RLS is only half of it, and assuming otherwise is what broke
-- the other two migrations. BYPASSRLS exempts service_role from the row
-- policies; whether it may touch the table AT ALL is a separate gate, and a
-- modern Supabase project hands the API roles no blanket privileges on `public`.
-- 0001 and 0002 both granted to `authenticated` only, so every service-role path
-- died on "permission denied for table ..." — the nightly retention sweep never
-- once ran, and account deletion could not get past enumerating. This table is
-- read and written EXCLUSIVELY by the service role, so without the grant below
-- it would not merely be restricted, it would be unusable by its only caller.
--
-- This does not widen access by one row: anon and authenticated are revoked
-- above, and RLS still has no policy for anyone. See 0004_service_role_grants.sql
-- on accounts-cloud-sync, which repairs the two tables that shipped without it.
grant select, insert, update, delete on public.abuse_reports to service_role;
