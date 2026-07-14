create type public.trip_plan_status as enum (
  'generating','validating','needs_revision','blocked','published','failed','superseded'
);
create type public.itinerary_validation_status as enum ('pending','pass','needs_revision','blocked');
create type public.trip_plan_event_type as enum (
  'generation_started','structure_created','route_validation_started',
  'constraint_validation_started','repair_started','validation_completed','published','failed'
);
create type private.itinerary_run_type as enum ('generation','repair','semantic_review');
create type private.itinerary_run_status as enum ('running','completed','failed','cancelled');
create type private.tool_evidence_status as enum ('verified','unavailable','stale','failed');

create table public.trip_plans (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  planning_request_id uuid not null references public.planning_requests(id) on delete restrict,
  planning_summary_id uuid not null references public.planning_summaries(id) on delete restrict,
  version integer not null check (version > 0),
  status public.trip_plan_status not null default 'generating',
  schema_version text not null check (char_length(schema_version) between 1 and 100),
  prompt_version text not null check (char_length(prompt_version) between 1 and 100),
  model text not null check (char_length(model) between 1 and 100),
  itinerary_json jsonb check (itinerary_json is null or jsonb_typeof(itinerary_json)='object'),
  validation_status public.itinerary_validation_status not null default 'pending',
  validation_summary jsonb check (validation_summary is null or jsonb_typeof(validation_summary)='object'),
  basis_summary_version integer not null check (basis_summary_version > 0),
  basis_summary_hash text not null check (char_length(basis_summary_hash) between 1 and 128),
  created_by_participant_id uuid not null references public.participants(id),
  created_by_user_id uuid not null references auth.users(id),
  error_code text check (error_code is null or char_length(error_code) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  failed_at timestamptz,
  unique(planning_request_id,version),
  unique(planning_request_id,basis_summary_version),
  unique(room_id,version),
  constraint trip_plans_request_room_fkey foreign key (planning_request_id,room_id)
    references public.planning_requests(id,room_id),
  constraint trip_plans_summary_basis_fkey foreign key (planning_request_id,basis_summary_version)
    references public.planning_summaries(planning_request_id,version),
  constraint trip_plans_creator_fkey foreign key (created_by_participant_id,room_id,created_by_user_id)
    references public.participants(id,room_id,user_id),
  constraint trip_plans_publication_state check (
    (status='published') = (published_at is not null)
  ),
  constraint trip_plans_failure_state check (
    (status='failed') = (failed_at is not null)
  )
);
create index trip_plans_room_created_idx on public.trip_plans(room_id,created_at desc);
create index trip_plans_recovery_idx on public.trip_plans(status,updated_at)
  where status in ('generating','validating','needs_revision');

create table public.trip_plan_events (
  id uuid primary key default gen_random_uuid(),
  trip_plan_id uuid not null references public.trip_plans(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  event_type public.trip_plan_event_type not null,
  created_at timestamptz not null default now()
);
create index trip_plan_events_plan_created_idx on public.trip_plan_events(trip_plan_id,created_at,id);

create table private.itinerary_runs (
  id uuid primary key default gen_random_uuid(),
  trip_plan_id uuid not null references public.trip_plans(id) on delete cascade,
  run_type private.itinerary_run_type not null,
  attempt integer not null check (attempt between 1 and 3),
  provider text not null default 'openai' check (char_length(provider) between 1 and 80),
  model text not null check (char_length(model) between 1 and 100),
  prompt_version text not null check (char_length(prompt_version) between 1 and 100),
  status private.itinerary_run_status not null default 'running',
  provider_response_id text,
  provider_request_id text,
  input_tokens bigint check (input_tokens is null or input_tokens >= 0),
  output_tokens bigint check (output_tokens is null or output_tokens >= 0),
  reasoning_tokens bigint check (reasoning_tokens is null or reasoning_tokens >= 0),
  cached_input_tokens bigint check (cached_input_tokens is null or cached_input_tokens >= 0),
  total_tokens bigint check (total_tokens is null or total_tokens >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(trip_plan_id,run_type,attempt)
);
create unique index itinerary_runs_one_active_idx on private.itinerary_runs(trip_plan_id)
  where status='running';

create table private.tool_evidence (
  id uuid primary key default gen_random_uuid(),
  trip_plan_id uuid not null references public.trip_plans(id) on delete cascade,
  itinerary_item_id text,
  provider text not null check (char_length(provider) between 1 and 80),
  tool_name text not null check (char_length(tool_name) between 1 and 80),
  request_fingerprint text not null check (char_length(request_fingerprint) between 1 and 128),
  retrieved_at timestamptz not null,
  expires_at timestamptz,
  status private.tool_evidence_status not null,
  normalized_result jsonb not null check (jsonb_typeof(normalized_result)='object'),
  source_reference jsonb check (source_reference is null or jsonb_typeof(source_reference)='object'),
  created_at timestamptz not null default now(),
  unique(trip_plan_id,tool_name,request_fingerprint)
);
create index tool_evidence_cache_idx on private.tool_evidence(tool_name,request_fingerprint,retrieved_at desc);

create table private.validation_reports (
  id uuid primary key default gen_random_uuid(),
  trip_plan_id uuid not null references public.trip_plans(id) on delete cascade,
  plan_version integer not null check (plan_version > 0),
  attempt integer not null check (attempt between 1 and 3),
  validator_version text not null check (char_length(validator_version) between 1 and 100),
  status public.itinerary_validation_status not null check (status<>'pending'),
  issues jsonb not null check (jsonb_typeof(issues)='array'),
  warnings jsonb not null check (jsonb_typeof(warnings)='array'),
  created_at timestamptz not null default now(),
  unique(trip_plan_id,attempt)
);

alter table public.trip_plans enable row level security;
alter table public.trip_plan_events enable row level security;
alter table private.itinerary_runs enable row level security;
alter table private.itinerary_runs force row level security;
alter table private.tool_evidence enable row level security;
alter table private.tool_evidence force row level security;
alter table private.validation_reports enable row level security;
alter table private.validation_reports force row level security;

create policy trip_plans_member_read on public.trip_plans for select to authenticated
using (private.is_room_member(room_id));
create policy trip_plan_events_member_read on public.trip_plan_events for select to authenticated
using (private.is_room_member(room_id));
create policy itinerary_runs_deny_browser on private.itinerary_runs as restrictive for all to anon,authenticated using(false) with check(false);
create policy tool_evidence_deny_browser on private.tool_evidence as restrictive for all to anon,authenticated using(false) with check(false);
create policy validation_reports_deny_browser on private.validation_reports as restrictive for all to anon,authenticated using(false) with check(false);

revoke all on table public.trip_plans,public.trip_plan_events from public,anon,authenticated;
grant select on table public.trip_plan_events to authenticated;
revoke all on table private.itinerary_runs,private.tool_evidence,private.validation_reports from public,anon,authenticated;

create trigger trip_plans_set_updated_at before update on public.trip_plans
for each row execute function private.set_updated_at();

create function private.reject_published_trip_plan_mutation() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.status='published' then
    raise exception using errcode='P0001',message='Published trip plans are immutable.';
  end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;
create trigger trip_plans_published_immutable before update or delete on public.trip_plans
for each row execute function private.reject_published_trip_plan_mutation();

create function private.notify_itinerary_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform realtime.send(
    jsonb_build_object('kind','itinerary','roomId',new.room_id,'planId',new.trip_plan_id,'eventType',new.event_type),
    'itinerary_changed','room:'||new.room_id::text,true
  );
  return null;
end; $$;
create trigger trip_plan_events_notify_room after insert on public.trip_plan_events
for each row execute function private.notify_itinerary_change();

create function public.create_itinerary_generation(target_planning_request_id uuid,participant_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  caller uuid:=(select auth.uid()); request public.planning_requests%rowtype;
  participant public.participants%rowtype; summary public.planning_summaries%rowtype;
  room public.rooms%rowtype; existing public.trip_plans%rowtype; created public.trip_plans%rowtype;
  next_version integer;
begin
  if caller is null then raise exception using errcode='P0001',message='Authentication required.'; end if;
  select * into request from public.planning_requests where id=target_planning_request_id for update;
  if not found then raise exception using errcode='P0001',message='Planning request not found.'; end if;
  select * into participant from public.participants where id=participant_id and room_id=request.room_id and user_id=caller and status='active';
  if not found then raise exception using errcode='P0001',message='Membership required.'; end if;
  select * into room from public.rooms where id=request.room_id for update;
  if room.status<>'active' then raise exception using errcode='P0001',message='Plan generation not allowed.'; end if;
  if request.status<>'approved_for_generation' or request.approved_summary_version is null or request.approved_summary_version<>request.current_summary_version then
    raise exception using errcode='P0001',message='Approved summary required.';
  end if;
  if private.planning_is_stale(request) then raise exception using errcode='P0001',message='Approved summary is stale.'; end if;
  select * into summary from public.planning_summaries where planning_request_id=request.id and version=request.approved_summary_version;
  if not found or summary.readiness_status<>'ready_for_review' or jsonb_array_length(coalesce(summary.summary_json#>'{readiness,blockers}','[]'::jsonb))>0 then
    raise exception using errcode='P0001',message='Plan generation not allowed.';
  end if;
  select * into existing from public.trip_plans where planning_request_id=request.id and basis_summary_version=summary.version;
  if found then
    return jsonb_build_object('id',existing.id,'status',existing.status,'version',existing.version,'created',false);
  end if;
  next_version:=coalesce(room.current_plan_version,0)+1;
  insert into public.trip_plans(
    room_id,planning_request_id,planning_summary_id,version,status,schema_version,prompt_version,model,
    basis_summary_version,basis_summary_hash,created_by_participant_id,created_by_user_id
  ) values (
    room.id,request.id,summary.id,next_version,'generating','1','trailie-itinerary-v1','gpt-5.6-sol',
    summary.version,summary.summary_hash,participant.id,caller
  ) returning * into created;
  insert into public.trip_plan_events(trip_plan_id,room_id,event_type) values(created.id,created.room_id,'generation_started');
  return jsonb_build_object('id',created.id,'status',created.status,'version',created.version,'created',true);
end; $$;

create function private.claim_itinerary_generation(target_trip_plan_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare plan public.trip_plans%rowtype; active private.itinerary_runs%rowtype; next_attempt integer; selected_type private.itinerary_run_type;
begin
  select * into plan from public.trip_plans where id=target_trip_plan_id for update;
  if not found then raise exception using errcode='P0001',message='Plan not found.'; end if;
  if plan.status in ('published','blocked','failed','superseded') then return jsonb_build_object('claimed',false,'status',plan.status); end if;
  select * into active from private.itinerary_runs where trip_plan_id=plan.id and status='running' for update;
  if found and active.created_at>now()-interval '5 minutes' then
    return jsonb_build_object('claimed',false,'status',plan.status,'attemptCount',active.attempt);
  elsif found then
    update private.itinerary_runs set status='failed',error_code='stale_lease',completed_at=now() where id=active.id;
  end if;
  select coalesce(max(attempt),0)+1 into next_attempt from private.itinerary_runs where trip_plan_id=plan.id;
  if next_attempt>3 then
    update public.trip_plans set status='failed',error_code='retry_exhausted',failed_at=now() where id=plan.id;
    insert into public.trip_plan_events(trip_plan_id,room_id,event_type) values(plan.id,plan.room_id,'failed');
    return jsonb_build_object('claimed',false,'status','failed','errorCode','retry_exhausted');
  end if;
  selected_type:=case when plan.status='needs_revision' then 'repair'::private.itinerary_run_type else 'generation'::private.itinerary_run_type end;
  insert into private.itinerary_runs(trip_plan_id,run_type,attempt,model,prompt_version)
    values(plan.id,selected_type,next_attempt,plan.model,plan.prompt_version) returning * into active;
  update public.trip_plans set status=case when plan.itinerary_json is null then 'generating'::public.trip_plan_status else 'validating'::public.trip_plan_status end,error_code=null,failed_at=null where id=plan.id;
  return jsonb_build_object(
    'claimed',true,'status',plan.status,'runId',active.id,'attemptCount',next_attempt,'runType',selected_type,
    'roomId',plan.room_id,'planningRequestId',plan.planning_request_id,'basisSummaryVersion',plan.basis_summary_version,
    'stage',case when plan.itinerary_json is null then 'generate' when plan.validation_status='needs_revision' then 'repair' else 'validate' end
  );
end; $$;
create function public.claim_itinerary_generation(target_trip_plan_id uuid) returns jsonb
language sql security definer set search_path='' as $$ select private.claim_itinerary_generation(target_trip_plan_id); $$;

create function private.get_itinerary_generation_context(target_trip_plan_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare plan public.trip_plans%rowtype; summary public.planning_summaries%rowtype;
begin
  select * into plan from public.trip_plans where id=target_trip_plan_id;
  if not found or plan.status in ('published','blocked','failed','superseded') then raise exception using errcode='P0001',message='Plan generation not allowed.'; end if;
  select * into summary from public.planning_summaries where id=plan.planning_summary_id;
  return jsonb_build_object(
    'tripPlanId',plan.id,'roomId',plan.room_id,'version',plan.version,'approvedSummary',summary.summary_json,
    'basisSummaryVersion',plan.basis_summary_version,'basisSummaryHash',plan.basis_summary_hash,'draft',plan.itinerary_json,
    'travelers',(select coalesce(jsonb_agg(jsonb_build_object('id','traveler:'||p.id::text,'displayName',p.display_name,'role',p.role) order by p.joined_at,p.id),'[]'::jsonb) from public.participants p where p.room_id=plan.room_id and p.status='active'),
    'latestValidation',(select jsonb_build_object('status',r.status,'issues',r.issues,'warnings',r.warnings,'validatorVersion',r.validator_version) from private.validation_reports r where r.trip_plan_id=plan.id order by r.attempt desc limit 1),
    'evidence',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'itemId',e.itinerary_item_id,'provider',e.provider,'toolName',e.tool_name,'requestFingerprint',e.request_fingerprint,'status',e.status,'retrievedAt',e.retrieved_at,'expiresAt',e.expires_at,'normalizedResult',e.normalized_result,'sourceReference',e.source_reference) order by e.created_at,e.id),'[]'::jsonb) from private.tool_evidence e where e.trip_plan_id=plan.id)
  );
end; $$;
create function public.get_itinerary_generation_context(target_trip_plan_id uuid) returns jsonb
language sql security definer set search_path='' as $$ select private.get_itinerary_generation_context(target_trip_plan_id); $$;

create function private.record_plan_progress(target_trip_plan_id uuid,target_event_type text) returns void
language plpgsql security definer set search_path='' as $$
declare plan public.trip_plans%rowtype;
begin
  select * into plan from public.trip_plans where id=target_trip_plan_id;
  if not found or target_event_type not in ('route_validation_started','constraint_validation_started','repair_started') then raise exception using errcode='P0001',message='Plan progress invalid.'; end if;
  insert into public.trip_plan_events(trip_plan_id,room_id,event_type) values(plan.id,plan.room_id,target_event_type::public.trip_plan_event_type);
end; $$;
create function public.record_plan_progress(target_trip_plan_id uuid,target_event_type text) returns void
language sql security definer set search_path='' as $$ select private.record_plan_progress(target_trip_plan_id,target_event_type); $$;

create function private.record_itinerary_draft(
  target_trip_plan_id uuid,validated_draft jsonb,target_provider_response_id text,target_provider_request_id text,
  target_input_tokens bigint,target_output_tokens bigint,target_reasoning_tokens bigint,target_cached_input_tokens bigint,
  target_total_tokens bigint,target_latency_ms integer
) returns void language plpgsql security definer set search_path='' as $$
declare plan public.trip_plans%rowtype;
begin
  select * into plan from public.trip_plans where id=target_trip_plan_id for update;
  if not found or plan.status not in ('generating','validating') or jsonb_typeof(validated_draft)<>'object' then raise exception using errcode='P0001',message='Invalid itinerary response.'; end if;
  update public.trip_plans set itinerary_json=validated_draft,status='validating',validation_status='pending',validation_summary=null where id=plan.id;
  update private.itinerary_runs set status='completed',provider_response_id=target_provider_response_id,provider_request_id=target_provider_request_id,input_tokens=target_input_tokens,output_tokens=target_output_tokens,reasoning_tokens=target_reasoning_tokens,cached_input_tokens=target_cached_input_tokens,total_tokens=target_total_tokens,latency_ms=target_latency_ms,completed_at=now()
    where trip_plan_id=plan.id and status='running';
  insert into public.trip_plan_events(trip_plan_id,room_id,event_type) values(plan.id,plan.room_id,'structure_created');
end; $$;
create function public.record_itinerary_draft(
  target_trip_plan_id uuid,validated_draft jsonb,target_provider_response_id text,target_provider_request_id text,
  target_input_tokens bigint,target_output_tokens bigint,target_reasoning_tokens bigint,target_cached_input_tokens bigint,
  target_total_tokens bigint,target_latency_ms integer
) returns void language sql security definer set search_path='' as $$
  select private.record_itinerary_draft(target_trip_plan_id,validated_draft,target_provider_response_id,target_provider_request_id,target_input_tokens,target_output_tokens,target_reasoning_tokens,target_cached_input_tokens,target_total_tokens,target_latency_ms);
$$;

create function private.record_tool_evidence(
  target_trip_plan_id uuid,target_provider text,target_tool_name text,target_request_fingerprint text,
  target_retrieved_at timestamptz,target_expires_at timestamptz,target_status text,target_normalized_result jsonb,
  target_source_reference jsonb,target_itinerary_item_id text
) returns uuid language plpgsql security definer set search_path='' as $$
declare evidence_id uuid;
begin
  if target_status not in ('verified','unavailable','stale','failed') or jsonb_typeof(target_normalized_result)<>'object' then raise exception using errcode='P0001',message='Tool evidence invalid.'; end if;
  insert into private.tool_evidence(trip_plan_id,itinerary_item_id,provider,tool_name,request_fingerprint,retrieved_at,expires_at,status,normalized_result,source_reference)
  values(target_trip_plan_id,target_itinerary_item_id,target_provider,target_tool_name,target_request_fingerprint,target_retrieved_at,target_expires_at,target_status::private.tool_evidence_status,target_normalized_result,target_source_reference)
  on conflict(trip_plan_id,tool_name,request_fingerprint) do update set itinerary_item_id=excluded.itinerary_item_id,provider=excluded.provider,retrieved_at=excluded.retrieved_at,expires_at=excluded.expires_at,status=excluded.status,normalized_result=excluded.normalized_result,source_reference=excluded.source_reference
  returning id into evidence_id;
  return evidence_id;
end; $$;
create function public.record_tool_evidence(
  target_trip_plan_id uuid,target_provider text,target_tool_name text,target_request_fingerprint text,
  target_retrieved_at timestamptz,target_expires_at timestamptz,target_status text,target_normalized_result jsonb,
  target_source_reference jsonb,target_itinerary_item_id text
) returns uuid language sql security definer set search_path='' as $$
  select private.record_tool_evidence(target_trip_plan_id,target_provider,target_tool_name,target_request_fingerprint,target_retrieved_at,target_expires_at,target_status,target_normalized_result,target_source_reference,target_itinerary_item_id);
$$;

create function private.record_validation_report(
  target_trip_plan_id uuid,target_plan_version integer,target_validator_version text,target_status text,target_issues jsonb,target_warnings jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare plan public.trip_plans%rowtype; report_id uuid; next_attempt integer; safe_summary jsonb; repaired jsonb;
begin
  select * into plan from public.trip_plans where id=target_trip_plan_id for update;
  if not found or plan.version<>target_plan_version or plan.status not in ('validating','needs_revision') or target_status not in ('pass','needs_revision','blocked') or jsonb_typeof(target_issues)<>'array' or jsonb_typeof(target_warnings)<>'array' then raise exception using errcode='P0001',message='Validation report invalid.'; end if;
  select coalesce(max(attempt),0)+1 into next_attempt from private.validation_reports where trip_plan_id=plan.id;
  if next_attempt>3 then raise exception using errcode='P0001',message='Validation retry exhausted.'; end if;
  insert into private.validation_reports(trip_plan_id,plan_version,attempt,validator_version,status,issues,warnings)
    values(plan.id,plan.version,next_attempt,target_validator_version,target_status::public.itinerary_validation_status,target_issues,target_warnings) returning id into report_id;
  update private.itinerary_runs set status='completed',completed_at=now()
    where trip_plan_id=plan.id and status='running';
  select case when target_status='pass' then coalesce(jsonb_agg(distinct issue->>'code') filter (where issue->>'code' is not null),'[]'::jsonb) else '[]'::jsonb end into repaired
    from private.validation_reports prior cross join lateral jsonb_array_elements(prior.issues) issue
    where prior.trip_plan_id=plan.id and prior.status='needs_revision';
  safe_summary:=jsonb_build_object(
    'validatorVersion',target_validator_version,'status',target_status,
    'issues','[]'::jsonb,'warnings','[]'::jsonb,
    'issueCount',jsonb_array_length(target_issues),'warningCount',jsonb_array_length(target_warnings),
    'passedChecks',case when target_status='pass' then jsonb_build_array('schema','references','date_range','timezone','item_order','overlap','travel_buffer','arrival_departure','route_duration','daily_drive_load','hard_constraints','confirmed_decisions','rejected_options','reservation_hours','coordinates','evidence_freshness','budget','duplicates','public_rendering') else '[]'::jsonb end,
    'repairedIssues',coalesce(repaired,'[]'::jsonb),'evidenceLastCheckedAt',now()
  );
  update public.trip_plans set validation_status=target_status::public.itinerary_validation_status,validation_summary=safe_summary,status=case target_status when 'needs_revision' then 'needs_revision'::public.trip_plan_status when 'blocked' then 'blocked'::public.trip_plan_status else 'validating'::public.trip_plan_status end where id=plan.id;
  insert into public.trip_plan_events(trip_plan_id,room_id,event_type) values(plan.id,plan.room_id,'validation_completed');
  return report_id;
end; $$;
create function public.record_validation_report(
  target_trip_plan_id uuid,target_plan_version integer,target_validator_version text,target_status text,target_issues jsonb,target_warnings jsonb
) returns uuid language sql security definer set search_path='' as $$
  select private.record_validation_report(target_trip_plan_id,target_plan_version,target_validator_version,target_status,target_issues,target_warnings);
$$;

create function private.mark_itinerary_needs_revision(target_trip_plan_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare plan public.trip_plans%rowtype;
begin
  select * into plan from public.trip_plans where id=target_trip_plan_id for update;
  if not found or plan.status<>'needs_revision' or plan.validation_status<>'needs_revision' then raise exception using errcode='P0001',message='Repair not allowed.'; end if;
  if (select count(*) from public.trip_plan_events where trip_plan_id=plan.id and event_type='repair_started')>=1 then raise exception using errcode='P0001',message='Repair retry exhausted.'; end if;
  insert into public.trip_plan_events(trip_plan_id,room_id,event_type) values(plan.id,plan.room_id,'repair_started');
end; $$;
create function public.mark_itinerary_needs_revision(target_trip_plan_id uuid) returns void language sql security definer set search_path='' as $$ select private.mark_itinerary_needs_revision(target_trip_plan_id); $$;

create function private.complete_itinerary_publication(target_trip_plan_id uuid,validated_itinerary jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare plan public.trip_plans%rowtype; latest private.validation_reports%rowtype;
begin
  select * into plan from public.trip_plans where id=target_trip_plan_id for update;
  if not found then raise exception using errcode='P0001',message='Plan not found.'; end if;
  if plan.status='published' then return jsonb_build_object('id',plan.id,'status','published','version',plan.version); end if;
  select * into latest from private.validation_reports where trip_plan_id=plan.id order by attempt desc limit 1;
  if plan.status<>'validating' or plan.validation_status<>'pass' or latest.status<>'pass' or jsonb_typeof(validated_itinerary)<>'object' then raise exception using errcode='P0001',message='Publication not allowed.'; end if;
  update public.trip_plans set itinerary_json=validated_itinerary,status='published',published_at=now(),error_code=null where id=plan.id;
  update public.rooms set current_plan_version=plan.version where id=plan.room_id and (current_plan_version is null or current_plan_version<plan.version);
  insert into public.trip_plan_events(trip_plan_id,room_id,event_type) values(plan.id,plan.room_id,'published');
  return jsonb_build_object('id',plan.id,'status','published','version',plan.version);
end; $$;
create function public.complete_itinerary_publication(target_trip_plan_id uuid,validated_itinerary jsonb) returns jsonb language sql security definer set search_path='' as $$ select private.complete_itinerary_publication(target_trip_plan_id,validated_itinerary); $$;

create function private.fail_itinerary_generation(target_trip_plan_id uuid,target_error_code text) returns void
language plpgsql security definer set search_path='' as $$
declare plan public.trip_plans%rowtype;
begin
  select * into plan from public.trip_plans where id=target_trip_plan_id for update;
  if not found or plan.status in ('published','superseded') then raise exception using errcode='P0001',message='Plan failure not allowed.'; end if;
  update private.itinerary_runs set status='failed',error_code=left(target_error_code,80),completed_at=now() where trip_plan_id=plan.id and status='running';
  update public.trip_plans set status='failed',error_code=left(target_error_code,80),failed_at=now() where id=plan.id;
  insert into public.trip_plan_events(trip_plan_id,room_id,event_type) values(plan.id,plan.room_id,'failed');
end; $$;
create function public.fail_itinerary_generation(target_trip_plan_id uuid,target_error_code text) returns void language sql security definer set search_path='' as $$ select private.fail_itinerary_generation(target_trip_plan_id,target_error_code); $$;

create function public.get_trip_plan(target_room_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare plan public.trip_plans%rowtype; events jsonb;
begin
  if not private.is_room_member(target_room_id) then raise exception using errcode='P0001',message='Membership required.'; end if;
  select * into plan from public.trip_plans where room_id=target_room_id and status<>'superseded' order by version desc limit 1;
  if not found then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'tripPlanId',e.trip_plan_id,'type',e.event_type,'createdAt',e.created_at) order by e.created_at,e.id),'[]'::jsonb) into events from public.trip_plan_events e where e.trip_plan_id=plan.id;
  return jsonb_build_object(
    'id',plan.id,'roomId',plan.room_id,'planningRequestId',plan.planning_request_id,'version',plan.version,
    'status',plan.status,'validationStatus',plan.validation_status,'basisSummaryVersion',plan.basis_summary_version,
    'itinerary',case when plan.status='published' then plan.itinerary_json else null end,
    'validationSummary',plan.validation_summary,'progressEvents',events,'createdAt',plan.created_at,'updatedAt',plan.updated_at,
    'publishedAt',plan.published_at,'errorCode',plan.error_code
  );
end; $$;

create function public.list_recoverable_itinerary_generations(batch_size integer default 10) returns setof uuid
language sql security definer set search_path='' as $$
  select plan.id from public.trip_plans plan
  where plan.status in ('generating','validating','needs_revision')
    and plan.updated_at<now()-interval '1 minute'
    and (select count(*) from private.itinerary_runs run where run.trip_plan_id=plan.id)<3
  order by plan.updated_at limit least(greatest(batch_size,1),50) for update skip locked;
$$;

revoke execute on function private.reject_published_trip_plan_mutation(),private.notify_itinerary_change(),private.claim_itinerary_generation(uuid),private.get_itinerary_generation_context(uuid),private.record_plan_progress(uuid,text),private.record_itinerary_draft(uuid,jsonb,text,text,bigint,bigint,bigint,bigint,bigint,integer),private.record_tool_evidence(uuid,text,text,text,timestamptz,timestamptz,text,jsonb,jsonb,text),private.record_validation_report(uuid,integer,text,text,jsonb,jsonb),private.mark_itinerary_needs_revision(uuid),private.complete_itinerary_publication(uuid,jsonb),private.fail_itinerary_generation(uuid,text) from public,anon,authenticated,service_role;

revoke execute on function public.create_itinerary_generation(uuid,uuid),public.get_trip_plan(uuid) from public,anon,service_role;
grant execute on function public.create_itinerary_generation(uuid,uuid),public.get_trip_plan(uuid) to authenticated;

revoke execute on function public.claim_itinerary_generation(uuid),public.get_itinerary_generation_context(uuid),public.record_plan_progress(uuid,text),public.record_itinerary_draft(uuid,jsonb,text,text,bigint,bigint,bigint,bigint,bigint,integer),public.record_tool_evidence(uuid,text,text,text,timestamptz,timestamptz,text,jsonb,jsonb,text),public.record_validation_report(uuid,integer,text,text,jsonb,jsonb),public.mark_itinerary_needs_revision(uuid),public.complete_itinerary_publication(uuid,jsonb),public.fail_itinerary_generation(uuid,text),public.list_recoverable_itinerary_generations(integer) from public,anon,authenticated;
grant execute on function public.claim_itinerary_generation(uuid),public.get_itinerary_generation_context(uuid),public.record_plan_progress(uuid,text),public.record_itinerary_draft(uuid,jsonb,text,text,bigint,bigint,bigint,bigint,bigint,integer),public.record_tool_evidence(uuid,text,text,text,timestamptz,timestamptz,text,jsonb,jsonb,text),public.record_validation_report(uuid,integer,text,text,jsonb,jsonb),public.mark_itinerary_needs_revision(uuid),public.complete_itinerary_publication(uuid,jsonb),public.fail_itinerary_generation(uuid,text),public.list_recoverable_itinerary_generations(integer) to service_role;
