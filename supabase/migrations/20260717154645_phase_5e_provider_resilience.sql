alter table private.ai_provider_attempts
  add column provider_status_code integer
    check (provider_status_code is null or provider_status_code between 100 and 599),
  add column retry_after_ms integer
    check (retry_after_ms is null or retry_after_ms between 0 and 30000),
  add column next_retry_at timestamptz,
  add column correlation_id text
    check (
      correlation_id is null
      or (
        char_length(correlation_id) between 1 and 100
        and correlation_id ~ '^[a-zA-Z0-9_.:-]+$'
      )
    ),
  add column recovery_count integer not null default 0
    check (recovery_count between 0 and 3);

create index ai_provider_attempts_retry_eligibility_idx
  on private.ai_provider_attempts (next_retry_at, workflow, operation_key, attempt)
  where status = 'failed' and retryable;

alter function public.reserve_ai_quota(uuid,uuid,text,text,bigint,uuid)
  rename to reserve_ai_quota_phase_5c;

create function public.reserve_ai_quota(
  target_user_id uuid,
  target_room_id uuid,
  target_workflow text,
  target_model text,
  estimated_tokens bigint,
  reservation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  reserved jsonb;
begin
  reserved := public.reserve_ai_quota_phase_5c(
    target_user_id,
    target_room_id,
    target_workflow,
    target_model,
    estimated_tokens,
    reservation_id
  );
  if reserved->>'status' = 'released' then
    update private.ai_quota_reservations
    set status = 'reserved', actual_tokens = null, reconciled_at = null
    where id = reservation_id and status = 'released';
    reserved := jsonb_build_object(
      'reservationId', reservation_id,
      'status', 'reserved'
    );
  end if;
  return reserved;
end;
$$;

create function public.claim_ai_provider_attempt(
  target_workflow text,
  target_operation_key text,
  target_attempt integer,
  target_model text,
  target_lease_owner uuid,
  target_lease_ms integer,
  target_quota_reservation_id uuid,
  target_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed jsonb;
  claimed_id uuid;
begin
  if target_correlation_id is null
    or char_length(target_correlation_id) not between 1 and 100
    or target_correlation_id !~ '^[a-zA-Z0-9_.:-]+$'
  then
    raise exception using errcode = 'P0001', message = 'invalid_provider_correlation';
  end if;

  claimed := public.claim_ai_provider_attempt(
    target_workflow,
    target_operation_key,
    target_attempt,
    target_model,
    target_lease_owner,
    target_lease_ms,
    target_quota_reservation_id
  );
  claimed_id := (claimed->>'attemptId')::uuid;

  update private.ai_provider_attempts
  set
    correlation_id = coalesce(correlation_id, target_correlation_id),
    recovery_count = recovery_count + case
      when coalesce((claimed->>'recovered')::boolean, false) then 1
      else 0
    end
  where id = claimed_id
    and (correlation_id is null or correlation_id = target_correlation_id);

  if not found then
    raise exception using errcode = 'P0001', message = 'provider_attempt_identity_mismatch';
  end if;
  return claimed;
end;
$$;

create function public.fail_ai_provider_attempt(
  target_attempt_id uuid,
  target_lease_owner uuid,
  target_error_code text,
  target_retryable boolean,
  target_provider_status_code integer,
  target_retry_after_ms integer,
  target_provider_request_id text,
  target_next_retry_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  failed jsonb;
begin
  if target_provider_status_code is not null
      and target_provider_status_code not between 100 and 599
    or target_retry_after_ms is not null
      and target_retry_after_ms not between 0 and 30000
    or target_provider_request_id is not null
      and (
        char_length(target_provider_request_id) not between 1 and 200
        or target_provider_request_id !~ '^[a-zA-Z0-9_.:-]+$'
      )
    or not target_retryable and target_next_retry_at is not null
  then
    raise exception using errcode = 'P0001', message = 'invalid_provider_failure';
  end if;

  failed := public.fail_ai_provider_attempt(
    target_attempt_id,
    target_lease_owner,
    target_error_code,
    target_retryable
  );
  update private.ai_provider_attempts
  set
    provider_status_code = target_provider_status_code,
    retry_after_ms = target_retry_after_ms,
    provider_request_id = nullif(left(target_provider_request_id, 200), ''),
    next_retry_at = case when target_retryable then target_next_retry_at else null end,
    updated_at = now()
  where id = target_attempt_id;
  return failed;
end;
$$;

create function public.get_ai_invocation_context(target_invocation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', invocation.id,
    'roomId', invocation.room_id,
    'sourceMessageId', invocation.source_message_id,
    'participantId', invocation.requested_by_participant_id,
    'userId', invocation.requested_by_user_id,
    'normalizedRequest', invocation.normalized_request,
    'promptVersion', invocation.prompt_version,
    'retryCount', invocation.retry_count,
    'providerAttemptCount', (
      select count(*)
      from private.ai_provider_attempts attempt
      where attempt.workflow = 'focused_answer'
        and attempt.operation_key = 'focused:' || invocation.id::text
    ),
    'status', invocation.status,
    'model', (
      select run.model
      from private.ai_runs run
      where run.invocation_id = invocation.id
      order by run.created_at desc, run.id desc
      limit 1
    ),
    'messages', coalesce((
      select jsonb_agg(message_row.payload order by message_row.created_at, message_row.id)
      from (
        select
          message.created_at,
          message.id,
          jsonb_build_object(
            'id', message.id,
            'body', message.body,
            'displayName', case
              when message.message_type = 'trailie' then 'Trailie'
              else coalesce(participant.display_name, 'Crew member')
            end,
            'messageType', message.message_type,
            'createdAt', message.created_at,
            'deletedAt', message.deleted_at
          ) payload
        from public.messages message
        left join public.participants participant on participant.id = message.participant_id
        where message.room_id = invocation.room_id
          and message.deleted_at is null
          and message.message_type <> 'system'
        order by
          (message.id = invocation.source_message_id) desc,
          message.created_at desc,
          message.id desc
        limit 14
      ) message_row
    ), '[]'::jsonb)
  )
  from private.ai_invocations invocation
  where invocation.id = target_invocation_id;
$$;

create function public.list_recoverable_ai_invocations(batch_size integer default 10)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select invocation.id
  from private.ai_invocations invocation
  where invocation.status in ('queued', 'running', 'failed')
    and invocation.response_message_id is null
    and (
      (
        invocation.status = 'queued'
        and invocation.created_at <= now() - interval '1 minute'
      )
      or (
        invocation.status = 'running'
        and invocation.started_at <= now() - interval '5 minutes'
      )
      or exists (
        select 1
        from private.ai_provider_attempts attempt
        where attempt.workflow = 'focused_answer'
          and attempt.operation_key = 'focused:' || invocation.id::text
          and attempt.status = 'failed'
          and attempt.retryable
          and attempt.attempt < 2
          and coalesce(attempt.next_retry_at, attempt.updated_at) <= now()
      )
      or exists (
        select 1
        from private.ai_provider_attempts attempt
        where attempt.workflow = 'focused_answer'
          and attempt.operation_key = 'focused:' || invocation.id::text
          and attempt.status = 'running'
          and attempt.attempt < 2
          and attempt.lease_expires_at <= now()
      )
    )
    and (
      select count(*)
      from private.ai_provider_attempts attempt
      where attempt.workflow = 'focused_answer'
        and attempt.operation_key = 'focused:' || invocation.id::text
    ) < 2
  order by invocation.created_at, invocation.id
  limit least(greatest(batch_size, 1), 50);
$$;

create or replace function public.list_recoverable_message_extractions(
  batch_size integer default 20
)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select extraction.message_id
  from private.message_extractions extraction
  where extraction.attempt_count < 2
    and (
      (
        extraction.status = 'queued'
        and extraction.created_at < now() - interval '1 minute'
      )
      or (
        extraction.status = 'running'
        and extraction.started_at < now() - interval '5 minutes'
      )
      or (
        extraction.status = 'failed'
        and (
          exists (
            select 1
            from private.ai_provider_attempts attempt
            where attempt.workflow = 'memory_extraction'
              and attempt.operation_key = 'memory:' || extraction.message_id::text
              and attempt.status = 'provider_completed'
          )
          or exists (
            select 1
            from private.ai_provider_attempts attempt
            where attempt.workflow = 'memory_extraction'
              and attempt.operation_key = 'memory:' || extraction.message_id::text
              and attempt.status = 'failed'
              and attempt.retryable
              and coalesce(attempt.next_retry_at, attempt.updated_at) <= now()
          )
        )
      )
    )
  order by extraction.created_at, extraction.id
  limit least(greatest(batch_size, 1), 100);
$$;

create function public.get_provider_resilience_report(target_room_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'focused', jsonb_build_object(
      'attemptCount', (
        select count(*)
        from private.ai_provider_attempts attempt
        join private.ai_invocations invocation
          on attempt.workflow = 'focused_answer'
          and attempt.operation_key = 'focused:' || invocation.id::text
        where invocation.room_id = target_room_id
      ),
      'retryCount', (
        select coalesce(sum(attempt.retry_count), 0)
        from private.ai_provider_attempts attempt
        join private.ai_invocations invocation
          on attempt.workflow = 'focused_answer'
          and attempt.operation_key = 'focused:' || invocation.id::text
        where invocation.room_id = target_room_id
      ),
      'recoveryCount', (
        select coalesce(sum(attempt.recovery_count), 0)
        from private.ai_provider_attempts attempt
        join private.ai_invocations invocation
          on attempt.workflow = 'focused_answer'
          and attempt.operation_key = 'focused:' || invocation.id::text
        where invocation.room_id = target_room_id
      ),
      'providerStatuses', coalesce((
        select jsonb_agg(attempt.provider_status_code order by attempt.created_at)
          filter (where attempt.provider_status_code is not null)
        from private.ai_provider_attempts attempt
        join private.ai_invocations invocation
          on attempt.workflow = 'focused_answer'
          and attempt.operation_key = 'focused:' || invocation.id::text
        where invocation.room_id = target_room_id
      ), '[]'::jsonb),
      'providerLatencyMs', (
        select coalesce(sum(attempt.provider_duration_ms), 0)
        from private.ai_provider_attempts attempt
        join private.ai_invocations invocation
          on attempt.workflow = 'focused_answer'
          and attempt.operation_key = 'focused:' || invocation.id::text
        where invocation.room_id = target_room_id
      ),
      'totalWorkflowLatencyMs', (
        select coalesce(max(attempt.total_duration_ms), 0)
        from private.ai_provider_attempts attempt
        join private.ai_invocations invocation
          on attempt.workflow = 'focused_answer'
          and attempt.operation_key = 'focused:' || invocation.id::text
        where invocation.room_id = target_room_id
      ),
      'totalTokens', (
        select coalesce(sum(attempt.total_tokens), 0)
        from private.ai_provider_attempts attempt
        join private.ai_invocations invocation
          on attempt.workflow = 'focused_answer'
          and attempt.operation_key = 'focused:' || invocation.id::text
        where invocation.room_id = target_room_id
      ),
      'unresolvedCount', (
        select count(*)
        from private.ai_provider_attempts attempt
        join private.ai_invocations invocation
          on attempt.workflow = 'focused_answer'
          and attempt.operation_key = 'focused:' || invocation.id::text
        where invocation.room_id = target_room_id
          and attempt.status in ('running','provider_completed')
      )
    ),
    'memory', jsonb_build_object(
      'attemptCount', (
        select count(*)
        from private.ai_provider_attempts attempt
        join private.message_extractions extraction
          on attempt.workflow = 'memory_extraction'
          and attempt.operation_key = 'memory:' || extraction.message_id::text
        where extraction.room_id = target_room_id
      ),
      'retryCount', (
        select coalesce(sum(attempt.retry_count), 0)
        from private.ai_provider_attempts attempt
        join private.message_extractions extraction
          on attempt.workflow = 'memory_extraction'
          and attempt.operation_key = 'memory:' || extraction.message_id::text
        where extraction.room_id = target_room_id
      ),
      'recoveryCount', (
        select coalesce(sum(attempt.recovery_count), 0)
        from private.ai_provider_attempts attempt
        join private.message_extractions extraction
          on attempt.workflow = 'memory_extraction'
          and attempt.operation_key = 'memory:' || extraction.message_id::text
        where extraction.room_id = target_room_id
      ),
      'providerStatuses', coalesce((
        select jsonb_agg(attempt.provider_status_code order by attempt.created_at)
          filter (where attempt.provider_status_code is not null)
        from private.ai_provider_attempts attempt
        join private.message_extractions extraction
          on attempt.workflow = 'memory_extraction'
          and attempt.operation_key = 'memory:' || extraction.message_id::text
        where extraction.room_id = target_room_id
      ), '[]'::jsonb),
      'providerLatencyMs', (
        select coalesce(sum(attempt.provider_duration_ms), 0)
        from private.ai_provider_attempts attempt
        join private.message_extractions extraction
          on attempt.workflow = 'memory_extraction'
          and attempt.operation_key = 'memory:' || extraction.message_id::text
        where extraction.room_id = target_room_id
      ),
      'totalWorkflowLatencyMs', (
        select coalesce(max(attempt.total_duration_ms), 0)
        from private.ai_provider_attempts attempt
        join private.message_extractions extraction
          on attempt.workflow = 'memory_extraction'
          and attempt.operation_key = 'memory:' || extraction.message_id::text
        where extraction.room_id = target_room_id
      ),
      'totalTokens', (
        select coalesce(sum(attempt.total_tokens), 0)
        from private.ai_provider_attempts attempt
        join private.message_extractions extraction
          on attempt.workflow = 'memory_extraction'
          and attempt.operation_key = 'memory:' || extraction.message_id::text
        where extraction.room_id = target_room_id
      ),
      'unresolvedCount', (
        select count(*)
        from private.message_extractions extraction
        where extraction.room_id = target_room_id
          and extraction.status in ('queued','running')
      )
    ),
    'messages', jsonb_build_object(
      'user', (
        select count(*) from public.messages
        where room_id = target_room_id and message_type = 'user'
      ),
      'trailie', (
        select count(*) from public.messages
        where room_id = target_room_id and message_type = 'trailie'
      )
    ),
    'planVersions', coalesce((
      select jsonb_agg(plan.version order by plan.version)
      from public.trip_plans plan
      where plan.room_id = target_room_id and plan.status = 'published'
    ), '[]'::jsonb),
    'shares', jsonb_build_object(
      'active', (
        select count(*) from public.plan_share_links share
        join public.trip_plans plan on plan.id = share.trip_plan_id
        where plan.room_id = target_room_id and share.status = 'active'
      ),
      'revoked', (
        select count(*) from public.plan_share_links share
        join public.trip_plans plan on plan.id = share.trip_plan_id
        where plan.room_id = target_room_id and share.status = 'revoked'
      )
    )
  );
$$;

revoke execute on function
  public.claim_ai_provider_attempt(text,text,integer,text,uuid,integer,uuid,text),
  public.fail_ai_provider_attempt(uuid,uuid,text,boolean,integer,integer,text,timestamptz),
  public.get_ai_invocation_context(uuid),
  public.list_recoverable_ai_invocations(integer),
  public.list_recoverable_message_extractions(integer),
  public.get_provider_resilience_report(uuid),
  public.reserve_ai_quota(uuid,uuid,text,text,bigint,uuid),
  public.reserve_ai_quota_phase_5c(uuid,uuid,text,text,bigint,uuid)
from public, anon, authenticated, service_role;

grant execute on function
  public.claim_ai_provider_attempt(text,text,integer,text,uuid,integer,uuid,text),
  public.fail_ai_provider_attempt(uuid,uuid,text,boolean,integer,integer,text,timestamptz),
  public.get_ai_invocation_context(uuid),
  public.list_recoverable_ai_invocations(integer),
  public.list_recoverable_message_extractions(integer),
  public.get_provider_resilience_report(uuid),
  public.reserve_ai_quota(uuid,uuid,text,text,bigint,uuid)
to service_role;
