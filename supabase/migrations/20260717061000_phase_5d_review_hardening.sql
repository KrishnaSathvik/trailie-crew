create or replace function public.record_plan_change_run_usage(
  target_change_request_id uuid,target_run_type text,target_provider_response_id text,target_provider_request_id text,
  target_input_tokens bigint,target_output_tokens bigint,target_reasoning_tokens bigint,target_cached_input_tokens bigint,
  target_total_tokens bigint,target_latency_ms integer
) returns void language plpgsql security definer set search_path='' as $$
begin
  if target_run_type not in ('impact_analysis','patch_generation','candidate_generation','candidate_scope_repair','candidate_repair') then
    raise exception using errcode='P0001',message='Change run invalid.';
  end if;
  if target_run_type='patch_generation' and not exists(
    select 1 from private.plan_change_runs where change_request_id=target_change_request_id and run_type='patch_generation'
  ) then
    insert into private.plan_change_runs(
      change_request_id,analysis_version,run_type,attempt,model,prompt_version,schema_version,status,
      provider_response_id,provider_request_id,input_tokens,output_tokens,reasoning_tokens,cached_input_tokens,total_tokens,latency_ms,completed_at
    ) select
      request.id,request.current_analysis_version,'patch_generation',1,'gpt-5.6-terra','trailie-revision-patch-v1','1','completed',
      target_provider_response_id,target_provider_request_id,target_input_tokens,target_output_tokens,target_reasoning_tokens,
      target_cached_input_tokens,target_total_tokens,target_latency_ms,now()
    from public.plan_change_requests request where request.id=target_change_request_id;
  end if;
  update private.plan_change_runs set provider_response_id=target_provider_response_id,provider_request_id=target_provider_request_id,
    input_tokens=target_input_tokens,output_tokens=target_output_tokens,reasoning_tokens=target_reasoning_tokens,
    cached_input_tokens=target_cached_input_tokens,total_tokens=target_total_tokens,latency_ms=target_latency_ms,
    status='completed',completed_at=coalesce(completed_at,now())
  where id=(select id from private.plan_change_runs where change_request_id=target_change_request_id
    and run_type=target_run_type::private.plan_change_run_type order by attempt desc limit 1);
end; $$;

create function public.complete_plan_change_scope_repair(
  target_change_request_id uuid
) returns void
language plpgsql security definer set search_path='' as $$
declare request public.plan_change_requests%rowtype;
begin
  select * into request from public.plan_change_requests
    where id=target_change_request_id for update;
  if not found or request.status<>'validating' or request.scope_repair_count<>1
    or not exists(
      select 1 from private.plan_change_runs
      where change_request_id=request.id and run_type='candidate_scope_repair'
        and status='completed'
    ) then
    raise exception using errcode='P0001',message='scope_repair_not_complete';
  end if;
  update private.change_scope_repair_reports
    set status='completed',completed_at=now()
    where change_request_id=request.id and status='running';
  if not found then
    raise exception using errcode='P0001',message='scope_repair_not_complete';
  end if;
  insert into public.plan_change_events(change_request_id,room_id,event_type)
    values(request.id,request.room_id,'scope_repair_succeeded');
end; $$;

create function public.prepare_revision_ai_recovery() returns void
language plpgsql security definer set search_path='' as $$
begin
  update private.ai_provider_attempts attempt
  set status='applied',validated_result=null,recovery_required=false,
      applied_at=coalesce(attempt.applied_at,now()),updated_at=now()
  where attempt.status='provider_completed'
    and split_part(attempt.operation_key,':',1) ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (
      (
        attempt.workflow='revision_analysis'
        and exists(
          select 1 from public.plan_change_analyses analysis
          where analysis.change_request_id=split_part(attempt.operation_key,':',1)::uuid
            and analysis.version=split_part(attempt.operation_key,':',3)::integer
        )
      ) or (
        attempt.workflow='revision_patch'
        and exists(
          select 1 from private.plan_change_patches patch
          where patch.change_request_id=split_part(attempt.operation_key,':',1)::uuid
            and patch.analysis_version=split_part(attempt.operation_key,':',3)::integer
        )
      ) or (
        attempt.workflow='revision_candidate'
        and exists(
          select 1 from public.plan_change_requests request
          where request.id=split_part(attempt.operation_key,':',1)::uuid
            and request.candidate_trip_plan_id is not null
        )
      ) or (
        attempt.workflow in ('revision_scope_repair','revision_repair')
        and exists(
          select 1 from private.plan_change_runs run
          where run.change_request_id=split_part(attempt.operation_key,':',1)::uuid
            and run.run_type=case attempt.workflow
              when 'revision_scope_repair' then 'candidate_scope_repair'::private.plan_change_run_type
              else 'candidate_repair'::private.plan_change_run_type
            end
            and run.status='completed'
        )
      )
    );
end; $$;

create or replace function private.claim_candidate_generation(target_change_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare request public.plan_change_requests%rowtype; run private.plan_change_runs%rowtype; attempt integer; route text;
begin
  select * into request from public.plan_change_requests where id=target_change_request_id for update;
  if not found then raise exception using errcode='P0001',message='Change request not found.'; end if;
  if request.candidate_trip_plan_id is not null then return jsonb_build_object('claimed',false,'status',request.status,'candidateTripPlanId',request.candidate_trip_plan_id); end if;
  if request.status='applying' and request.updated_at>now()-interval '5 minutes' then return jsonb_build_object('claimed',false,'status',request.status); end if;
  if request.status not in ('approved','applying') or request.approved_analysis_version is distinct from request.current_analysis_version or request.candidate_attempt_count>=2 or private.plan_change_is_stale(request) then return jsonb_build_object('claimed',false,'status',request.status); end if;
  route:=case
    when request.request_type='remove_item' then 'deterministic'
    when request.request_type in ('move_item','reschedule_item','shorten_item','extend_item','update_note') then 'terra_patch'
    else 'sol_candidate'
  end;
  attempt:=request.candidate_attempt_count+1;
  update public.plan_change_requests set status='applying',candidate_attempt_count=attempt,error_code=null where id=request.id;
  update private.plan_change_runs set status='cancelled',completed_at=now() where change_request_id=request.id and status='running';
  insert into private.plan_change_runs(change_request_id,analysis_version,run_type,attempt,model,prompt_version,schema_version)
  values(request.id,request.approved_analysis_version,'candidate_generation',attempt,
    case route when 'deterministic' then 'trailie-deterministic' when 'terra_patch' then 'gpt-5.6-terra' else 'gpt-5.6-sol' end,
    case route when 'sol_candidate' then 'trailie-itinerary-revision-v2' else 'trailie-revision-patch-v1' end,'1') returning * into run;
  insert into public.plan_change_events(change_request_id,room_id,event_type) values(request.id,request.room_id,'candidate_generation_started');
  return jsonb_build_object('claimed',true,'runId',run.id,'attemptCount',attempt,'roomId',request.room_id,'candidateVersion',request.base_plan_version+1);
end; $$;

revoke execute on function public.complete_plan_change_scope_repair(uuid),
  public.prepare_revision_ai_recovery() from public,anon,authenticated;
grant execute on function public.complete_plan_change_scope_repair(uuid),
  public.prepare_revision_ai_recovery() to service_role;
