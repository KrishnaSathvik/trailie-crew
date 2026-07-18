create function public.get_travel_provider_acceptance_report(
  target_room_id uuid
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare operations jsonb; versions jsonb; backlog jsonb;
begin
  if not exists(select 1 from public.rooms where id=target_room_id) then
    raise exception using errcode='P0001',message='acceptance_room_not_found';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'provider',request.provider,'capability',request.capability,
    'status',request.status,'cacheStatus',request.cache_status,
    'durationMs',request.duration_ms,'safeRequestId',request.safe_request_id,
    'errorClass',request.error_class,'retryable',request.retryable,
    'createdAt',request.created_at
  ) order by request.created_at,request.id),'[]'::jsonb)
  into operations
  from private.travel_provider_requests request
  where request.room_id=target_room_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'version',summary.version,'status',summary.status,
    'snapshotCount',summary.snapshot_count,
    'verifiedCount',summary.verified_count,
    'unavailableCount',summary.unavailable_count,
    'staleCount',summary.stale_count,
    'evidenceKeys',summary.evidence_keys
  ) order by summary.version),'[]'::jsonb)
  into versions
  from (
    select plan.version,plan.status,count(snapshot.id)::integer snapshot_count,
      count(snapshot.id) filter(
        where snapshot.verification_at_publication='verified'
      )::integer verified_count,
      count(snapshot.id) filter(
        where snapshot.freshness_at_publication in ('unavailable','expired')
      )::integer unavailable_count,
      count(snapshot.id) filter(
        where snapshot.freshness_at_publication='stale'
      )::integer stale_count,
      coalesce(jsonb_agg(jsonb_build_object(
        'evidenceId',snapshot.evidence_external_id,
        'evidenceType',snapshot.evidence_type,
        'targetItemId',snapshot.target_item_id,
        'semanticHash',snapshot.semantic_hash
      ) order by snapshot.evidence_type,snapshot.evidence_external_id)
        filter(where snapshot.id is not null),'[]'::jsonb) evidence_keys
    from public.trip_plans plan
    left join private.plan_evidence_snapshots snapshot
      on snapshot.trip_plan_id=plan.id
    where plan.room_id=target_room_id
    group by plan.id,plan.version,plan.status
  ) summary;

  select jsonb_build_object(
    'refreshJobs',count(*) filter(
      where job.status in ('pending','running')
        or (job.status='failed' and job.retryable)
    ),
    'providerRetries',(
      select count(*) from private.travel_provider_requests request
      where request.room_id=target_room_id
        and request.retryable and request.next_retry_at is not null
        and request.status in ('failed','unavailable')
    )
  ) into backlog
  from private.travel_refresh_jobs job
  where job.room_id=target_room_id;

  return jsonb_build_object(
    'roomId',target_room_id,'operations',operations,
    'versions',versions,'backlog',backlog
  );
end; $$;

revoke all on function public.get_travel_provider_acceptance_report(uuid)
  from public,anon,authenticated;
grant execute on function public.get_travel_provider_acceptance_report(uuid)
  to service_role;
