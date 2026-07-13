begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(31);

insert into auth.users (id, instance_id, aud, role, created_at, updated_at, is_anonymous)
values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now(), true),
  ('30000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now(), true),
  ('30000000-0000-4000-8000-000000000003', '00000000-0000-0000-8000-000000000000', 'authenticated', 'authenticated', now(), now(), true),
  ('30000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now(), true),
  ('30000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now(), true);

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
set local role authenticated;
create temporary table chat_trip as select * from public.create_trip('Chat Trip', 'Maya', null);
reset role;

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
set local role authenticated;
create temporary table chat_member as select * from public.join_trip((select invite_token from chat_trip), 'Leo');
reset role;

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);
set local role authenticated;
create temporary table other_trip as select * from public.create_trip('Other Trip', 'Nia', null);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  format(
    'select public.send_message(%L, %L, %L, %L, null)',
    (select room_id from chat_trip), (select participant_id from chat_trip), 'Hello',
    '31000000-0000-4000-8000-000000000001'
  ),
  'P0001', 'Authentication required.', 'send_message rejects callers without an identity'
);
reset role;

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select throws_ok(
  format(
    'select public.send_message(%L, %L, %L, %L, null)',
    (select room_id from chat_trip), (select participant_id from chat_trip), 'Outsider',
    '31000000-0000-4000-8000-000000000002'
  ),
  'P0001', 'Membership required.', 'send_message rejects outsiders'
);
reset role;

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select throws_ok(
  format(
    'select public.send_message(%L, %L, %L, %L, null)',
    (select room_id from chat_trip), (select participant_id from chat_trip), 'Spoof',
    '31000000-0000-4000-8000-000000000003'
  ),
  'P0001', 'Participant mismatch.', 'send_message rejects a spoofed participant'
);
select throws_ok(
  format(
    'select public.send_message(%L, %L, %L, %L, null)',
    (select room_id from chat_trip), (select participant_id from chat_member), '   ',
    '31000000-0000-4000-8000-000000000004'
  ),
  'P0001', 'Message cannot be empty.', 'send_message rejects blank text'
);
select throws_ok(
  format(
    'select public.send_message(%L, %L, repeat(%L, 4001), %L, null)',
    (select room_id from chat_trip), (select participant_id from chat_member), 'x',
    '31000000-0000-4000-8000-000000000005'
  ),
  'P0001', 'Message is too long.', 'send_message rejects oversized text'
);

create temporary table first_message as
select public.send_message(
  (select room_id from chat_trip),
  (select participant_id from chat_member),
  '  Meet at the north trailhead.  ',
  '31000000-0000-4000-8000-000000000006',
  null
) as payload;
reset role;

select is((select payload->>'body' from first_message), 'Meet at the north trailhead.', 'valid message is trimmed and returned');
select is((select payload->>'message_type' from first_message), 'user', 'message_type is forced to user');
select is((select payload->'sender'->>'display_name' from first_message), 'Leo', 'safe sender summary is returned');
select ok(not ((select payload from first_message) ? 'sender_user_id'), 'message payload omits sender auth identity');

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
set local role authenticated;
create temporary table duplicate_message as
select public.send_message(
  (select room_id from chat_trip),
  (select participant_id from chat_member),
  'Different retry body is ignored.',
  '31000000-0000-4000-8000-000000000006',
  null
) as payload;
reset role;
select is((select payload->>'id' from duplicate_message), (select payload->>'id' from first_message), 'duplicate client id returns the original message');
select is((select count(*) from public.messages where client_message_id = '31000000-0000-4000-8000-000000000006'), 1::bigint, 'duplicate client id preserves one row');

insert into public.messages (room_id, participant_id, sender_user_id, message_type, body, client_message_id, created_at)
values (
  (select room_id from other_trip),
  (select participant_id from other_trip),
  '30000000-0000-4000-8000-000000000003',
  'user', 'Other room message', '31000000-0000-4000-8000-000000000007', now()
);
create temporary table other_message as
select id from public.messages
where client_message_id = '31000000-0000-4000-8000-000000000007';
grant select on table other_message to authenticated;

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select throws_ok(
  format(
    'select public.send_message(%L, %L, %L, %L, %L)',
    (select room_id from chat_trip), (select participant_id from chat_member), 'Bad reply',
    '31000000-0000-4000-8000-000000000008',
    (select id from other_message)
  ),
  'P0001', 'Invalid reply target.', 'reply target must belong to the same room'
);
create temporary table reply_message as
select public.send_message(
  (select room_id from chat_trip),
  (select participant_id from chat_member),
  'Replying now.',
  '31000000-0000-4000-8000-000000000009',
  ((select payload->>'id' from first_message)::uuid)
) as payload;
reset role;
select is((select payload->'reply'->>'body' from reply_message), 'Meet at the north trailhead.', 'valid reply includes a safe preview');

update public.participants set status = 'left' where id = (select participant_id from chat_member);
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select throws_ok(
  format(
    'select public.send_message(%L, %L, %L, %L, null)',
    (select room_id from chat_trip), (select participant_id from chat_member), 'Inactive',
    '31000000-0000-4000-8000-000000000010'
  ),
  'P0001', 'Membership required.', 'inactive participant cannot send'
);
reset role;
update public.participants set status = 'active' where id = (select participant_id from chat_member);

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
set local role authenticated;
create temporary table reaction_on as
select public.toggle_message_reaction(
  ((select payload->>'id' from first_message)::uuid),
  (select participant_id from chat_member),
  'love'
) as payload;
reset role;
select is((select (payload->>'active')::boolean from reaction_on), true, 'valid reaction toggles on');
select is((select (payload->>'count')::integer from reaction_on), 1, 'reaction result includes count');

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
set local role authenticated;
create temporary table reaction_off as
select public.toggle_message_reaction(
  ((select payload->>'id' from first_message)::uuid),
  (select participant_id from chat_member),
  'love'
) as payload;
select throws_ok(
  format(
    'select public.toggle_message_reaction(%L, %L, %L)',
    ((select payload->>'id' from first_message)::uuid), (select participant_id from chat_member), 'fire'
  ),
  'P0001', 'Reaction is invalid.', 'invalid reaction is rejected'
);
reset role;
select is((select (payload->>'active')::boolean from reaction_off), false, 'same reaction toggles off');

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select throws_ok(
  format(
    'select public.toggle_message_reaction(%L, %L, %L)',
    ((select payload->>'id' from first_message)::uuid), (select participant_id from chat_member), 'like'
  ),
  'P0001', 'Membership required.', 'outsider cannot react'
);
reset role;

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select throws_ok(
  format(
    'select public.toggle_message_reaction(%L, %L, %L)',
    ((select payload->>'id' from first_message)::uuid), (select participant_id from chat_member), 'like'
  ),
  'P0001', 'Participant mismatch.', 'reaction rejects a spoofed participant'
);
select throws_ok(
  format(
    'select public.toggle_message_reaction(%L, %L, %L)',
    (select id from other_message),
    (select participant_id from chat_trip), 'like'
  ),
  'P0001', 'Message is not visible.', 'cross-room reaction is rejected'
);
reset role;

insert into public.messages (room_id, participant_id, sender_user_id, message_type, body, created_at)
select
  (select room_id from chat_trip),
  (select participant_id from chat_trip),
  '30000000-0000-4000-8000-000000000001',
  'user',
  'History ' || series,
  '2026-07-13 19:00:00+00'::timestamptz + (series || ' seconds')::interval
from generate_series(1, 55) as series;

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
set local role authenticated;
create temporary table first_page as
select public.get_room_messages((select room_id from chat_trip), null, null, 10) as payload;
create temporary table second_page as
select public.get_room_messages(
  (select room_id from chat_trip),
  ((select payload->'next_cursor'->>'created_at' from first_page)::timestamptz),
  ((select payload->'next_cursor'->>'id' from first_page)::uuid),
  10
) as payload;
create temporary table capped_page as
select public.get_room_messages((select room_id from chat_trip), null, null, 500) as payload;
reset role;

select is((select jsonb_array_length(payload->'messages') from first_page), 10, 'newest history page has requested size');
select is((select (payload->>'has_more')::boolean from first_page), true, 'history reports additional pages');
select ok(
  (select (payload->'messages'->0->>'created_at')::timestamptz >= (payload->'messages'->9->>'created_at')::timestamptz from first_page),
  'history is returned newest first with a stable descending cursor order'
);
select is(
  (select count(*) from (
    select jsonb_array_elements(first_page.payload->'messages')->>'id' as id from first_page
    intersect
    select jsonb_array_elements(second_page.payload->'messages')->>'id' as id from second_page
  ) overlap),
  0::bigint,
  'stable cursor pages do not overlap'
);
select is((select jsonb_array_length(payload->'messages') from capped_page), 50, 'database caps page size at 50');

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select throws_ok(
  format('select public.get_room_messages(%L, null, null, 30)', (select room_id from chat_trip)),
  'P0001', 'Membership required.', 'outsider cannot load history'
);
reset role;

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
set local role authenticated;
create temporary table reaction_summary as
select public.toggle_message_reaction(
  ((select payload->>'id' from first_message)::uuid),
  (select participant_id from chat_trip),
  'celebrate'
) as payload;
create temporary table summarized_history as
select public.get_room_messages((select room_id from chat_trip), null, null, 50) as payload;
reset role;
select ok(
  exists (
    select 1
    from summarized_history,
      jsonb_array_elements(payload->'messages') as message,
      jsonb_array_elements(message->'reactions') as reaction
    where message->>'id' = (select payload->>'id' from first_message)
      and reaction->>'reaction' = 'celebrate'
      and (reaction->>'count')::integer = 1
      and (reaction->>'reacted_by_current_participant')::boolean
  ),
  'history includes reaction counts and current participant state'
);
select ok(
  not ((select payload from summarized_history)::text ~* 'email|raw_user|user_metadata'),
  'history payload excludes private auth data'
);
select ok(
  not exists (
    select 1 from summarized_history, jsonb_array_elements(payload->'messages') as message
    where message->>'room_id' <> (select room_id::text from chat_trip)
  ),
  'history is isolated to the requested room'
);

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000005', true);
set local role authenticated;
create temporary table rate_trip as select * from public.create_trip('Rate Trip', 'Ari', null);
select public.send_message(
  (select room_id from rate_trip),
  (select participant_id from rate_trip),
  'Burst ' || series,
  ('32000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  null
)
from generate_series(1, 8) as series;
select throws_ok(
  format(
    'select public.send_message(%L, %L, %L, %L, null)',
    (select room_id from rate_trip), (select participant_id from rate_trip), 'One too many',
    '32000000-0000-4000-8000-000000000009'
  ),
  'P0001', 'Rate limit exceeded.', 'server-side rate limit blocks the ninth message in ten seconds'
);
reset role;

select * from finish();
rollback;
