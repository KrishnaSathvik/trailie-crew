create type public.planning_request_status as enum (
  'draft','generating_summary','awaiting_review','changes_requested',
  'approved_for_generation','superseded','cancelled','failed'
);
create type public.planning_readiness_status as enum ('ready_for_review','needs_information','blocked');
create type public.planning_review_decision as enum ('approved','changes_requested');

create table public.planning_requests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  requested_by_participant_id uuid not null,
  requested_by_user_id uuid not null references auth.users(id),
  status public.planning_request_status not null default 'draft',
  approval_mode public.approval_mode not null,
  current_summary_version integer not null default 0 check (current_summary_version >= 0),
  approved_summary_version integer check (approved_summary_version > 0),
  basis_memory_version integer not null check (basis_memory_version > 0),
  basis_latest_message_id uuid,
  basis_latest_message_created_at timestamptz,
  basis_participant_ids uuid[] not null,
  basis_membership_fingerprint text not null,
  idempotency_key text not null unique,
  generation_attempt_count integer not null default 0 check (generation_attempt_count between 0 and 2),
  generation_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  cancelled_at timestamptz,
  unique(id,room_id),
  constraint planning_requests_requester_fkey foreign key
    (requested_by_participant_id, room_id, requested_by_user_id)
    references public.participants(id, room_id, user_id),
  constraint planning_requests_basis_message_fkey foreign key
    (basis_latest_message_id, room_id) references public.messages(id, room_id),
  constraint planning_requests_approved_version_valid check (
    (status='approved_for_generation') = (approved_summary_version is not null and approved_at is not null)
  ),
  constraint planning_requests_cancelled_valid check ((status='cancelled') = (cancelled_at is not null))
);
create unique index planning_requests_one_active_room_idx on public.planning_requests(room_id)
  where status in ('draft','generating_summary','awaiting_review','changes_requested');
create index planning_requests_room_created_idx on public.planning_requests(room_id,created_at desc);
create index planning_requests_recovery_idx on public.planning_requests(status,updated_at)
  where status in ('draft','generating_summary','failed','changes_requested');

create table public.planning_summaries (
  id uuid primary key default gen_random_uuid(),
  planning_request_id uuid not null references public.planning_requests(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  version integer not null check (version > 0),
  schema_version text not null check (char_length(schema_version) between 1 and 100),
  prompt_version text not null check (char_length(prompt_version) between 1 and 100),
  model text not null check (char_length(model) between 1 and 100),
  summary_json jsonb not null check (jsonb_typeof(summary_json)='object'),
  readiness_status public.planning_readiness_status not null,
  summary_hash text not null check (char_length(summary_hash) between 1 and 128),
  basis_memory_version integer not null check (basis_memory_version > 0),
  basis_latest_message_id uuid,
  basis_latest_message_created_at timestamptz,
  basis_participant_ids uuid[] not null,
  basis_membership_fingerprint text not null,
  created_at timestamptz not null default now(),
  unique(planning_request_id,version),
  constraint planning_summaries_request_room_fkey foreign key
    (planning_request_id,room_id) references public.planning_requests(id,room_id),
  constraint planning_summaries_basis_message_fkey foreign key
    (basis_latest_message_id,room_id) references public.messages(id,room_id)
);
create index planning_summaries_room_created_idx on public.planning_summaries(room_id,created_at desc);

create table public.planning_approvals (
  id uuid primary key default gen_random_uuid(),
  planning_request_id uuid not null references public.planning_requests(id) on delete cascade,
  summary_version integer not null check (summary_version > 0),
  participant_id uuid not null references public.participants(id),
  user_id uuid not null references auth.users(id),
  decision public.planning_review_decision not null,
  note text check (note is null or char_length(btrim(note)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(planning_request_id,summary_version,participant_id)
);
create index planning_approvals_request_version_idx on public.planning_approvals(planning_request_id,summary_version);

create table public.planning_review_events (
  id uuid primary key default gen_random_uuid(),
  planning_request_id uuid not null references public.planning_requests(id) on delete cascade,
  summary_version integer not null,
  participant_id uuid not null references public.participants(id),
  decision public.planning_review_decision not null,
  note text,
  created_at timestamptz not null default now()
);
create index planning_review_events_request_idx on public.planning_review_events(planning_request_id,summary_version,created_at);

create table private.planning_runs (
  id uuid primary key default gen_random_uuid(),
  planning_request_id uuid not null references public.planning_requests(id) on delete cascade,
  summary_version integer not null,
  model text not null,
  prompt_version text not null,
  schema_version text not null,
  status text not null check (status in ('running','completed','failed')),
  attempt_count integer not null check (attempt_count between 1 and 2),
  provider_response_id text,
  provider_request_id text,
  input_tokens bigint check (input_tokens >= 0),
  output_tokens bigint check (output_tokens >= 0),
  reasoning_tokens bigint check (reasoning_tokens >= 0),
  cached_input_tokens bigint check (cached_input_tokens >= 0),
  total_tokens bigint check (total_tokens >= 0),
  latency_ms integer check (latency_ms >= 0),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.planning_requests enable row level security;
alter table public.planning_summaries enable row level security;
alter table public.planning_approvals enable row level security;
alter table public.planning_review_events enable row level security;
alter table private.planning_runs enable row level security;
alter table private.planning_runs force row level security;

create policy planning_requests_member_read on public.planning_requests for select to authenticated
  using ((select private.is_room_member(room_id)));
create policy planning_summaries_member_read on public.planning_summaries for select to authenticated
  using ((select private.is_room_member(room_id)));
create policy planning_approvals_member_read on public.planning_approvals for select to authenticated
  using (exists(select 1 from public.planning_requests request where request.id=planning_request_id and private.is_room_member(request.room_id)));
create policy planning_review_events_member_read on public.planning_review_events for select to authenticated
  using (exists(select 1 from public.planning_requests request where request.id=planning_request_id and private.is_room_member(request.room_id)));
create policy planning_runs_deny_browser on private.planning_runs as restrictive for all to anon,authenticated using(false) with check(false);

grant select on public.planning_requests,public.planning_summaries,public.planning_approvals,public.planning_review_events to authenticated;
revoke insert,update,delete on public.planning_requests,public.planning_summaries,public.planning_approvals,public.planning_review_events from anon,authenticated;
revoke all on private.planning_runs from public,anon,authenticated,service_role;

create trigger planning_requests_set_updated_at before update on public.planning_requests
  for each row execute function private.set_updated_at();
create trigger planning_approvals_set_updated_at before update on public.planning_approvals
  for each row execute function private.set_updated_at();

create function private.reject_planning_summary_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception using errcode='P0001',message='Published planning summaries are immutable.'; end; $$;
create trigger planning_summaries_immutable before update or delete on public.planning_summaries
  for each row execute function private.reject_planning_summary_mutation();

create function private.current_planning_basis(target_room_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'memoryVersion',memory.memory_version,
    'latestMessageId',message.id,
    'latestMessageCreatedAt',message.created_at,
    'participantIds',coalesce(participants.ids,'{}'::uuid[]),
    'membershipFingerprint',encode(extensions.digest(array_to_string(coalesce(participants.ids,'{}'::uuid[]),','),'sha256'),'hex'),
    'approvalMode',room.approval_mode
  )
  from public.rooms room
  join private.room_memory memory on memory.room_id=room.id
  left join lateral (
    select array_agg(participant.id order by participant.id) ids from public.participants participant
    where participant.room_id=room.id and participant.status='active'
  ) participants on true
  left join lateral (
    select msg.id,msg.created_at from public.messages msg
    join private.message_extractions extraction on extraction.message_id=msg.id and extraction.status='completed'
    where msg.room_id=room.id and msg.message_type='user' and msg.deleted_at is null
    order by msg.created_at desc,msg.id desc limit 1
  ) message on true
  where room.id=target_room_id and room.status='active';
$$;

create function public.create_planning_request(target_room_id uuid,participant_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); participant public.participants%rowtype; basis jsonb; existing public.planning_requests%rowtype; created public.planning_requests%rowtype; key text;
begin
  if caller is null then raise exception using errcode='P0001',message='Authentication required.'; end if;
  select * into participant from public.participants where id=participant_id and room_id=target_room_id and user_id=caller and status='active';
  if not found then raise exception using errcode='P0001',message='Membership required.'; end if;
  basis:=private.current_planning_basis(target_room_id);
  if basis is null then raise exception using errcode='P0001',message='Planning request unavailable.'; end if;
  select * into existing from public.planning_requests where room_id=target_room_id and status in ('draft','generating_summary','awaiting_review','changes_requested') for update;
  if found then return jsonb_build_object('id',existing.id,'status',existing.status,'currentSummaryVersion',existing.current_summary_version,'created',false); end if;
  key:=encode(extensions.digest(target_room_id::text||':'||(basis->>'memoryVersion')||':'||coalesce(basis->>'latestMessageId','none')||':'||(basis->>'membershipFingerprint')||':'||(basis->>'approvalMode'),'sha256'),'hex');
  select * into existing from public.planning_requests where idempotency_key=key;
  if found then return jsonb_build_object('id',existing.id,'status',existing.status,'currentSummaryVersion',existing.current_summary_version,'created',false); end if;
  insert into public.planning_requests(room_id,requested_by_participant_id,requested_by_user_id,approval_mode,basis_memory_version,basis_latest_message_id,basis_latest_message_created_at,basis_participant_ids,basis_membership_fingerprint,idempotency_key)
  values(target_room_id,participant.id,caller,(basis->>'approvalMode')::public.approval_mode,(basis->>'memoryVersion')::int,nullif(basis->>'latestMessageId','')::uuid,nullif(basis->>'latestMessageCreatedAt','')::timestamptz,array(select jsonb_array_elements_text(to_jsonb((basis->'participantIds')::jsonb)))::uuid[],basis->>'membershipFingerprint',key)
  returning * into created;
  return jsonb_build_object('id',created.id,'status',created.status,'currentSummaryVersion',0,'created',true);
end; $$;

create function private.claim_planning_summary_generation(target_request_id uuid,target_model text,target_prompt_version text,target_schema_version text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare request public.planning_requests%rowtype; next_version int; run private.planning_runs%rowtype;
begin
  select * into request from public.planning_requests where id=target_request_id for update;
  if not found then raise exception using errcode='P0001',message='Planning request not found.'; end if;
  if request.status='generating_summary' and request.updated_at > now()-interval '5 minutes' then return jsonb_build_object('claimed',false,'status',request.status); end if;
  if request.status not in ('draft','failed','changes_requested','generating_summary') or request.generation_attempt_count>=2 then return jsonb_build_object('claimed',false,'status',request.status,'errorCode','retry_exhausted'); end if;
  next_version:=request.current_summary_version+1;
  update public.planning_requests set status='generating_summary',generation_attempt_count=generation_attempt_count+1,generation_error_code=null where id=request.id returning * into request;
  insert into private.planning_runs(planning_request_id,summary_version,model,prompt_version,schema_version,status,attempt_count)
  values(request.id,next_version,target_model,target_prompt_version,target_schema_version,'running',request.generation_attempt_count) returning * into run;
  return jsonb_build_object('claimed',true,'status','generating_summary','runId',run.id,'summaryVersion',next_version,'attemptCount',run.attempt_count,'roomId',request.room_id);
end; $$;

create function public.claim_planning_summary_generation(target_request_id uuid,target_model text,target_prompt_version text,target_schema_version text) returns jsonb
language sql security definer set search_path='' as $$ select private.claim_planning_summary_generation(target_request_id,target_model,target_prompt_version,target_schema_version); $$;

create function private.complete_planning_summary(target_request_id uuid,validated_summary jsonb,readiness text,target_summary_hash text,target_provider_response_id text,target_provider_request_id text,target_model text,target_prompt_version text,target_schema_version text,target_input_tokens bigint,target_output_tokens bigint,target_reasoning_tokens bigint,target_cached_input_tokens bigint,target_total_tokens bigint,target_latency_ms integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare request public.planning_requests%rowtype; version int; basis jsonb;
begin
  select * into request from public.planning_requests where id=target_request_id for update;
  if not found or request.status<>'generating_summary' then raise exception using errcode='P0001',message='Planning request unavailable.'; end if;
  if readiness not in ('ready_for_review','needs_information','blocked') or validated_summary->>'title'<>'Before I build the trip' then raise exception using errcode='P0001',message='Invalid summary response.'; end if;
  version:=request.current_summary_version+1; basis:=private.current_planning_basis(request.room_id);
  insert into public.planning_summaries(planning_request_id,room_id,version,schema_version,prompt_version,model,summary_json,readiness_status,summary_hash,basis_memory_version,basis_latest_message_id,basis_latest_message_created_at,basis_participant_ids,basis_membership_fingerprint)
  values(request.id,request.room_id,version,target_schema_version,target_prompt_version,target_model,validated_summary,readiness::public.planning_readiness_status,target_summary_hash,(basis->>'memoryVersion')::int,nullif(basis->>'latestMessageId','')::uuid,nullif(basis->>'latestMessageCreatedAt','')::timestamptz,array(select jsonb_array_elements_text(to_jsonb((basis->'participantIds')::jsonb)))::uuid[],basis->>'membershipFingerprint');
  update private.planning_runs set status='completed',provider_response_id=target_provider_response_id,provider_request_id=target_provider_request_id,input_tokens=target_input_tokens,output_tokens=target_output_tokens,reasoning_tokens=target_reasoning_tokens,cached_input_tokens=target_cached_input_tokens,total_tokens=target_total_tokens,latency_ms=target_latency_ms,completed_at=now()
  where planning_request_id=request.id and summary_version=version and status='running';
  update public.planning_requests set status='awaiting_review',current_summary_version=version,basis_memory_version=(basis->>'memoryVersion')::int,basis_latest_message_id=nullif(basis->>'latestMessageId','')::uuid,basis_latest_message_created_at=nullif(basis->>'latestMessageCreatedAt','')::timestamptz,basis_participant_ids=array(select jsonb_array_elements_text(to_jsonb((basis->'participantIds')::jsonb)))::uuid[],basis_membership_fingerprint=basis->>'membershipFingerprint',generation_attempt_count=0 where id=request.id;
  return jsonb_build_object('id',request.id,'status','awaiting_review','summaryVersion',version);
end; $$;

create function public.complete_planning_summary(target_request_id uuid,validated_summary jsonb,readiness text,target_summary_hash text,target_provider_response_id text,target_provider_request_id text,target_model text,target_prompt_version text,target_schema_version text,target_input_tokens bigint,target_output_tokens bigint,target_reasoning_tokens bigint,target_cached_input_tokens bigint,target_total_tokens bigint,target_latency_ms integer) returns jsonb
language sql security definer set search_path='' as $$ select private.complete_planning_summary(target_request_id,validated_summary,readiness,target_summary_hash,target_provider_response_id,target_provider_request_id,target_model,target_prompt_version,target_schema_version,target_input_tokens,target_output_tokens,target_reasoning_tokens,target_cached_input_tokens,target_total_tokens,target_latency_ms); $$;

create function public.fail_planning_summary(target_request_id uuid,target_error_code text) returns void language plpgsql security definer set search_path='' as $$
begin update private.planning_runs set status='failed',error_code=target_error_code,completed_at=now() where planning_request_id=target_request_id and status='running'; update public.planning_requests set status='failed',generation_error_code=target_error_code where id=target_request_id and status='generating_summary'; end; $$;

create function private.planning_is_stale(request public.planning_requests) returns boolean language plpgsql stable security definer set search_path='' as $$
declare basis jsonb;
begin basis:=private.current_planning_basis(request.room_id); return (basis->>'memoryVersion')::int>request.basis_memory_version or basis->>'membershipFingerprint'<>request.basis_membership_fingerprint or basis->>'approvalMode'<>request.approval_mode::text or coalesce(basis->>'latestMessageId','')<>coalesce(request.basis_latest_message_id::text,''); end; $$;

create function public.review_planning_summary(target_request_id uuid,target_summary_version integer,target_participant_id uuid,target_decision text,note text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); request public.planning_requests%rowtype; participant public.participants%rowtype; summary public.planning_summaries%rowtype; required uuid[]; approved uuid[]; changed uuid[]; pending uuid[]; complete boolean;
begin
  select * into request from public.planning_requests where id=target_request_id for update;
  if not found then raise exception using errcode='P0001',message='Planning request not found.'; end if;
  select * into participant from public.participants where id=target_participant_id and room_id=request.room_id and user_id=caller and status='active';
  if not found then raise exception using errcode='P0001',message='Membership required.'; end if;
  if target_summary_version<>request.current_summary_version then raise exception using errcode='P0001',message='Approval version mismatch.'; end if;
  if request.status not in ('awaiting_review','changes_requested') then raise exception using errcode='P0001',message='Approval not allowed.'; end if;
  if private.planning_is_stale(request) then raise exception using errcode='P0001',message='Summary is stale.'; end if;
  if target_decision not in ('approved','changes_requested') then raise exception using errcode='P0001',message='Approval not allowed.'; end if;
  if target_decision='changes_requested' and (note is null or char_length(btrim(note)) not between 1 and 500) then raise exception using errcode='P0001',message='Changes note required.'; end if;
  select * into summary from public.planning_summaries where planning_request_id=request.id and version=target_summary_version;
  insert into public.planning_approvals(planning_request_id,summary_version,participant_id,user_id,decision,note) values(request.id,target_summary_version,participant.id,caller,target_decision::public.planning_review_decision,nullif(btrim(note),''))
  on conflict(planning_request_id,summary_version,participant_id) do update set decision=excluded.decision,note=excluded.note,updated_at=now();
  insert into public.planning_review_events(planning_request_id,summary_version,participant_id,decision,note) values(request.id,target_summary_version,participant.id,target_decision::public.planning_review_decision,nullif(btrim(note),''));
  select array_agg(id order by id) into required from public.participants where room_id=request.room_id and status='active' and (request.approval_mode='all_active' or role='host');
  select coalesce(array_agg(participant_id order by participant_id),'{}') into approved from public.planning_approvals where planning_request_id=request.id and summary_version=target_summary_version and decision='approved' and participant_id=any(required);
  select coalesce(array_agg(participant_id order by participant_id),'{}') into changed from public.planning_approvals where planning_request_id=request.id and summary_version=target_summary_version and decision='changes_requested';
  select coalesce(array_agg(value order by value),'{}') into pending from unnest(required) value where not(value=any(approved));
  complete:=cardinality(pending)=0 and cardinality(changed)=0 and summary.readiness_status='ready_for_review';
  if cardinality(changed)>0 then update public.planning_requests set status='changes_requested' where id=request.id;
  elsif complete then update public.planning_requests set status='approved_for_generation',approved_summary_version=target_summary_version,approved_at=now() where id=request.id and status<>'approved_for_generation'; end if;
  return jsonb_build_object('approvalMode',request.approval_mode,'summaryVersion',target_summary_version,'requiredParticipantIds',to_jsonb(required),'approvedParticipantIds',to_jsonb(approved),'changeRequestedParticipantIds',to_jsonb(changed),'pendingParticipantIds',to_jsonb(pending),'isComplete',complete,'isStale',false,'blockers',case when summary.readiness_status='ready_for_review' then '[]'::jsonb else summary.summary_json#>'{readiness,blockers}' end);
end; $$;

create function public.request_summary_revision(target_request_id uuid,target_summary_version integer,participant_id uuid,note text) returns jsonb language sql security definer set search_path='' as $$ select public.review_planning_summary(target_request_id,target_summary_version,participant_id,'changes_requested',note); $$;

create function public.regenerate_planning_summary(target_request_id uuid,target_summary_version integer,participant_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); request public.planning_requests%rowtype; basis jsonb;
begin select * into request from public.planning_requests where id=target_request_id for update; if not found or target_summary_version<>request.current_summary_version then raise exception using errcode='P0001',message='Approval version mismatch.'; end if; if not exists(select 1 from public.participants where id=participant_id and room_id=request.room_id and user_id=caller and status='active') then raise exception using errcode='P0001',message='Membership required.'; end if; if request.status not in ('changes_requested','awaiting_review','failed','approved_for_generation') then raise exception using errcode='P0001',message='Planning request unavailable.'; end if; basis:=private.current_planning_basis(request.room_id); update public.planning_requests set status='draft',approved_summary_version=null,approved_at=null,basis_memory_version=(basis->>'memoryVersion')::int,basis_latest_message_id=nullif(basis->>'latestMessageId','')::uuid,basis_latest_message_created_at=nullif(basis->>'latestMessageCreatedAt','')::timestamptz,basis_participant_ids=array(select jsonb_array_elements_text(to_jsonb((basis->'participantIds')::jsonb)))::uuid[],basis_membership_fingerprint=basis->>'membershipFingerprint',approval_mode=(basis->>'approvalMode')::public.approval_mode,generation_attempt_count=0,generation_error_code=null where id=request.id; return jsonb_build_object('id',request.id,'status','draft','nextSummaryVersion',request.current_summary_version+1); end; $$;

create function public.get_planning_request(target_room_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare request public.planning_requests%rowtype; summary public.planning_summaries%rowtype; stale boolean; required jsonb; approved jsonb; changed jsonb; pending jsonb;
begin
  if not private.is_room_member(target_room_id) then raise exception using errcode='P0001',message='Membership required.'; end if;
  select * into request from public.planning_requests where room_id=target_room_id order by created_at desc limit 1;
  if not found then return null; end if;
  if request.current_summary_version>0 then select * into summary from public.planning_summaries where planning_request_id=request.id and version=request.current_summary_version; end if;
  stale:=request.current_summary_version>0 and private.planning_is_stale(request);
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name,'role',p.role) order by p.joined_at,p.id),'[]') into required from public.participants p where p.room_id=request.room_id and p.status='active' and (request.approval_mode='all_active' or p.role='host');
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name,'role',p.role) order by p.joined_at,p.id),'[]') into approved from public.planning_approvals a join public.participants p on p.id=a.participant_id where a.planning_request_id=request.id and a.summary_version=request.current_summary_version and a.decision='approved' and p.status='active';
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name,'role',p.role) order by p.joined_at,p.id),'[]') into changed from public.planning_approvals a join public.participants p on p.id=a.participant_id where a.planning_request_id=request.id and a.summary_version=request.current_summary_version and a.decision='changes_requested' and p.status='active';
  select coalesce(jsonb_agg(item),'[]') into pending from jsonb_array_elements(required) item where not exists(select 1 from jsonb_array_elements(approved) accepted where accepted->>'id'=item->>'id');
  return jsonb_build_object('id',request.id,'roomId',request.room_id,'status',request.status,'approvalMode',request.approval_mode,'currentSummaryVersion',request.current_summary_version,'approvedSummaryVersion',request.approved_summary_version,'readinessStatus',summary.readiness_status,'summary',summary.summary_json,'approvalState',case when request.current_summary_version=0 then null else jsonb_build_object('approvalMode',request.approval_mode,'summaryVersion',request.current_summary_version,'requiredParticipants',required,'approvedParticipants',approved,'changeRequestedParticipants',changed,'pendingParticipants',pending,'isComplete',request.status='approved_for_generation','isStale',stale,'blockers',coalesce(summary.summary_json#>'{readiness,blockers}','[]'::jsonb)) end,'generationErrorCode',request.generation_error_code,'isStale',stale,'createdAt',request.created_at,'updatedAt',request.updated_at);
end; $$;

create function public.get_planning_summary_context(target_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare request public.planning_requests%rowtype; memory private.room_memory%rowtype;
begin
  select * into request from public.planning_requests where id=target_request_id and status='generating_summary';
  if not found then raise exception using errcode='P0001',message='Planning request unavailable.'; end if;
  select * into memory from private.room_memory where room_id=request.room_id;
  return jsonb_build_object(
    'requestId',request.id,'roomId',request.room_id,'approvalMode',request.approval_mode,'memoryVersion',memory.memory_version,
    'memorySnapshot',jsonb_build_object('participantProfiles',memory.participant_profiles,'sharedContext',memory.shared_context,'confirmedDecisions',memory.confirmed_decisions,'rejectedOptions',memory.rejected_options,'openQuestions',memory.open_questions),
    'participants',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name,'role',p.role) order by p.joined_at,p.id),'[]') from public.participants p where p.room_id=request.room_id and p.status='active'),
    'activeFacts',(select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'subjectType',f.subject_type,'subjectParticipantId',f.subject_participant_id,'factType',f.fact_type,'canonicalKey',f.canonical_key,'value',f.value,'status',f.status,'sourceMessageId',f.source_message_id) order by f.created_at,f.id),'[]') from (select * from private.memory_facts where room_id=request.room_id and status<>'superseded' order by created_at desc limit 50) f),
    'recentMessages',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'messageType',m.message_type,'participantId',m.participant_id,'displayName',p.display_name,'createdAt',m.created_at) order by m.created_at,m.id),'[]') from (select * from public.messages where room_id=request.room_id and deleted_at is null order by created_at desc,id desc limit 12) m join public.participants p on p.id=m.participant_id),
    'reviewNotes',(select coalesce(jsonb_agg(jsonb_build_object('participantId',e.participant_id,'note',e.note,'createdAt',e.created_at) order by e.created_at),'[]') from public.planning_review_events e where e.planning_request_id=request.id and e.decision='changes_requested' and e.note is not null)
  );
end; $$;

create function public.list_recoverable_planning_requests(batch_size integer default 10) returns setof uuid language sql security definer set search_path='' as $$ select id from public.planning_requests where ((status in ('draft','changes_requested','failed') and generation_attempt_count<2) or (status='generating_summary' and updated_at<now()-interval '5 minutes' and generation_attempt_count<2)) order by updated_at limit least(greatest(batch_size,1),50) for update skip locked; $$;
create function public.list_recoverable_message_extractions(batch_size integer default 20) returns setof uuid language sql security definer set search_path='' as $$ select message_id from private.message_extractions where attempt_count<2 and ((status='queued' and created_at<now()-interval '1 minute') or (status='running' and started_at<now()-interval '5 minutes') or status='failed') order by created_at limit least(greatest(batch_size,1),100) for update skip locked; $$;

create or replace function public.claim_message_extraction(target_message_id uuid,target_model text,target_prompt_version text,target_schema_version text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare source public.messages%rowtype; extraction private.message_extractions%rowtype;
begin select message.* into source from public.messages message join public.rooms room on room.id=message.room_id where message.id=target_message_id and message.message_type='user' and message.deleted_at is null and room.status='active'; if not found then raise exception using errcode='P0001',message='Source message is invalid.'; end if; if not exists(select 1 from public.participants where id=source.participant_id and room_id=source.room_id and user_id=source.sender_user_id and status='active') then raise exception using errcode='P0001',message='Participant not found.'; end if; insert into private.message_extractions(room_id,message_id,participant_id,user_id,model,prompt_version,schema_version) values(source.room_id,source.id,source.participant_id,source.sender_user_id,target_model,target_prompt_version,target_schema_version) on conflict(message_id) do nothing; select * into extraction from private.message_extractions where message_id=target_message_id for update; if extraction.status in ('completed','skipped') then return jsonb_build_object('id',extraction.id,'status',extraction.status,'claimed',false,'attemptCount',extraction.attempt_count); end if; if extraction.status='running' and extraction.started_at>now()-interval '5 minutes' then return jsonb_build_object('id',extraction.id,'status','running','claimed',false,'attemptCount',extraction.attempt_count); end if; if extraction.attempt_count>=2 then return jsonb_build_object('id',extraction.id,'status','failed','claimed',false,'attemptCount',extraction.attempt_count,'errorCode','retry_exhausted'); end if; update private.message_extractions set status='running',attempt_count=attempt_count+1,started_at=now(),completed_at=null,error_code=null where id=extraction.id returning * into extraction; return jsonb_build_object('id',extraction.id,'status',extraction.status,'claimed',true,'attemptCount',extraction.attempt_count,'roomId',extraction.room_id,'participantId',extraction.participant_id,'userId',extraction.user_id); end; $$;

revoke execute on function private.reject_planning_summary_mutation(),private.current_planning_basis(uuid),private.claim_planning_summary_generation(uuid,text,text,text),private.complete_planning_summary(uuid,jsonb,text,text,text,text,text,text,text,bigint,bigint,bigint,bigint,bigint,integer),private.planning_is_stale(public.planning_requests) from public,anon,authenticated,service_role;
revoke execute on function public.create_planning_request(uuid,uuid),public.review_planning_summary(uuid,integer,uuid,text,text),public.request_summary_revision(uuid,integer,uuid,text),public.regenerate_planning_summary(uuid,integer,uuid),public.get_planning_request(uuid) from public,anon,service_role;
grant execute on function public.create_planning_request(uuid,uuid),public.review_planning_summary(uuid,integer,uuid,text,text),public.request_summary_revision(uuid,integer,uuid,text),public.regenerate_planning_summary(uuid,integer,uuid),public.get_planning_request(uuid) to authenticated;
revoke execute on function public.claim_planning_summary_generation(uuid,text,text,text),public.complete_planning_summary(uuid,jsonb,text,text,text,text,text,text,text,bigint,bigint,bigint,bigint,bigint,integer),public.fail_planning_summary(uuid,text),public.get_planning_summary_context(uuid),public.list_recoverable_planning_requests(integer),public.list_recoverable_message_extractions(integer) from public,anon,authenticated;
grant execute on function public.claim_planning_summary_generation(uuid,text,text,text),public.complete_planning_summary(uuid,jsonb,text,text,text,text,text,text,text,bigint,bigint,bigint,bigint,bigint,integer),public.fail_planning_summary(uuid,text),public.get_planning_summary_context(uuid),public.list_recoverable_planning_requests(integer),public.list_recoverable_message_extractions(integer) to service_role;
