begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
grant execute on function public.create_trip_unprotected(text,text,integer) to authenticated;
select plan(12);

select has_column(
  'private',
  'ai_invocations',
  'response_contract',
  'focused invocations persist the validated response contract privately'
);
select has_column(
  'private',
  'ai_invocations',
  'detected_intent',
  'focused invocations record the deterministic intent'
);
select has_function(
  'public',
  'stage_ai_response_contract',
  array['uuid','uuid','jsonb','text','text[]','text','integer'],
  'trusted workers can stage a validated Trailie response'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.stage_ai_response_contract(uuid,uuid,jsonb,text,text[],text,integer)',
    'execute'
  ),
  'browser roles cannot stage Trailie response contracts'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.stage_ai_response_contract(uuid,uuid,jsonb,text,text[],text,integer)',
    'execute'
  ),
  'service workers can stage Trailie response contracts'
);

insert into auth.users (id, instance_id, aud, role, created_at, updated_at, is_anonymous)
values (
  '8a100000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  now(),
  now(),
  true
);

select set_config(
  'request.jwt.claim.sub',
  '8a100000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;
create temporary table intelligence_trip as
select * from public.create_trip_unprotected('Trailie Intelligence', 'Mira', null);
create temporary table intelligence_message as
select public.send_message(
  (select room_id from intelligence_trip),
  (select participant_id from intelligence_trip),
  '@Trailie Is Yellowstone good in October?',
  '8a200000-0000-4000-8000-000000000001',
  null
) as payload;
reset role;
grant select on table intelligence_trip, intelligence_message to service_role;

set local role service_role;
create temporary table intelligence_invocation as
select public.create_ai_invocation(
  (select room_id from intelligence_trip),
  ((select payload->>'id' from intelligence_message)::uuid),
  (select participant_id from intelligence_trip),
  'explicit_mention',
  'Is Yellowstone good in October?',
  'trailie-focused-v2'
) as payload;
create temporary table intelligence_run as
select public.start_ai_run(
  ((select payload->>'id' from intelligence_invocation)::uuid),
  'gpt-5.6-terra',
  'trailie-focused-v2'
) as payload;

select public.stage_ai_response_contract(
  ((select payload->>'id' from intelligence_invocation)::uuid),
  ((select payload->>'run_id' from intelligence_run)::uuid),
  jsonb_build_object(
    'schemaVersion','1',
    'responseId',(select payload->>'id' from intelligence_invocation),
    'sourceMessageId',(select payload->>'id' from intelligence_message),
    'createdAt','2026-07-20T12:00:00.000Z',
    'intent','direct_question',
    'message','October can be a good time for fewer crowds.',
    'blocks',jsonb_build_array(
      jsonb_build_object(
        'type','markdown',
        'markdown','October can be a good time for fewer crowds.'
      )
    ),
    'warnings',jsonb_build_array(),
    'sources',jsonb_build_array(),
    'assumptions',jsonb_build_array(),
    'unresolvedQuestions',jsonb_build_array(),
    'suggestedActions',jsonb_build_array(),
    'persistenceDirective','none',
    'approvalDirective','not_required',
    'freshness','not_applicable',
    'privacyLevel','room'
  ),
  'direct_question',
  array['trip','requester_permissions','recent_messages'],
  'pass',
  0
);
create temporary table intelligence_completed as
select public.complete_ai_run(
  ((select payload->>'id' from intelligence_invocation)::uuid),
  ((select payload->>'run_id' from intelligence_run)::uuid),
  'October can be a good time for fewer crowds.',
  'resp_8a',
  'req_8a',
  20,
  12,
  0,
  0,
  32,
  120
) as payload;
reset role;

select is(
  (
    select detected_intent
    from private.ai_invocations
    where id = ((select payload->>'id' from intelligence_invocation)::uuid)
  ),
  'direct_question',
  'the deterministic intent is recorded'
);
select is(
  (
    select validation_result
    from private.ai_invocations
    where id = ((select payload->>'id' from intelligence_invocation)::uuid)
  ),
  'pass',
  'the response validation result is recorded'
);
select is(
  (
    select context_sections
    from private.ai_invocations
    where id = ((select payload->>'id' from intelligence_invocation)::uuid)
  ),
  array['trip','requester_permissions','recent_messages']::text[],
  'only safe context section names are recorded'
);
select is(
  (
    select response_contract->>'message'
    from private.ai_invocations
    where id = ((select payload->>'id' from intelligence_invocation)::uuid)
  ),
  'October can be a good time for fewer crowds.',
  'the validated contract is staged without a raw provider payload'
);

select set_config(
  'request.jwt.claim.sub',
  '8a100000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;
create temporary table intelligence_history as
select public.get_room_messages(
  (select room_id from intelligence_trip),
  null,
  null,
  30
) as payload;
reset role;

select is(
  (
    select message->'trailie_response'->>'intent'
    from jsonb_array_elements(
      (select payload->'messages' from intelligence_history)
    ) message
    where message->>'message_type' = 'trailie'
  ),
  'direct_question',
  'members receive the structured response with the persisted message'
);
select is(
  (
    select message->'trailie_response'->>'message'
    from jsonb_array_elements(
      (select payload->'messages' from intelligence_history)
    ) message
    where message->>'message_type' = 'trailie'
  ),
  'October can be a good time for fewer crowds.',
  'the structured response and fallback message agree'
);
select ok(
  (
    select message->'trailie_response'
    from jsonb_array_elements(
      (select payload->'messages' from intelligence_history)
    ) message
    where message->>'message_type' = 'user'
  ) = 'null'::jsonb,
  'human messages never receive a Trailie response contract'
);

select * from finish();
rollback;
