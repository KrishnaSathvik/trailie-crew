create table private.ai_provider_attempts (
  id uuid primary key default gen_random_uuid(),
  workflow text not null check (workflow in (
    'focused_answer','memory_extraction','planning_summary',
    'itinerary_generation','itinerary_repair',
    'revision_analysis','revision_candidate','revision_repair'
  )),
  operation_key text not null check (length(operation_key) between 1 and 240),
  attempt integer not null check (attempt between 1 and 3),
  model text not null check (length(model) between 1 and 160),
  status text not null default 'running' check (status in ('running','provider_completed','applied','failed')),
  lease_owner uuid not null,
  lease_expires_at timestamptz not null,
  quota_reservation_id uuid references private.ai_quota_reservations(id) on delete set null,
  provider_response_id text,
  provider_request_id text,
  validated_result jsonb,
  result_hash text,
  input_tokens bigint check (input_tokens is null or input_tokens>=0),
  output_tokens bigint check (output_tokens is null or output_tokens>=0),
  reasoning_tokens bigint check (reasoning_tokens is null or reasoning_tokens>=0),
  cached_input_tokens bigint check (cached_input_tokens is null or cached_input_tokens>=0),
  total_tokens bigint check (total_tokens is null or total_tokens>=0),
  provider_duration_ms integer check (provider_duration_ms is null or provider_duration_ms>=0),
  total_duration_ms integer check (total_duration_ms is null or total_duration_ms>=0),
  retry_count integer not null default 0 check (retry_count between 0 and 2),
  repair_count integer not null default 0 check (repair_count between 0 and 1),
  error_code text check (error_code is null or length(error_code) between 1 and 80),
  retryable boolean not null default false,
  recovery_required boolean not null default false,
  recovered boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  provider_completed_at timestamptz,
  applied_at timestamptz,
  unique(workflow,operation_key,attempt)
);

create unique index ai_provider_attempts_response_id_idx
on private.ai_provider_attempts(provider_response_id)
where provider_response_id is not null;

create index ai_provider_attempts_recovery_idx
on private.ai_provider_attempts(status,lease_expires_at,updated_at)
where status in ('running','provider_completed','failed');

alter table private.ai_provider_attempts enable row level security;
alter table private.ai_provider_attempts force row level security;
revoke all on private.ai_provider_attempts from public,anon,authenticated,service_role;

create function public.claim_ai_provider_attempt(
  target_workflow text,
  target_operation_key text,
  target_attempt integer,
  target_model text,
  target_lease_owner uuid,
  target_lease_ms integer,
  target_quota_reservation_id uuid default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  current private.ai_provider_attempts%rowtype;
  expires timestamptz;
  result_available boolean;
  durable_found boolean:=false;
begin
  if target_workflow not in (
    'focused_answer','memory_extraction','planning_summary',
    'itinerary_generation','itinerary_repair',
    'revision_analysis','revision_candidate','revision_repair'
  ) or length(coalesce(target_operation_key,'')) not between 1 and 240
    or target_attempt not between 1 and 3
    or length(coalesce(target_model,'')) not between 1 and 160
    or target_lease_owner is null then
    raise exception using errcode='P0001',message='invalid_provider_attempt';
  end if;
  if target_lease_ms not between 60000 and 900000 then
    raise exception using errcode='P0001',message='invalid_provider_lease';
  end if;
  expires:=now()+make_interval(secs=>target_lease_ms/1000.0);

  select * into current from private.ai_provider_attempts
  where workflow=target_workflow and operation_key=target_operation_key
    and status in ('provider_completed','applied')
  order by attempt desc limit 1
  for update;
  if found then
    durable_found:=true;
  else
    select * into current from private.ai_provider_attempts
    where workflow=target_workflow and operation_key=target_operation_key and attempt=target_attempt
    for update;
  end if;
  if not found then
    insert into private.ai_provider_attempts(
      workflow,operation_key,attempt,model,lease_owner,lease_expires_at,quota_reservation_id
    ) values(
      target_workflow,target_operation_key,target_attempt,target_model,target_lease_owner,expires,target_quota_reservation_id
    ) returning * into current;
    return jsonb_build_object(
      'attemptId',current.id,'claimed',true,'resultAvailable',false,'applied',false,
      'attempt',current.attempt,'status',current.status
    );
  end if;

  if current.model<>target_model
    or (not durable_found and current.quota_reservation_id is distinct from target_quota_reservation_id) then
    raise exception using errcode='P0001',message='provider_attempt_identity_mismatch';
  end if;
  if current.status='applied' then
    return jsonb_build_object(
      'attemptId',current.id,'claimed',false,'resultAvailable',false,'applied',true,
      'attempt',current.attempt,'status',current.status
    );
  end if;
  if current.status='failed' then
    return jsonb_build_object(
      'attemptId',current.id,'claimed',false,'resultAvailable',false,'applied',false,
      'attempt',current.attempt,'status',current.status,'retryable',current.retryable
    );
  end if;
  if current.lease_expires_at>now() then
    return jsonb_build_object(
      'attemptId',current.id,'claimed',false,
      'resultAvailable',current.status='provider_completed','applied',false,
      'attempt',current.attempt,'status',current.status
    );
  end if;

  result_available:=current.status='provider_completed';
  update private.ai_provider_attempts set
    lease_owner=target_lease_owner,
    lease_expires_at=expires,
    recovered=true,
    recovery_required=result_available,
    updated_at=now()
  where id=current.id returning * into current;
  return jsonb_build_object(
    'attemptId',current.id,'claimed',true,'resultAvailable',result_available,'applied',false,
    'attempt',current.attempt,'status',current.status,'recovered',true
  );
end; $$;

create function public.complete_ai_provider_attempt(
  target_attempt_id uuid,
  target_lease_owner uuid,
  target_provider_response_id text,
  target_provider_request_id text,
  target_validated_result jsonb,
  target_input_tokens bigint,
  target_output_tokens bigint,
  target_reasoning_tokens bigint,
  target_cached_input_tokens bigint,
  target_total_tokens bigint,
  target_provider_duration_ms integer,
  target_total_duration_ms integer,
  target_retry_count integer,
  target_repair_count integer
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current private.ai_provider_attempts%rowtype;
begin
  select * into current from private.ai_provider_attempts where id=target_attempt_id for update;
  if not found then raise exception using errcode='P0001',message='provider_attempt_not_found'; end if;
  if current.status in ('provider_completed','applied') then
    return jsonb_build_object('attemptId',current.id,'status',current.status,'resultHash',current.result_hash);
  end if;
  if current.status<>'running' or current.lease_owner<>target_lease_owner or current.lease_expires_at<=now() then
    raise exception using errcode='P0001',message='provider_attempt_lease_not_owned';
  end if;
  if target_validated_result is null or jsonb_typeof(target_validated_result)<>'object'
    or octet_length(target_validated_result::text)>1048576
    or coalesce(target_input_tokens,0)<0 or coalesce(target_output_tokens,0)<0
    or coalesce(target_reasoning_tokens,0)<0 or coalesce(target_cached_input_tokens,0)<0
    or coalesce(target_total_tokens,0)<0
    or target_provider_duration_ms<0 or target_total_duration_ms<0
    or target_retry_count not between 0 and 2 or target_repair_count not between 0 and 1 then
    raise exception using errcode='P0001',message='invalid_provider_result';
  end if;
  update private.ai_provider_attempts set
    status='provider_completed',
    provider_response_id=nullif(left(target_provider_response_id,200),''),
    provider_request_id=nullif(left(target_provider_request_id,200),''),
    validated_result=target_validated_result,
    result_hash=encode(extensions.digest(target_validated_result::text,'sha256'),'hex'),
    input_tokens=target_input_tokens,
    output_tokens=target_output_tokens,
    reasoning_tokens=target_reasoning_tokens,
    cached_input_tokens=target_cached_input_tokens,
    total_tokens=target_total_tokens,
    provider_duration_ms=target_provider_duration_ms,
    total_duration_ms=target_total_duration_ms,
    retry_count=target_retry_count,
    repair_count=target_repair_count,
    quota_reservation_id=case
      when exists(select 1 from private.ai_quota_reservations reservation where reservation.id=current.id)
      then current.id else current.quota_reservation_id end,
    error_code=null,
    retryable=false,
    recovery_required=false,
    provider_completed_at=now(),
    updated_at=now()
  where id=current.id returning * into current;
  return jsonb_build_object('attemptId',current.id,'status',current.status,'resultHash',current.result_hash);
end; $$;

create function public.get_staged_ai_provider_result(
  target_attempt_id uuid,
  target_lease_owner uuid
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare current private.ai_provider_attempts%rowtype;
begin
  select * into current from private.ai_provider_attempts where id=target_attempt_id;
  if not found then raise exception using errcode='P0001',message='provider_attempt_not_found'; end if;
  if current.status<>'provider_completed' or current.lease_owner<>target_lease_owner or current.lease_expires_at<=now() then
    raise exception using errcode='P0001',message='provider_attempt_lease_not_owned';
  end if;
  return jsonb_build_object(
    'attemptId',current.id,'workflow',current.workflow,'operationKey',current.operation_key,
    'attempt',current.attempt,'model',current.model,'validatedResult',current.validated_result,
    'providerResponseId',current.provider_response_id,'providerRequestId',current.provider_request_id,
    'inputTokens',current.input_tokens,'outputTokens',current.output_tokens,
    'reasoningTokens',current.reasoning_tokens,'cachedInputTokens',current.cached_input_tokens,
    'totalTokens',current.total_tokens,'providerDurationMs',current.provider_duration_ms,
    'totalDurationMs',current.total_duration_ms,'retryCount',current.retry_count,
    'repairCount',current.repair_count,'recovered',current.recovered
  );
end; $$;

create function public.mark_ai_provider_attempt_applied(
  target_attempt_id uuid,
  target_lease_owner uuid
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current private.ai_provider_attempts%rowtype;
begin
  select * into current from private.ai_provider_attempts where id=target_attempt_id for update;
  if not found then raise exception using errcode='P0001',message='provider_attempt_not_found'; end if;
  if current.status='applied' then return jsonb_build_object('attemptId',current.id,'status',current.status); end if;
  if current.status<>'provider_completed' or current.lease_owner<>target_lease_owner or current.lease_expires_at<=now() then
    raise exception using errcode='P0001',message='provider_attempt_lease_not_owned';
  end if;
  update private.ai_provider_attempts set
    status='applied',validated_result=null,recovery_required=false,applied_at=now(),updated_at=now()
  where id=current.id returning * into current;
  return jsonb_build_object('attemptId',current.id,'status',current.status,'resultHash',current.result_hash);
end; $$;

create function public.fail_ai_provider_attempt(
  target_attempt_id uuid,
  target_lease_owner uuid,
  target_error_code text,
  target_retryable boolean
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current private.ai_provider_attempts%rowtype;
begin
  select * into current from private.ai_provider_attempts where id=target_attempt_id for update;
  if not found then raise exception using errcode='P0001',message='provider_attempt_not_found'; end if;
  if current.status='failed' then return jsonb_build_object('attemptId',current.id,'status',current.status,'retryable',current.retryable); end if;
  if current.status<>'running' or current.lease_owner<>target_lease_owner then
    raise exception using errcode='P0001',message='provider_attempt_lease_not_owned';
  end if;
  if length(coalesce(target_error_code,'')) not between 1 and 80 then
    raise exception using errcode='P0001',message='invalid_provider_failure';
  end if;
  update private.ai_provider_attempts set
    status='failed',error_code=target_error_code,retryable=target_retryable,
    recovery_required=target_retryable,validated_result=null,updated_at=now()
  where id=current.id returning * into current;
  return jsonb_build_object('attemptId',current.id,'status',current.status,'retryable',current.retryable);
end; $$;

create function public.list_recoverable_ai_provider_attempts(batch_size integer default 10)
returns table(
  attempt_id uuid,workflow text,operation_key text,attempt integer,status text,
  recovery_required boolean,age_seconds bigint
) language sql stable security definer set search_path='' as $$
  select id,workflow,operation_key,attempt,status,recovery_required,
    greatest(extract(epoch from now()-updated_at)::bigint,0)
  from private.ai_provider_attempts
  where (
    status in ('running','provider_completed') and lease_expires_at<=now()
  ) or (
    status='failed' and retryable and lease_expires_at<=now()
  )
  order by updated_at,id
  limit least(greatest(batch_size,1),50);
$$;

create function public.prepare_ai_recovery() returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  requeued_messages integer:=0;
  reconciled_attempts integer:=0;
  affected integer:=0;
  staged record;
begin
  update private.message_extractions
  set status='failed',error_code='recovery_required',completed_at=now()
  where status='running' and attempt_count<2
    and started_at<now()-interval '5 minutes';
  get diagnostics requeued_messages=row_count;

  for staged in
    select attempt.*,invocation.id invocation_id,run.id run_id
    from private.ai_provider_attempts attempt
    join private.ai_invocations invocation
      on attempt.workflow='focused_answer'
      and split_part(attempt.operation_key,':',1)='focused'
      and split_part(attempt.operation_key,':',2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and invocation.id=split_part(attempt.operation_key,':',2)::uuid
    join private.ai_runs run on run.invocation_id=invocation.id and run.status='started'
    where attempt.status='provider_completed' and attempt.lease_expires_at<=now()
      and invocation.status='running'
    order by attempt.updated_at
    for update of attempt,invocation,run skip locked
  loop
    perform public.complete_ai_run(
      staged.invocation_id,staged.run_id,staged.validated_result->>'body',
      staged.provider_response_id,staged.provider_request_id,
      staged.input_tokens,staged.output_tokens,staged.reasoning_tokens,
      staged.cached_input_tokens,staged.total_tokens,staged.total_duration_ms
    );
    update private.ai_provider_attempts set
      status='applied',validated_result=null,recovery_required=false,
      applied_at=now(),updated_at=now()
    where id=staged.id;
    reconciled_attempts:=reconciled_attempts+1;
  end loop;

  update private.ai_runs run set
    status='failed',error_code='recovery_required',completed_at=now()
  from private.ai_invocations invocation
  where run.invocation_id=invocation.id and run.status='started'
    and invocation.status='running'
    and invocation.started_at<now()-interval '5 minutes'
    and not exists(
      select 1 from private.ai_provider_attempts attempt
      where attempt.workflow='focused_answer'
        and attempt.operation_key='focused:'||invocation.id::text
        and attempt.status='provider_completed'
    );
  update private.ai_invocations invocation set
    status='failed',error_code='recovery_required',completed_at=now()
  where invocation.status='running'
    and invocation.started_at<now()-interval '5 minutes'
    and not exists(
      select 1 from private.ai_provider_attempts attempt
      where attempt.workflow='focused_answer'
        and attempt.operation_key='focused:'||invocation.id::text
        and attempt.status='provider_completed'
    );

  update private.ai_provider_attempts attempt set
    status='applied',validated_result=null,recovery_required=false,
    applied_at=now(),updated_at=now()
  where attempt.status='provider_completed' and (
    (
      attempt.workflow='focused_answer'
      and split_part(attempt.operation_key,':',1)='focused'
      and split_part(attempt.operation_key,':',2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and exists(
        select 1 from private.ai_invocations invocation
        where invocation.id=split_part(attempt.operation_key,':',2)::uuid
          and invocation.status='completed'
      )
    ) or (
      attempt.workflow='memory_extraction'
      and split_part(attempt.operation_key,':',1)='memory'
      and split_part(attempt.operation_key,':',2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and exists(
        select 1 from private.message_extractions extraction
        where extraction.message_id=split_part(attempt.operation_key,':',2)::uuid
          and extraction.status='completed'
      )
    ) or (
      attempt.workflow='planning_summary'
      and split_part(attempt.operation_key,':',1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and split_part(attempt.operation_key,':',2)='summary'
      and split_part(attempt.operation_key,':',3) ~ '^[0-9]+$'
      and exists(
        select 1 from public.planning_summaries summary
        where summary.planning_request_id=split_part(attempt.operation_key,':',1)::uuid
          and summary.version=split_part(attempt.operation_key,':',3)::integer
          and summary.summary_json=attempt.validated_result
      )
    ) or (
      attempt.workflow in ('itinerary_generation','itinerary_repair')
      and split_part(attempt.operation_key,':',1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and exists(
        select 1 from public.trip_plans plan
        where plan.id=split_part(attempt.operation_key,':',1)::uuid
          and plan.itinerary_json=attempt.validated_result
      )
    ) or (
      attempt.workflow='revision_analysis'
      and split_part(attempt.operation_key,':',1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and split_part(attempt.operation_key,':',3) ~ '^[0-9]+$'
      and exists(
        select 1 from public.plan_change_analyses analysis
        where analysis.change_request_id=split_part(attempt.operation_key,':',1)::uuid
          and analysis.version=split_part(attempt.operation_key,':',3)::integer
          and analysis.analysis_json=attempt.validated_result
      )
    ) or (
      attempt.workflow in ('revision_candidate','revision_repair')
      and split_part(attempt.operation_key,':',1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and exists(
        select 1 from public.plan_change_requests request
        join public.trip_plans candidate on candidate.id=request.candidate_trip_plan_id
        where request.id=split_part(attempt.operation_key,':',1)::uuid
          and candidate.itinerary_json=attempt.validated_result
      )
    )
  );
  get diagnostics affected=row_count;
  reconciled_attempts:=reconciled_attempts+affected;
  return jsonb_build_object(
    'requeuedMessageExtractions',requeued_messages,
    'reconciledProviderAttempts',reconciled_attempts
  );
end; $$;

create or replace function public.start_ai_run(
  target_invocation_id uuid,target_model text,target_prompt_version text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare invocation private.ai_invocations%rowtype; run private.ai_runs%rowtype;
begin
  select item.* into invocation from private.ai_invocations item
  where item.id=target_invocation_id for update;
  if not found then raise exception using errcode='P0001',message='Invocation not found.'; end if;
  if invocation.status='completed' then
    return jsonb_build_object('status','completed','response_message_id',invocation.response_message_id);
  end if;
  if invocation.status='running' and invocation.started_at>now()-interval '5 minutes' then
    return jsonb_build_object('status','running');
  end if;
  if invocation.status='running' then
    update private.ai_runs set status='failed',error_code='recovery_required',completed_at=now()
    where invocation_id=invocation.id and status='started';
    update private.ai_invocations set status='failed',error_code='recovery_required',completed_at=now()
    where id=invocation.id;
    invocation.status:='failed';
  end if;
  if invocation.status='cancelled' or (invocation.status='failed' and invocation.retry_count>=1) then
    raise exception using errcode='P0001',message='Retry is not allowed.';
  end if;
  if invocation.prompt_version<>target_prompt_version then
    raise exception using errcode='P0001',message='Prompt version mismatch.';
  end if;
  if invocation.status='failed' then
    update private.ai_invocations set retry_count=retry_count+1 where id=invocation.id;
  end if;
  update private.ai_invocations set
    status='running',started_at=now(),completed_at=null,error_code=null
  where id=invocation.id;
  insert into private.ai_runs(invocation_id,model,prompt_version)
  values(invocation.id,target_model,target_prompt_version) returning * into run;
  return jsonb_build_object('status','started','run_id',run.id);
end; $$;

create or replace function public.reserve_ai_quota(
  target_user_id uuid,target_room_id uuid,target_workflow text,target_model text,
  estimated_tokens bigint,reservation_id uuid
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  settings private.ai_quota_settings%rowtype;
  model_limit private.ai_model_limits%rowtype;
  existing private.ai_quota_reservations%rowtype;
  user_count bigint;room_count bigint;global_count bigint;model_count bigint;
  user_tokens bigint;room_tokens bigint;global_tokens bigint;model_tokens bigint;
  today date:=(timezone('utc',now()))::date;
begin
  perform pg_advisory_xact_lock(hashtextextended('trailie-ai-quota:'||today::text,0));
  select * into existing from private.ai_quota_reservations where id=reservation_id for update;
  if found then
    if existing.user_id<>target_user_id or existing.room_id<>target_room_id
      or existing.workflow<>target_workflow or existing.model<>target_model
      or existing.reserved_tokens<>estimated_tokens then
      raise exception using errcode='P0001',message='quota_reservation_identity_mismatch';
    end if;
    return jsonb_build_object('reservationId',existing.id,'status',existing.status);
  end if;
  select * into settings from private.ai_quota_settings where singleton for update;
  if not settings.generation_enabled then raise exception using errcode='P0001',message='ai_disabled'; end if;
  if estimated_tokens<=0 then raise exception using errcode='P0001',message='provider_budget_unavailable'; end if;
  if not exists(select 1 from public.participants where room_id=target_room_id and user_id=target_user_id and status='active') then raise exception using errcode='P0001',message='membership_required'; end if;
  select count(*),coalesce(sum(coalesce(actual_tokens,reserved_tokens)),0) into user_count,user_tokens from private.ai_quota_reservations where user_id=target_user_id and usage_day=today and status<>'released';
  select count(*),coalesce(sum(coalesce(actual_tokens,reserved_tokens)),0) into room_count,room_tokens from private.ai_quota_reservations where room_id=target_room_id and usage_day=today and status<>'released';
  select count(*),coalesce(sum(coalesce(actual_tokens,reserved_tokens)),0) into global_count,global_tokens from private.ai_quota_reservations where usage_day=today and status<>'released';
  if user_count>=settings.user_daily_invocations or user_tokens+estimated_tokens>settings.user_daily_tokens then raise exception using errcode='P0001',message='user_ai_limit_reached'; end if;
  if room_count>=settings.room_daily_invocations or room_tokens+estimated_tokens>settings.room_daily_tokens then raise exception using errcode='P0001',message='room_ai_limit_reached'; end if;
  if global_count>=settings.global_daily_invocations or global_tokens+estimated_tokens>settings.global_daily_tokens then raise exception using errcode='P0001',message='global_ai_limit_reached'; end if;
  select * into model_limit from private.ai_model_limits where model=target_model;
  if found then
    if not model_limit.enabled then raise exception using errcode='P0001',message='provider_budget_unavailable'; end if;
    select count(*),coalesce(sum(coalesce(actual_tokens,reserved_tokens)),0) into model_count,model_tokens from private.ai_quota_reservations where usage_day=today and model=target_model and status<>'released';
    if model_count>=model_limit.daily_invocations or model_tokens+estimated_tokens>model_limit.daily_tokens then raise exception using errcode='P0001',message='global_ai_limit_reached'; end if;
  end if;
  insert into private.ai_quota_reservations(id,user_id,room_id,workflow,model,reserved_tokens)
  values(reservation_id,target_user_id,target_room_id,target_workflow,target_model,estimated_tokens);
  return jsonb_build_object('reservationId',reservation_id,'status','reserved');
end; $$;

revoke execute on function
  public.claim_ai_provider_attempt(text,text,integer,text,uuid,integer,uuid),
  public.complete_ai_provider_attempt(uuid,uuid,text,text,jsonb,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer),
  public.get_staged_ai_provider_result(uuid,uuid),
  public.mark_ai_provider_attempt_applied(uuid,uuid),
  public.fail_ai_provider_attempt(uuid,uuid,text,boolean),
  public.list_recoverable_ai_provider_attempts(integer),
  public.prepare_ai_recovery()
from public,anon,authenticated,service_role;

grant execute on function
  public.claim_ai_provider_attempt(text,text,integer,text,uuid,integer,uuid),
  public.complete_ai_provider_attempt(uuid,uuid,text,text,jsonb,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer),
  public.get_staged_ai_provider_result(uuid,uuid),
  public.mark_ai_provider_attempt_applied(uuid,uuid),
  public.fail_ai_provider_attempt(uuid,uuid,text,boolean),
  public.list_recoverable_ai_provider_attempts(integer),
  public.prepare_ai_recovery()
to service_role;
