begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(28);

insert into auth.users (id, instance_id, aud, role, created_at, updated_at, is_anonymous)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now(), true),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now(), true),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now(), true),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now(), true),
  ('10000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now(), true),
  ('10000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now(), true);

set local role authenticated;
select throws_ok(
  $$ select * from public.create_trip('No identity', 'Nobody', null) $$,
  'P0001',
  'Authentication required.',
  'unauthenticated callers cannot create Trips'
);
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
set local role authenticated;
create temporary table created_one as
select * from public.create_trip('Boundary Waters', 'Maya', 6);
reset role;

select ok(
  (select room_id is not null and participant_id is not null and length(invite_token) >= 43 from created_one),
  'create_trip returns safe identifiers and the one-time raw invite token'
);
select is((select count(*) from public.rooms where id = (select room_id from created_one)), 1::bigint, 'room is created');
select is(
  (select role::text from public.participants where id = (select participant_id from created_one)),
  'host',
  'host participant is created with the host role'
);
select is((select count(*) from public.room_invites where room_id = (select room_id from created_one)), 1::bigint, 'invite is created');
select is((select count(*) from private.room_memory where room_id = (select room_id from created_one)), 1::bigint, 'room memory is initialized');
select matches((select room_code from created_one), '^[A-HJ-NP-Z2-9]{8}$', 'room code is human-readable');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
set local role authenticated;
create temporary table created_two as
select * from public.create_trip('Second Trip', 'Maya', null);
reset role;

select isnt((select room_code from created_one), (select room_code from created_two), 'room codes are unique');
select isnt(
  (select token_hash from public.room_invites where room_id = (select room_id from created_one)),
  (select invite_token from created_one),
  'raw invite token is not stored'
);
select is(
  (select token_hash from public.room_invites where room_id = (select room_id from created_one)),
  (select pg_catalog.encode(extensions.digest(invite_token, 'sha256'), 'hex') from created_one),
  'stored invite token hash supports deterministic lookup'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select throws_ok($$ select * from public.create_trip('', 'Maya', null) $$, 'P0001', 'Trip name must be between 1 and 100 characters.', 'blank Trip name fails');
select throws_ok($$ select * from public.create_trip(repeat('x', 101), 'Maya', null) $$, 'P0001', 'Trip name must be between 1 and 100 characters.', 'long Trip name fails');
select throws_ok($$ select * from public.create_trip('Trip', '', null) $$, 'P0001', 'Display name must be between 1 and 50 characters.', 'blank display name fails');
select throws_ok($$ select * from public.create_trip('Trip', repeat('x', 51), null) $$, 'P0001', 'Display name must be between 1 and 50 characters.', 'long display name fails');
select throws_ok($$ select * from public.create_trip('Trip', 'Maya', 0) $$, 'P0001', 'Expected travelers must be between 1 and 50.', 'zero expected travelers fails');
select throws_ok($$ select * from public.create_trip('Trip', 'Maya', 51) $$, 'P0001', 'Expected travelers must be between 1 and 50.', 'too many expected travelers fails');
reset role;
select is((select count(*) from public.rooms where name = 'Trip'), 0::bigint, 'invalid creates leave no room artifacts');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
set local role authenticated;
create temporary table joined_token as
select * from public.join_trip((select invite_token from created_one), 'Leo');
reset role;
select is((select participant_role::text from joined_token), 'member', 'a valid long token joins as a member');
select is((select use_count from public.room_invites where room_id = (select room_id from created_one)), 1, 'token join increments use_count once');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
set local role authenticated;
create temporary table joined_code as
select * from public.join_trip((select room_code from created_two), 'Nia');
select is((select room_id from joined_code), (select room_id from created_two), 'a valid short room code joins successfully');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select throws_ok(
  format('select * from public.join_trip(%L, %L)', (select invite_token from created_one), 'Another Name'),
  'P0001', 'You are already a member of this Trip.', 'duplicate user membership fails'
);
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select throws_ok(
  format('select * from public.join_trip(%L, %L)', (select invite_token from created_one), 'leo'),
  'P0001', 'That display name is already active in this Trip.', 'active display names are unique case-insensitively'
);
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
set local role authenticated;
create temporary table revoked_trip as select * from public.create_trip('Revoked Trip', 'Maya', null);
create temporary table expired_trip as select * from public.create_trip('Expired Trip', 'Maya', null);
create temporary table limited_trip as select * from public.create_trip('Limited Trip', 'Maya', null);
create temporary table archived_trip as select * from public.create_trip('Archived Trip', 'Maya', null);
create temporary table deleted_trip as select * from public.create_trip('Deleted Trip', 'Maya', null);
reset role;

update public.room_invites set revoked_at = now() where room_id = (select room_id from revoked_trip);
update public.room_invites set expires_at = now() - interval '1 minute' where room_id = (select room_id from expired_trip);
update public.room_invites set max_uses = 1 where room_id = (select room_id from limited_trip);
update public.rooms set status = 'archived' where id = (select room_id from archived_trip);
update public.rooms set status = 'deleted' where id = (select room_id from deleted_trip);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select throws_ok(format('select * from public.join_trip(%L, %L)', (select invite_token from revoked_trip), 'Ari'), 'P0001', 'Invite is revoked.', 'revoked invite fails');
select throws_ok(format('select * from public.join_trip(%L, %L)', (select invite_token from expired_trip), 'Ari'), 'P0001', 'Invite has expired.', 'expired invite fails');
create temporary table limited_join as select * from public.join_trip((select invite_token from limited_trip), 'Ari');
select throws_ok(format('select * from public.join_trip(%L, %L)', (select invite_token from archived_trip), 'Ari'), 'P0001', 'Trip is not active.', 'archived Trip fails');
select throws_ok(format('select * from public.join_trip(%L, %L)', (select invite_token from deleted_trip), 'Ari'), 'P0001', 'Trip is not active.', 'deleted Trip fails');
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
set local role authenticated;
select throws_ok(format('select * from public.join_trip(%L, %L)', (select invite_token from limited_trip), 'Bea'), 'P0001', 'Invite has reached its usage limit.', 'max uses is enforced');
reset role;
select is((select use_count from public.room_invites where room_id = (select room_id from limited_trip)), 1, 'failed max-use join does not increment use_count');

select * from finish();
rollback;
