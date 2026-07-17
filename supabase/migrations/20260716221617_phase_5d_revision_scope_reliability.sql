alter type public.plan_change_type add value if not exists 'update_note' after 'extend_item';
alter type public.plan_change_event_type add value if not exists 'scope_repair_started' after 'repair_started';
alter type public.plan_change_event_type add value if not exists 'scope_repair_succeeded' after 'scope_repair_started';
alter type private.plan_change_run_type add value if not exists 'patch_generation' after 'impact_analysis';
alter type private.plan_change_run_type add value if not exists 'candidate_scope_repair' after 'candidate_generation';

alter table public.plan_change_requests
  add column scope_repair_count integer not null default 0 check (scope_repair_count between 0 and 1),
  add column conflict_repair_count integer not null default 0 check (conflict_repair_count between 0 and 1);

create or replace function public.create_plan_change_request(base_trip_plan_id uuid,participant_id uuid,request_type text,target_item_id text default null,request_text text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); base public.trip_plans%rowtype; member public.participants%rowtype; room public.rooms%rowtype; basis jsonb; normalized text; key text; existing public.plan_change_requests%rowtype; created public.plan_change_requests%rowtype; target_required boolean;
begin
  if caller is null then raise exception using errcode='P0001',message='Authentication required.'; end if;
  select * into base from public.trip_plans where id=$1;
  if not found then raise exception using errcode='P0001',message='Base plan not found.'; end if;
  select * into member from public.participants where id=$2 and room_id=base.room_id and user_id=caller and status='active';
  if not found then raise exception using errcode='P0001',message='Membership required.'; end if;
  select * into room from public.rooms where id=base.room_id for update;
  if base.status<>'published' or room.current_plan_version is distinct from base.version then raise exception using errcode='P0001',message='Base plan is not current.'; end if;
  if $3 is null or $3 not in ('add_item','remove_item','replace_item','move_item','reschedule_item','shorten_item','extend_item','update_note','change_route','change_lodging','change_food','rebalance_day','update_traveler_logistics','adjust_budget','general_revision') then raise exception using errcode='P0001',message='Change request not allowed.'; end if;
  normalized:=lower(regexp_replace(btrim(coalesce($5,'')),'\s+',' ','g'));
  if char_length(normalized) not between 1 and 2000 or normalized ~ '[<>]' then raise exception using errcode='P0001',message='Change request not allowed.'; end if;
  target_required:=$3 not in ('add_item','general_revision','rebalance_day','update_traveler_logistics','adjust_budget');
  if target_required and $4 is null then raise exception using errcode='P0001',message='Target item not found.'; end if;
  if $4 is not null and not exists(
    select 1 from jsonb_array_elements(coalesce(base.itinerary_json->'days','[]'::jsonb)) day
    cross join lateral jsonb_array_elements(coalesce(day->'items','[]'::jsonb)) item where item->>'id'=$4
  ) then raise exception using errcode='P0001',message='Target item not found.'; end if;
  basis:=private.current_revision_basis(base.room_id);
  key:=encode(extensions.digest(base.id::text||':'||member.id::text||':'||coalesce($4,'')||':'||$3||':'||normalized,'sha256'),'hex');
  select * into existing from public.plan_change_requests where idempotency_key=key;
  if found then return jsonb_build_object('id',existing.id,'roomId',existing.room_id,'status',existing.status,'basePlanVersion',existing.base_plan_version,'created',false); end if;
  insert into public.plan_change_requests(room_id,base_trip_plan_id,base_plan_version,basis_plan_hash,basis_membership_fingerprint,requested_by_participant_id,requested_by_user_id,request_type,target_item_id,request_text,normalized_request_text,approval_mode,idempotency_key)
  values(base.room_id,base.id,base.version,coalesce(base.plan_hash,encode(extensions.digest(base.itinerary_json::text,'sha256'),'hex')),basis->>'membershipFingerprint',member.id,caller,$3::public.plan_change_type,$4,btrim($5),normalized,room.approval_mode,key)
  returning * into created;
  insert into public.plan_change_events(change_request_id,room_id,event_type) values(created.id,created.room_id,'request_created');
  return jsonb_build_object('id',created.id,'roomId',created.room_id,'status',created.status,'basePlanVersion',created.base_plan_version,'created',true);
end; $$;

alter table private.ai_provider_attempts drop constraint ai_provider_attempts_workflow_check;
alter table private.ai_provider_attempts add constraint ai_provider_attempts_workflow_check check (workflow in (
  'focused_answer','memory_extraction','planning_summary','itinerary_generation','itinerary_repair',
  'revision_analysis','revision_patch','revision_candidate','revision_scope_repair','revision_repair'
));

create or replace function public.claim_ai_provider_attempt(
  target_workflow text,target_operation_key text,target_attempt integer,target_model text,
  target_lease_owner uuid,target_lease_ms integer,target_quota_reservation_id uuid default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current private.ai_provider_attempts%rowtype; expires timestamptz; result_available boolean; durable_found boolean:=false;
begin
  if target_workflow not in (
    'focused_answer','memory_extraction','planning_summary','itinerary_generation','itinerary_repair',
    'revision_analysis','revision_patch','revision_candidate','revision_scope_repair','revision_repair'
  ) or length(coalesce(target_operation_key,'')) not between 1 and 240
    or target_attempt not between 1 and 3 or length(coalesce(target_model,'')) not between 1 and 160
    or target_lease_owner is null then
    raise exception using errcode='P0001',message='invalid_provider_attempt';
  end if;
  if target_lease_ms not between 60000 and 900000 then
    raise exception using errcode='P0001',message='invalid_provider_lease';
  end if;
  expires:=now()+make_interval(secs=>target_lease_ms/1000.0);
  select * into current from private.ai_provider_attempts
    where workflow=target_workflow and operation_key=target_operation_key
      and status in ('provider_completed','applied') order by attempt desc limit 1 for update;
  if found then durable_found:=true;
  else
    select * into current from private.ai_provider_attempts
      where workflow=target_workflow and operation_key=target_operation_key and attempt=target_attempt for update;
  end if;
  if not found then
    insert into private.ai_provider_attempts(workflow,operation_key,attempt,model,lease_owner,lease_expires_at,quota_reservation_id)
    values(target_workflow,target_operation_key,target_attempt,target_model,target_lease_owner,expires,target_quota_reservation_id)
    returning * into current;
    return jsonb_build_object('attemptId',current.id,'claimed',true,'resultAvailable',false,'applied',false,'attempt',current.attempt,'status',current.status);
  end if;
  if current.model<>target_model or (not durable_found and current.quota_reservation_id is distinct from target_quota_reservation_id) then
    raise exception using errcode='P0001',message='provider_attempt_identity_mismatch';
  end if;
  if current.status='applied' then
    return jsonb_build_object('attemptId',current.id,'claimed',false,'resultAvailable',false,'applied',true,'attempt',current.attempt,'status',current.status);
  end if;
  if current.status='failed' then
    return jsonb_build_object('attemptId',current.id,'claimed',false,'resultAvailable',false,'applied',false,'attempt',current.attempt,'status',current.status,'retryable',current.retryable);
  end if;
  if current.lease_expires_at>now() then
    return jsonb_build_object('attemptId',current.id,'claimed',false,'resultAvailable',current.status='provider_completed','applied',false,'attempt',current.attempt,'status',current.status);
  end if;
  result_available:=current.status='provider_completed';
  update private.ai_provider_attempts set lease_owner=target_lease_owner,lease_expires_at=expires,
    recovered=true,recovery_required=result_available,updated_at=now()
    where id=current.id returning * into current;
  return jsonb_build_object('attemptId',current.id,'claimed',true,'resultAvailable',result_available,'applied',false,'attempt',current.attempt,'status',current.status,'recovered',true);
end; $$;

create table private.plan_change_manifests (
  id uuid primary key default gen_random_uuid(),
  change_request_id uuid not null references public.plan_change_requests(id) on delete cascade,
  analysis_version integer not null check (analysis_version > 0),
  base_plan_id uuid not null references public.trip_plans(id) on delete restrict,
  base_version integer not null check (base_version > 0),
  base_plan_hash text not null check (base_plan_hash ~ '^[a-f0-9]{64}$'),
  schema_version text not null check (schema_version = '1'),
  manifest_hash text not null check (manifest_hash ~ '^[a-f0-9]{64}$'),
  manifest_json jsonb not null check (jsonb_typeof(manifest_json) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  unique(change_request_id,analysis_version),
  unique(id,change_request_id),
  unique(change_request_id,manifest_hash)
);

create table private.plan_change_patches (
  id uuid primary key default gen_random_uuid(),
  change_request_id uuid not null references public.plan_change_requests(id) on delete cascade,
  analysis_version integer not null check (analysis_version > 0),
  manifest_id uuid not null,
  manifest_hash text not null check (manifest_hash ~ '^[a-f0-9]{64}$'),
  schema_version text not null check (schema_version = '1'),
  patch_hash text not null check (patch_hash ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('ready','blocked')),
  patch_json jsonb not null check (jsonb_typeof(patch_json) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  unique(change_request_id,analysis_version),
  unique(manifest_id),
  constraint plan_change_patches_manifest_fkey foreign key (manifest_id,change_request_id)
    references private.plan_change_manifests(id,change_request_id) on delete cascade
);

create table private.change_scope_repair_reports (
  id uuid primary key default gen_random_uuid(),
  change_request_id uuid not null references public.plan_change_requests(id) on delete cascade,
  candidate_trip_plan_id uuid not null references public.trip_plans(id) on delete cascade,
  manifest_id uuid not null references private.plan_change_manifests(id) on delete restrict,
  attempt integer not null check (attempt = 1),
  boundary_report jsonb not null check (jsonb_typeof(boundary_report) = 'object'),
  unauthorized_differences jsonb not null check (jsonb_typeof(unauthorized_differences) = 'array'),
  status text not null default 'running' check (status in ('running','completed','failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(change_request_id,attempt),
  unique(candidate_trip_plan_id,attempt)
);

create index change_scope_repair_reports_manifest_id_idx
  on private.change_scope_repair_reports (manifest_id);

create index plan_change_manifests_base_idx on private.plan_change_manifests(base_plan_id,base_version);
create index plan_change_patches_request_idx on private.plan_change_patches(change_request_id,analysis_version);
create index change_scope_repair_reports_candidate_idx on private.change_scope_repair_reports(candidate_trip_plan_id);

alter table private.plan_change_manifests enable row level security;
alter table private.plan_change_manifests force row level security;
alter table private.plan_change_patches enable row level security;
alter table private.plan_change_patches force row level security;
alter table private.change_scope_repair_reports enable row level security;
alter table private.change_scope_repair_reports force row level security;

create policy plan_change_manifests_deny_browser on private.plan_change_manifests
  as restrictive for all to anon,authenticated using(false) with check(false);
create policy plan_change_patches_deny_browser on private.plan_change_patches
  as restrictive for all to anon,authenticated using(false) with check(false);
create policy change_scope_repair_reports_deny_browser on private.change_scope_repair_reports
  as restrictive for all to anon,authenticated using(false) with check(false);

revoke all on private.plan_change_manifests,private.plan_change_patches,private.change_scope_repair_reports
  from public,anon,authenticated,service_role;

create function private.reject_completed_revision_artifact_mutation() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.completed_at is not null then
    raise exception using errcode='P0001',message='completed_revision_artifact_immutable';
  end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;

create trigger plan_change_manifests_immutable before update or delete on private.plan_change_manifests
for each row execute function private.reject_completed_revision_artifact_mutation();
create trigger plan_change_patches_immutable before update or delete on private.plan_change_patches
for each row execute function private.reject_completed_revision_artifact_mutation();
create trigger change_scope_repair_reports_immutable before update or delete on private.change_scope_repair_reports
for each row execute function private.reject_completed_revision_artifact_mutation();

create function private.persist_plan_change_manifest(
  target_change_request_id uuid,
  target_manifest jsonb,
  target_manifest_hash text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  request public.plan_change_requests%rowtype;
  existing private.plan_change_manifests%rowtype;
begin
  select * into request from public.plan_change_requests where id=target_change_request_id for update;
  if not found or request.status not in ('approved','applying','validating')
    or request.approved_analysis_version is distinct from request.current_analysis_version
    or private.plan_change_is_stale(request)
    or jsonb_typeof(target_manifest)<>'object'
    or target_manifest_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='P0001',message='revision_manifest_not_allowed';
  end if;
  if target_manifest->>'changeRequestId'<>request.id::text
    or target_manifest->>'basePlanId'<>request.base_trip_plan_id::text
    or (target_manifest->>'baseVersion')::integer<>request.base_plan_version
    or target_manifest->>'basePlanHash'<>request.basis_plan_hash
    or (target_manifest->>'analysisVersion')::integer<>request.current_analysis_version
    or target_manifest->>'requestType'<>request.request_type::text
    or target_manifest->>'schemaVersion'<>'1' then
    raise exception using errcode='P0001',message='revision_manifest_identity_mismatch';
  end if;
  select * into existing from private.plan_change_manifests
    where change_request_id=request.id and analysis_version=request.current_analysis_version;
  if found then
    if existing.manifest_hash<>target_manifest_hash or existing.manifest_json<>target_manifest then
      raise exception using errcode='P0001',message='revision_manifest_identity_mismatch';
    end if;
    return jsonb_build_object('id',existing.id,'manifestHash',existing.manifest_hash,'reused',true);
  end if;
  insert into private.plan_change_manifests(
    change_request_id,analysis_version,base_plan_id,base_version,base_plan_hash,
    schema_version,manifest_hash,manifest_json
  ) values(
    request.id,request.current_analysis_version,request.base_trip_plan_id,request.base_plan_version,
    request.basis_plan_hash,'1',target_manifest_hash,target_manifest
  ) returning * into existing;
  return jsonb_build_object('id',existing.id,'manifestHash',existing.manifest_hash,'reused',false);
end; $$;

create function public.persist_plan_change_manifest(
  target_change_request_id uuid,target_manifest jsonb,target_manifest_hash text
) returns jsonb
language sql security definer set search_path='' as $$
  select private.persist_plan_change_manifest(target_change_request_id,target_manifest,target_manifest_hash);
$$;

create function private.persist_plan_change_patch(
  target_change_request_id uuid,
  target_patch jsonb
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  request public.plan_change_requests%rowtype;
  manifest private.plan_change_manifests%rowtype;
  existing private.plan_change_patches%rowtype;
  calculated_hash text;
begin
  select * into request from public.plan_change_requests where id=target_change_request_id for update;
  select * into manifest from private.plan_change_manifests
    where change_request_id=request.id and analysis_version=request.current_analysis_version;
  if not found or request.status not in ('approved','applying','validating')
    or jsonb_typeof(target_patch)<>'object'
    or target_patch->>'schemaVersion'<>'1'
    or (target_patch->>'baseVersion')::integer<>request.base_plan_version
    or target_patch->>'manifestHash'<>manifest.manifest_hash
    or target_patch->>'status' not in ('ready','blocked')
    or jsonb_typeof(target_patch->'operations')<>'array' then
    raise exception using errcode='P0001',message='revision_patch_identity_mismatch';
  end if;
  calculated_hash:=encode(extensions.digest(target_patch::text,'sha256'),'hex');
  select * into existing from private.plan_change_patches
    where change_request_id=request.id and analysis_version=request.current_analysis_version;
  if found then
    if existing.patch_hash<>calculated_hash or existing.patch_json<>target_patch then
      raise exception using errcode='P0001',message='revision_patch_identity_mismatch';
    end if;
    return jsonb_build_object('id',existing.id,'status',existing.status,'patchHash',existing.patch_hash,'reused',true);
  end if;
  insert into private.plan_change_patches(
    change_request_id,analysis_version,manifest_id,manifest_hash,schema_version,patch_hash,status,patch_json
  ) values(
    request.id,request.current_analysis_version,manifest.id,manifest.manifest_hash,'1',calculated_hash,
    target_patch->>'status',target_patch
  ) returning * into existing;
  return jsonb_build_object('id',existing.id,'status',existing.status,'patchHash',existing.patch_hash,'reused',false);
end; $$;

create function public.persist_plan_change_patch(
  target_change_request_id uuid,target_patch jsonb
) returns jsonb
language sql security definer set search_path='' as $$
  select private.persist_plan_change_patch(target_change_request_id,target_patch);
$$;

create function private.start_plan_change_scope_repair(
  target_change_request_id uuid,
  target_boundary_report jsonb
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  request public.plan_change_requests%rowtype;
  manifest private.plan_change_manifests%rowtype;
  report private.change_scope_repair_reports%rowtype;
begin
  select * into request from public.plan_change_requests where id=target_change_request_id for update;
  if not found or request.status<>'validating' or request.candidate_trip_plan_id is null
    or request.scope_repair_count>=1 then
    return jsonb_build_object('claimed',false);
  end if;
  select * into manifest from private.plan_change_manifests
    where change_request_id=request.id and analysis_version=request.current_analysis_version;
  if not found or target_boundary_report->>'status'<>'blocked'
    or jsonb_typeof(target_boundary_report->'preservation'->'unauthorizedDifferences')<>'array' then
    raise exception using errcode='P0001',message='scope_repair_not_allowed';
  end if;
  update public.plan_change_requests set scope_repair_count=1 where id=request.id;
  insert into private.change_scope_repair_reports(
    change_request_id,candidate_trip_plan_id,manifest_id,attempt,boundary_report,unauthorized_differences
  ) values(
    request.id,request.candidate_trip_plan_id,manifest.id,1,target_boundary_report,
    target_boundary_report->'preservation'->'unauthorizedDifferences'
  ) returning * into report;
  insert into private.plan_change_runs(
    change_request_id,candidate_trip_plan_id,analysis_version,run_type,attempt,model,prompt_version,schema_version
  ) values(
    request.id,request.candidate_trip_plan_id,request.current_analysis_version,'candidate_scope_repair',1,
    'gpt-5.6-sol','trailie-revision-scope-repair-v1','1'
  );
  insert into public.plan_change_events(change_request_id,room_id,event_type)
    values(request.id,request.room_id,'scope_repair_started');
  return jsonb_build_object('claimed',true,'reportId',report.id,'attempt',1);
end; $$;

create function public.start_plan_change_scope_repair(
  target_change_request_id uuid,target_boundary_report jsonb
) returns jsonb
language sql security definer set search_path='' as $$
  select private.start_plan_change_scope_repair(target_change_request_id,target_boundary_report);
$$;

create or replace function public.start_plan_change_repair(target_change_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare request public.plan_change_requests%rowtype; candidate public.trip_plans%rowtype; run private.plan_change_runs%rowtype;
begin
  select * into request from public.plan_change_requests where id=target_change_request_id for update;
  if not found or request.status<>'validating' or request.candidate_trip_plan_id is null
    or request.conflict_repair_count>=1 then return jsonb_build_object('claimed',false); end if;
  select * into candidate from public.trip_plans where id=request.candidate_trip_plan_id for update;
  if candidate.status<>'needs_revision' or exists(
    select 1 from private.plan_change_runs where change_request_id=request.id and run_type='candidate_repair'
  ) then return jsonb_build_object('claimed',false); end if;
  update public.plan_change_requests set conflict_repair_count=1 where id=request.id;
  insert into private.plan_change_runs(change_request_id,candidate_trip_plan_id,analysis_version,run_type,attempt,model,prompt_version,schema_version)
  values(request.id,candidate.id,request.approved_analysis_version,'candidate_repair',1,'gpt-5.6-sol','trailie-itinerary-revision-v2','1') returning * into run;
  insert into public.plan_change_events(change_request_id,room_id,event_type) values(request.id,request.room_id,'repair_started');
  insert into public.trip_plan_events(trip_plan_id,room_id,event_type) values(candidate.id,request.room_id,'repair_started');
  return jsonb_build_object('claimed',true,'runId',run.id);
end; $$;

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
      request.id,request.current_analysis_version,'patch_generation',1,'gpt-5.6-sol','trailie-revision-patch-v1','1','completed',
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
  if target_run_type='candidate_scope_repair' then
    update private.change_scope_repair_reports set status='completed',completed_at=now()
      where change_request_id=target_change_request_id and status='running';
    insert into public.plan_change_events(change_request_id,room_id,event_type)
      select id,room_id,'scope_repair_succeeded' from public.plan_change_requests where id=target_change_request_id;
  end if;
end; $$;

create or replace function private.claim_candidate_generation(target_change_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare request public.plan_change_requests%rowtype; run private.plan_change_runs%rowtype; attempt integer; deterministic boolean;
begin
  select * into request from public.plan_change_requests where id=target_change_request_id for update;
  if not found then raise exception using errcode='P0001',message='Change request not found.'; end if;
  if request.candidate_trip_plan_id is not null then return jsonb_build_object('claimed',false,'status',request.status,'candidateTripPlanId',request.candidate_trip_plan_id); end if;
  if request.status='applying' and request.updated_at>now()-interval '5 minutes' then return jsonb_build_object('claimed',false,'status',request.status); end if;
  if request.status not in ('approved','applying') or request.approved_analysis_version is distinct from request.current_analysis_version or request.candidate_attempt_count>=2 or private.plan_change_is_stale(request) then return jsonb_build_object('claimed',false,'status',request.status); end if;
  deterministic:=request.request_type in ('remove_item','move_item','reschedule_item','shorten_item','extend_item','update_note');
  attempt:=request.candidate_attempt_count+1;
  update public.plan_change_requests set status='applying',candidate_attempt_count=attempt,error_code=null where id=request.id;
  update private.plan_change_runs set status='cancelled',completed_at=now() where change_request_id=request.id and status='running';
  insert into private.plan_change_runs(change_request_id,analysis_version,run_type,attempt,model,prompt_version,schema_version)
  values(request.id,request.approved_analysis_version,'candidate_generation',attempt,
    case when deterministic then 'trailie-deterministic' else 'gpt-5.6-sol' end,
    case when deterministic then 'trailie-revision-patch-v1' else 'trailie-itinerary-revision-v2' end,'1') returning * into run;
  insert into public.plan_change_events(change_request_id,room_id,event_type) values(request.id,request.room_id,'candidate_generation_started');
  return jsonb_build_object('claimed',true,'runId',run.id,'attemptCount',attempt,'roomId',request.room_id,'candidateVersion',request.base_plan_version+1);
end; $$;

create or replace function public.get_plan_change_context(target_change_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare request public.plan_change_requests%rowtype; analysis public.plan_change_analyses%rowtype; base public.trip_plans%rowtype; summary public.planning_summaries%rowtype;
begin
  select * into request from public.plan_change_requests where id=target_change_request_id;
  if not found then raise exception using errcode='P0001',message='Change request not found.'; end if;
  select * into base from public.trip_plans where id=request.base_trip_plan_id;
  select * into summary from public.planning_summaries where id=base.planning_summary_id;
  select * into analysis from public.plan_change_analyses where change_request_id=request.id and version=request.current_analysis_version;
  return jsonb_build_object(
    'request',jsonb_build_object(
      'id',request.id,'roomId',request.room_id,'status',request.status,'requestType',request.request_type,
      'targetItemId',request.target_item_id,'requestText',request.request_text,'baseTripPlanId',request.base_trip_plan_id,
      'basePlanVersion',request.base_plan_version,'basePlanHash',request.basis_plan_hash,
      'currentAnalysisVersion',request.current_analysis_version,'approvedAnalysisVersion',request.approved_analysis_version,
      'candidateTripPlanId',request.candidate_trip_plan_id,'candidateAttemptCount',request.candidate_attempt_count,
      'scopeRepairCount',request.scope_repair_count,'conflictRepairCount',request.conflict_repair_count
    ),
    'basePlan',base.itinerary_json,'approvedSummary',summary.summary_json,'analysis',analysis.analysis_json,
    'manifest',(select manifest_json from private.plan_change_manifests where change_request_id=request.id and analysis_version=request.current_analysis_version),
    'patch',(select patch_json from private.plan_change_patches where change_request_id=request.id and analysis_version=request.current_analysis_version),
    'candidatePlan',(select itinerary_json from public.trip_plans where id=request.candidate_trip_plan_id),
    'evidence',(select coalesce(jsonb_agg(jsonb_build_object(
      'id','evidence:'||e.id::text,'itemId',e.itinerary_item_id,'provider',e.provider,'toolName',e.tool_name,
      'requestFingerprint',e.request_fingerprint,'status',e.status,'retrievedAt',e.retrieved_at,'expiresAt',e.expires_at,
      'normalizedResult',e.normalized_result,'sourceReference',e.source_reference
    ) order by e.created_at,e.id),'[]'::jsonb) from private.tool_evidence e
      where e.trip_plan_id in (request.base_trip_plan_id,request.candidate_trip_plan_id))
  );
end; $$;

create or replace function public.get_plan_change_request(target_room_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare request public.plan_change_requests%rowtype; analysis public.plan_change_analyses%rowtype; events jsonb;
begin
  if not private.is_room_member(target_room_id) then raise exception using errcode='P0001',message='Membership required.'; end if;
  select * into request from public.plan_change_requests where room_id=target_room_id order by created_at desc limit 1;
  if not found then return null; end if;
  select * into analysis from public.plan_change_analyses where change_request_id=request.id and version=request.current_analysis_version;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'changeRequestId',e.change_request_id,'type',e.event_type,'createdAt',e.created_at) order by e.created_at,e.id),'[]'::jsonb) into events from public.plan_change_events e where e.change_request_id=request.id;
  return jsonb_build_object(
    'id',request.id,'roomId',request.room_id,'baseTripPlanId',request.base_trip_plan_id,'basePlanVersion',request.base_plan_version,
    'requestType',request.request_type,'targetItemId',request.target_item_id,'requestText',request.request_text,'status',request.status,
    'approvalMode',request.approval_mode,'currentAnalysisVersion',request.current_analysis_version,'approvedAnalysisVersion',request.approved_analysis_version,
    'candidateTripPlanId',request.candidate_trip_plan_id,'scopeRepairCount',request.scope_repair_count,'conflictRepairCount',request.conflict_repair_count,
    'isStale',private.plan_change_is_stale(request),'materiality',analysis.materiality,
    'feasibility',analysis.feasibility,'analysis',analysis.analysis_json,'analysisApprovalState',case when analysis.id is null then null else private.change_approval_state(request,false) end,
    'candidateConfirmationState',case when request.candidate_trip_plan_id is null then null else private.change_approval_state(request,true) end,
    'candidateDiff',request.candidate_diff,'candidatePlan',case when request.status in ('awaiting_confirmation','published') then private.safe_trip_plan(request.candidate_trip_plan_id,true) else null end,
    'events',events,'errorCode',request.error_code,'createdAt',request.created_at,'updatedAt',request.updated_at,'approvedAt',request.approved_at,'publishedAt',request.published_at,'cancelledAt',request.cancelled_at
  );
end; $$;

create or replace function public.block_plan_change(target_change_request_id uuid,target_error_code text) returns void
language plpgsql security definer set search_path='' as $$
declare request public.plan_change_requests%rowtype;
begin
  select * into request from public.plan_change_requests where id=target_change_request_id for update;
  if not found or request.status in ('published','cancelled','superseded') then
    raise exception using errcode='P0001',message='Change request not allowed.';
  end if;
  update private.plan_change_runs set status='failed',error_code=left(target_error_code,80),completed_at=now()
    where change_request_id=request.id and status='running';
  update private.change_scope_repair_reports set status='failed',completed_at=now()
    where change_request_id=request.id and status='running';
  update public.trip_plans set status='blocked',validation_status='blocked',error_code=left(target_error_code,80)
    where id=request.candidate_trip_plan_id and status<>'published';
  update public.plan_change_requests set status='blocked',error_code=left(target_error_code,80) where id=request.id;
  insert into public.plan_change_events(change_request_id,room_id,event_type) values(request.id,request.room_id,'blocked');
end; $$;

revoke execute on function private.reject_completed_revision_artifact_mutation(),
  private.persist_plan_change_manifest(uuid,jsonb,text),private.persist_plan_change_patch(uuid,jsonb),
  private.start_plan_change_scope_repair(uuid,jsonb)
  from public,anon,authenticated,service_role;
revoke execute on function public.persist_plan_change_manifest(uuid,jsonb,text),
  public.persist_plan_change_patch(uuid,jsonb),public.start_plan_change_scope_repair(uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.persist_plan_change_manifest(uuid,jsonb,text),
  public.persist_plan_change_patch(uuid,jsonb),public.start_plan_change_scope_repair(uuid,jsonb)
  to service_role;
