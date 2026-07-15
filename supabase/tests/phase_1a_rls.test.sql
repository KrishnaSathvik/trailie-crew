begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
grant execute on function public.create_trip_unprotected(text,text,integer),public.join_trip_unprotected(text,text) to authenticated;

select plan(16);

insert into auth.users (id, instance_id, aud, role, created_at, updated_at, is_anonymous)
values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now(), true),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now(), true),
  ('20000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now(), true),
  ('20000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now(), true);

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
set local role authenticated;
create temporary table host_trip as select * from public.create_trip_unprotected('Host Trip', 'Host', null);
reset role;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
set local role authenticated;
create temporary table member_join as select * from public.join_trip_unprotected((select invite_token from host_trip), 'Member');
reset role;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000003', true);
set local role authenticated;
create temporary table other_trip as select * from public.create_trip_unprotected('Other Trip', 'Other Host', null);
reset role;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select is((select count(*) from public.rooms), 0::bigint, 'outsider cannot read rooms');
select is((select count(*) from public.participants), 0::bigint, 'outsider cannot read participants');
reset role;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select is((select count(*) from public.rooms), 1::bigint, 'member can read their room');
select is((select count(*) from public.participants), 2::bigint, 'member can read active crew rows');
select is((select count(*) from public.rooms where id = (select room_id from other_trip)), 0::bigint, 'member cannot read another room');
select throws_ok(
  format('update public.participants set role = %L where id = %L', 'host', (select participant_id from member_join)),
  '42501', 'permission denied for table participants', 'member cannot promote themselves'
);
select throws_ok(
  format('insert into public.participants (room_id, user_id, display_name, role) values (%L, %L, %L, %L)', (select room_id from host_trip), '20000000-0000-4000-8000-000000000004', 'Injected', 'member'),
  '42501', 'permission denied for table participants', 'client cannot insert participants directly'
);
select throws_ok(
  format('delete from public.rooms where id = %L', (select room_id from host_trip)),
  '42501', 'permission denied for table rooms', 'client cannot delete rooms directly'
);
select throws_ok(
  format('select * from private.room_memory where room_id = %L', (select room_id from host_trip)),
  '42501', 'permission denied for schema private', 'client cannot read private room memory'
);
select is((select count(*) from public.room_invite_metadata), 0::bigint, 'non-host cannot read invite management metadata');
select results_eq(
  format('update public.rooms set name = %L where id = %L returning id', 'Member Rename', (select room_id from host_trip)),
  'select null::uuid where false',
  'non-host cannot update safe room settings'
);
reset role;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is((select count(*) from public.room_invite_metadata), 1::bigint, 'host can read safe invite metadata');
select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'room_invite_metadata' and column_name = 'token_hash'
  ),
  'safe invite metadata never exposes token hashes'
);
select results_eq(
  format('update public.rooms set name = %L where id = %L returning name', 'Renamed Trip', (select room_id from host_trip)),
  $$ values ('Renamed Trip'::text) $$,
  'host can update safe room settings'
);
select throws_ok(
  format('update public.rooms set host_user_id = %L where id = %L', '20000000-0000-4000-8000-000000000002', (select room_id from host_trip)),
  '42501', 'permission denied for table rooms', 'host cannot mutate sensitive room ownership'
);
select throws_ok(
  'select token_hash from public.room_invites',
  '42501', 'permission denied for table room_invites', 'host cannot read stored token hashes'
);
reset role;

select * from finish();
rollback;
