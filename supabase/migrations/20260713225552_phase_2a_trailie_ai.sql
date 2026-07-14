create table private.ai_invocations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  source_message_id uuid references public.messages(id),
  requested_by_participant_id uuid not null references public.participants(id),
  requested_by_user_id uuid not null references auth.users(id),
  invocation_type text not null,
  normalized_request text not null,
  prompt_version text not null,
  status text not null default 'queued',
  idempotency_key text not null unique,
  response_message_id uuid unique references public.messages(id),
  error_code text,
  retry_count integer not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint ai_invocations_type_valid check (
    invocation_type in ('explicit_mention', 'direct_address', 'reply_to_trailie', 'application_action')
  ),
  constraint ai_invocations_status_valid check (
    status in ('queued', 'running', 'completed', 'failed', 'cancelled')
  ),
  constraint ai_invocations_request_valid check (
    normalized_request = btrim(normalized_request)
    and char_length(normalized_request) between 1 and 4000
  ),
  constraint ai_invocations_prompt_version_valid check (
    prompt_version = btrim(prompt_version) and char_length(prompt_version) between 1 and 100
  ),
  constraint ai_invocations_participant_room_user_fkey
    foreign key (requested_by_participant_id, room_id, requested_by_user_id)
    references public.participants (id, room_id, user_id),
  constraint ai_invocations_source_room_fkey
    foreign key (source_message_id, room_id)
    references public.messages (id, room_id),
  constraint ai_invocations_retry_count_valid check (retry_count between 0 and 1)
);

create index ai_invocations_room_created_idx
  on private.ai_invocations (room_id, created_at desc);
create index ai_invocations_user_created_idx
  on private.ai_invocations (requested_by_user_id, created_at desc);
create index ai_invocations_active_idx
  on private.ai_invocations (room_id, source_message_id)
  where status in ('queued', 'running');

create table private.ai_runs (
  id uuid primary key default gen_random_uuid(),
  invocation_id uuid not null references private.ai_invocations(id) on delete cascade,
  provider text not null default 'openai',
  model text not null,
  prompt_version text not null,
  openai_response_id text,
  openai_request_id text,
  status text not null default 'started',
  input_tokens bigint,
  output_tokens bigint,
  reasoning_tokens bigint,
  cached_input_tokens bigint,
  total_tokens bigint,
  latency_ms integer,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint ai_runs_provider_valid check (provider = 'openai'),
  constraint ai_runs_status_valid check (status in ('started', 'completed', 'failed', 'cancelled')),
  constraint ai_runs_model_valid check (model = btrim(model) and char_length(model) between 1 and 100),
  constraint ai_runs_prompt_version_valid check (prompt_version = btrim(prompt_version) and char_length(prompt_version) between 1 and 100),
  constraint ai_runs_usage_nonnegative check (
    coalesce(input_tokens, 0) >= 0 and coalesce(output_tokens, 0) >= 0
    and coalesce(reasoning_tokens, 0) >= 0 and coalesce(cached_input_tokens, 0) >= 0
    and coalesce(total_tokens, 0) >= 0 and coalesce(latency_ms, 0) >= 0
  )
);

create index ai_runs_invocation_created_idx
  on private.ai_runs (invocation_id, created_at desc);

alter table private.ai_invocations enable row level security;
alter table private.ai_invocations force row level security;
alter table private.ai_runs enable row level security;
alter table private.ai_runs force row level security;

create policy ai_invocations_deny_browser_roles on private.ai_invocations
as restrictive for all to anon, authenticated using (false) with check (false);
create policy ai_runs_deny_browser_roles on private.ai_runs
as restrictive for all to anon, authenticated using (false) with check (false);

revoke all on table private.ai_invocations from public, anon, authenticated, service_role;
revoke all on table private.ai_runs from public, anon, authenticated, service_role;

-- The trusted invocation route reads persisted message and participant state
-- before entering the narrowly scoped mutation functions below. Browser roles
-- retain their existing RLS-protected privileges; private AI tables stay closed.
grant select on public.messages, public.participants to service_role;

create function public.create_ai_invocation(
  target_room_id uuid,
  target_source_message_id uuid,
  target_participant_id uuid,
  target_invocation_type text,
  target_normalized_request text,
  target_prompt_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owned_participant public.participants%rowtype;
  source_message public.messages%rowtype;
  computed_key text;
  invocation private.ai_invocations%rowtype;
begin
  if target_invocation_type not in ('explicit_mention', 'direct_address', 'reply_to_trailie', 'application_action') then
    raise exception using errcode = 'P0001', message = 'Invocation type is invalid.';
  end if;
  if target_normalized_request is null or target_normalized_request <> btrim(target_normalized_request)
    or char_length(target_normalized_request) not between 1 and 4000 then
    raise exception using errcode = 'P0001', message = 'Invocation request is invalid.';
  end if;
  if target_prompt_version is null or target_prompt_version <> btrim(target_prompt_version)
    or char_length(target_prompt_version) not between 1 and 100 then
    raise exception using errcode = 'P0001', message = 'Prompt version is invalid.';
  end if;

  select participant.* into owned_participant
  from public.participants as participant
  join public.rooms as room on room.id = participant.room_id and room.status = 'active'
  where participant.id = target_participant_id
    and participant.room_id = target_room_id
    and participant.status = 'active';
  if not found then
    raise exception using errcode = 'P0001', message = 'Membership required.';
  end if;

  select message.* into source_message
  from public.messages as message
  where message.id = target_source_message_id
    and message.room_id = target_room_id
    and message.message_type = 'user'
    and message.sender_user_id = owned_participant.user_id
    and message.participant_id = owned_participant.id
    and message.deleted_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Source message is invalid.';
  end if;

  if target_invocation_type = 'reply_to_trailie' and not exists (
    select 1 from public.messages as reply
    where reply.id = source_message.reply_to_message_id
      and reply.room_id = target_room_id
      and reply.message_type = 'trailie'
      and reply.deleted_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'Reply target is invalid.';
  end if;

  computed_key := pg_catalog.encode(
    extensions.digest(
      target_room_id::text || ':' || target_source_message_id::text || ':' || target_invocation_type || ':' || target_prompt_version,
      'sha256'
    ),
    'hex'
  );

  select item.* into invocation from private.ai_invocations as item
  where item.idempotency_key = computed_key for update;
  if found then
    return pg_catalog.jsonb_build_object(
      'id', invocation.id, 'status', invocation.status,
      'response_message_id', invocation.response_message_id,
      'retry_count', invocation.retry_count
    );
  end if;

  if (
    select pg_catalog.count(*) from private.ai_invocations as recent
    where recent.requested_by_user_id = owned_participant.user_id
      and recent.room_id = target_room_id
      and recent.created_at > pg_catalog.clock_timestamp() - interval '10 minutes'
  ) >= 10 then
    raise exception using errcode = 'P0001', message = 'AI rate limit exceeded.';
  end if;

  insert into private.ai_invocations (
    room_id, source_message_id, requested_by_participant_id, requested_by_user_id,
    invocation_type, normalized_request, prompt_version, idempotency_key
  ) values (
    target_room_id, target_source_message_id, owned_participant.id, owned_participant.user_id,
    target_invocation_type, target_normalized_request, target_prompt_version, computed_key
  ) returning * into invocation;

  return pg_catalog.jsonb_build_object(
    'id', invocation.id, 'status', invocation.status,
    'response_message_id', invocation.response_message_id,
    'retry_count', invocation.retry_count
  );
end;
$$;

create function public.start_ai_run(
  target_invocation_id uuid,
  target_model text,
  target_prompt_version text
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
  select item.* into invocation from private.ai_invocations as item
  where item.id = target_invocation_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'Invocation not found.'; end if;
  if invocation.status = 'completed' then
    return pg_catalog.jsonb_build_object('status', 'completed', 'response_message_id', invocation.response_message_id);
  end if;
  if invocation.status = 'running' then
    return pg_catalog.jsonb_build_object('status', 'running');
  end if;
  if invocation.status = 'cancelled' or (invocation.status = 'failed' and invocation.retry_count >= 1) then
    raise exception using errcode = 'P0001', message = 'Retry is not allowed.';
  end if;
  if invocation.prompt_version <> target_prompt_version then
    raise exception using errcode = 'P0001', message = 'Prompt version mismatch.';
  end if;
  if invocation.status = 'failed' then
    update private.ai_invocations set retry_count = retry_count + 1 where id = invocation.id;
  end if;
  update private.ai_invocations
    set status = 'running', started_at = coalesce(started_at, now()), completed_at = null, error_code = null
    where id = invocation.id;
  insert into private.ai_runs (invocation_id, model, prompt_version)
    values (invocation.id, target_model, target_prompt_version) returning * into run;
  return pg_catalog.jsonb_build_object('status', 'started', 'run_id', run.id);
end;
$$;

create function public.complete_ai_run(
  target_invocation_id uuid,
  target_run_id uuid,
  response_body text,
  provider_response_id text,
  provider_request_id text,
  used_input_tokens bigint,
  used_output_tokens bigint,
  used_reasoning_tokens bigint,
  used_cached_input_tokens bigint,
  used_total_tokens bigint,
  measured_latency_ms integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invocation private.ai_invocations%rowtype;
  run private.ai_runs%rowtype;
  message_id uuid;
begin
  select item.* into invocation from private.ai_invocations as item
  where item.id = target_invocation_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'Invocation not found.'; end if;
  if invocation.status = 'completed' then
    return pg_catalog.jsonb_build_object('status', 'completed', 'response_message_id', invocation.response_message_id);
  end if;
  if invocation.status <> 'running' then
    raise exception using errcode = 'P0001', message = 'Invocation is not running.';
  end if;
  select item.* into run from private.ai_runs as item
  where item.id = target_run_id and item.invocation_id = invocation.id for update;
  if not found or run.status <> 'started' then
    raise exception using errcode = 'P0001', message = 'AI run is invalid.';
  end if;
  if response_body is null or response_body <> btrim(response_body)
    or char_length(response_body) not between 1 and 4000 then
    raise exception using errcode = 'P0001', message = 'AI response is invalid.';
  end if;

  insert into public.messages (
    room_id, participant_id, sender_user_id, message_type, body, reply_to_message_id
  ) values (
    invocation.room_id, invocation.requested_by_participant_id, invocation.requested_by_user_id,
    'trailie', response_body, invocation.source_message_id
  ) returning id into message_id;

  update private.ai_runs set
    status = 'completed', openai_response_id = provider_response_id,
    openai_request_id = provider_request_id, input_tokens = used_input_tokens,
    output_tokens = used_output_tokens, reasoning_tokens = used_reasoning_tokens,
    cached_input_tokens = used_cached_input_tokens, total_tokens = used_total_tokens,
    latency_ms = measured_latency_ms, completed_at = now()
  where id = run.id;
  update private.ai_invocations set
    status = 'completed', response_message_id = message_id, completed_at = now(), error_code = null
  where id = invocation.id;

  return pg_catalog.jsonb_build_object('status', 'completed', 'response_message_id', message_id);
end;
$$;

create function public.fail_ai_run(
  target_invocation_id uuid,
  target_run_id uuid,
  safe_error_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare invocation private.ai_invocations%rowtype;
begin
  select item.* into invocation from private.ai_invocations as item
  where item.id = target_invocation_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'Invocation not found.'; end if;
  if invocation.status = 'completed' then
    return pg_catalog.jsonb_build_object('status', 'completed', 'response_message_id', invocation.response_message_id);
  end if;
  update private.ai_runs set
    status = case when safe_error_code = 'invocation_cancelled' then 'cancelled' else 'failed' end,
    error_code = left(safe_error_code, 80), completed_at = now()
    where id = target_run_id and invocation_id = invocation.id and status = 'started';
  update private.ai_invocations set
    status = case when safe_error_code = 'invocation_cancelled' then 'cancelled' else 'failed' end,
    error_code = left(safe_error_code, 80), completed_at = now()
    where id = invocation.id and status = 'running';
  return pg_catalog.jsonb_build_object(
    'status', case when safe_error_code = 'invocation_cancelled' then 'cancelled' else 'failed' end,
    'error_code', left(safe_error_code, 80)
  );
end;
$$;

revoke execute on function public.create_ai_invocation(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.start_ai_run(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.complete_ai_run(uuid, uuid, text, text, text, bigint, bigint, bigint, bigint, bigint, integer) from public, anon, authenticated;
revoke execute on function public.fail_ai_run(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_ai_invocation(uuid, uuid, uuid, text, text, text) to service_role;
grant execute on function public.start_ai_run(uuid, text, text) to service_role;
grant execute on function public.complete_ai_run(uuid, uuid, text, text, text, bigint, bigint, bigint, bigint, bigint, integer) to service_role;
grant execute on function public.fail_ai_run(uuid, uuid, text) to service_role;

-- Trailie messages use the invoking participant identity to satisfy the existing
-- immutable message foreign key. Keep those server-created rows from consuming
-- the participant's human-message rate allowance.
create or replace function public.send_message(
  target_room_id uuid,
  participant_id uuid,
  body text,
  client_message_id uuid,
  reply_to_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  caller_user_id uuid := (select auth.uid());
  normalized_body text := pg_catalog.btrim($3);
  owned_participant public.participants%rowtype;
  existing_message_id uuid;
  inserted_message_id uuid;
begin
  if caller_user_id is null then
    raise exception using errcode = 'P0001', message = 'Authentication required.';
  end if;
  if not (select private.is_room_member(target_room_id)) then
    raise exception using errcode = 'P0001', message = 'Membership required.';
  end if;
  select participant.* into owned_participant
  from public.participants as participant
  where participant.id = $2 and participant.room_id = target_room_id;
  if not found or owned_participant.user_id <> caller_user_id then
    raise exception using errcode = 'P0001', message = 'Participant mismatch.';
  end if;
  if owned_participant.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'Membership required.';
  end if;
  if normalized_body is null or pg_catalog.char_length(normalized_body) = 0 then
    raise exception using errcode = 'P0001', message = 'Message cannot be empty.';
  end if;
  if pg_catalog.char_length(normalized_body) > 4000 then
    raise exception using errcode = 'P0001', message = 'Message is too long.';
  end if;
  if $4 is null then
    raise exception using errcode = 'P0001', message = 'Client message id is required.';
  end if;
  select message.id into existing_message_id
  from public.messages as message
  where message.room_id = target_room_id
    and message.sender_user_id = caller_user_id
    and message.client_message_id = $4;
  if found then return private.message_payload(existing_message_id, $2); end if;
  if $5 is not null and not exists (
    select 1 from public.messages as reply
    where reply.id = $5 and reply.room_id = target_room_id and reply.deleted_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'Invalid reply target.';
  end if;
  if (
    select pg_catalog.count(*)
    from public.messages as recent
    where recent.room_id = target_room_id
      and recent.sender_user_id = caller_user_id
      and recent.message_type = 'user'
      and recent.created_at > pg_catalog.clock_timestamp() - interval '10 seconds'
  ) >= 8 then
    raise exception using errcode = 'P0001', message = 'Rate limit exceeded.';
  end if;
  insert into public.messages (
    room_id, participant_id, sender_user_id, message_type, body,
    client_message_id, reply_to_message_id
  ) values (
    target_room_id, $2, caller_user_id, 'user', normalized_body, $4, $5
  )
  on conflict (room_id, sender_user_id, client_message_id)
    where client_message_id is not null
  do nothing returning id into inserted_message_id;
  if inserted_message_id is null then
    select message.id into inserted_message_id
    from public.messages as message
    where message.room_id = target_room_id
      and message.sender_user_id = caller_user_id
      and message.client_message_id = $4;
  end if;
  return private.message_payload(inserted_message_id, $2);
end;
$$;
