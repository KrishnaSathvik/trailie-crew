begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
grant execute on function public.create_trip_unprotected(text,text,integer),public.join_trip_unprotected(text,text) to authenticated;
select plan(31);

select has_table('private', 'message_extractions', 'message extractions are private');
select has_table('private', 'memory_facts', 'normalized memory facts are private');
select has_function('public', 'claim_message_extraction', array['uuid','text','text','text'], 'claim RPC exists');
select has_function('public', 'skip_message_extraction', array['uuid','text'], 'skip RPC exists');
select has_function('public', 'complete_message_extraction', array['uuid','jsonb','text','text','bigint','bigint','bigint','bigint','bigint','integer'], 'complete RPC exists');
select has_function('public', 'fail_message_extraction', array['uuid','text'], 'failure RPC exists');
select has_function('private', 'apply_memory_patch', array['uuid','uuid','uuid','jsonb'], 'private atomic patch function exists');
select has_function('private', 'rebuild_room_memory', array['uuid'], 'private projection rebuild exists');
select isnt((select relrowsecurity from pg_class where oid = 'private.message_extractions'::regclass), false, 'extraction RLS enabled');
select isnt((select relforcerowsecurity from pg_class where oid = 'private.message_extractions'::regclass), false, 'extraction RLS forced');
select isnt((select relrowsecurity from pg_class where oid = 'private.memory_facts'::regclass), false, 'facts RLS enabled');
select isnt((select relforcerowsecurity from pg_class where oid = 'private.memory_facts'::regclass), false, 'facts RLS forced');
select ok(not has_table_privilege('anon', 'private.message_extractions', 'select'), 'anon cannot read extractions');
select ok(not has_table_privilege('authenticated', 'private.memory_facts', 'select'), 'authenticated cannot read facts');
select ok(not has_table_privilege('authenticated', 'private.room_memory', 'select'), 'browser cannot read room memory');
select ok(not has_function_privilege('authenticated', 'public.claim_message_extraction(uuid,text,text,text)', 'execute'), 'browser cannot claim work');
select ok(has_function_privilege('service_role', 'public.claim_message_extraction(uuid,text,text,text)', 'execute'), 'service worker can claim work');
select hasnt_column('private', 'message_extractions', 'raw_output', 'raw model output is not stored');
select hasnt_column('private', 'message_extractions', 'reasoning', 'hidden reasoning is not stored');

insert into auth.users (id, instance_id, aud, role, created_at, updated_at, is_anonymous)
values ('60000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now(), true);
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', true);
set local role authenticated;
create temporary table memory_trip as select * from public.create_trip_unprotected('Memory Trip', 'Maya', null);
create temporary table memory_message as select public.send_message(
  (select room_id from memory_trip), (select participant_id from memory_trip),
  'I prefer hiking', '61000000-0000-4000-8000-000000000001', null
) as payload;
reset role;
grant select on memory_trip, memory_message to service_role;

set local role service_role;
create temporary table first_claim as select public.claim_message_extraction(
  ((select payload->>'id' from memory_message)::uuid), 'gpt-5.6-luna', 'trailie-memory-v1', '1'
) as payload;
create temporary table second_claim as select public.claim_message_extraction(
  ((select payload->>'id' from memory_message)::uuid), 'gpt-5.6-luna', 'trailie-memory-v1', '1'
) as payload;
reset role;

select is((select payload->>'status' from first_claim), 'running', 'first worker claims the message');
select is((select payload->>'status' from second_claim), 'running', 'duplicate scheduling observes the existing running claim');
select is((select count(*) from private.message_extractions where message_id = ((select payload->>'id' from memory_message)::uuid)), 1::bigint, 'one extraction row exists per message');
select is((select attempt_count from private.message_extractions where message_id = ((select payload->>'id' from memory_message)::uuid)), 1, 'duplicate running claim does not increase attempts');

set local role service_role;
select public.complete_message_extraction(
  ((select payload->>'id' from memory_message)::uuid),
  jsonb_build_object('facts', jsonb_build_array(jsonb_build_object(
    'factType', 'activity_preference', 'subjectType', 'participant',
    'subjectParticipantId', (select participant_id from memory_trip),
    'canonicalKey', 'participant:activity_preference', 'value', jsonb_build_object('text', 'hiking'),
    'status', 'active', 'confidence', 0.95, 'evidenceStrength', 'explicit',
    'sourceMessageId', (select payload->>'id' from memory_message), 'supersedesFactId', null
  )), 'supersessions', '[]'::jsonb),
  'resp_memory', 'req_memory', 20, 10, 0, 0, 30, 75
);
reset role;

select is((select status from private.message_extractions where message_id = ((select payload->>'id' from memory_message)::uuid)), 'completed', 'completion reaches a terminal state');
select is((select count(*) from private.memory_facts where room_id = (select room_id from memory_trip)), 1::bigint, 'validated patch stores one normalized fact');
select is((select memory_version from private.room_memory where room_id = (select room_id from memory_trip)), 2, 'effective memory change increments version once');
select is((select participant_profiles #>> array[(select participant_id::text from memory_trip),'preferences','0','value','text'] from private.room_memory where room_id = (select room_id from memory_trip)), 'hiking', 'participant projection contains the preference');
select is((select count(*) from public.messages where room_id = (select room_id from memory_trip)), 1::bigint, 'extraction creates no public message');
select is((select count(*) from public.messages where room_id = (select room_id from memory_trip) and message_type = 'trailie'), 0::bigint, 'extraction creates no Trailie message');

set local role service_role;
create temporary table completed_claim as select public.claim_message_extraction(
  ((select payload->>'id' from memory_message)::uuid), 'gpt-5.6-luna', 'trailie-memory-v1', '1'
) as payload;
reset role;
select is((select payload->>'status' from completed_claim), 'completed', 'successful extraction is not reprocessed');
select is((select memory_version from private.room_memory where room_id = (select room_id from memory_trip)), 2, 'duplicate scheduling does not increment memory version');

select * from finish();
rollback;
