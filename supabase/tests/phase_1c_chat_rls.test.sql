begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(19);

insert into auth.users (id, instance_id, aud, role, created_at, updated_at, is_anonymous)
values
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now(), true),
  ('40000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now(), true),
  ('40000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now(), true);

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);
set local role authenticated;
create temporary table rls_trip as select * from public.create_trip('RLS Chat', 'Maya', null);
reset role;

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000002', true);
set local role authenticated;
create temporary table rls_member as select * from public.join_trip((select invite_token from rls_trip), 'Leo');
create temporary table sent as
select public.send_message(
  (select room_id from rls_trip), (select participant_id from rls_member), 'Visible to crew',
  '41000000-0000-4000-8000-000000000001', null
) as payload;
create temporary table reacted as
select public.toggle_message_reaction(
  ((select payload->>'id' from sent)::uuid), (select participant_id from rls_member), 'like'
) as payload;
reset role;

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is((select count(*) from public.messages), 1::bigint, 'member reads messages in their room');
select is((select count(*) from public.message_reactions), 1::bigint, 'member reads reactions in their room');
select throws_ok(
  format(
    'insert into public.messages (room_id, participant_id, sender_user_id, message_type, body) values (%L, %L, %L, %L, %L)',
    (select room_id from rls_trip), (select participant_id from rls_trip),
    '40000000-0000-4000-8000-000000000001', 'system', 'Malicious system message'
  ),
  '42501', 'permission denied for table messages', 'direct malicious system insert is denied'
);
select throws_ok(
  format('update public.messages set body = %L where id = %L', 'Changed', ((select payload->>'id' from sent)::uuid)),
  '42501', 'permission denied for table messages', 'direct message update is denied'
);
select throws_ok(
  format('delete from public.messages where id = %L', ((select payload->>'id' from sent)::uuid)),
  '42501', 'permission denied for table messages', 'direct message delete is denied'
);
select throws_ok(
  format(
    'insert into public.message_reactions (message_id, participant_id, reaction) values (%L, %L, %L)',
    ((select payload->>'id' from sent)::uuid), (select participant_id from rls_trip), 'love'
  ),
  '42501', 'permission denied for table message_reactions', 'direct spoofed reaction insert is denied'
);
reset role;

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select is((select count(*) from public.messages), 0::bigint, 'outsider cannot read messages');
select is((select count(*) from public.message_reactions), 0::bigint, 'outsider cannot read reactions');
reset role;

select has_table('public', 'messages', 'messages table exists');
select has_table('public', 'message_reactions', 'message reactions table exists');
select has_function('public', 'send_message', array['uuid', 'uuid', 'text', 'uuid', 'uuid'], 'send_message has the locked signature');
select has_function('public', 'toggle_message_reaction', array['uuid', 'uuid', 'text'], 'reaction RPC has the locked signature');
select has_function('public', 'get_room_messages', array['uuid', 'timestamp with time zone', 'uuid', 'integer'], 'history RPC has the locked signature');
select ok((select relrowsecurity from pg_class where oid = 'public.messages'::regclass), 'messages has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.message_reactions'::regclass), 'reactions have RLS enabled');
select is(
  (select count(*) from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname like 'room_members_%'),
  2::bigint,
  'private Realtime channel has member read and write policies'
);
select ok(has_table_privilege('authenticated', 'public.messages', 'SELECT'), 'authenticated receives message read access');
select ok(not has_table_privilege('authenticated', 'public.messages', 'INSERT'), 'authenticated has no direct message insert access');
select ok(not has_table_privilege('authenticated', 'public.message_reactions', 'INSERT'), 'authenticated has no direct reaction insert access');

select * from finish();
rollback;
