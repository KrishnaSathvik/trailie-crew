create table private.recovery_executions (
  execution_key text primary key check (execution_key = 'default'),
  last_started_at timestamptz not null
);

alter table private.recovery_executions enable row level security;
alter table private.recovery_executions force row level security;
create policy recovery_executions_deny_browser
  on private.recovery_executions
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);
revoke all on private.recovery_executions from public, anon, authenticated, service_role;

create function private.claim_recovery_execution(min_interval_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed boolean := false;
  bounded_interval integer := least(greatest(min_interval_seconds, 1), 300);
begin
  insert into private.recovery_executions(execution_key, last_started_at)
  values ('default', now())
  on conflict (execution_key) do update
    set last_started_at = excluded.last_started_at
    where private.recovery_executions.last_started_at
      <= now() - make_interval(secs => bounded_interval)
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

create function public.claim_recovery_execution(min_interval_seconds integer default 10)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.claim_recovery_execution(min_interval_seconds);
$$;

revoke execute on function private.claim_recovery_execution(integer)
  from public, anon, authenticated, service_role;
revoke execute on function public.claim_recovery_execution(integer)
  from public, anon, authenticated;
grant execute on function public.claim_recovery_execution(integer)
  to service_role;
