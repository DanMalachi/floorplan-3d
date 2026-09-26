-- Audit log for the nightly retention sweep. Run this once in the Supabase SQL
-- editor. Numbered 0008: 0006 and 0007 are taken by PRs #44 and #45, already
-- applied in prod by Dan.
--
-- WHY THIS TABLE EXISTS
--
-- `GET /api/account/retention` (src/app/api/account/retention/route.ts) returns
-- its run Summary only in the HTTP response. Vercel Hobby keeps roughly 12 hours
-- of function logs, and the cron in vercel.json fires once a day at 03:17 UTC —
-- so by the time anyone looks, there is no way to tell whether last night's run
-- happened at all, let alone whether it deleted anything or errored out. This
-- table is the durable record: one row per invocation, written by the route
-- itself, so "did the sweep run, and what did it do" is a query instead of a
-- guess. See docs/DATA_RETENTION.md §3.1 for what the sweep does.
--
-- PRIVACY: this table stores COUNTS, not identities. `projects`/`project_docs`
-- rows and storage paths are keyed by Supabase user id (see 0001, 0004), and the
-- route's Summary type already includes, on a dry run only, `wouldDelete` — a
-- list of concrete project ids, room ids and `<user id>/<file>` storage paths.
-- That list is useful to a human reading the HTTP response once, but there is no
-- reason to keep a rolling 180-day archive of user ids and file paths sitting in
-- a table nothing else needs. The route persists a REDACTED copy of the Summary
-- (see summaryToRunRow in src/lib/supabase/retentionLog.ts): `wouldDelete` is
-- dropped entirely, and `errors`/`skipped` — which interpolate project/room ids
-- into free text, e.g. "purge <project id>: ..." — are kept as counts only. Every
-- other Summary field (ok, dryRun, windows, purged/orphan/foreignRooms counts,
-- capped) is already just a count or a boolean, so it is kept as-is. Nothing
-- keyed to a specific user, project or file survives into this table.

create table if not exists public.retention_runs (
  id            uuid primary key default gen_random_uuid(),
  started_at    timestamptz not null,
  finished_at   timestamptz not null,
  -- '?dryRun=1' vs a real run. A dry run still gets a row: "did it run" and
  -- "did it run for real" are different questions, both worth answering later.
  dry_run       boolean not null,
  -- Mirrors Summary.ok — false means at least one error was recorded (see
  -- `errors_count`), not that the route itself threw (that path still logs,
  -- see the route's finally-style wrapper).
  ok            boolean not null,
  -- Mirrors Summary.capped — the 5,000-deletions-per-run budget was hit.
  capped        boolean not null default false,
  -- 'cron' when Vercel Cron's own user agent is present on the request,
  -- 'manual' otherwise. Vercel does not sign requests with anything more
  -- specific than the Authorization header this route already requires, so
  -- this is best-effort, not a hard guarantee.
  trigger       text not null default 'manual',
  purged_projects  integer not null default 0,
  purged_files     integer not null default 0,
  orphan_files     integer not null default 0,
  orphan_bytes     bigint  not null default 0,
  foreign_rooms    integer not null default 0,
  errors_count     integer not null default 0,
  skipped_count    integer not null default 0,
  -- The redacted Summary described above: ok, dryRun, windows, purged, orphans,
  -- foreignRooms, capped, errorsCount, skippedCount. No ids, no paths.
  summary       jsonb not null,
  constraint retention_runs_trigger_shape check (trigger in ('cron', 'manual'))
);

-- Read pattern is "most recent N runs" and "prune anything older than 180
-- days" — both order by started_at, so that is the index, not id.
create index if not exists retention_runs_started_at_idx
  on public.retention_runs (started_at desc);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
--
-- Same posture as 0004/0005: enable RLS, add no policy. No API role other than
-- service_role can reach this table at all — not even to read their own
-- rows, because there is no such concept here; every row belongs to the sweep,
-- not to a user. `authenticated` and `anon` get nothing, matching 0001/0002/0005.

alter table public.retention_runs enable row level security;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
--
-- 0004's postscript: "service_role was never granted anything here" is exactly
-- the bug that made the retention sweep silently never run for months, because
-- table creation grants nothing by default. 0004 also added a default privilege
-- so that FUTURE tables created by the same role inherit the service_role grant
-- automatically — this table should already have it if this migration is run by
-- the same role that ran 0004 (the SQL editor's `postgres`). The explicit grant
-- below is not relying on that: it says so directly, the same way 0004 enumerated
-- projects/project_docs/live_rooms rather than trusting a blanket grant.

grant usage on schema public to service_role;
grant select, insert, delete on public.retention_runs to service_role;
-- Deliberately no `update`: a run's row is written once, at the end of that
-- run, and never revised afterwards. `delete` is granted only for the 180-day
-- prune the route performs in the same request that inserts the newest row.

-- ---------------------------------------------------------------------------
-- Verifying
-- ---------------------------------------------------------------------------
--
--   select table_name, grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_schema = 'public'
--      and table_name = 'retention_runs'
--      and grantee in ('anon', 'authenticated', 'service_role')
--    order by grantee, privilege_type;
--
-- Then hit the route once (?dryRun=1 is enough) and confirm a row landed:
--
--   select started_at, finished_at, dry_run, ok, capped, trigger,
--          purged_projects, purged_files, orphan_files, orphan_bytes,
--          foreign_rooms, errors_count, skipped_count
--     from public.retention_runs
--    order by started_at desc
--    limit 14;
