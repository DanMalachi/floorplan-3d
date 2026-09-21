-- Security hardening from the pre-launch audit (SECURITY_AUDIT.md). Run once in the
-- Supabase SQL editor, BEFORE deploying the application code that depends on it
-- (the app tolerates the column being absent — it treats that as "revocation not
-- available yet" and logs loudly — but nothing is revocable until this has run).
--
-- Idempotent: every statement is safe to run twice.
--
-- Contents
--   1. live_rooms.grants_valid_after — per-room share-link revocation      (F-02)
--   2. Storage buckets: MIME allow-list + size cap                          (F-11)
--   3. Per-account quotas on projects and on document size                  (F-12)
--
-- ROLLBACK (forward-recovery, nothing here destroys data):
--   alter table public.live_rooms drop column if exists grants_valid_after;
--   drop trigger if exists projects_quota on public.projects;
--   drop trigger if exists project_docs_size on public.project_docs;
--   drop function if exists public.enforce_project_quota();
--   drop function if exists public.enforce_doc_size();
--   update storage.buckets set file_size_limit = null, allowed_mime_types = null
--    where id in ('plans','thumbs');

-- ---------------------------------------------------------------------------
-- 1. Share-link revocation
-- ---------------------------------------------------------------------------
--
-- Share grants are stateless signed tokens (HMAC over room+role+expiry), so before
-- this column a leaked or mistakenly-sent link could not be withdrawn: it stayed
-- valid for its full 30 days, and the only remedy was rotating the signing secret
-- for EVERY room. Each grant now carries `iat` (mint time); the owner revokes by
-- moving this timestamp forward, and every grant minted before it stops working.
--
-- 'epoch' means "never revoked". Written only by the server with the service role
-- (after it has proven the caller owns the room) — `authenticated` has SELECT on
-- live_rooms and nothing else, so a client cannot move it, and 0002 deliberately
-- gives no insert/update/delete grant.

alter table public.live_rooms
  add column if not exists grants_valid_after timestamptz not null default 'epoch';

-- ---------------------------------------------------------------------------
-- 2. Storage buckets
-- ---------------------------------------------------------------------------
--
-- 0001 created both buckets with no size cap and no content-type restriction, so
-- any signed-in account could store arbitrary files (HTML, SVG, executables, huge
-- blobs) at our storage cost. The app only ever uploads raster images. The list
-- must match EXT in src/store/cloudProjects.ts. Buckets stay private.

update storage.buckets
   set file_size_limit    = 52428800,  -- 50 MiB: a 3000px PNG page render is single-digit MiB
       allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
 where id = 'plans';

update storage.buckets
   set file_size_limit    = 5242880,   -- 5 MiB: card thumbnails are tens of KiB
       allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
 where id = 'thumbs';

-- ---------------------------------------------------------------------------
-- 3. Quotas
-- ---------------------------------------------------------------------------
--
-- RLS scopes rows to their owner but says nothing about HOW MANY rows or how big.
-- A free account could otherwise write unbounded rows and multi-hundred-MiB jsonb
-- documents. Limits are generous — real documents are tens of KiB to ~1 MiB — and
-- exist to bound abuse, not to shape normal use. Raise them here if a real user
-- hits one; the error text is what the sync engine will see as a failed push.
--
-- Soft-deleted rows are not counted, so deleting projects always frees quota.

create or replace function public.enforce_project_quota()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from public.projects
   where owner = new.owner and deleted_at is null;
  if v_count >= 500 then
    raise exception 'project quota exceeded (500 per account)' using errcode = '54000';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_quota on public.projects;
create trigger projects_quota
  before insert on public.projects
  for each row execute function public.enforce_project_quota();

create or replace function public.enforce_doc_size()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if pg_column_size(new.state) > 16 * 1024 * 1024 then
    raise exception 'project document too large (16 MiB limit)' using errcode = '54000';
  end if;
  return new;
end;
$$;

drop trigger if exists project_docs_size on public.project_docs;
create trigger project_docs_size
  before insert or update of state on public.project_docs
  for each row execute function public.enforce_doc_size();

-- ---------------------------------------------------------------------------
-- Verifying
-- ---------------------------------------------------------------------------
--
--   select column_name, data_type, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'live_rooms';
--
--   select id, public, file_size_limit, allowed_mime_types
--     from storage.buckets where id in ('plans','thumbs');
--
--   select tgname from pg_trigger
--    where tgname in ('projects_quota', 'project_docs_size');
