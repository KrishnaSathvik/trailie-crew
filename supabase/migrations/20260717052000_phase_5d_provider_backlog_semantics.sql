create or replace function public.fail_ai_provider_attempt(
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
    recovery_required=false,validated_result=null,updated_at=now()
  where id=current.id returning * into current;
  return jsonb_build_object('attemptId',current.id,'status',current.status,'retryable',current.retryable);
end; $$;

create or replace function public.list_recoverable_ai_provider_attempts(batch_size integer default 10)
returns table(
  attempt_id uuid,workflow text,operation_key text,attempt integer,status text,
  recovery_required boolean,age_seconds bigint
) language sql stable security definer set search_path='' as $$
  select id,workflow,operation_key,attempt,status,recovery_required,
    greatest(extract(epoch from now()-updated_at)::bigint,0)
  from private.ai_provider_attempts
  where status in ('running','provider_completed')
    and lease_expires_at<=now()
  order by updated_at,id
  limit least(greatest(batch_size,1),50);
$$;

update private.ai_provider_attempts
set recovery_required=false,updated_at=now()
where status='failed' and recovery_required;
