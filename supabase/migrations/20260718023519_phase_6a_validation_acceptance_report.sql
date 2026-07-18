create function public.get_itinerary_validation_acceptance_report(
  target_room_id uuid
) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'version',plan.version,'status',plan.status,
    'validationStatus',plan.validation_status,'errorCode',plan.error_code,
    'attempt',report.attempt,
    'issueCodes',coalesce((
      select jsonb_agg(issue->>'code' order by issue->>'code')
      from jsonb_array_elements(report.issues) issue
    ),'[]'::jsonb),
    'warningCodes',coalesce((
      select jsonb_agg(warning->>'code' order by warning->>'code')
      from jsonb_array_elements(report.warnings) warning
    ),'[]'::jsonb)
  ) order by plan.version,report.attempt),'[]'::jsonb)
  from public.trip_plans plan
  left join private.validation_reports report on report.trip_plan_id=plan.id
  where plan.room_id=target_room_id;
$$;

revoke all on function public.get_itinerary_validation_acceptance_report(uuid)
  from public,anon,authenticated;
grant execute on function public.get_itinerary_validation_acceptance_report(uuid)
  to service_role;
