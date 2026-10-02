-- Short share links: `done.design/s#k7Qm2xPa9Lz4` instead of
-- `done.design/v/<uuid>#g=<~200-character signed grant>`. Run this once in the
-- Supabase SQL editor. Numbered 0009: 0008 is retention_runs (PR #46).
--
-- Dan, 2026-10-02: the long links "look suspicious". The code goes after `#`,
-- like the grant it stands for, so it never reaches the server in a request
-- line, a Referer header or an access log — F-20 (SECURITY_AUDIT.md) still holds.
-- The landing page (src/app/[locale]/s/page.tsx) reads the fragment and POSTs it
-- to /api/share/resolve.
--
-- ---------------------------------------------------------------------------
-- WHAT IS STORED, AND WHAT IS NOT
--
-- Not the code, and not the grant. `code_hash` is sha256(code) — the code
-- itself exists only in the link — and the row holds the grant's CLAIMS (room,
-- role, iat, exp), from which /api/share/resolve re-signs an identical grant on
-- demand. So a leak of this table hands out no working link: without the code
-- there is nothing to open, and the claims alone are not a grant (signing needs
-- SHARE_SIGNING_SECRET, which never touches the database).
--
-- `iat_ms` is kept EXACTLY, not re-stamped at resolve time: revocation compares
-- a grant's iat against `live_rooms.grants_valid_after` (migration 0005), so a
-- short link minted before "Revoke links" must stay dead after it. `exp_ms` is
-- carried over the same way, so a short link never outlives the grant it was
-- made from.
--
-- No user id, no IP, no name. The room id is the only identifier, and it is the
-- same one `live_rooms` already holds.
--
-- LIFECYCLE: rows past `exp_ms` are useless (resolve refuses them) and are
-- deleted opportunistically by /api/share/short on each new link — no separate
-- sweep, nothing for the retention cron to learn.
--
-- WHO CAN READ / WRITE: only the service role, exactly like abuse_reports
-- (0006) — RLS on, zero policies, nothing granted to anon/authenticated, so
-- PostgREST is not a side door around the routes' rate limits.
-- ---------------------------------------------------------------------------

create table if not exists public.share_links (
  code_hash   text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  -- Same shape as roomSchema in src/lib/api/schemas.ts — change both together.
  room_id     text not null check (room_id ~ '^floorplan-[A-Za-z0-9][A-Za-z0-9_-]{3,63}$'),
  role        text not null check (role in ('view', 'decorate', 'build')),
  iat_ms      bigint not null,
  exp_ms      bigint not null,
  created_at  timestamptz not null default now()
);

create index if not exists share_links_exp_idx on public.share_links (exp_ms);

alter table public.share_links enable row level security;
revoke all on public.share_links from anon, authenticated;

-- service_role bypasses RLS but still needs table privileges — see
-- 0004_service_role_grants.sql for how that was learned the hard way.
grant select, insert, delete on public.share_links to service_role;
