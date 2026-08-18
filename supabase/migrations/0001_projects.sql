-- Cloud projects: the per-user copy that lets a plan follow you to another
-- computer. Run this once in the Supabase SQL editor.
--
-- Shape mirrors the browser's IndexedDB layout deliberately:
--   projects       ← projects:manifest  (the gallery card)
--   project_docs   ← project:<id>       (the geometry)
--   storage plans/ ← image:<id>         (the imported plan image)
--   storage thumbs/← thumb:<id>         (the card thumbnail)
--
-- Ownership is enforced by row-level security, not by application code: every
-- policy is `owner = auth.uid()`, so a bug in the client cannot read or write
-- another account's plans.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.projects (
  id               uuid primary key,          -- the client's own crypto.randomUUID()
  owner            uuid not null references auth.users(id) on delete cascade,
  name             text not null default 'Untitled plan',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Server-authoritative change counter. A push states the rev it was based on;
  -- a mismatch means another device got there first. This is what makes
  -- last-write-wins safe enough to use without a CRDT.
  rev              bigint not null default 0,
  schema_version   int not null default 2,
  plan_image_path  text,
  plan_image_hash  text,                      -- skip re-uploading an unchanged image
  thumb_path       text,
  live_room_id     text,
  live_role        text,
  deleted_at       timestamptz                -- soft delete, so other devices learn about it
);

create index if not exists projects_owner_updated_idx on public.projects (owner, updated_at desc);

create table if not exists public.project_docs (
  project_id  uuid primary key references public.projects(id) on delete cascade,
  -- Denormalised so the RLS policy is a plain column check instead of a join.
  owner       uuid not null references auth.users(id) on delete cascade,
  rev         bigint not null,
  state       jsonb not null,                 -- the durable slice, image-free
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.projects enable row level security;
alter table public.project_docs enable row level security;

drop policy if exists "own projects" on public.projects;
create policy "own projects" on public.projects
  for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());

drop policy if exists "own project docs" on public.project_docs;
create policy "own project docs" on public.project_docs
  for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
--
-- Two different gates: RLS decides WHICH rows a request may touch, grants decide
-- whether the role may touch the table at all. Supabase projects no longer hand
-- the API roles blanket privileges on `public`, so without these a signed-in
-- user hits "permission denied for table projects" even though the policy above
-- would have allowed the row. `anon` deliberately gets nothing.

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.project_docs to authenticated;

-- ---------------------------------------------------------------------------
-- push_project — compare-and-swap on rev, card + document in one transaction
-- ---------------------------------------------------------------------------
--
-- Returns the resulting rev and whether the push was refused. A refusal is not
-- an error: it means this device's copy is based on a rev the server has moved
-- past, and the client resolves it by keeping both copies.

create or replace function public.push_project(
  p_id              uuid,
  p_expected_rev    bigint,
  p_name            text,
  p_state           jsonb,
  p_schema_version  int,
  p_plan_image_path text default null,
  p_plan_image_hash text default null,
  p_thumb_path      text default null,
  p_live_room_id    text default null,
  p_live_role       text default null,
  p_created_at      timestamptz default null
)
returns table (rev bigint, conflict boolean)
language plpgsql
security invoker
as $$
declare
  v_current bigint;
  v_new     bigint;
begin
  select p.rev into v_current
    from public.projects p
   where p.id = p_id and p.owner = auth.uid();

  -- First time this project reaches the cloud (or the first sign-in claiming a
  -- project that has only ever lived in a browser).
  if v_current is null then
    if p_expected_rev <> 0 then
      -- We believed a server copy existed; it doesn't. Let the client re-sync
      -- rather than silently resurrecting a deleted project.
      return query select 0::bigint, true;
      return;
    end if;
    insert into public.projects (id, owner, name, created_at, updated_at, rev, schema_version,
                                 plan_image_path, plan_image_hash, thumb_path, live_room_id, live_role)
      values (p_id, auth.uid(), p_name, coalesce(p_created_at, now()), now(), 1, p_schema_version,
              p_plan_image_path, p_plan_image_hash, p_thumb_path, p_live_room_id, p_live_role);
    insert into public.project_docs (project_id, owner, rev, state)
      values (p_id, auth.uid(), 1, p_state);
    return query select 1::bigint, false;
    return;
  end if;

  if v_current <> p_expected_rev then
    return query select v_current, true;
    return;
  end if;

  v_new := v_current + 1;

  update public.projects
     set name             = p_name,
         rev              = v_new,
         updated_at       = now(),
         schema_version   = p_schema_version,
         -- coalesce: a push that didn't re-upload the image keeps the stored one
         plan_image_path  = coalesce(p_plan_image_path, plan_image_path),
         plan_image_hash  = coalesce(p_plan_image_hash, plan_image_hash),
         thumb_path       = coalesce(p_thumb_path, thumb_path),
         live_room_id     = p_live_room_id,
         live_role        = p_live_role,
         deleted_at       = null
   where id = p_id and owner = auth.uid();

  update public.project_docs
     set rev = v_new, state = p_state, updated_at = now()
   where project_id = p_id;

  return query select v_new, false;
end;
$$;

grant execute on function public.push_project(
  uuid, bigint, text, jsonb, int, text, text, text, text, text, timestamptz
) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: the two big base64 strings, kept out of the database
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('plans', 'plans', false), ('thumbs', 'thumbs', false)
on conflict (id) do nothing;

-- Paths are `<user id>/<project id>...`, so the first folder segment IS the
-- ownership check.
drop policy if exists "own plan files" on storage.objects;
create policy "own plan files" on storage.objects
  for all to authenticated
  using (bucket_id in ('plans', 'thumbs') and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id in ('plans', 'thumbs') and (storage.foldername(name))[1] = auth.uid()::text);
