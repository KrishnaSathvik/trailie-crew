create function public.fail_ai_provider_attempt(
  target_attempt_id uuid,
  target_lease_owner uuid,
  target_error_code text,
  target_retryable boolean,
  target_provider_status_code integer,
  target_retry_after_ms integer,
  target_provider_request_id text,
  target_next_retry_at timestamptz,
  target_provider_duration_ms integer,
  target_total_duration_ms integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  failed jsonb;
begin
  if target_provider_duration_ms not between 0 and 300000
    or target_total_duration_ms not between 0 and 300000
    or target_provider_duration_ms > target_total_duration_ms
  then
    raise exception using errcode = 'P0001', message = 'invalid_provider_duration';
  end if;

  failed := public.fail_ai_provider_attempt(
    target_attempt_id,
    target_lease_owner,
    target_error_code,
    target_retryable,
    target_provider_status_code,
    target_retry_after_ms,
    target_provider_request_id,
    target_next_retry_at
  );
  update private.ai_provider_attempts
  set
    provider_duration_ms = target_provider_duration_ms,
    total_duration_ms = target_total_duration_ms,
    updated_at = now()
  where id = target_attempt_id;
  return failed;
end;
$$;

revoke all on function public.fail_ai_provider_attempt(
  uuid,uuid,text,boolean,integer,integer,text,timestamptz,integer,integer
) from public,anon,authenticated;
grant execute on function public.fail_ai_provider_attempt(
  uuid,uuid,text,boolean,integer,integer,text,timestamptz,integer,integer
) to service_role;
