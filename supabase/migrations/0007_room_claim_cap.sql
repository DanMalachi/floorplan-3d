-- F-24: unbounded room claims per user.
--
-- claim_live_room() (migration 0002) was pure first-come-wins with no limit at
-- all on how many rooms one account could own. Nothing else in the app bounds
-- this: minting a share is rate-limited (60/min), but nothing stops one signed-in
-- account from calling "Go live" repeatedly and accumulating an unbounded number
-- of live_rooms rows, each one a Liveblocks room that exists (and, while it does,
-- can cost) for as long as nobody deletes it.
--
-- ROOM_CLAIM_CAP = 50 here MUST match the constant of the same name in
-- src/lib/api/rooms.ts (used only for the client-facing message — this function
-- is what actually enforces it). It is Dan's number to confirm, not a measured
-- one: generous for the alpha's household/small-team usage, bounding rather than
-- reflecting real usage.
--
-- Not perfectly atomic against a concurrent double-claim race (two requests could
-- both pass the count check before either inserts) — acceptable for a soft cap
-- against ordinary abuse, not a hard security boundary; the existing 60/min rate
-- limit on /api/share already bounds how fast one caller can even try.

create or replace function public.claim_live_room(p_room_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_owned_count integer;
begin
  if auth.uid() is null then
    return 'other';
  end if;

  -- Already yours: report so without touching the cap. A caller re-entering a
  -- room they claimed long ago must not be blocked by having since claimed
  -- ROOM_CLAIM_CAP others.
  select owner into v_owner from public.live_rooms where room_id = p_room_id;
  if v_owner = auth.uid() then
    return 'owner';
  end if;
  if v_owner is not null then
    return 'other';
  end if;

  select count(*) into v_owned_count from public.live_rooms where owner = auth.uid();
  if v_owned_count >= 50 then -- ROOM_CLAIM_CAP — keep in sync with rooms.ts
    return 'limit';
  end if;

  insert into public.live_rooms (room_id, owner)
    values (p_room_id, auth.uid())
    on conflict (room_id) do nothing;
  select owner into v_owner from public.live_rooms where room_id = p_room_id;
  if v_owner = auth.uid() then return 'owner'; end if;
  return 'other';
end;
$$;

revoke execute on function public.claim_live_room(text) from public, anon;
grant execute on function public.claim_live_room(text) to authenticated;

-- Verify after applying:
--   select proname, prosecdef from pg_proc where proname = 'claim_live_room';
--   -- claim a room as a low-owned test account, then:
--   select count(*) from public.live_rooms where owner = '<test-account-uuid>';
