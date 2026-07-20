create table private.ai_runtime_telemetry (
  request_id uuid primary key,
  room_id_hash text not null,
  response_type text not null,
  detected_intent text,
  request_complexity text,
  selected_model_route text,
  tool_classes_selected text[] not null default '{}',
  started_at timestamptz not null,
  invocation_detection_ms integer,
  permission_check_ms integer,
  intent_classification_ms integer,
  context_assembly_ms integer,
  conversation_summary_ms integer,
  model_queue_ms integer,
  time_to_first_model_token_ms integer,
  time_to_first_visible_output_ms integer,
  model_generation_ms integer,
  tool_call_ms jsonb not null default '{}'::jsonb,
  tool_observations jsonb not null default '{}'::jsonb,
  provider_call_count integer not null default 0,
  validation_ms integer,
  repair_ms integer,
  repair_count integer not null default 0,
  evidence_binding_ms integer,
  map_binding_ms integer,
  booking_binding_ms integer,
  persistence_ms integer,
  final_render_ready_ms integer,
  total_duration_ms integer not null,
  input_tokens bigint,
  output_tokens bigint,
  estimated_cost numeric(12, 6),
  cancellation_reason text,
  timeout_reason text,
  fallback_reason text,
  success_state text not null,
  recorded_at timestamptz not null default now(),
  constraint ai_runtime_room_hash_valid check (
    room_id_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint ai_runtime_response_type_valid check (
    response_type in (
      'normal_chat',
      'context_backed',
      'tool_backed',
      'planning_summary',
      'full_itinerary',
      'small_revision',
      'large_revision',
      'map',
      'booking',
      'unsupported'
    )
  ),
  constraint ai_runtime_complexity_valid check (
    request_complexity is null or request_complexity in (
      'instant',
      'simple',
      'context_backed',
      'tool_backed',
      'planning_summary',
      'full_itinerary',
      'small_revision',
      'large_revision',
      'evidence_refresh',
      'map_resolution',
      'booking_guidance',
      'unsupported'
    )
  ),
  constraint ai_runtime_route_valid check (
    selected_model_route is null or selected_model_route in (
      'deterministic',
      'fast',
      'reasoning_planning',
      'tool_pipeline'
    )
  ),
  constraint ai_runtime_state_valid check (
    success_state in ('success', 'failure', 'cancelled', 'timeout', 'fallback')
  ),
  constraint ai_runtime_identifiers_bounded check (
    (detected_intent is null or (
      detected_intent ~ '^[a-z][a-z0-9_]{0,79}$'
    ))
    and (cancellation_reason is null or (
      cancellation_reason ~ '^[a-z][a-z0-9_]{0,79}$'
    ))
    and (timeout_reason is null or (
      timeout_reason ~ '^[a-z][a-z0-9_]{0,79}$'
    ))
    and (fallback_reason is null or (
      fallback_reason ~ '^[a-z][a-z0-9_]{0,79}$'
    ))
  ),
  constraint ai_runtime_counts_nonnegative check (
    provider_call_count between 0 and 100
    and repair_count between 0 and 20
    and coalesce(input_tokens, 0) >= 0
    and coalesce(output_tokens, 0) >= 0
    and coalesce(estimated_cost, 0) >= 0
  ),
  constraint ai_runtime_timings_nonnegative check (
    coalesce(invocation_detection_ms, 0) >= 0
    and coalesce(permission_check_ms, 0) >= 0
    and coalesce(intent_classification_ms, 0) >= 0
    and coalesce(context_assembly_ms, 0) >= 0
    and coalesce(conversation_summary_ms, 0) >= 0
    and coalesce(model_queue_ms, 0) >= 0
    and coalesce(time_to_first_model_token_ms, 0) >= 0
    and coalesce(time_to_first_visible_output_ms, 0) >= 0
    and coalesce(model_generation_ms, 0) >= 0
    and coalesce(validation_ms, 0) >= 0
    and coalesce(repair_ms, 0) >= 0
    and coalesce(evidence_binding_ms, 0) >= 0
    and coalesce(map_binding_ms, 0) >= 0
    and coalesce(booking_binding_ms, 0) >= 0
    and coalesce(persistence_ms, 0) >= 0
    and coalesce(final_render_ready_ms, 0) >= 0
    and total_duration_ms >= 0
  ),
  constraint ai_runtime_tool_payloads_bounded check (
    jsonb_typeof(tool_call_ms) = 'object'
    and jsonb_typeof(tool_observations) = 'object'
    and pg_column_size(tool_call_ms) <= 4096
    and pg_column_size(tool_observations) <= 16384
  )
);

create index ai_runtime_telemetry_started_idx
  on private.ai_runtime_telemetry (started_at desc);
create index ai_runtime_telemetry_class_idx
  on private.ai_runtime_telemetry (
    request_complexity,
    success_state,
    started_at desc
  );

alter table private.ai_runtime_telemetry enable row level security;
alter table private.ai_runtime_telemetry force row level security;

create policy ai_runtime_telemetry_deny_browser_roles
  on private.ai_runtime_telemetry
  for all
  to public
  using (false)
  with check (false);

revoke all on table private.ai_runtime_telemetry
  from public, anon, authenticated, service_role;

create function public.record_ai_runtime_telemetry(payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed_tool_classes constant text[] := array[
    'nps',
    'ridb',
    'weather',
    'maps_geocoding',
    'directions',
    'booking_normalization',
    'approved_search_handoff',
    'database_read',
    'database_write',
    'recovery_workflow'
  ];
  selected_tools text[] := '{}';
  safe_tool_call_ms jsonb := '{}'::jsonb;
  safe_tool_observations jsonb := '{}'::jsonb;
  tool_key text;
  tool_value jsonb;
begin
  if jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_runtime_telemetry';
  end if;
  if payload ?| array[
    'prompt',
    'messages',
    'conversation',
    'memory',
    'authorization',
    'sessionToken',
    'guestToken',
    'inviteToken',
    'url',
    'providerPayload'
  ] then
    raise exception using errcode = '22023', message = 'unsafe_runtime_telemetry';
  end if;

  for tool_key in
    select jsonb_array_elements_text(
      coalesce(payload->'toolClassesSelected', '[]'::jsonb)
    )
  loop
    if not (tool_key = any(allowed_tool_classes)) then
      raise exception using errcode = '22023', message = 'invalid_runtime_tool_class';
    end if;
    selected_tools := array_append(selected_tools, tool_key);
  end loop;

  for tool_key, tool_value in
    select key, value
    from jsonb_each(coalesce(payload->'toolCallMs', '{}'::jsonb))
  loop
    if not (tool_key = any(allowed_tool_classes))
      or jsonb_typeof(tool_value) <> 'number'
    then
      raise exception using errcode = '22023', message = 'invalid_runtime_tool_timing';
    end if;
    safe_tool_call_ms := safe_tool_call_ms || jsonb_build_object(
      tool_key,
      least(greatest((tool_value #>> '{}')::integer, 0), 3600000)
    );
  end loop;

  for tool_key, tool_value in
    select key, value
    from jsonb_each(coalesce(payload->'toolObservations', '{}'::jsonb))
  loop
    if not (tool_key = any(allowed_tool_classes))
      or jsonb_typeof(tool_value) <> 'object'
    then
      raise exception using errcode = '22023', message = 'invalid_runtime_tool_observation';
    end if;
    safe_tool_observations := safe_tool_observations || jsonb_build_object(
      tool_key,
      jsonb_build_object(
        'durationMs',
        least(greatest(coalesce((tool_value->>'durationMs')::integer, 0), 0), 3600000),
        'cache',
        case
          when tool_value->>'cache' in ('hit', 'miss', 'not_applicable')
            then tool_value->>'cache'
          else 'not_applicable'
        end,
        'retries',
        least(greatest(coalesce((tool_value->>'retries')::integer, 0), 0), 20),
        'state',
        case
          when tool_value->>'state' in (
            'success',
            'failure',
            'timeout',
            'rate_limited'
          )
            then tool_value->>'state'
          else 'failure'
        end
      )
    );
  end loop;

  insert into private.ai_runtime_telemetry (
    request_id,
    room_id_hash,
    response_type,
    detected_intent,
    request_complexity,
    selected_model_route,
    tool_classes_selected,
    started_at,
    invocation_detection_ms,
    permission_check_ms,
    intent_classification_ms,
    context_assembly_ms,
    conversation_summary_ms,
    model_queue_ms,
    time_to_first_model_token_ms,
    time_to_first_visible_output_ms,
    model_generation_ms,
    tool_call_ms,
    tool_observations,
    provider_call_count,
    validation_ms,
    repair_ms,
    repair_count,
    evidence_binding_ms,
    map_binding_ms,
    booking_binding_ms,
    persistence_ms,
    final_render_ready_ms,
    total_duration_ms,
    input_tokens,
    output_tokens,
    estimated_cost,
    cancellation_reason,
    timeout_reason,
    fallback_reason,
    success_state
  )
  values (
    (payload->>'requestId')::uuid,
    payload->>'roomIdHash',
    payload->>'responseType',
    nullif(payload->>'detectedIntent', ''),
    nullif(payload->>'requestComplexity', ''),
    nullif(payload->>'selectedModelRoute', ''),
    selected_tools,
    (payload->>'startedAt')::timestamptz,
    nullif(payload->>'invocationDetectionMs', '')::integer,
    nullif(payload->>'permissionCheckMs', '')::integer,
    nullif(payload->>'intentClassificationMs', '')::integer,
    nullif(payload->>'contextAssemblyMs', '')::integer,
    nullif(payload->>'conversationSummaryMs', '')::integer,
    nullif(payload->>'modelQueueMs', '')::integer,
    nullif(payload->>'timeToFirstModelTokenMs', '')::integer,
    nullif(payload->>'timeToFirstVisibleOutputMs', '')::integer,
    nullif(payload->>'modelGenerationMs', '')::integer,
    safe_tool_call_ms,
    safe_tool_observations,
    coalesce((payload->>'providerCallCount')::integer, 0),
    nullif(payload->>'validationMs', '')::integer,
    nullif(payload->>'repairMs', '')::integer,
    coalesce((payload->>'repairCount')::integer, 0),
    nullif(payload->>'evidenceBindingMs', '')::integer,
    nullif(payload->>'mapBindingMs', '')::integer,
    nullif(payload->>'bookingBindingMs', '')::integer,
    nullif(payload->>'persistenceMs', '')::integer,
    nullif(payload->>'finalRenderReadyMs', '')::integer,
    (payload->>'totalDurationMs')::integer,
    nullif(payload->>'inputTokens', '')::bigint,
    nullif(payload->>'outputTokens', '')::bigint,
    nullif(payload->>'estimatedCost', '')::numeric,
    nullif(payload->>'cancellationReason', ''),
    nullif(payload->>'timeoutReason', ''),
    nullif(payload->>'fallbackReason', ''),
    payload->>'successState'
  )
  on conflict (request_id) do nothing;
end;
$$;

revoke all on function public.record_ai_runtime_telemetry(jsonb)
  from public, anon, authenticated;
grant execute on function public.record_ai_runtime_telemetry(jsonb)
  to service_role;

create function public.cancel_planning_generation(
  target_request_id uuid,
  target_participant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  request public.planning_requests%rowtype;
  participant public.participants%rowtype;
begin
  if caller is null then
    raise exception using errcode = 'P0001', message = 'Authentication required.';
  end if;
  select * into request
  from public.planning_requests
  where id = target_request_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Planning request not found.';
  end if;
  select * into participant
  from public.participants
  where id = target_participant_id
    and room_id = request.room_id
    and user_id = caller
    and status = 'active';
  if not found then
    raise exception using errcode = 'P0001', message = 'Membership required.';
  end if;
  if request.status = 'cancelled' then
    return jsonb_build_object('id', request.id, 'status', 'cancelled');
  end if;
  if request.status not in ('draft', 'generating_summary') then
    raise exception using errcode = 'P0001', message = 'Planning cancellation not allowed.';
  end if;
  update private.planning_runs
  set status = 'failed',
      error_code = 'workflow_cancelled',
      completed_at = now()
  where planning_request_id = request.id and status = 'running';
  update public.planning_requests
  set status = 'cancelled',
      cancelled_at = now(),
      generation_error_code = 'workflow_cancelled'
  where id = request.id;
  return jsonb_build_object('id', request.id, 'status', 'cancelled');
end;
$$;

create function public.cancel_itinerary_generation(
  target_trip_plan_id uuid,
  target_participant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  plan public.trip_plans%rowtype;
  participant public.participants%rowtype;
begin
  if caller is null then
    raise exception using errcode = 'P0001', message = 'Authentication required.';
  end if;
  select * into plan
  from public.trip_plans
  where id = target_trip_plan_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Plan not found.';
  end if;
  select * into participant
  from public.participants
  where id = target_participant_id
    and room_id = plan.room_id
    and user_id = caller
    and status = 'active';
  if not found then
    raise exception using errcode = 'P0001', message = 'Membership required.';
  end if;
  if plan.status = 'failed' and plan.error_code = 'workflow_cancelled' then
    return jsonb_build_object('id', plan.id, 'status', 'stopped');
  end if;
  if plan.status not in ('generating', 'validating', 'needs_revision') then
    raise exception using errcode = 'P0001', message = 'Plan cancellation not allowed.';
  end if;
  update private.itinerary_runs
  set status = 'cancelled',
      error_code = 'workflow_cancelled',
      completed_at = now()
  where trip_plan_id = plan.id and status = 'running';
  update public.trip_plans
  set status = 'failed',
      error_code = 'workflow_cancelled',
      failed_at = now()
  where id = plan.id;
  insert into public.trip_plan_events(trip_plan_id, room_id, event_type)
  values(plan.id, plan.room_id, 'failed');
  return jsonb_build_object('id', plan.id, 'status', 'stopped');
end;
$$;

create or replace function private.fail_itinerary_generation(
  target_trip_plan_id uuid,
  target_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan public.trip_plans%rowtype;
begin
  select * into plan
  from public.trip_plans
  where id = target_trip_plan_id
  for update;
  if not found or plan.status in ('published', 'superseded') then
    raise exception using errcode = 'P0001', message = 'Plan failure not allowed.';
  end if;
  if plan.status = 'failed' and plan.error_code = 'workflow_cancelled' then
    return;
  end if;
  update private.itinerary_runs
  set status = 'failed',
      error_code = left(target_error_code, 80),
      completed_at = now()
  where trip_plan_id = plan.id and status = 'running';
  update public.trip_plans
  set status = 'failed',
      error_code = left(target_error_code, 80),
      failed_at = now()
  where id = plan.id;
  insert into public.trip_plan_events(trip_plan_id, room_id, event_type)
  values(plan.id, plan.room_id, 'failed');
end;
$$;

revoke all on function public.cancel_planning_generation(uuid, uuid)
  from public, anon, service_role;
revoke all on function public.cancel_itinerary_generation(uuid, uuid)
  from public, anon, service_role;
grant execute on function public.cancel_planning_generation(uuid, uuid)
  to authenticated;
grant execute on function public.cancel_itinerary_generation(uuid, uuid)
  to authenticated;
