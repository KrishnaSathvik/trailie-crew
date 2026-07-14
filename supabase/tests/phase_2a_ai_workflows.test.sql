begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(38);

select has_table('private', 'ai_invocations', 'ai_invocations is private');
select has_table('private', 'ai_runs', 'ai_runs is private');
select has_function('public', 'create_ai_invocation', array['uuid','uuid','uuid','text','text','text'], 'server invocation RPC exists');
select has_function('public', 'start_ai_run', array['uuid','text','text'], 'server run-start RPC exists');
select has_function('public', 'complete_ai_run', array['uuid','uuid','text','text','text','bigint','bigint','bigint','bigint','bigint','integer'], 'server run-completion RPC exists');
select has_function('public', 'fail_ai_run', array['uuid','uuid','text'], 'server run-failure RPC exists');

select isnt((select relrowsecurity from pg_class where oid = 'private.ai_invocations'::regclass), false, 'invocation RLS enabled');
select isnt((select relforcerowsecurity from pg_class where oid = 'private.ai_invocations'::regclass), false, 'invocation RLS forced');
select isnt((select relrowsecurity from pg_class where oid = 'private.ai_runs'::regclass), false, 'run RLS enabled');
select isnt((select relforcerowsecurity from pg_class where oid = 'private.ai_runs'::regclass), false, 'run RLS forced');
select ok(not has_table_privilege('anon', 'private.ai_invocations', 'select'), 'anon cannot read invocations');
select ok(not has_table_privilege('authenticated', 'private.ai_invocations', 'select'), 'authenticated cannot read invocations');
select ok(not has_table_privilege('authenticated', 'private.ai_runs', 'insert'), 'authenticated cannot write runs');
select ok(not has_function_privilege('authenticated', 'public.create_ai_invocation(uuid,uuid,uuid,text,text,text)', 'execute'), 'browser cannot execute server invocation RPC');
select ok(has_function_privilege('service_role', 'public.create_ai_invocation(uuid,uuid,uuid,text,text,text)', 'execute'), 'service role can execute invocation RPC');
select ok(not has_table_privilege('service_role', 'private.ai_invocations', 'select'), 'service role cannot read private invocation rows directly');
select hasnt_column('private', 'ai_invocations', 'prompt', 'invocations do not store prompts');
select hasnt_column('private', 'ai_runs', 'raw_provider_response', 'runs do not store raw provider responses');
select hasnt_column('private', 'ai_runs', 'api_key', 'runs do not have API-key storage');

insert into auth.users (id, instance_id, aud, role, created_at, updated_at, is_anonymous)
values
  ('50000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now(), true),
  ('50000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now(), true),
  ('50000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now(), true);

select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000001', true);
set local role authenticated;
create temporary table ai_trip as select * from public.create_trip('AI Trip', 'Maya', null);
create temporary table ai_message as select public.send_message(
  (select room_id from ai_trip), (select participant_id from ai_trip),
  '@Trailie compare driving and flying', '51000000-0000-4000-8000-000000000001', null
) as payload;
reset role;
grant select on table ai_trip, ai_message to service_role;

set local role service_role;
create temporary table invocation_one as select public.create_ai_invocation(
  (select room_id from ai_trip),
  ((select payload->>'id' from ai_message)::uuid),
  (select participant_id from ai_trip),
  'explicit_mention', 'compare driving and flying', 'trailie-focused-v1'
) as payload;
create temporary table invocation_two as select public.create_ai_invocation(
  (select room_id from ai_trip),
  ((select payload->>'id' from ai_message)::uuid),
  (select participant_id from ai_trip),
  'explicit_mention', 'compare driving and flying', 'trailie-focused-v1'
) as payload;
reset role;

select is((select payload->>'id' from invocation_one), (select payload->>'id' from invocation_two), 'duplicate invocation reuses its identity');
select is((select count(*) from private.ai_invocations where id = ((select payload->>'id' from invocation_one)::uuid)), 1::bigint, 'idempotency uniqueness preserves one row');
select is((select status from private.ai_invocations where id = ((select payload->>'id' from invocation_one)::uuid)), 'queued', 'new invocation is queued');

set local role service_role;
create temporary table ai_run as select public.start_ai_run(
  ((select payload->>'id' from invocation_one)::uuid), 'gpt-5.6-terra', 'trailie-focused-v1'
) as payload;
create temporary table running_duplicate as select public.start_ai_run(
  ((select payload->>'id' from invocation_one)::uuid), 'gpt-5.6-terra', 'trailie-focused-v1'
) as payload;
reset role;

select is((select payload->>'status' from ai_run), 'started', 'queued invocation starts one run');
select is((select payload->>'status' from running_duplicate), 'running', 'second worker receives running status');
select is((select count(*) from private.ai_runs where invocation_id = ((select payload->>'id' from invocation_one)::uuid)), 1::bigint, 'two workers do not create two runs');

set local role service_role;
create temporary table completed as select public.complete_ai_run(
  ((select payload->>'id' from invocation_one)::uuid),
  ((select payload->>'run_id' from ai_run)::uuid),
  'A focused answer.', 'resp_123', 'req_123',
  10, 8, 2, 3, 18, 125
) as payload;
create temporary table completed_again as select public.complete_ai_run(
  ((select payload->>'id' from invocation_one)::uuid),
  ((select payload->>'run_id' from ai_run)::uuid),
  'A different answer.', 'resp_456', 'req_456',
  20, 9, 3, 0, 29, 140
) as payload;
reset role;

select is((select payload->>'response_message_id' from completed), (select payload->>'response_message_id' from completed_again), 'completion is idempotent');
select is((select count(*) from public.messages where id = ((select payload->>'response_message_id' from completed)::uuid)), 1::bigint, 'one Trailie message persists');
select is((select body from public.messages where id = ((select payload->>'response_message_id' from completed)::uuid)), 'A focused answer.', 'retry cannot replace the successful body');
select is((select status from private.ai_invocations where id = ((select payload->>'id' from invocation_one)::uuid)), 'completed', 'invocation completes');
select is((select status from private.ai_runs where id = ((select payload->>'run_id' from ai_run)::uuid)), 'completed', 'run completes');
select is((select reasoning_tokens from private.ai_runs where id = ((select payload->>'run_id' from ai_run)::uuid)), 2::bigint, 'documented usage metadata is recorded');
select is((select message_type::text from public.messages where id = ((select payload->>'id' from ai_message)::uuid)), 'user', 'browser message RPC cannot create a Trailie message');

select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000001', true);
set local role authenticated;
create temporary table failed_message as select public.send_message(
  (select room_id from ai_trip), (select participant_id from ai_trip),
  '@Trailie simulate provider failure', '51000000-0000-4000-8000-000000000002', null
) as payload;
reset role;
grant select on table failed_message to service_role;

set local role service_role;
select throws_ok(
  format(
    'select public.create_ai_invocation(%L::uuid, %L::uuid, %L::uuid, %L, %L, %L)',
    '52000000-0000-4000-8000-000000000001',
    (select payload->>'id' from failed_message),
    (select participant_id::text from ai_trip),
    'explicit_mention', 'simulate provider failure', 'trailie-focused-v1'
  ),
  'P0001', 'Membership required.', 'invocation cannot cross room boundaries'
);
create temporary table failed_invocation as select public.create_ai_invocation(
  (select room_id from ai_trip), ((select payload->>'id' from failed_message)::uuid),
  (select participant_id from ai_trip), 'explicit_mention',
  'simulate provider failure', 'trailie-focused-v1'
) as payload;
create temporary table failed_run_one as select public.start_ai_run(
  ((select payload->>'id' from failed_invocation)::uuid), 'gpt-5.6-terra', 'trailie-focused-v1'
) as payload;
select public.fail_ai_run(
  ((select payload->>'id' from failed_invocation)::uuid),
  ((select payload->>'run_id' from failed_run_one)::uuid), 'openai_unavailable'
);
reset role;

select is((select status from private.ai_invocations where id = ((select payload->>'id' from failed_invocation)::uuid)), 'failed', 'provider failure marks invocation failed');
select is((select status from private.ai_runs where id = ((select payload->>'run_id' from failed_run_one)::uuid)), 'failed', 'provider failure marks run failed');
select is((select error_code from private.ai_runs where id = ((select payload->>'run_id' from failed_run_one)::uuid)), 'openai_unavailable', 'only the safe failure code is recorded');

set local role service_role;
create temporary table failed_run_two as select public.start_ai_run(
  ((select payload->>'id' from failed_invocation)::uuid), 'gpt-5.6-terra', 'trailie-focused-v1'
) as payload;
select public.fail_ai_run(
  ((select payload->>'id' from failed_invocation)::uuid),
  ((select payload->>'run_id' from failed_run_two)::uuid), 'invalid_model_response'
);
select throws_ok(
  format(
    'select public.start_ai_run(%L::uuid, %L, %L)',
    (select payload->>'id' from failed_invocation), 'gpt-5.6-sol', 'trailie-focused-v1'
  ),
  'P0001', 'Retry is not allowed.', 'a third provider run is rejected'
);
reset role;

select is((select retry_count from private.ai_invocations where id = ((select payload->>'id' from failed_invocation)::uuid)), 1, 'failed invocation permits exactly one deliberate retry');

select * from finish();
rollback;
