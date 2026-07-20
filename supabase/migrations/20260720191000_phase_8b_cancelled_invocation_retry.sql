create or replace function public.start_ai_run(
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
  select item.* into invocation
  from private.ai_invocations as item
  where item.id = target_invocation_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Invocation not found.';
  end if;
  if invocation.status = 'completed' then
    return jsonb_build_object(
      'status',
      'completed',
      'response_message_id',
      invocation.response_message_id
    );
  end if;
  if (
    invocation.status = 'running'
    and invocation.started_at > now() - interval '5 minutes'
  ) then
    return jsonb_build_object('status', 'running');
  end if;
  if invocation.status = 'running' then
    update private.ai_runs
    set status = 'failed',
        error_code = 'recovery_required',
        completed_at = now()
    where invocation_id = invocation.id
      and status = 'started';
    update private.ai_invocations
    set status = 'failed',
        error_code = 'recovery_required',
        completed_at = now()
    where id = invocation.id;
    invocation.status := 'failed';
  end if;
  if invocation.status = 'failed' and invocation.retry_count >= 1 then
    raise exception using errcode = 'P0001', message = 'Retry is not allowed.';
  end if;
  if invocation.prompt_version <> target_prompt_version then
    raise exception using errcode = 'P0001', message = 'Prompt version mismatch.';
  end if;
  if invocation.status in ('failed', 'cancelled') then
    update private.ai_invocations
    set retry_count = retry_count + 1
    where id = invocation.id;
  end if;
  update private.ai_invocations
  set status = 'running',
      started_at = now(),
      completed_at = null,
      error_code = null
  where id = invocation.id;
  insert into private.ai_runs(invocation_id, model, prompt_version)
  values(invocation.id, target_model, target_prompt_version)
  returning * into run;
  return jsonb_build_object('status', 'started', 'run_id', run.id);
end;
$$;

revoke all on function public.start_ai_run(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.start_ai_run(uuid, text, text)
  to service_role;
