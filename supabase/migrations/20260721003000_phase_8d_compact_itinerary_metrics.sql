alter table private.ai_runtime_telemetry
  add column expansion_ms integer;

create or replace function public.create_itinerary_generation(
  target_planning_request_id uuid,
  participant_id uuid
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
  summary public.planning_summaries%rowtype;
  room public.rooms%rowtype;
  existing public.trip_plans%rowtype;
  created public.trip_plans%rowtype;
  next_version integer;
begin
  if caller is null then
    raise exception using errcode = 'P0001', message = 'Authentication required.';
  end if;
  select * into request
  from public.planning_requests
  where id = target_planning_request_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Planning request not found.';
  end if;
  select * into participant
  from public.participants
  where id = participant_id
    and room_id = request.room_id
    and user_id = caller
    and status = 'active';
  if not found then
    raise exception using errcode = 'P0001', message = 'Membership required.';
  end if;
  select * into room
  from public.rooms
  where id = request.room_id
  for update;
  if room.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'Plan generation not allowed.';
  end if;
  if request.status <> 'approved_for_generation'
    or request.approved_summary_version is null
    or request.approved_summary_version <> request.current_summary_version
  then
    raise exception using errcode = 'P0001', message = 'Approved summary required.';
  end if;
  if private.planning_is_stale(request) then
    raise exception using errcode = 'P0001', message = 'Approved summary is stale.';
  end if;
  select * into summary
  from public.planning_summaries
  where planning_request_id = request.id
    and version = request.approved_summary_version;
  if not found
    or summary.readiness_status <> 'ready_for_review'
    or jsonb_array_length(
      coalesce(summary.summary_json #> '{readiness,blockers}', '[]'::jsonb)
    ) > 0
  then
    raise exception using errcode = 'P0001', message = 'Plan generation not allowed.';
  end if;
  select * into existing
  from public.trip_plans
  where planning_request_id = request.id
    and basis_summary_version = summary.version;
  if found then
    return jsonb_build_object(
      'id', existing.id,
      'status', existing.status,
      'version', existing.version,
      'created', false
    );
  end if;
  next_version := coalesce(room.current_plan_version, 0) + 1;
  insert into public.trip_plans (
    room_id,
    planning_request_id,
    planning_summary_id,
    version,
    status,
    schema_version,
    prompt_version,
    model,
    basis_summary_version,
    basis_summary_hash,
    created_by_participant_id,
    created_by_user_id
  ) values (
    room.id,
    request.id,
    summary.id,
    next_version,
    'generating',
    '1',
    'trailie-itinerary-compact-v1',
    'gpt-5.6-terra',
    summary.version,
    summary.summary_hash,
    participant.id,
    caller
  ) returning * into created;
  insert into public.trip_plan_events (trip_plan_id, room_id, event_type)
  values (created.id, created.room_id, 'generation_started');
  return jsonb_build_object(
    'id', created.id,
    'status', created.status,
    'version', created.version,
    'created', true
  );
end;
$$;

alter table private.ai_runtime_telemetry
  add constraint ai_runtime_expansion_ms_nonnegative
  check (coalesce(expansion_ms, 0) between 0 and 3600000);

create function public.record_ai_runtime_expansion_metric(
  target_request_id uuid,
  target_expansion_ms integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_expansion_ms not between 0 and 3600000 then
    raise exception using errcode = '22023', message = 'invalid_runtime_expansion_metric';
  end if;

  update private.ai_runtime_telemetry
  set expansion_ms = target_expansion_ms
  where request_id = target_request_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'runtime_telemetry_not_found';
  end if;
end;
$$;

revoke all on function public.record_ai_runtime_expansion_metric(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.record_ai_runtime_expansion_metric(uuid, integer)
  to service_role;

create function public.get_phase8d_itinerary_runtime_samples(
  target_room_id_hash text,
  window_started_at timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'requestId', telemetry.request_id,
      'startedAt', telemetry.started_at,
      'state', telemetry.success_state,
      'selectedModelRoute', telemetry.selected_model_route,
      'generationDurationMs', telemetry.model_generation_ms,
      'expansionDurationMs', telemetry.expansion_ms,
      'semanticValidationDurationMs', telemetry.validation_ms,
      'repairCount', telemetry.repair_count,
      'previewReadyDurationMs', telemetry.final_render_ready_ms,
      'totalDurationMs', telemetry.total_duration_ms,
      'inputTokens', telemetry.input_tokens,
      'outputTokens', telemetry.output_tokens,
      'fallbackReason', telemetry.fallback_reason,
      'failureReason', coalesce(
        telemetry.timeout_reason,
        telemetry.cancellation_reason,
        case when telemetry.success_state = 'failure' then 'workflow_failed' end
      )
    ) order by telemetry.started_at
  ), '[]'::jsonb)
  from private.ai_runtime_telemetry as telemetry
  where target_room_id_hash ~ '^[a-f0-9]{64}$'
    and telemetry.room_id_hash = target_room_id_hash
    and telemetry.response_type = 'full_itinerary'
    and telemetry.started_at >= window_started_at;
$$;

revoke all on function public.get_phase8d_itinerary_runtime_samples(text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_phase8d_itinerary_runtime_samples(text, timestamptz)
  to service_role;
