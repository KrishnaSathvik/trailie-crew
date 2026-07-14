create type public.plan_change_type as enum (
  'add_item','remove_item','replace_item','move_item','reschedule_item','shorten_item','extend_item',
  'change_route','change_lodging','change_food','rebalance_day','update_traveler_logistics','adjust_budget','general_revision'
);
create type public.plan_change_status as enum (
  'draft','analyzing','awaiting_review','changes_requested','approved','applying','validating',
  'awaiting_confirmation','blocked','published','failed','cancelled','superseded'
);
create type public.change_materiality as enum ('minor','material','critical');
create type public.change_feasibility as enum ('feasible','needs_information','blocked');
create type public.plan_change_decision as enum ('approved','changes_requested');
create type public.candidate_confirmation_decision as enum ('confirmed','changes_requested');
create type public.plan_change_event_type as enum (
  'request_created','analysis_started','analysis_ready','changes_requested','approved',
  'candidate_generation_started','candidate_validation_started','repair_started','candidate_ready',
  'confirmation_changed','published','blocked','failed','cancelled'
);
create type private.plan_change_run_type as enum ('impact_analysis','candidate_generation','candidate_repair');
create type private.plan_change_run_status as enum ('running','completed','failed','cancelled');

alter table public.trip_plans add column plan_hash text;
update public.trip_plans set plan_hash=encode(extensions.digest(itinerary_json::text,'sha256'),'hex') where itinerary_json is not null;
alter table public.trip_plans add constraint trip_plans_hash_valid check (plan_hash is null or char_length(plan_hash) between 1 and 128);
alter table public.trip_plans drop constraint trip_plans_planning_request_id_basis_summary_version_key;
alter table public.trip_plans add constraint trip_plans_id_room_unique unique(id,room_id);

create table public.plan_change_requests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  base_trip_plan_id uuid not null references public.trip_plans(id) on delete restrict,
  base_plan_version integer not null check (base_plan_version > 0),
  basis_plan_hash text not null check (char_length(basis_plan_hash) between 1 and 128),
  basis_membership_fingerprint text not null check (char_length(basis_membership_fingerprint) between 1 and 128),
  requested_by_participant_id uuid not null,
  requested_by_user_id uuid not null references auth.users(id),
  request_type public.plan_change_type not null,
  target_item_id text,
  request_text text not null check (char_length(btrim(request_text)) between 1 and 2000 and request_text !~ '[<>]'),
  normalized_request_text text not null check (char_length(normalized_request_text) between 1 and 2000),
  status public.plan_change_status not null default 'draft',
  approval_mode public.approval_mode not null,
  current_analysis_version integer not null default 0 check (current_analysis_version >= 0),
  approved_analysis_version integer check (approved_analysis_version > 0),
  candidate_trip_plan_id uuid references public.trip_plans(id) on delete restrict,
  candidate_diff jsonb check (candidate_diff is null or jsonb_typeof(candidate_diff)='object'),
  idempotency_key text not null unique,
  analysis_attempt_count integer not null default 0 check (analysis_attempt_count between 0 and 2),
  candidate_attempt_count integer not null default 0 check (candidate_attempt_count between 0 and 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  published_at timestamptz,
  cancelled_at timestamptz,
  error_code text check (error_code is null or char_length(error_code) between 1 and 80),
  unique(id,room_id),
  constraint plan_change_requests_requester_fkey foreign key
    (requested_by_participant_id,room_id,requested_by_user_id)
    references public.participants(id,room_id,user_id),
  constraint plan_change_requests_base_room_fkey foreign key
    (base_trip_plan_id,room_id) references public.trip_plans(id,room_id),
  constraint plan_change_requests_cancelled_valid check ((status='cancelled')=(cancelled_at is not null)),
  constraint plan_change_requests_published_valid check ((status='published')=(published_at is not null))
);
create index plan_change_requests_room_created_idx on public.plan_change_requests(room_id,created_at desc);
create index plan_change_requests_base_idx on public.plan_change_requests(base_trip_plan_id);
create index plan_change_requests_recovery_idx on public.plan_change_requests(status,updated_at)
  where status in ('draft','analyzing','approved','applying','validating','failed');
create unique index plan_change_requests_one_active_scope_idx on public.plan_change_requests(
  base_trip_plan_id,requested_by_participant_id,coalesce(target_item_id,''),normalized_request_text
) where status not in ('published','cancelled','superseded');

alter table public.trip_plans add column change_request_id uuid references public.plan_change_requests(id) on delete restrict;
alter table public.trip_plans add column base_trip_plan_id uuid references public.trip_plans(id) on delete restrict;
create unique index trip_plans_change_request_idx on public.trip_plans(change_request_id) where change_request_id is not null;
create index trip_plans_base_plan_idx on public.trip_plans(base_trip_plan_id) where base_trip_plan_id is not null;

create table public.plan_change_analyses (
  id uuid primary key default gen_random_uuid(),
  change_request_id uuid not null references public.plan_change_requests(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  version integer not null check (version > 0),
  schema_version text not null check (char_length(schema_version) between 1 and 100),
  prompt_version text not null check (char_length(prompt_version) between 1 and 100),
  model text not null check (char_length(model) between 1 and 100),
  analysis_json jsonb not null check (jsonb_typeof(analysis_json)='object'),
  analysis_hash text not null check (char_length(analysis_hash) between 1 and 128),
  materiality public.change_materiality not null,
  feasibility public.change_feasibility not null,
  basis_plan_hash text not null check (char_length(basis_plan_hash) between 1 and 128),
  basis_plan_version integer not null check (basis_plan_version > 0),
  created_at timestamptz not null default now(),
  unique(change_request_id,version),
  constraint plan_change_analyses_request_room_fkey foreign key (change_request_id,room_id)
    references public.plan_change_requests(id,room_id)
);
create index plan_change_analyses_room_created_idx on public.plan_change_analyses(room_id,created_at desc);

create table public.plan_change_approvals (
  id uuid primary key default gen_random_uuid(),
  change_request_id uuid not null references public.plan_change_requests(id) on delete cascade,
  analysis_version integer not null check (analysis_version > 0),
  participant_id uuid not null references public.participants(id),
  user_id uuid not null references auth.users(id),
  decision public.plan_change_decision not null,
  note text check (note is null or (char_length(btrim(note)) between 1 and 500 and note !~ '[<>]')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(change_request_id,analysis_version,participant_id)
);
create index plan_change_approvals_request_version_idx on public.plan_change_approvals(change_request_id,analysis_version);
create index plan_change_approvals_participant_idx on public.plan_change_approvals(participant_id);

create table public.plan_change_confirmations (
  id uuid primary key default gen_random_uuid(),
  change_request_id uuid not null references public.plan_change_requests(id) on delete cascade,
  candidate_trip_plan_id uuid not null references public.trip_plans(id) on delete cascade,
  participant_id uuid not null references public.participants(id),
  user_id uuid not null references auth.users(id),
  decision public.candidate_confirmation_decision not null,
  note text check (note is null or (char_length(btrim(note)) between 1 and 500 and note !~ '[<>]')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(change_request_id,candidate_trip_plan_id,participant_id)
);
create index plan_change_confirmations_candidate_idx on public.plan_change_confirmations(candidate_trip_plan_id);
create index plan_change_confirmations_participant_idx on public.plan_change_confirmations(participant_id);

create table public.plan_change_events (
  id uuid primary key default gen_random_uuid(),
  change_request_id uuid not null references public.plan_change_requests(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  event_type public.plan_change_event_type not null,
  created_at timestamptz not null default now()
);
create index plan_change_events_request_created_idx on public.plan_change_events(change_request_id,created_at,id);
create index plan_change_events_room_created_idx on public.plan_change_events(room_id,created_at desc);

create table private.plan_change_runs (
  id uuid primary key default gen_random_uuid(),
  change_request_id uuid not null references public.plan_change_requests(id) on delete cascade,
  candidate_trip_plan_id uuid references public.trip_plans(id) on delete cascade,
  analysis_version integer,
  run_type private.plan_change_run_type not null,
  attempt integer not null check (attempt between 1 and 2),
  model text not null check (char_length(model) between 1 and 100),
  prompt_version text not null check (char_length(prompt_version) between 1 and 100),
  schema_version text not null check (char_length(schema_version) between 1 and 100),
  status private.plan_change_run_status not null default 'running',
  provider_response_id text,
  provider_request_id text,
  input_tokens bigint check (input_tokens is null or input_tokens >= 0),
  output_tokens bigint check (output_tokens is null or output_tokens >= 0),
  reasoning_tokens bigint check (reasoning_tokens is null or reasoning_tokens >= 0),
  cached_input_tokens bigint check (cached_input_tokens is null or cached_input_tokens >= 0),
  total_tokens bigint check (total_tokens is null or total_tokens >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error_code text check (error_code is null or char_length(error_code) between 1 and 80),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(change_request_id,run_type,attempt)
);
create unique index plan_change_runs_one_active_idx on private.plan_change_runs(change_request_id) where status='running';

create table private.change_boundary_reports (
  id uuid primary key default gen_random_uuid(),
  change_request_id uuid not null references public.plan_change_requests(id) on delete cascade,
  candidate_trip_plan_id uuid not null references public.trip_plans(id) on delete cascade,
  validator_version text not null check (char_length(validator_version) between 1 and 100),
  status public.itinerary_validation_status not null check (status in ('pass','blocked')),
  issues jsonb not null check (jsonb_typeof(issues)='array'),
  diff_json jsonb not null check (jsonb_typeof(diff_json)='object'),
  created_at timestamptz not null default now(),
  unique(change_request_id,candidate_trip_plan_id)
);
create index change_boundary_reports_candidate_idx on private.change_boundary_reports(candidate_trip_plan_id);

alter table public.plan_change_requests enable row level security;
alter table public.plan_change_analyses enable row level security;
alter table public.plan_change_approvals enable row level security;
alter table public.plan_change_confirmations enable row level security;
alter table public.plan_change_events enable row level security;
alter table private.plan_change_runs enable row level security;
alter table private.plan_change_runs force row level security;
alter table private.change_boundary_reports enable row level security;
alter table private.change_boundary_reports force row level security;

create policy plan_change_requests_member_read on public.plan_change_requests for select to authenticated
  using ((select private.is_room_member(room_id)));
create policy plan_change_analyses_member_read on public.plan_change_analyses for select to authenticated
  using ((select private.is_room_member(room_id)));
create policy plan_change_approvals_member_read on public.plan_change_approvals for select to authenticated
  using (exists(select 1 from public.plan_change_requests request where request.id=change_request_id and private.is_room_member(request.room_id)));
create policy plan_change_confirmations_member_read on public.plan_change_confirmations for select to authenticated
  using (exists(select 1 from public.plan_change_requests request where request.id=change_request_id and private.is_room_member(request.room_id)));
create policy plan_change_events_member_read on public.plan_change_events for select to authenticated
  using ((select private.is_room_member(room_id)));
create policy plan_change_runs_deny_browser on private.plan_change_runs as restrictive for all to anon,authenticated using(false) with check(false);
create policy change_boundary_reports_deny_browser on private.change_boundary_reports as restrictive for all to anon,authenticated using(false) with check(false);

revoke all on public.plan_change_requests,public.plan_change_analyses,public.plan_change_approvals,public.plan_change_confirmations,public.plan_change_events from public,anon,authenticated;
grant select on public.plan_change_requests,public.plan_change_analyses,public.plan_change_approvals,public.plan_change_confirmations,public.plan_change_events to authenticated;
revoke all on private.plan_change_runs,private.change_boundary_reports from public,anon,authenticated,service_role;

create trigger plan_change_requests_set_updated_at before update on public.plan_change_requests
  for each row execute function private.set_updated_at();
create trigger plan_change_approvals_set_updated_at before update on public.plan_change_approvals
  for each row execute function private.set_updated_at();
create trigger plan_change_confirmations_set_updated_at before update on public.plan_change_confirmations
  for each row execute function private.set_updated_at();

create function private.reject_change_analysis_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception using errcode='P0001',message='Published change analyses are immutable.'; end; $$;
create trigger plan_change_analyses_immutable before update or delete on public.plan_change_analyses
  for each row execute function private.reject_change_analysis_mutation();

create function private.reject_ready_candidate_content_mutation() returns trigger language plpgsql set search_path='' as $$
begin
  if exists(select 1 from public.plan_change_requests request where request.candidate_trip_plan_id=old.id and request.status in ('awaiting_confirmation','published'))
    and new.itinerary_json is distinct from old.itinerary_json then
    raise exception using errcode='P0001',message='Ready candidate itineraries are immutable.';
  end if;
  return new;
end; $$;
create trigger trip_plans_ready_candidate_immutable before update on public.trip_plans
  for each row execute function private.reject_ready_candidate_content_mutation();

create function private.notify_plan_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform realtime.send(
    jsonb_build_object('kind','plan_change','roomId',new.room_id,'changeRequestId',new.change_request_id,'eventType',new.event_type),
    'plan_change_changed','room:'||new.room_id::text,true
  );
  return null;
end; $$;
create trigger plan_change_events_notify_room after insert on public.plan_change_events
  for each row execute function private.notify_plan_change();

create function private.current_revision_basis(target_room_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'currentPlanVersion',room.current_plan_version,
    'approvalMode',room.approval_mode,
    'membershipFingerprint',encode(extensions.digest(coalesce(string_agg(participant.id::text||':'||participant.role::text,',' order by participant.id),'none'),'sha256'),'hex')
  )
  from public.rooms room
  left join public.participants participant on participant.room_id=room.id and participant.status='active'
  where room.id=target_room_id and room.status='active'
  group by room.id;
$$;

create function private.plan_change_is_stale(request public.plan_change_requests) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare basis jsonb; base public.trip_plans%rowtype;
begin
  basis:=private.current_revision_basis(request.room_id);
  select * into base from public.trip_plans where id=request.base_trip_plan_id;
  return basis is null
    or (basis->>'currentPlanVersion')::integer<>request.base_plan_version
    or basis->>'approvalMode'<>request.approval_mode::text
    or basis->>'membershipFingerprint'<>request.basis_membership_fingerprint
    or base.status<>'published'
    or base.version<>request.base_plan_version
    or coalesce(base.plan_hash,encode(extensions.digest(base.itinerary_json::text,'sha256'),'hex'))<>request.basis_plan_hash;
end; $$;

create function public.create_plan_change_request(base_trip_plan_id uuid,participant_id uuid,request_type text,target_item_id text default null,request_text text default null)
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
  if $3 is null or $3 not in ('add_item','remove_item','replace_item','move_item','reschedule_item','shorten_item','extend_item','change_route','change_lodging','change_food','rebalance_day','update_traveler_logistics','adjust_budget','general_revision') then raise exception using errcode='P0001',message='Change request not allowed.'; end if;
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

create function private.claim_change_analysis(target_change_request_id uuid,target_model text,target_prompt_version text,target_schema_version text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare request public.plan_change_requests%rowtype; attempt integer; run private.plan_change_runs%rowtype;
begin
  select * into request from public.plan_change_requests where id=target_change_request_id for update;
  if not found then raise exception using errcode='P0001',message='Change request not found.'; end if;
  if request.status='analyzing' and request.updated_at>now()-interval '5 minutes' then return jsonb_build_object('claimed',false,'status',request.status); end if;
  if request.status not in ('draft','changes_requested','failed','analyzing') or request.analysis_attempt_count>=2 or private.plan_change_is_stale(request) then return jsonb_build_object('claimed',false,'status',request.status,'errorCode','retry_exhausted'); end if;
  attempt:=request.analysis_attempt_count+1;
  update public.plan_change_requests set status='analyzing',analysis_attempt_count=attempt,error_code=null where id=request.id;
  update private.plan_change_runs set status='cancelled',completed_at=now() where change_request_id=request.id and status='running';
  insert into private.plan_change_runs(change_request_id,analysis_version,run_type,attempt,model,prompt_version,schema_version)
  values(request.id,request.current_analysis_version+1,'impact_analysis',attempt,target_model,target_prompt_version,target_schema_version) returning * into run;
  insert into public.plan_change_events(change_request_id,room_id,event_type) values(request.id,request.room_id,'analysis_started');
  return jsonb_build_object('claimed',true,'runId',run.id,'analysisVersion',request.current_analysis_version+1,'attemptCount',attempt,'roomId',request.room_id);
end; $$;
create function public.claim_change_analysis(target_change_request_id uuid,target_model text,target_prompt_version text,target_schema_version text) returns jsonb
language sql security definer set search_path='' as $$ select private.claim_change_analysis(target_change_request_id,target_model,target_prompt_version,target_schema_version); $$;

create function private.complete_change_analysis(target_change_request_id uuid,validated_analysis jsonb,target_materiality text,target_feasibility text,target_analysis_hash text,target_model text,target_prompt_version text,target_schema_version text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare request public.plan_change_requests%rowtype; next_version integer; next_status public.plan_change_status;
begin
  select * into request from public.plan_change_requests where id=target_change_request_id for update;
  if not found or request.status<>'analyzing' then raise exception using errcode='P0001',message='Change analysis not allowed.'; end if;
  if private.plan_change_is_stale(request) then update public.plan_change_requests set status='blocked',error_code='change_request_stale' where id=request.id; raise exception using errcode='P0001',message='Change request is stale.'; end if;
  if jsonb_typeof(validated_analysis)<>'object' or validated_analysis->>'schemaVersion'<>'1' or target_materiality not in ('minor','material','critical') or target_feasibility not in ('feasible','needs_information','blocked') then raise exception using errcode='P0001',message='Invalid change analysis.'; end if;
  next_version:=request.current_analysis_version+1;
  insert into public.plan_change_analyses(change_request_id,room_id,version,schema_version,prompt_version,model,analysis_json,analysis_hash,materiality,feasibility,basis_plan_hash,basis_plan_version)
  values(request.id,request.room_id,next_version,target_schema_version,target_prompt_version,target_model,validated_analysis,target_analysis_hash,target_materiality::public.change_materiality,target_feasibility::public.change_feasibility,request.basis_plan_hash,request.base_plan_version);
  update private.plan_change_runs set status='completed',completed_at=now() where change_request_id=request.id and run_type='impact_analysis' and status='running';
  next_status:=case when target_feasibility='blocked' or jsonb_array_length(coalesce(validated_analysis->'blockers','[]'::jsonb))>0 then 'blocked'::public.plan_change_status else 'awaiting_review'::public.plan_change_status end;
  update public.plan_change_requests set status=next_status,current_analysis_version=next_version,approved_analysis_version=null,analysis_attempt_count=0,error_code=case when next_status='blocked' then 'candidate_blocked' else null end where id=request.id;
  insert into public.plan_change_events(change_request_id,room_id,event_type) values(request.id,request.room_id,case when next_status='blocked' then 'blocked'::public.plan_change_event_type else 'analysis_ready'::public.plan_change_event_type end);
  return jsonb_build_object('id',request.id,'status',next_status,'analysisVersion',next_version);
end; $$;
create function public.complete_change_analysis(target_change_request_id uuid,validated_analysis jsonb,target_materiality text,target_feasibility text,target_analysis_hash text,target_model text,target_prompt_version text,target_schema_version text) returns jsonb
language sql security definer set search_path='' as $$ select private.complete_change_analysis(target_change_request_id,validated_analysis,target_materiality,target_feasibility,target_analysis_hash,target_model,target_prompt_version,target_schema_version); $$;

create function public.review_plan_change(target_change_request_id uuid,target_analysis_version integer,target_participant_id uuid,target_decision text,note text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); request public.plan_change_requests%rowtype; member public.participants%rowtype; analysis public.plan_change_analyses%rowtype; required uuid[]; approved uuid[]; complete boolean;
begin
  if caller is null then raise exception using errcode='P0001',message='Authentication required.'; end if;
  select * into request from public.plan_change_requests where id=target_change_request_id for update;
  if not found then raise exception using errcode='P0001',message='Change request not found.'; end if;
  select * into member from public.participants where id=target_participant_id and room_id=request.room_id and user_id=caller and status='active';
  if not found then raise exception using errcode='P0001',message='Membership required.'; end if;
  if request.status not in ('awaiting_review','changes_requested') then raise exception using errcode='P0001',message='Change approval not allowed.'; end if;
  if private.plan_change_is_stale(request) then raise exception using errcode='P0001',message='Change request is stale.'; end if;
  if target_analysis_version<>request.current_analysis_version then raise exception using errcode='P0001',message='Analysis version mismatch.'; end if;
  select * into analysis from public.plan_change_analyses where change_request_id=request.id and version=target_analysis_version;
  if not found or analysis.feasibility='blocked' or jsonb_array_length(coalesce(analysis.analysis_json->'blockers','[]'::jsonb))>0 then raise exception using errcode='P0001',message='Change approval not allowed.'; end if;
  if target_decision not in ('approved','changes_requested') then raise exception using errcode='P0001',message='Change approval not allowed.'; end if;
  if target_decision='changes_requested' and (note is null or char_length(btrim(note)) not between 1 and 500) then raise exception using errcode='P0001',message='Change note required.'; end if;
  insert into public.plan_change_approvals(change_request_id,analysis_version,participant_id,user_id,decision,note)
  values(request.id,target_analysis_version,member.id,caller,target_decision::public.plan_change_decision,nullif(btrim(note),''))
  on conflict(change_request_id,analysis_version,participant_id) do update set decision=excluded.decision,note=excluded.note,user_id=excluded.user_id;
  if target_decision='changes_requested' then
    update public.plan_change_requests set status='changes_requested',approved_analysis_version=null,approved_at=null where id=request.id;
    insert into public.plan_change_events(change_request_id,room_id,event_type) values(request.id,request.room_id,'changes_requested');
    return jsonb_build_object('id',request.id,'status','changes_requested','complete',false);
  end if;
  select array_agg(id order by id) into required from public.participants where room_id=request.room_id and status='active' and (request.approval_mode='all_active' or role='host');
  select array_agg(participant_id order by participant_id) into approved from public.plan_change_approvals where change_request_id=request.id and analysis_version=target_analysis_version and decision='approved' and participant_id=any(required);
  complete:=coalesce(required,'{}'::uuid[])<@coalesce(approved,'{}'::uuid[]);
  if complete then
    update public.plan_change_requests set status='approved',approved_analysis_version=target_analysis_version,approved_at=now() where id=request.id;
    insert into public.plan_change_events(change_request_id,room_id,event_type) values(request.id,request.room_id,'approved');
  end if;
  return jsonb_build_object('id',request.id,'status',case when complete then 'approved' else 'awaiting_review' end,'complete',complete);
end; $$;

create function private.claim_candidate_generation(target_change_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare request public.plan_change_requests%rowtype; run private.plan_change_runs%rowtype; attempt integer;
begin
  select * into request from public.plan_change_requests where id=target_change_request_id for update;
  if not found then raise exception using errcode='P0001',message='Change request not found.'; end if;
  if request.candidate_trip_plan_id is not null then return jsonb_build_object('claimed',false,'status',request.status,'candidateTripPlanId',request.candidate_trip_plan_id); end if;
  if request.status='applying' and request.updated_at>now()-interval '5 minutes' then return jsonb_build_object('claimed',false,'status',request.status); end if;
  if request.status not in ('approved','applying') or request.approved_analysis_version is distinct from request.current_analysis_version or request.candidate_attempt_count>=2 or private.plan_change_is_stale(request) then return jsonb_build_object('claimed',false,'status',request.status); end if;
  attempt:=request.candidate_attempt_count+1;
  update public.plan_change_requests set status='applying',candidate_attempt_count=attempt,error_code=null where id=request.id;
  update private.plan_change_runs set status='cancelled',completed_at=now() where change_request_id=request.id and status='running';
  insert into private.plan_change_runs(change_request_id,analysis_version,run_type,attempt,model,prompt_version,schema_version)
  values(request.id,request.approved_analysis_version,'candidate_generation',attempt,'gpt-5.6-sol','trailie-itinerary-revision-v1','1') returning * into run;
  insert into public.plan_change_events(change_request_id,room_id,event_type) values(request.id,request.room_id,'candidate_generation_started');
  return jsonb_build_object('claimed',true,'runId',run.id,'attemptCount',attempt,'roomId',request.room_id,'candidateVersion',request.base_plan_version+1);
end; $$;
create function public.claim_candidate_generation(target_change_request_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.claim_candidate_generation(target_change_request_id); $$;

create function private.attach_candidate_trip_plan(target_change_request_id uuid,validated_itinerary jsonb,target_model text,target_prompt_version text,target_schema_version text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare request public.plan_change_requests%rowtype; base public.trip_plans%rowtype; candidate public.trip_plans%rowtype;
begin
  select * into request from public.plan_change_requests where id=target_change_request_id for update;
  if not found or request.status<>'applying' or request.candidate_trip_plan_id is not null or private.plan_change_is_stale(request) or jsonb_typeof(validated_itinerary)<>'object' then raise exception using errcode='P0001',message='Invalid candidate.'; end if;
  select * into base from public.trip_plans where id=request.base_trip_plan_id;
  insert into public.trip_plans(room_id,planning_request_id,planning_summary_id,version,status,schema_version,prompt_version,model,itinerary_json,plan_hash,validation_status,basis_summary_version,basis_summary_hash,created_by_participant_id,created_by_user_id,change_request_id,base_trip_plan_id)
  values(base.room_id,base.planning_request_id,base.planning_summary_id,request.base_plan_version+1,'validating',target_schema_version,target_prompt_version,target_model,validated_itinerary,encode(extensions.digest(validated_itinerary::text,'sha256'),'hex'),'pending',base.basis_summary_version,base.basis_summary_hash,request.requested_by_participant_id,request.requested_by_user_id,request.id,base.id)
  returning * into candidate;
  update private.plan_change_runs set status='completed',candidate_trip_plan_id=candidate.id,completed_at=now() where change_request_id=request.id and run_type='candidate_generation' and status='running';
  update public.plan_change_requests set status='validating',candidate_trip_plan_id=candidate.id where id=request.id;
  insert into public.plan_change_events(change_request_id,room_id,event_type) values(request.id,request.room_id,'candidate_validation_started');
  return jsonb_build_object('id',candidate.id,'status',candidate.status,'version',candidate.version);
end; $$;
create function public.attach_candidate_trip_plan(target_change_request_id uuid,validated_itinerary jsonb,target_model text,target_prompt_version text,target_schema_version text) returns jsonb language sql security definer set search_path='' as $$ select private.attach_candidate_trip_plan(target_change_request_id,validated_itinerary,target_model,target_prompt_version,target_schema_version); $$;

create function public.update_plan_change_candidate(target_candidate_trip_plan_id uuid,validated_itinerary jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare request public.plan_change_requests%rowtype; candidate public.trip_plans%rowtype;
begin
  select * into candidate from public.trip_plans where id=target_candidate_trip_plan_id for update;
  select * into request from public.plan_change_requests where candidate_trip_plan_id=candidate.id for update;
  if not found or request.status<>'validating' or candidate.status not in ('validating','needs_revision') or jsonb_typeof(validated_itinerary)<>'object' then raise exception using errcode='P0001',message='Invalid candidate.'; end if;
  update public.trip_plans set itinerary_json=validated_itinerary,plan_hash=encode(extensions.digest(validated_itinerary::text,'sha256'),'hex'),status='validating',validation_status='pending',validation_summary=null where id=candidate.id;
end; $$;

create function public.start_plan_change_repair(target_change_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare request public.plan_change_requests%rowtype; candidate public.trip_plans%rowtype; run private.plan_change_runs%rowtype;
begin
  select * into request from public.plan_change_requests where id=target_change_request_id for update;
  if not found or request.status<>'validating' or request.candidate_trip_plan_id is null then return jsonb_build_object('claimed',false); end if;
  select * into candidate from public.trip_plans where id=request.candidate_trip_plan_id for update;
  if candidate.status<>'needs_revision' or exists(select 1 from private.plan_change_runs where change_request_id=request.id and run_type='candidate_repair') then return jsonb_build_object('claimed',false); end if;
  insert into private.plan_change_runs(change_request_id,candidate_trip_plan_id,analysis_version,run_type,attempt,model,prompt_version,schema_version)
  values(request.id,candidate.id,request.approved_analysis_version,'candidate_repair',1,'gpt-5.6-sol','trailie-itinerary-revision-v1','1') returning * into run;
  insert into public.plan_change_events(change_request_id,room_id,event_type) values(request.id,request.room_id,'repair_started');
  insert into public.trip_plan_events(trip_plan_id,room_id,event_type) values(candidate.id,request.room_id,'repair_started');
  return jsonb_build_object('claimed',true,'runId',run.id);
end; $$;

create function public.block_plan_change(target_change_request_id uuid,target_error_code text) returns void
language plpgsql security definer set search_path='' as $$
declare request public.plan_change_requests%rowtype;
begin
  select * into request from public.plan_change_requests where id=target_change_request_id for update;
  if not found or request.status in ('published','cancelled','superseded') then raise exception using errcode='P0001',message='Change request not allowed.'; end if;
  update private.plan_change_runs set status='failed',error_code=left(target_error_code,80),completed_at=now() where change_request_id=request.id and status='running';
  update public.trip_plans set status='blocked',validation_status='blocked',error_code=left(target_error_code,80) where id=request.candidate_trip_plan_id and status<>'published';
  update public.plan_change_requests set status='blocked',error_code=left(target_error_code,80) where id=request.id;
  insert into public.plan_change_events(change_request_id,room_id,event_type) values(request.id,request.room_id,'blocked');
end; $$;

create function public.record_plan_change_run_usage(
  target_change_request_id uuid,target_run_type text,target_provider_response_id text,target_provider_request_id text,
  target_input_tokens bigint,target_output_tokens bigint,target_reasoning_tokens bigint,target_cached_input_tokens bigint,
  target_total_tokens bigint,target_latency_ms integer
) returns void language plpgsql security definer set search_path='' as $$
begin
  if target_run_type not in ('impact_analysis','candidate_generation','candidate_repair') then raise exception using errcode='P0001',message='Change run invalid.'; end if;
  update private.plan_change_runs set provider_response_id=target_provider_response_id,provider_request_id=target_provider_request_id,
    input_tokens=target_input_tokens,output_tokens=target_output_tokens,reasoning_tokens=target_reasoning_tokens,
    cached_input_tokens=target_cached_input_tokens,total_tokens=target_total_tokens,latency_ms=target_latency_ms,
    status='completed',completed_at=coalesce(completed_at,now())
  where id=(select id from private.plan_change_runs where change_request_id=target_change_request_id and run_type=target_run_type::private.plan_change_run_type order by attempt desc limit 1);
end; $$;

create function private.complete_plan_change_candidate(target_change_request_id uuid,boundary_report jsonb,candidate_diff jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare request public.plan_change_requests%rowtype; candidate public.trip_plans%rowtype; latest private.validation_reports%rowtype;
begin
  select * into request from public.plan_change_requests where id=target_change_request_id for update;
  if not found or request.status<>'validating' or request.candidate_trip_plan_id is null or private.plan_change_is_stale(request) then raise exception using errcode='P0001',message='Invalid candidate.'; end if;
  select * into candidate from public.trip_plans where id=request.candidate_trip_plan_id for update;
  select * into latest from private.validation_reports where trip_plan_id=candidate.id order by attempt desc limit 1;
  if candidate.version<>request.base_plan_version+1 or candidate.validation_status<>'pass' or latest.status<>'pass' or $2->>'status'<>'pass' or $3->>'candidateVersion'<>(request.base_plan_version+1)::text then raise exception using errcode='P0001',message='Candidate validation failed.'; end if;
  insert into private.change_boundary_reports(change_request_id,candidate_trip_plan_id,validator_version,status,issues,diff_json)
  values(request.id,candidate.id,coalesce($2->>'validatorVersion','trailie-change-boundary-v1'),'pass',coalesce($2->'issues','[]'::jsonb),$3)
  on conflict(change_request_id,candidate_trip_plan_id) do nothing;
  update public.plan_change_requests set status='awaiting_confirmation',candidate_diff=$3 where id=request.id;
  insert into public.plan_change_events(change_request_id,room_id,event_type) values(request.id,request.room_id,'candidate_ready');
  return jsonb_build_object('id',request.id,'status','awaiting_confirmation','candidateTripPlanId',candidate.id);
end; $$;
create function public.complete_plan_change_candidate(target_change_request_id uuid,boundary_report jsonb,candidate_diff jsonb) returns jsonb language sql security definer set search_path='' as $$ select private.complete_plan_change_candidate(target_change_request_id,boundary_report,candidate_diff); $$;

create function public.confirm_plan_change_candidate(target_change_request_id uuid,target_candidate_trip_plan_id uuid,target_participant_id uuid,target_decision text,note text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); request public.plan_change_requests%rowtype; member public.participants%rowtype; required uuid[]; confirmed uuid[]; complete boolean;
begin
  if caller is null then raise exception using errcode='P0001',message='Authentication required.'; end if;
  select * into request from public.plan_change_requests where id=target_change_request_id for update;
  if not found or request.status<>'awaiting_confirmation' or request.candidate_trip_plan_id is distinct from target_candidate_trip_plan_id then raise exception using errcode='P0001',message='Candidate confirmation required.'; end if;
  select * into member from public.participants where id=target_participant_id and room_id=request.room_id and user_id=caller and status='active';
  if not found then raise exception using errcode='P0001',message='Membership required.'; end if;
  if private.plan_change_is_stale(request) then raise exception using errcode='P0001',message='Change request is stale.'; end if;
  if target_decision not in ('confirmed','changes_requested') then raise exception using errcode='P0001',message='Candidate confirmation required.'; end if;
  if target_decision='changes_requested' and (note is null or char_length(btrim(note)) not between 1 and 500) then raise exception using errcode='P0001',message='Change note required.'; end if;
  insert into public.plan_change_confirmations(change_request_id,candidate_trip_plan_id,participant_id,user_id,decision,note)
  values(request.id,target_candidate_trip_plan_id,member.id,caller,target_decision::public.candidate_confirmation_decision,nullif(btrim(note),''))
  on conflict(change_request_id,candidate_trip_plan_id,participant_id) do update set decision=excluded.decision,note=excluded.note,user_id=excluded.user_id;
  if target_decision='changes_requested' then update public.plan_change_requests set status='blocked',error_code='candidate_blocked' where id=request.id; end if;
  select array_agg(id order by id) into required from public.participants where room_id=request.room_id and status='active' and (request.approval_mode='all_active' or role='host');
  select array_agg(participant_id order by participant_id) into confirmed from public.plan_change_confirmations where change_request_id=request.id and candidate_trip_plan_id=target_candidate_trip_plan_id and decision='confirmed' and participant_id=any(required);
  complete:=coalesce(required,'{}'::uuid[])<@coalesce(confirmed,'{}'::uuid[]);
  insert into public.plan_change_events(change_request_id,room_id,event_type) values(request.id,request.room_id,'confirmation_changed');
  return jsonb_build_object('id',request.id,'status',case when target_decision='changes_requested' then 'blocked' else request.status::text end,'complete',complete);
end; $$;

create function private.complete_plan_change_publication(target_change_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare snapshot public.plan_change_requests%rowtype; request public.plan_change_requests%rowtype; room public.rooms%rowtype; base public.trip_plans%rowtype; candidate public.trip_plans%rowtype; latest private.validation_reports%rowtype; boundary private.change_boundary_reports%rowtype; required uuid[]; confirmed uuid[];
begin
  select * into snapshot from public.plan_change_requests where id=target_change_request_id;
  if not found then raise exception using errcode='P0001',message='Change request not found.'; end if;
  select * into room from public.rooms where id=snapshot.room_id for update;
  select * into request from public.plan_change_requests where id=target_change_request_id for update;
  if request.status='published' then return jsonb_build_object('id',request.id,'status','published','version',request.base_plan_version+1); end if;
  if request.status<>'awaiting_confirmation' or room.current_plan_version is distinct from request.base_plan_version or private.plan_change_is_stale(request) then raise exception using errcode='P0001',message='Change request is stale.'; end if;
  select * into base from public.trip_plans where id=request.base_trip_plan_id for update;
  select * into candidate from public.trip_plans where id=request.candidate_trip_plan_id for update;
  select * into latest from private.validation_reports where trip_plan_id=candidate.id order by attempt desc limit 1;
  select * into boundary from private.change_boundary_reports where change_request_id=request.id and candidate_trip_plan_id=candidate.id;
  select array_agg(id order by id) into required from public.participants where room_id=request.room_id and status='active' and (request.approval_mode='all_active' or role='host');
  select array_agg(participant_id order by participant_id) into confirmed from public.plan_change_confirmations where change_request_id=request.id and candidate_trip_plan_id=candidate.id and decision='confirmed' and participant_id=any(required);
  if not (coalesce(required,'{}'::uuid[])<@coalesce(confirmed,'{}'::uuid[])) then raise exception using errcode='P0001',message='Candidate confirmation required.'; end if;
  if candidate.version<>base.version+1 or candidate.status<>'validating' or candidate.validation_status<>'pass' or latest.status<>'pass' or boundary.status<>'pass' then raise exception using errcode='P0001',message='Candidate validation failed.'; end if;
  update public.trip_plans set status='published',published_at=now(),plan_hash=encode(extensions.digest(itinerary_json::text,'sha256'),'hex'),error_code=null where id=candidate.id;
  update public.rooms set current_plan_version=candidate.version where id=room.id and current_plan_version=request.base_plan_version;
  if not found then raise exception using errcode='P0001',message='Change request is stale.'; end if;
  update public.plan_change_requests set status='published',published_at=now(),error_code=null where id=request.id;
  insert into public.trip_plan_events(trip_plan_id,room_id,event_type) values(candidate.id,request.room_id,'published');
  insert into public.plan_change_events(change_request_id,room_id,event_type) values(request.id,request.room_id,'published');
  return jsonb_build_object('id',request.id,'status','published','version',candidate.version,'tripPlanId',candidate.id);
end; $$;
create function public.complete_plan_change_publication(target_change_request_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.complete_plan_change_publication(target_change_request_id); $$;

create function public.cancel_plan_change_request(target_change_request_id uuid,target_participant_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); request public.plan_change_requests%rowtype; member public.participants%rowtype;
begin
  if caller is null then raise exception using errcode='P0001',message='Authentication required.'; end if;
  select * into request from public.plan_change_requests where id=target_change_request_id for update;
  if not found or request.status in ('published','cancelled','superseded') then raise exception using errcode='P0001',message='Change request not allowed.'; end if;
  select * into member from public.participants where id=target_participant_id and room_id=request.room_id and user_id=caller and status='active';
  if not found then raise exception using errcode='P0001',message='Membership required.'; end if;
  if member.id<>request.requested_by_participant_id and member.role<>'host' then raise exception using errcode='P0001',message='Permission denied.'; end if;
  update private.plan_change_runs set status='cancelled',completed_at=now() where change_request_id=request.id and status='running';
  update public.plan_change_requests set status='cancelled',cancelled_at=now() where id=request.id;
  insert into public.plan_change_events(change_request_id,room_id,event_type) values(request.id,request.room_id,'cancelled');
  return jsonb_build_object('id',request.id,'status','cancelled');
end; $$;

create function private.change_approval_state(request public.plan_change_requests,confirmation boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare required jsonb; approved jsonb; changed jsonb; pending jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name,'role',p.role) order by p.joined_at,p.id),'[]'::jsonb) into required from public.participants p where p.room_id=request.room_id and p.status='active' and (request.approval_mode='all_active' or p.role='host');
  if confirmation then
    select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name,'role',p.role) order by p.joined_at,p.id),'[]'::jsonb) into approved from public.plan_change_confirmations c join public.participants p on p.id=c.participant_id where c.change_request_id=request.id and c.candidate_trip_plan_id=request.candidate_trip_plan_id and c.decision='confirmed';
    select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name,'role',p.role) order by p.joined_at,p.id),'[]'::jsonb) into changed from public.plan_change_confirmations c join public.participants p on p.id=c.participant_id where c.change_request_id=request.id and c.candidate_trip_plan_id=request.candidate_trip_plan_id and c.decision='changes_requested';
  else
    select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name,'role',p.role) order by p.joined_at,p.id),'[]'::jsonb) into approved from public.plan_change_approvals a join public.participants p on p.id=a.participant_id where a.change_request_id=request.id and a.analysis_version=request.current_analysis_version and a.decision='approved';
    select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name,'role',p.role) order by p.joined_at,p.id),'[]'::jsonb) into changed from public.plan_change_approvals a join public.participants p on p.id=a.participant_id where a.change_request_id=request.id and a.analysis_version=request.current_analysis_version and a.decision='changes_requested';
  end if;
  select coalesce(jsonb_agg(value),'[]'::jsonb) into pending from jsonb_array_elements(required) value where not exists(select 1 from jsonb_array_elements(approved) a where a->>'id'=value->>'id');
  return jsonb_build_object('requiredParticipants',required,'approvedParticipants',approved,'changeRequestedParticipants',changed,'pendingParticipants',pending,'isComplete',jsonb_array_length(pending)=0,'isStale',private.plan_change_is_stale(request),'blockers','[]'::jsonb);
end; $$;

create function private.safe_trip_plan(target_trip_plan_id uuid,include_draft boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare plan public.trip_plans%rowtype; events jsonb;
begin
  select * into plan from public.trip_plans where id=target_trip_plan_id;
  if not found then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'tripPlanId',e.trip_plan_id,'type',e.event_type,'createdAt',e.created_at) order by e.created_at,e.id),'[]'::jsonb) into events from public.trip_plan_events e where e.trip_plan_id=plan.id;
  return jsonb_build_object('id',plan.id,'roomId',plan.room_id,'planningRequestId',plan.planning_request_id,'version',plan.version,'status',plan.status,'validationStatus',plan.validation_status,'basisSummaryVersion',plan.basis_summary_version,'itinerary',case when plan.status='published' or include_draft then plan.itinerary_json else null end,'validationSummary',plan.validation_summary,'progressEvents',events,'createdAt',plan.created_at,'updatedAt',plan.updated_at,'publishedAt',plan.published_at,'errorCode',plan.error_code);
end; $$;

create function public.get_plan_change_request(target_room_id uuid) returns jsonb
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
    'candidateTripPlanId',request.candidate_trip_plan_id,'isStale',private.plan_change_is_stale(request),'materiality',analysis.materiality,
    'feasibility',analysis.feasibility,'analysis',analysis.analysis_json,'analysisApprovalState',case when analysis.id is null then null else private.change_approval_state(request,false) end,
    'candidateConfirmationState',case when request.candidate_trip_plan_id is null then null else private.change_approval_state(request,true) end,
    'candidateDiff',request.candidate_diff,'candidatePlan',case when request.status in ('awaiting_confirmation','published') then private.safe_trip_plan(request.candidate_trip_plan_id,true) else null end,
    'events',events,'errorCode',request.error_code,'createdAt',request.created_at,'updatedAt',request.updated_at,'approvedAt',request.approved_at,'publishedAt',request.published_at,'cancelledAt',request.cancelled_at
  );
end; $$;

create or replace function public.get_trip_plan(target_room_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare plan public.trip_plans%rowtype; room public.rooms%rowtype; events jsonb;
begin
  if not private.is_room_member(target_room_id) then raise exception using errcode='P0001',message='Membership required.'; end if;
  select * into room from public.rooms where id=target_room_id;
  if room.current_plan_version is not null then
    select * into plan from public.trip_plans where room_id=target_room_id and version=room.current_plan_version and status='published';
  else
    select * into plan from public.trip_plans where room_id=target_room_id and change_request_id is null and status<>'superseded' order by version desc limit 1;
  end if;
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

create function public.list_plan_versions(target_room_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare versions jsonb;
begin
  if not private.is_room_member(target_room_id) then raise exception using errcode='P0001',message='Membership required.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'tripPlanId',plan.id,'version',plan.version,'publishedAt',plan.published_at,
    'source',case when plan.change_request_id is null then 'original_approved_summary' else 'change_request' end,
    'requestedBy',case when request.id is null then null else jsonb_build_object('id',participant.id,'displayName',participant.display_name,'role',participant.role) end,
    'changeSummary',request.request_text,'validationStatus',plan.validation_status,'isCurrent',room.current_plan_version=plan.version
  ) order by plan.version desc),'[]'::jsonb) into versions
  from public.trip_plans plan join public.rooms room on room.id=plan.room_id
  left join public.plan_change_requests request on request.id=plan.change_request_id
  left join public.participants participant on participant.id=request.requested_by_participant_id
  where plan.room_id=target_room_id and plan.status='published';
  return versions;
end; $$;

create function public.get_trip_plan_version(target_room_id uuid,target_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare plan_id uuid;
begin
  if not private.is_room_member(target_room_id) then raise exception using errcode='P0001',message='Membership required.'; end if;
  select id into plan_id from public.trip_plans where room_id=target_room_id and version=target_version and status='published';
  if plan_id is null then raise exception using errcode='P0001',message='Plan not found.'; end if;
  return private.safe_trip_plan(plan_id,false);
end; $$;

create function public.compare_plan_versions(target_room_id uuid,base_version integer,candidate_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare candidate public.trip_plans%rowtype; request public.plan_change_requests%rowtype;
begin
  if not private.is_room_member(target_room_id) then raise exception using errcode='P0001',message='Membership required.'; end if;
  select * into candidate from public.trip_plans where room_id=target_room_id and version=candidate_version and status='published';
  if not found then raise exception using errcode='P0001',message='Plan not found.'; end if;
  select * into request from public.plan_change_requests where candidate_trip_plan_id=candidate.id and base_plan_version=base_version;
  if found and request.candidate_diff is not null then return request.candidate_diff; end if;
  return jsonb_build_object('schemaVersion','1','baseVersion',base_version,'candidateVersion',candidate_version,'summary','Version comparison unavailable.','changedDays','[]'::jsonb,'items','[]'::jsonb,'routeChanges','[]'::jsonb,'budgetDelta',null,'warningsAdded','[]'::jsonb,'warningsResolved','[]'::jsonb);
end; $$;

create function public.get_plan_change_context(target_change_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare request public.plan_change_requests%rowtype; analysis public.plan_change_analyses%rowtype; base public.trip_plans%rowtype; summary public.planning_summaries%rowtype;
begin
  select * into request from public.plan_change_requests where id=target_change_request_id;
  if not found then raise exception using errcode='P0001',message='Change request not found.'; end if;
  select * into base from public.trip_plans where id=request.base_trip_plan_id;
  select * into summary from public.planning_summaries where id=base.planning_summary_id;
  select * into analysis from public.plan_change_analyses where change_request_id=request.id and version=request.current_analysis_version;
  return jsonb_build_object(
    'request',jsonb_build_object('id',request.id,'roomId',request.room_id,'status',request.status,'requestType',request.request_type,'targetItemId',request.target_item_id,'requestText',request.request_text,'basePlanVersion',request.base_plan_version,'currentAnalysisVersion',request.current_analysis_version,'approvedAnalysisVersion',request.approved_analysis_version,'candidateTripPlanId',request.candidate_trip_plan_id),
    'basePlan',base.itinerary_json,'approvedSummary',summary.summary_json,'analysis',analysis.analysis_json,
    'candidatePlan',(select itinerary_json from public.trip_plans where id=request.candidate_trip_plan_id),
    'evidence',(select coalesce(jsonb_agg(jsonb_build_object('id','evidence:'||e.id::text,'itemId',e.itinerary_item_id,'provider',e.provider,'toolName',e.tool_name,'requestFingerprint',e.request_fingerprint,'status',e.status,'retrievedAt',e.retrieved_at,'expiresAt',e.expires_at,'normalizedResult',e.normalized_result,'sourceReference',e.source_reference) order by e.created_at,e.id),'[]'::jsonb) from private.tool_evidence e where e.trip_plan_id in (request.base_trip_plan_id,request.candidate_trip_plan_id))
  );
end; $$;

create function public.fail_plan_change(target_change_request_id uuid,target_error_code text) returns void
language plpgsql security definer set search_path='' as $$
declare request public.plan_change_requests%rowtype;
begin
  select * into request from public.plan_change_requests where id=target_change_request_id for update;
  if not found or request.status in ('published','cancelled','superseded') then raise exception using errcode='P0001',message='Change request not allowed.'; end if;
  update private.plan_change_runs set status='failed',error_code=left(target_error_code,80),completed_at=now() where change_request_id=request.id and status='running';
  update public.plan_change_requests set status='failed',error_code=left(target_error_code,80) where id=request.id;
  insert into public.plan_change_events(change_request_id,room_id,event_type) values(request.id,request.room_id,'failed');
end; $$;

create function public.list_recoverable_plan_changes(batch_size integer default 10) returns setof uuid
language sql security definer set search_path='' as $$
  select request.id from public.plan_change_requests request
  where request.status in ('draft','analyzing','approved','applying','validating','failed')
    and request.updated_at<now()-interval '1 minute'
    and request.analysis_attempt_count<2 and request.candidate_attempt_count<2
  order by request.updated_at limit least(greatest(batch_size,1),50) for update skip locked;
$$;

create function public.list_recoverable_plan_change_publications(batch_size integer default 10) returns setof uuid
language sql security definer set search_path='' as $$
  select request.id
  from public.plan_change_requests request
  where request.status='awaiting_confirmation'
    and not exists (
      select 1 from public.participants participant
      where participant.room_id=request.room_id and participant.status='active'
        and (request.approval_mode='all_active' or participant.role='host')
        and not exists (
          select 1 from public.plan_change_confirmations confirmation
          where confirmation.change_request_id=request.id
            and confirmation.candidate_trip_plan_id=request.candidate_trip_plan_id
            and confirmation.participant_id=participant.id and confirmation.decision='confirmed'
        )
    )
  order by request.updated_at limit least(greatest(batch_size,1),50) for update skip locked;
$$;

revoke execute on function private.reject_change_analysis_mutation(),private.reject_ready_candidate_content_mutation(),private.notify_plan_change(),private.current_revision_basis(uuid),private.plan_change_is_stale(public.plan_change_requests),private.claim_change_analysis(uuid,text,text,text),private.complete_change_analysis(uuid,jsonb,text,text,text,text,text,text),private.claim_candidate_generation(uuid),private.attach_candidate_trip_plan(uuid,jsonb,text,text,text),private.complete_plan_change_candidate(uuid,jsonb,jsonb),private.complete_plan_change_publication(uuid),private.change_approval_state(public.plan_change_requests,boolean),private.safe_trip_plan(uuid,boolean) from public,anon,authenticated,service_role;

revoke execute on function public.create_plan_change_request(uuid,uuid,text,text,text),public.review_plan_change(uuid,integer,uuid,text,text),public.confirm_plan_change_candidate(uuid,uuid,uuid,text,text),public.cancel_plan_change_request(uuid,uuid),public.get_plan_change_request(uuid),public.list_plan_versions(uuid),public.get_trip_plan_version(uuid,integer),public.compare_plan_versions(uuid,integer,integer) from public,anon,service_role;
grant execute on function public.create_plan_change_request(uuid,uuid,text,text,text),public.review_plan_change(uuid,integer,uuid,text,text),public.confirm_plan_change_candidate(uuid,uuid,uuid,text,text),public.cancel_plan_change_request(uuid,uuid),public.get_plan_change_request(uuid),public.list_plan_versions(uuid),public.get_trip_plan_version(uuid,integer),public.compare_plan_versions(uuid,integer,integer) to authenticated;

revoke execute on function public.claim_change_analysis(uuid,text,text,text),public.complete_change_analysis(uuid,jsonb,text,text,text,text,text,text),public.claim_candidate_generation(uuid),public.attach_candidate_trip_plan(uuid,jsonb,text,text,text),public.update_plan_change_candidate(uuid,jsonb),public.start_plan_change_repair(uuid),public.block_plan_change(uuid,text),public.record_plan_change_run_usage(uuid,text,text,text,bigint,bigint,bigint,bigint,bigint,integer),public.complete_plan_change_candidate(uuid,jsonb,jsonb),public.complete_plan_change_publication(uuid),public.get_plan_change_context(uuid),public.fail_plan_change(uuid,text),public.list_recoverable_plan_changes(integer),public.list_recoverable_plan_change_publications(integer) from public,anon,authenticated;
grant execute on function public.claim_change_analysis(uuid,text,text,text),public.complete_change_analysis(uuid,jsonb,text,text,text,text,text,text),public.claim_candidate_generation(uuid),public.attach_candidate_trip_plan(uuid,jsonb,text,text,text),public.update_plan_change_candidate(uuid,jsonb),public.start_plan_change_repair(uuid),public.block_plan_change(uuid,text),public.record_plan_change_run_usage(uuid,text,text,text,bigint,bigint,bigint,bigint,bigint,integer),public.complete_plan_change_candidate(uuid,jsonb,jsonb),public.complete_plan_change_publication(uuid),public.get_plan_change_context(uuid),public.fail_plan_change(uuid,text),public.list_recoverable_plan_changes(integer),public.list_recoverable_plan_change_publications(integer) to service_role;
