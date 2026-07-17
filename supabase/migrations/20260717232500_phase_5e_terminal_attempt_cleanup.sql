alter function public.prepare_ai_recovery()
  rename to prepare_ai_recovery_phase_5e_base;

create function public.prepare_ai_recovery()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  prepared jsonb;
  finalized_terminal_attempts integer := 0;
begin
  prepared := public.prepare_ai_recovery_phase_5e_base();

  update private.ai_provider_attempts attempt
  set
    status = 'failed',
    error_code = coalesce(nullif(plan.error_code, ''), 'recovery_required'),
    retryable = false,
    recovery_required = false,
    validated_result = null,
    next_retry_at = null,
    updated_at = now()
  from public.trip_plans plan
  where attempt.workflow in ('itinerary_generation', 'itinerary_repair')
    and split_part(attempt.operation_key, ':', 1) ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and plan.id = split_part(attempt.operation_key, ':', 1)::uuid
    and plan.status in ('published', 'blocked', 'failed', 'superseded')
    and attempt.status in ('running', 'provider_completed')
    and attempt.lease_expires_at <= now();
  get diagnostics finalized_terminal_attempts = row_count;

  return coalesce(prepared, '{}'::jsonb) || jsonb_build_object(
    'finalizedTerminalProviderAttempts',
    finalized_terminal_attempts
  );
end;
$$;

revoke all on function public.prepare_ai_recovery_phase_5e_base()
from public, anon, authenticated, service_role;
revoke all on function public.prepare_ai_recovery()
from public, anon, authenticated;
grant execute on function public.prepare_ai_recovery()
to service_role;
