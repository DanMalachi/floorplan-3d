-- Table privileges for `service_role`. Run this once in the Supabase SQL editor.
--
-- Numbered 0004, not 0003: `0003_abuse_reports.sql` already exists on the
-- unmerged `feat/abuse-takedown` branch, and reusing its number would collide on
-- merge.
--
-- WHY THIS MIGRATION EXISTS
--
-- RLS bypass is not table permission. `service_role` is BYPASSRLS, so it is easy
-- to assume it can reach everything — but that attribute only exempts it from the
-- row policies. Whether a role may touch the table AT ALL is a separate gate, and
-- on a modern Supabase project the API roles are handed no blanket privileges on
-- `public`. Migration 0001 says exactly this in its own Grants section, and then
-- grants only to `authenticated`. `service_role` was never granted anything here,
-- and neither 0002 nor 0003 corrected it.
--
-- The consequence was that every code path running with no user session — the
-- ones that CANNOT ask a signed-in client to act for them — was dead:
--
--   /api/account/retention   the nightly sweep. It never once succeeded: each run
--                            failed `permission denied for table projects`, so no
--                            soft-deleted project was ever purged past its 30-day
--                            window and no orphaned object was ever collected,
--                            while the Privacy Policy promised both.
--   /api/account/delete      "delete my account". It fails at stage 1, which
--                            enumerates `projects` before touching anything, and
--                            returns 500. That ordering is what saved us: the
--                            feature was inert rather than half-destructive.
--
-- Both failures were invisible because the sweep reports trouble as HTTP 500 with
-- the diagnosis in the response body, and Vercel logged the nightly cron as a bare
-- failure with no message.
--
-- APPLYING THIS RE-ARMS ACCOUNT DELETION FOR REAL. It has never been executed
-- successfully against the database. Test it on a throwaway Google account before
-- anyone points it at data they care about.

-- ---------------------------------------------------------------------------
-- The grants 0001 and 0002 should have carried
-- ---------------------------------------------------------------------------
--
-- Deliberately enumerated table by table rather than `grant ... on all tables`,
-- to match 0001's posture: privileges are stated, not swept up. `anon` still gets
-- nothing, and nothing here weakens a row policy — service_role's row access was
-- never the thing in question.

grant usage on schema public to service_role;

grant select, insert, update, delete on public.projects     to service_role;
grant select, insert, update, delete on public.project_docs to service_role;
grant select, insert, update, delete on public.live_rooms   to service_role;

-- ---------------------------------------------------------------------------
-- Functions: deliberately NOT granted
-- ---------------------------------------------------------------------------
--
-- An audit of every service-role call site found no `.rpc(...)` among them, so no
-- function needs a grant here. Recording why, so the omission reads as a decision
-- rather than the same oversight repeating:
--
--   push_project(...)            0001 never revoked it from PUBLIC, and PostgreSQL
--                                grants EXECUTE to PUBLIC by default — so
--                                service_role can already execute it. Nothing to fix.
--   live_room_owner_state(text)  0002 revoked both from PUBLIC, which is what
--   claim_live_room(text)        actually removes service_role's implicit access.
--                                Left that way on purpose: both are SECURITY
--                                DEFINER functions built around auth.uid(), which
--                                is NULL under the service role. claim_live_room
--                                would insert a null owner and hit the not-null
--                                constraint, so a grant here would buy a broken
--                                code path, not a working one. A server-side
--                                claim, if ever needed, should write the row
--                                directly rather than borrow a function that
--                                assumes a session.

-- ---------------------------------------------------------------------------
-- Stopping the next one
-- ---------------------------------------------------------------------------
--
-- The bug was not one forgotten line; it was repeated three migrations running,
-- because nothing made the omission visible. A default privilege closes that: any
-- table created LATER in this schema by the role that runs this statement (the
-- SQL editor connects as `postgres`) carries the service_role grant from birth.
--
-- Two limits worth knowing, so this is not mistaken for a blanket fix:
--   • It is not retroactive. It does nothing for the three tables above, which is
--     why they are granted explicitly.
--   • It is per-creating-role. A table created by some other role does not
--     inherit it, so a new migration applied a different way still needs its own
--     grant — including `0003_abuse_reports.sql` when that branch merges.

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

-- ---------------------------------------------------------------------------
-- Verifying
-- ---------------------------------------------------------------------------
--
-- After running this, `service_role` should appear for all three tables:
--
--   select table_name, grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_schema = 'public'
--      and grantee in ('anon', 'authenticated', 'service_role')
--    order by table_name, grantee;
--
-- Then re-run the sweep in dry-run mode. `ok` should come back true with an empty
-- `skipped`; a non-empty `skipped` still means "I could not look", never "there is
-- nothing there". Use curl.exe rather than Invoke-RestMethod or fetch — both throw
-- away the response body on a non-2xx status, which is the body you need to read:
--
--   curl.exe -H "Authorization: Bearer $CRON_SECRET" \
--     "https://floorplan-3d-dans-projects7.vercel.app/api/account/retention?dryRun=1"
