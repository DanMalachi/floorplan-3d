-- RLS / storage / RPC isolation test. Run in the SQL editor of a STAGING (or
-- throwaway) Supabase project — NEVER production. Everything happens inside one
-- transaction that ends in ROLLBACK, so it leaves nothing behind; but it does insert
-- into auth.users, so do not run it anywhere you would mind a failed rollback.
--
-- Expected result: the final SELECT returns 'ALL RLS CHECKS PASSED'. Any failed
-- assertion raises an exception naming the check.
--
-- Covers SECURITY_AUDIT.md "Required security tests": cross-user read/write/delete,
-- anonymous access, storage-path ownership, room-claim isolation, and that a client
-- cannot touch live_rooms or move a revocation cut-off.

begin;

-- Two users and their identities -------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email)
values
  ('aaaaaaaa-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-a@example.invalid'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-b@example.invalid');

create or replace function pg_temp.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.act_as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end $$;

create or replace function pg_temp.back_to_admin() returns void language plpgsql as $$
begin execute 'reset role'; end $$;

create or replace function pg_temp.expect_denied(p_name text, p_sql text) returns void language plpgsql as $$
declare v_rows bigint;
begin
  begin
    execute p_sql;
    get diagnostics v_rows = row_count;
    if v_rows <> 0 then raise exception 'CHECK FAILED (%): statement affected % row(s)', p_name, v_rows; end if;
  exception when insufficient_privilege or check_violation or others then
    if sqlerrm like 'CHECK FAILED%' then raise; end if;
    -- permission denied / RLS violation is the expected outcome
  end;
end $$;

-- User A creates a project, a room claim, and (as admin) a storage object row ----
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-00000000000a');
select * from public.push_project(
  '11111111-1111-4111-8111-111111111111', 0, 'A plan', '{"scene":{}}'::jsonb, 2);
select public.claim_live_room('floorplan-rls-audit-room-0001');

select pg_temp.back_to_admin();
insert into storage.objects (bucket_id, name, owner)
values ('plans', 'aaaaaaaa-0000-4000-8000-00000000000a/11111111-1111-4111-8111-111111111111.png',
        'aaaaaaaa-0000-4000-8000-00000000000a');

-- 1. User B cannot see, edit, or delete A's rows ---------------------------------
select pg_temp.act_as('bbbbbbbb-0000-4000-8000-00000000000b');
do $$ begin
  if (select count(*) from public.projects) <> 0 then raise exception 'CHECK FAILED: B can read A projects'; end if;
  if (select count(*) from public.project_docs) <> 0 then raise exception 'CHECK FAILED: B can read A project_docs'; end if;
  if (select count(*) from storage.objects where bucket_id = 'plans') <> 0 then raise exception 'CHECK FAILED: B can list A storage objects'; end if;
end $$;
select pg_temp.expect_denied('B updates A project', $$update public.projects set name = 'pwned' where id = '11111111-1111-4111-8111-111111111111'$$);
select pg_temp.expect_denied('B deletes A project', $$delete from public.projects where id = '11111111-1111-4111-8111-111111111111'$$);
select pg_temp.expect_denied('B rewrites A doc', $$update public.project_docs set state = '{}'::jsonb where project_id = '11111111-1111-4111-8111-111111111111'$$);
select pg_temp.expect_denied('B deletes A storage object', $$delete from storage.objects where bucket_id = 'plans'$$);

-- 2. B cannot plant a row owned by A, or write into A's storage folder -----------
do $$ begin
  begin
    insert into public.projects (id, owner, name) values ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-0000-4000-8000-00000000000a', 'planted');
    raise exception 'CHECK FAILED: B inserted a project owned by A';
  exception when others then
    if sqlerrm like 'CHECK FAILED%' then raise; end if;
  end;
  begin
    insert into storage.objects (bucket_id, name, owner) values ('plans', 'aaaaaaaa-0000-4000-8000-00000000000a/planted.png', 'bbbbbbbb-0000-4000-8000-00000000000b');
    raise exception 'CHECK FAILED: B wrote into A storage folder';
  exception when others then
    if sqlerrm like 'CHECK FAILED%' then raise; end if;
  end;
end $$;

-- 3. Room claims: first-come-wins, B cannot take A's room or edit live_rooms -----
do $$ begin
  if public.claim_live_room('floorplan-rls-audit-room-0001') <> 'other' then raise exception 'CHECK FAILED: B claimed A room'; end if;
  if public.live_room_owner_state('floorplan-rls-audit-room-0001') <> 'other' then raise exception 'CHECK FAILED: owner state leaks'; end if;
  if (select count(*) from public.live_rooms) <> 0 then raise exception 'CHECK FAILED: B can read A live_rooms'; end if;
end $$;
select pg_temp.expect_denied('B writes live_rooms', $$insert into public.live_rooms (room_id, owner) values ('floorplan-rls-audit-room-0002', 'bbbbbbbb-0000-4000-8000-00000000000b')$$);
select pg_temp.expect_denied('B moves the revocation cut-off', $$update public.live_rooms set grants_valid_after = now() where room_id = 'floorplan-rls-audit-room-0001'$$);

-- 4. Anonymous role: no table, RPC, or storage access at all ---------------------
select pg_temp.act_as_anon();
do $$ begin
  begin perform 1 from public.projects; raise exception 'CHECK FAILED: anon can select projects';
  exception when insufficient_privilege then null; end;
  begin perform public.claim_live_room('floorplan-rls-audit-room-0003'); raise exception 'CHECK FAILED: anon can claim rooms';
  exception when insufficient_privilege then null; end;
  begin perform public.push_project('33333333-3333-4333-8333-333333333333', 0, 'x', '{}'::jsonb, 2); raise exception 'CHECK FAILED: anon can push_project';
  exception when insufficient_privilege then null; end;
  if (select count(*) from storage.objects) <> 0 then raise exception 'CHECK FAILED: anon can list storage'; end if;
end $$;

-- 5. Owner still has full access (the policy is not simply "deny everything") ----
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-00000000000a');
do $$ begin
  if (select count(*) from public.projects) <> 1 then raise exception 'CHECK FAILED: A lost access to own project'; end if;
  if public.live_room_owner_state('floorplan-rls-audit-room-0001') <> 'owner' then raise exception 'CHECK FAILED: A is not owner of own room'; end if;
end $$;

-- 6. Quotas and bucket rules from migration 0005 ---------------------------------
select pg_temp.back_to_admin();
do $$ begin
  if (select file_size_limit from storage.buckets where id = 'plans') is null then
    raise exception 'CHECK FAILED: plans bucket has no size limit (migration 0005 not applied?)'; end if;
  if (select allowed_mime_types from storage.buckets where id = 'plans') is null then
    raise exception 'CHECK FAILED: plans bucket has no MIME allow-list (migration 0005 not applied?)'; end if;
  if (select public from storage.buckets where id in ('plans','thumbs') and public limit 1) is not null then
    raise exception 'CHECK FAILED: a storage bucket is PUBLIC'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'project_docs_size') then
    raise exception 'CHECK FAILED: doc-size trigger missing (migration 0005 not applied?)'; end if;
end $$;

select 'ALL RLS CHECKS PASSED' as result;

rollback;
