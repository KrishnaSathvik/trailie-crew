create or replace function public.fail_ai_provider_attempt(
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
    retry_count = greatest(retry_count, attempt - 1),
    updated_at = now()
  where id = target_attempt_id;
  return failed;
end;
$$;

revoke all on function public.fail_ai_provider_attempt(
  uuid,uuid,text,boolean,integer,integer,text,timestamptz
) from public,anon,authenticated;
grant execute on function public.fail_ai_provider_attempt(
  uuid,uuid,text,boolean,integer,integer,text,timestamptz
) to service_role;
