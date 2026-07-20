alter table private.ai_invocations
  add column response_contract jsonb,
  add column response_contract_run_id uuid references private.ai_runs(id),
  add column detected_intent text,
  add column context_sections text[] not null default '{}'::text[],
  add column validation_result text,
  add column repair_count integer not null default 0,
  add constraint ai_invocations_detected_intent_valid check (
    detected_intent is null or detected_intent in (
      'direct_question','destination_discovery','destination_comparison',
      'trip_context_question','preference_capture','constraint_capture',
      'planning_readiness','create_itinerary','itinerary_question',
      'itinerary_revision','map_question','route_question',
      'lodging_recommendation','lodging_search','flight_guidance',
      'flight_search','reservation_question','booking_handoff',
      'evidence_question','weather_question','permit_question',
      'group_conflict','approval_question','version_question',
      'unsupported_action'
    )
  ),
  add constraint ai_invocations_context_sections_valid check (
    context_sections <@ array[
      'trip','requester_permissions','shared_trip_context','crew_signals',
      'recent_messages','current_plan','version_history','planning','revision',
      'selected_lodging','selected_flights','evidence'
    ]::text[]
  ),
  add constraint ai_invocations_validation_result_valid check (
    validation_result is null or validation_result in ('pass','failed')
  ),
  add constraint ai_invocations_repair_count_valid check (
    repair_count between 0 and 1
  ),
  add constraint ai_invocations_response_contract_valid check (
    response_contract is null or (
      pg_catalog.jsonb_typeof(response_contract) = 'object'
      and response_contract->>'schemaVersion' = '1'
      and response_contract->>'privacyLevel' = 'room'
      and response_contract->>'intent' = detected_intent
      and response_contract->>'responseId' = id::text
      and response_contract->>'sourceMessageId' = source_message_id::text
      and pg_catalog.char_length(response_contract->>'message') between 1 and 4000
      and pg_catalog.jsonb_typeof(response_contract->'blocks') = 'array'
      and pg_catalog.jsonb_array_length(response_contract->'blocks') <= 12
    )
  );

create function public.stage_ai_response_contract(
  target_invocation_id uuid,
  target_run_id uuid,
  validated_response_contract jsonb,
  target_detected_intent text,
  target_context_sections text[],
  target_validation_result text,
  target_repair_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invocation private.ai_invocations%rowtype;
  run private.ai_runs%rowtype;
begin
  select item.* into invocation
  from private.ai_invocations item
  where item.id = target_invocation_id
  for update;
  if not found then
    raise exception using errcode='P0001', message='Invocation not found.';
  end if;
  if invocation.status <> 'running' then
    raise exception using errcode='P0001', message='Invocation is not running.';
  end if;

  select item.* into run
  from private.ai_runs item
  where item.id = target_run_id
    and item.invocation_id = invocation.id
  for update;
  if not found or run.status <> 'started' then
    raise exception using errcode='P0001', message='AI run is invalid.';
  end if;

  if validated_response_contract is null
    or pg_catalog.jsonb_typeof(validated_response_contract) <> 'object'
    or validated_response_contract->>'schemaVersion' <> '1'
    or validated_response_contract->>'privacyLevel' <> 'room'
    or validated_response_contract->>'intent' is distinct from target_detected_intent
    or validated_response_contract->>'responseId' is distinct from invocation.id::text
    or validated_response_contract->>'sourceMessageId' is distinct from invocation.source_message_id::text
    or pg_catalog.char_length(validated_response_contract->>'message') not between 1 and 4000
    or pg_catalog.jsonb_typeof(validated_response_contract->'blocks') <> 'array'
    or pg_catalog.jsonb_array_length(validated_response_contract->'blocks') > 12
  then
    raise exception using errcode='P0001', message='Trailie response contract is invalid.';
  end if;

  if target_context_sections is null
    or not target_context_sections <@ array[
      'trip','requester_permissions','shared_trip_context','crew_signals',
      'recent_messages','current_plan','version_history','planning','revision',
      'selected_lodging','selected_flights','evidence'
    ]::text[]
    or target_validation_result <> 'pass'
    or target_repair_count not between 0 and 1
  then
    raise exception using errcode='P0001', message='Trailie response metadata is invalid.';
  end if;

  update private.ai_invocations
  set
    response_contract = validated_response_contract,
    response_contract_run_id = run.id,
    detected_intent = target_detected_intent,
    context_sections = target_context_sections,
    validation_result = target_validation_result,
    repair_count = target_repair_count
  where id = invocation.id;

  return pg_catalog.jsonb_build_object('status','staged','invocation_id',invocation.id);
end;
$$;

create or replace function private.message_payload(
  target_message_id uuid,
  current_participant_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', message.id,
    'room_id', message.room_id,
    'participant_id', message.participant_id,
    'message_type', message.message_type,
    'body', message.body,
    'trailie_response', case
      when message.message_type = 'trailie' then (
        select invocation.response_contract
        from private.ai_invocations invocation
        where invocation.response_message_id = message.id
        limit 1
      )
      else null
    end,
    'client_message_id', message.client_message_id,
    'reply_to_message_id', message.reply_to_message_id,
    'sender', pg_catalog.jsonb_build_object(
      'participant_id', sender.id,
      'display_name', sender.display_name,
      'role', sender.role
    ),
    'reply', case
      when reply.id is null then null
      else pg_catalog.jsonb_build_object(
        'id', reply.id,
        'body', reply.body,
        'sender_display_name', reply_sender.display_name
      )
    end,
    'reactions', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'reaction', summary.reaction,
          'count', summary.reaction_count,
          'reacted_by_current_participant', summary.reacted_by_current_participant
        )
        order by summary.reaction_order
      )
      from (
        select
          reaction.reaction,
          pg_catalog.count(*)::integer as reaction_count,
          pg_catalog.bool_or(reaction.participant_id = current_participant_id) as reacted_by_current_participant,
          case reaction.reaction
            when 'like' then 1
            when 'love' then 2
            when 'laugh' then 3
            when 'celebrate' then 4
            when 'thinking' then 5
          end as reaction_order
        from public.message_reactions reaction
        where reaction.message_id = message.id
        group by reaction.reaction
      ) summary
    ), '[]'::jsonb),
    'created_at', message.created_at,
    'edited_at', message.edited_at,
    'deleted_at', message.deleted_at
  )
  from public.messages message
  join public.participants sender on sender.id = message.participant_id
  left join public.messages reply on reply.id = message.reply_to_message_id
  left join public.participants reply_sender on reply_sender.id = reply.participant_id
  where message.id = target_message_id
    and message.deleted_at is null;
$$;

revoke all on function public.stage_ai_response_contract(
  uuid,uuid,jsonb,text,text[],text,integer
) from public, anon, authenticated;
grant execute on function public.stage_ai_response_contract(
  uuid,uuid,jsonb,text,text[],text,integer
) to service_role;
