-- Server-side room ownership. Run this once in the Supabase SQL editor.
--
-- WHY THIS TABLE EXISTS
--
-- Room ownership used to live only in the creator's browser (an IndexedDB map in
-- src/store/projectPersistence.ts). A browser-side note is not an authorization:
-- the server had no way to tell the room's creator apart from anyone who had
-- simply seen the room id, so /api/share would mint a "build" grant for any room
-- to any caller, and /api/liveblocks-auth treated "no grant" as "host". This table
-- is the server's own record of who created a room, so those two routes can tell
-- the difference.
--
-- Claiming is first-come-wins. That is the same trust-on-first-use the local map
-- had, with one decisive improvement: the first claim is now permanent and
-- server-held, so a second browser cannot assert it away.

create table if not exists public.live_rooms (
  room_id     text primary key,
  owner       uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- Reject junk keys at the database rather than trusting the caller's format
  -- check. Mirrors ROOM_RE / roomSchema in the application.
  constraint live_rooms_room_id_shape check (room_id ~ '^floorplan-[A-Za-z0-9][A-Za-z0-9_-]{3,63}$')
);

create index if not exists live_rooms_owner_idx on public.live_rooms (owner);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
--
-- Read-only, and only your own rows. All writes go through claim_live_room()
-- below, so there is no policy that lets a client insert a row directly — that
-- would let a client claim a room it does not own by writing whatever it liked.

alter table public.live_rooms enable row level security;

drop policy if exists "own live rooms" on public.live_rooms;
create policy "own live rooms" on public.live_rooms
  for select to authenticated
  using (owner = auth.uid());

grant usage on schema public to authenticated;
grant select on public.live_rooms to authenticated;
-- Deliberately no insert/update/delete grant: see above.

-- ---------------------------------------------------------------------------
-- live_room_owner_state — owner / other / free, without leaking who "other" is
-- ---------------------------------------------------------------------------
--
-- An RLS select cannot answer this. "No rows" means both "nobody owns it" and
-- "someone else owns it", and the application has to tell those apart: the first
-- allows a fallback to the signed owner cookie, the second must override it. So
-- this runs as definer and returns only the caller's relationship to the row —
-- never the other owner's identity.

create or replace function public.live_room_owner_state(p_room_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if auth.uid() is null then
    return 'other'; -- fail closed: an anonymous caller owns nothing
  end if;
  select owner into v_owner from public.live_rooms where room_id = p_room_id;
  if v_owner is null then return 'free'; end if;
  if v_owner = auth.uid() then return 'owner'; end if;
  return 'other';
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_live_room — first-come-wins, atomic
-- ---------------------------------------------------------------------------
--
-- `on conflict do nothing` followed by a read makes the race harmless: two
-- simultaneous claims produce one owner and one 'other', never two owners.

create or replace function public.claim_live_room(p_room_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if auth.uid() is null then
    return 'other';
  end if;
  insert into public.live_rooms (room_id, owner)
    values (p_room_id, auth.uid())
    on conflict (room_id) do nothing;
  select owner into v_owner from public.live_rooms where room_id = p_room_id;
  if v_owner = auth.uid() then return 'owner'; end if;
  return 'other';
end;
$$;

-- A security-definer function runs with the owner's privileges, and PostgreSQL
-- grants EXECUTE to PUBLIC by default. Revoke first, then hand it only to signed-in
-- users — otherwise the anon role could claim rooms.
revoke execute on function public.live_room_owner_state(text) from public, anon;
revoke execute on function public.claim_live_room(text) from public, anon;
grant execute on function public.live_room_owner_state(text) to authenticated;
grant execute on function public.claim_live_room(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Existing rooms
-- ---------------------------------------------------------------------------
--
-- Rooms created before this migration have no row here. Their owner claims them
-- simply by opening them once while signed in ("Go live" / opening the live
-- project from the gallery), which calls claim_live_room. Share links already in
-- circulation are unaffected either way — they carry a signed grant, which is
-- verified without consulting this table at all.
--
-- Those legacy room ids are only 8 hex characters (32 bits). Until their owner
-- claims them, a determined attacker who enumerates one could claim it first, so
-- open each live project once after applying this. New rooms use a full UUID.
