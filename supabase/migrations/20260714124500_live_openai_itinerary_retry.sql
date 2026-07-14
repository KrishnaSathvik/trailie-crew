create function public.retry_itinerary_generation(
  target_trip_plan_id uuid,
  participant_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  plan public.trip_plans%rowtype;
  request public.planning_requests%rowtype;
  attempt_count integer;
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

  perform 1
  from public.participants
  where id = participant_id
    and room_id = plan.room_id
    and user_id = caller
    and status = 'active';
  if not found then
    raise exception using errcode = 'P0001', message = 'Membership required.';
  end if;

  if plan.status <> 'failed'
    or plan.error_code not in ('model_timeout', 'model_rate_limited', 'model_unavailable', 'validation_failed') then
    raise exception using errcode = 'P0001', message = 'Plan generation not allowed.';
  end if;

  select * into request
  from public.planning_requests
  where id = plan.planning_request_id
  for update;
  if not found
    or request.status <> 'approved_for_generation'
    or request.approved_summary_version is null
    or request.approved_summary_version <> plan.basis_summary_version
    or private.planning_is_stale(request) then
    raise exception using errcode = 'P0001', message = 'Approved summary is stale.';
  end if;

  select count(*) into attempt_count
  from private.itinerary_runs
  where trip_plan_id = plan.id;
  if attempt_count >= 3 and not (
    plan.error_code = 'validation_failed' and plan.itinerary_json is not null
  ) then
    raise exception using errcode = 'P0001', message = 'Retry exhausted.';
  end if;

  update public.trip_plans
  set status = case
        when plan.error_code = 'validation_failed' and plan.itinerary_json is not null
          then 'validating'::public.trip_plan_status
        else 'generating'::public.trip_plan_status
      end,
      error_code = null,
      failed_at = null
  where id = plan.id;
  insert into public.trip_plan_events(trip_plan_id, room_id, event_type)
  values (plan.id, plan.room_id, 'generation_started');

  return jsonb_build_object(
    'id', plan.id,
    'status', case
      when plan.error_code = 'validation_failed' and plan.itinerary_json is not null
        then 'validating'
      else 'generating'
    end,
    'version', plan.version
  );
end;
$$;

revoke execute on function public.retry_itinerary_generation(uuid, uuid)
from public, anon, service_role;
grant execute on function public.retry_itinerary_generation(uuid, uuid)
to authenticated;

create or replace function private.claim_itinerary_generation(target_trip_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan public.trip_plans%rowtype;
  active private.itinerary_runs%rowtype;
  next_attempt integer;
  selected_type private.itinerary_run_type;
begin
  select * into plan from public.trip_plans where id = target_trip_plan_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Plan not found.';
  end if;
  if plan.status in ('published', 'blocked', 'failed', 'superseded') then
    return jsonb_build_object('claimed', false, 'status', plan.status);
  end if;

  select * into active
  from private.itinerary_runs
  where trip_plan_id = plan.id and status = 'running'
  for update;
  if found and active.created_at > now() - interval '5 minutes' then
    return jsonb_build_object(
      'claimed', false,
      'status', plan.status,
      'attemptCount', active.attempt
    );
  elsif found then
    update private.itinerary_runs
    set status = 'failed', error_code = 'stale_lease', completed_at = now()
    where id = active.id;
  end if;

  select coalesce(max(attempt), 0) into next_attempt
  from private.itinerary_runs
  where trip_plan_id = plan.id;

  if plan.status = 'validating' and plan.itinerary_json is not null then
    return jsonb_build_object(
      'claimed', true,
      'status', plan.status,
      'attemptCount', next_attempt,
      'roomId', plan.room_id,
      'planningRequestId', plan.planning_request_id,
      'basisSummaryVersion', plan.basis_summary_version,
      'stage', 'validate'
    );
  end if;

  next_attempt := next_attempt + 1;
  if next_attempt > 3 then
    update public.trip_plans
    set status = 'failed', error_code = 'retry_exhausted', failed_at = now()
    where id = plan.id;
    insert into public.trip_plan_events(trip_plan_id, room_id, event_type)
    values (plan.id, plan.room_id, 'failed');
    return jsonb_build_object(
      'claimed', false,
      'status', 'failed',
      'errorCode', 'retry_exhausted'
    );
  end if;

  selected_type := case
    when plan.status = 'needs_revision' then 'repair'::private.itinerary_run_type
    else 'generation'::private.itinerary_run_type
  end;
  insert into private.itinerary_runs(trip_plan_id, run_type, attempt, model, prompt_version)
  values (plan.id, selected_type, next_attempt, plan.model, plan.prompt_version)
  returning * into active;
  update public.trip_plans
  set status = case
        when plan.itinerary_json is null then 'generating'::public.trip_plan_status
        else 'validating'::public.trip_plan_status
      end,
      error_code = null,
      failed_at = null
  where id = plan.id;
  return jsonb_build_object(
    'claimed', true,
    'status', plan.status,
    'runId', active.id,
    'attemptCount', next_attempt,
    'runType', selected_type,
    'roomId', plan.room_id,
    'planningRequestId', plan.planning_request_id,
    'basisSummaryVersion', plan.basis_summary_version,
    'stage', case
      when plan.itinerary_json is null then 'generate'
      when plan.validation_status = 'needs_revision' then 'repair'
      else 'validate'
    end
  );
end;
$$;
