create unique index trip_plans_id_version_travel_evidence_idx
  on public.trip_plans(id,version);
create unique index trip_plans_id_room_travel_evidence_idx
  on public.trip_plans(id,room_id);

create table private.travel_provider_requests (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (length(provider) between 1 and 80),
  capability text not null check (length(capability) between 1 and 80),
  environment text not null check (environment in ('local','test','hosted-acceptance','preview','production')),
  room_id uuid references public.rooms(id) on delete cascade,
  workflow_key text not null check (length(workflow_key) between 1 and 240),
  request_key text not null check (length(request_key) between 16 and 128),
  status text not null check (status in ('running','succeeded','failed','unavailable')),
  cache_status text not null check (cache_status in ('miss','hit','stale_hit','negative_hit','bypass')),
  safe_request_id text check (safe_request_id is null or length(safe_request_id) between 1 and 200),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  error_class text check (error_class is null or length(error_class) between 1 and 80),
  request_cost_microunits bigint check (request_cost_microunits is null or request_cost_microunits >= 0),
  attempt integer not null default 1 check (attempt between 1 and 3),
  retryable boolean not null default false,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(provider,capability,environment,workflow_key,request_key,attempt),
  check (
    (status='running' and completed_at is null)
    or (status<>'running' and completed_at is not null)
  )
);
create index travel_provider_requests_operations_idx
  on private.travel_provider_requests(provider,capability,created_at desc);
create index travel_provider_requests_retry_idx
  on private.travel_provider_requests(next_retry_at,created_at)
  where status in ('failed','unavailable') and retryable;

create table private.travel_evidence (
  id uuid primary key default gen_random_uuid(),
  schema_version text not null check (schema_version='1'),
  evidence_id text not null unique check (length(evidence_id) between 16 and 240),
  evidence_type text not null check (evidence_type in (
    'geocode','place','route','travel_duration','distance','weather_forecast',
    'temperature','precipitation','severe_weather','sunrise','sunset','park',
    'park_alert','park_closure','permit','reservation','operating_hours',
    'accessibility','fee','campground','visitor_center','trail','food','lodging',
    'general_official_notice'
  )),
  provider text not null check (length(provider) between 1 and 80),
  source_name text not null check (length(source_name) between 1 and 200),
  source_url text check (source_url is null or length(source_url) between 1 and 2048),
  source_entity_id text check (source_entity_id is null or length(source_entity_id) between 1 and 240),
  provider_request_id uuid references private.travel_provider_requests(id) on delete set null,
  retrieved_at timestamptz not null,
  observed_at timestamptz,
  valid_from timestamptz,
  valid_until timestamptz,
  freshness_state text not null check (freshness_state in ('fresh','cached_fresh','stale','expired','unavailable','conflicting')),
  verification_state text not null check (verification_state in ('verified','partially_verified','unverified','inferred','failed')),
  confidence text not null check (confidence in ('high','medium','low')),
  availability_state text not null check (availability_state in ('available','partial','unavailable','ambiguous','not_found','unsupported')),
  normalized_value jsonb not null check (jsonb_typeof(normalized_value)='object'),
  provider_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(provider_metadata)='object'),
  attribution jsonb not null check (jsonb_typeof(attribution)='object'),
  restrictions jsonb not null check (jsonb_typeof(restrictions)='object'),
  error_state jsonb check (error_state is null or jsonb_typeof(error_state)='object'),
  created_at timestamptz not null default now(),
  check (valid_until is null or valid_from is null or valid_until >= valid_from)
);
create index travel_evidence_provider_entity_idx
  on private.travel_evidence(provider,evidence_type,source_entity_id,retrieved_at desc);
create index travel_evidence_expiration_idx
  on private.travel_evidence(valid_until)
  where valid_until is not null;

create table private.travel_evidence_bindings (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null references private.travel_evidence(id) on delete cascade,
  binding_type text not null check (binding_type in ('location','entity','plan_item','room')),
  binding_key text not null check (length(binding_key) between 1 and 240),
  binding_value jsonb not null check (jsonb_typeof(binding_value)='object'),
  privacy text not null default 'public' check (privacy in ('public','private','sensitive')),
  created_at timestamptz not null default now(),
  unique(evidence_id,binding_type,binding_key)
);
create index travel_evidence_bindings_lookup_idx
  on private.travel_evidence_bindings(binding_type,binding_key,evidence_id);

create table private.travel_cache_entries (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (environment in ('local','test','hosted-acceptance','preview','production')),
  provider text not null check (length(provider) between 1 and 80),
  capability text not null check (length(capability) between 1 and 80),
  schema_version text not null check (schema_version='1'),
  cache_key text not null check (length(cache_key) between 16 and 240),
  evidence_id uuid references private.travel_evidence(id) on delete cascade,
  response_json jsonb not null default '{"state":"unavailable","evidence":[],"warnings":[]}'::jsonb
    check (jsonb_typeof(response_json)='object' and octet_length(response_json::text)<=1048576),
  negative_result boolean not null default false,
  expires_at timestamptz not null,
  stale_until timestamptz,
  last_accessed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(environment,provider,capability,schema_version,cache_key),
  check (stale_until is null or stale_until >= expires_at)
);
create index travel_cache_entries_cleanup_idx
  on private.travel_cache_entries(coalesce(stale_until,expires_at),last_accessed_at);

create table private.plan_evidence_snapshots (
  id uuid primary key default gen_random_uuid(),
  trip_plan_id uuid not null references public.trip_plans(id) on delete cascade,
  plan_version integer not null check (plan_version > 0),
  evidence_id uuid not null references private.travel_evidence(id) on delete restrict,
  evidence_external_id text not null check (length(evidence_external_id) between 16 and 240),
  evidence_type text not null check (length(evidence_type) between 1 and 80),
  target_item_id text,
  semantic_hash text not null check (length(semantic_hash)=64),
  freshness_at_publication text not null check (freshness_at_publication in ('fresh','cached_fresh','stale','expired','unavailable','conflicting')),
  verification_at_publication text not null check (verification_at_publication in ('verified','partially_verified','unverified','inferred','failed')),
  provider text not null check (length(provider) between 1 and 80),
  source_name text not null check (length(source_name) between 1 and 200),
  source_url text check (source_url is null or length(source_url) between 1 and 2048),
  retrieved_at timestamptz not null,
  evidence_json jsonb not null check (jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now(),
  unique(trip_plan_id,evidence_external_id,target_item_id),
  constraint plan_evidence_snapshot_plan_version_fkey
    foreign key (trip_plan_id,plan_version)
    references public.trip_plans(id,version) on delete cascade
);
create unique index plan_evidence_snapshots_once_idx
  on private.plan_evidence_snapshots(
    trip_plan_id,evidence_external_id,coalesce(target_item_id,'')
  );
create index plan_evidence_snapshots_plan_idx
  on private.plan_evidence_snapshots(trip_plan_id,evidence_type,target_item_id);

create table private.travel_refresh_jobs (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  trip_plan_id uuid references public.trip_plans(id) on delete cascade,
  job_key text not null check (length(job_key) between 16 and 240),
  capability text not null check (capability in (
    'geocode','route','weather','daylight','park','park_alerts','reservation_links','snapshot_assembly'
  )),
  target_key text not null check (length(target_key) between 1 and 240),
  status text not null default 'pending' check (status in ('pending','running','succeeded','failed','cancelled')),
  attempt integer not null default 0 check (attempt between 0 and 3),
  lease_owner uuid,
  lease_expires_at timestamptz,
  next_retry_at timestamptz not null default now(),
  error_class text check (error_class is null or length(error_class) between 1 and 80),
  retryable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(room_id,job_key),
  constraint travel_refresh_job_plan_room_fkey
    foreign key (trip_plan_id,room_id) references public.trip_plans(id,room_id)
);
create index travel_refresh_jobs_claim_idx
  on private.travel_refresh_jobs(status,next_retry_at,created_at)
  where status in ('pending','running','failed');

alter table private.travel_provider_requests enable row level security;
alter table private.travel_provider_requests force row level security;
alter table private.travel_evidence enable row level security;
alter table private.travel_evidence force row level security;
alter table private.travel_evidence_bindings enable row level security;
alter table private.travel_evidence_bindings force row level security;
alter table private.travel_cache_entries enable row level security;
alter table private.travel_cache_entries force row level security;
alter table private.plan_evidence_snapshots enable row level security;
alter table private.plan_evidence_snapshots force row level security;
alter table private.travel_refresh_jobs enable row level security;
alter table private.travel_refresh_jobs force row level security;

create policy travel_provider_requests_deny_browser on private.travel_provider_requests
  as restrictive for all to anon,authenticated using(false) with check(false);
create policy travel_evidence_deny_browser on private.travel_evidence
  as restrictive for all to anon,authenticated using(false) with check(false);
create policy travel_evidence_bindings_deny_browser on private.travel_evidence_bindings
  as restrictive for all to anon,authenticated using(false) with check(false);
create policy travel_cache_entries_deny_browser on private.travel_cache_entries
  as restrictive for all to anon,authenticated using(false) with check(false);
create policy plan_evidence_snapshots_deny_browser on private.plan_evidence_snapshots
  as restrictive for all to anon,authenticated using(false) with check(false);
create policy travel_refresh_jobs_deny_browser on private.travel_refresh_jobs
  as restrictive for all to anon,authenticated using(false) with check(false);

revoke all on private.travel_provider_requests,private.travel_evidence,
  private.travel_evidence_bindings,private.travel_cache_entries,
  private.plan_evidence_snapshots,private.travel_refresh_jobs
  from public,anon,authenticated,service_role;

create function private.reject_travel_snapshot_mutation() returns trigger
language plpgsql set search_path='' as $$
begin
  raise exception using errcode='P0001',message='travel_evidence_snapshot_immutable';
end; $$;
create trigger plan_evidence_snapshots_immutable
before update or delete on private.plan_evidence_snapshots
for each row execute function private.reject_travel_snapshot_mutation();

create function public.record_travel_provider_request(
  target_provider text,
  target_capability text,
  target_environment text,
  target_room_id uuid,
  target_workflow_key text,
  target_request_key text,
  target_status text,
  target_cache_status text,
  target_safe_request_id text default null,
  target_duration_ms integer default null,
  target_error_class text default null,
  target_retryable boolean default false,
  target_next_retry_at timestamptz default null,
  target_attempt integer default 1
) returns uuid
language plpgsql security definer set search_path='' as $$
declare stored private.travel_provider_requests%rowtype;
begin
  insert into private.travel_provider_requests(
    provider,capability,environment,room_id,workflow_key,request_key,status,cache_status,
    safe_request_id,duration_ms,error_class,retryable,next_retry_at,attempt,completed_at
  ) values(
    left(target_provider,80),left(target_capability,80),target_environment,target_room_id,
    left(target_workflow_key,240),left(target_request_key,128),target_status,
    target_cache_status,nullif(left(coalesce(target_safe_request_id,''),200),''),
    target_duration_ms,nullif(left(coalesce(target_error_class,''),80),''),
    target_retryable,target_next_retry_at,target_attempt,
    case when target_status='running' then null else now() end
  )
  on conflict(provider,capability,environment,workflow_key,request_key,attempt)
  do update set
    status=excluded.status,cache_status=excluded.cache_status,
    safe_request_id=excluded.safe_request_id,duration_ms=excluded.duration_ms,
    error_class=excluded.error_class,retryable=excluded.retryable,
    next_retry_at=excluded.next_retry_at,completed_at=excluded.completed_at
  returning * into stored;
  return stored.id;
end; $$;

create function public.claim_travel_provider_request(
  target_provider text,
  target_capability text,
  target_environment text,
  target_room_id uuid,
  target_workflow_key text,
  target_request_key text,
  target_room_daily_limit integer,
  target_global_daily_limit integer
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing private.travel_provider_requests%rowtype;
  room_count bigint; global_count bigint;
begin
  if target_room_daily_limit not between 1 and 10000
    or target_global_daily_limit not between 1 and 1000000
    or target_room_daily_limit>target_global_daily_limit then
    raise exception using errcode='P0001',message='invalid_travel_provider_limit';
  end if;
  select * into existing from private.travel_provider_requests request
    where request.provider=target_provider
      and request.capability=target_capability
      and request.environment=target_environment
      and request.workflow_key=target_workflow_key
      and request.request_key=target_request_key
    order by request.attempt desc limit 1;
  if found then
    return jsonb_build_object(
      'allowed',false,'reason','duplicate_request','requestId',existing.id
    );
  end if;
  select count(*) into global_count from private.travel_provider_requests request
    where request.provider=target_provider
      and request.environment=target_environment
      and request.created_at>=date_trunc('day',now())
      and request.cache_status='miss'
      and request.status in ('running','succeeded');
  if global_count>=target_global_daily_limit then
    return jsonb_build_object('allowed',false,'reason','global_daily_limit');
  end if;
  select count(*) into room_count from private.travel_provider_requests request
    where request.room_id=target_room_id
      and request.provider=target_provider
      and request.environment=target_environment
      and request.created_at>=date_trunc('day',now())
      and request.cache_status='miss'
      and request.status in ('running','succeeded');
  if room_count>=target_room_daily_limit then
    return jsonb_build_object('allowed',false,'reason','room_daily_limit');
  end if;
  insert into private.travel_provider_requests(
    provider,capability,environment,room_id,workflow_key,request_key,status,
    cache_status,attempt
  ) values(
    left(target_provider,80),left(target_capability,80),target_environment,
    target_room_id,left(target_workflow_key,240),left(target_request_key,128),
    'running','miss',1
  ) returning * into existing;
  return jsonb_build_object(
    'allowed',true,'reason',null,'requestId',existing.id
  );
exception when unique_violation then
  return jsonb_build_object('allowed',false,'reason','duplicate_request');
end; $$;

create function public.store_travel_evidence(
  target_evidence jsonb,
  target_provider_request_id uuid default null
) returns uuid
language plpgsql security definer set search_path='' as $$
declare stored private.travel_evidence%rowtype;
begin
  if target_evidence is null
    or jsonb_typeof(target_evidence)<>'object'
    or target_evidence->>'schemaVersion'<>'1'
    or length(coalesce(target_evidence->>'evidenceId','')) not between 16 and 240
    or jsonb_typeof(target_evidence->'normalizedValue')<>'object'
    or jsonb_typeof(target_evidence->'attribution')<>'object'
    or jsonb_typeof(target_evidence->'restrictions')<>'object'
    or octet_length(target_evidence::text)>262144 then
    raise exception using errcode='P0001',message='invalid_travel_evidence';
  end if;
  insert into private.travel_evidence(
    schema_version,evidence_id,evidence_type,provider,source_name,source_url,
    source_entity_id,provider_request_id,retrieved_at,observed_at,valid_from,
    valid_until,freshness_state,verification_state,confidence,
    availability_state,normalized_value,provider_metadata,attribution,
    restrictions,error_state
  ) values(
    target_evidence->>'schemaVersion',target_evidence->>'evidenceId',
    target_evidence->>'evidenceType',target_evidence->>'provider',
    target_evidence->>'sourceName',nullif(target_evidence->>'sourceUrl',''),
    nullif(target_evidence->>'sourceEntityId',''),target_provider_request_id,
    (target_evidence->>'retrievedAt')::timestamptz,
    nullif(target_evidence->>'observedAt','')::timestamptz,
    nullif(target_evidence->>'validFrom','')::timestamptz,
    nullif(target_evidence->>'validUntil','')::timestamptz,
    target_evidence->>'freshnessState',target_evidence->>'verificationState',
    target_evidence->>'confidence',target_evidence->>'availabilityState',
    target_evidence->'normalizedValue',coalesce(target_evidence->'providerMetadata','{}'::jsonb),
    target_evidence->'attribution',target_evidence->'restrictions',
    nullif(target_evidence->'errorState','null'::jsonb)
  )
  on conflict(evidence_id) do nothing
  returning * into stored;
  if stored.id is null then
    select * into stored from private.travel_evidence
      where evidence_id=target_evidence->>'evidenceId';
    if stored.normalized_value is distinct from target_evidence->'normalizedValue'
      or stored.provider<>target_evidence->>'provider'
      or stored.evidence_type<>target_evidence->>'evidenceType' then
      raise exception using errcode='P0001',message='travel_evidence_identity_conflict';
    end if;
  end if;
  return stored.id;
end; $$;

create function public.bind_travel_evidence(
  target_evidence_id uuid,
  target_binding_type text,
  target_binding_key text,
  target_binding_value jsonb,
  target_privacy text default 'public'
) returns uuid
language plpgsql security definer set search_path='' as $$
declare binding_id uuid;
begin
  if target_binding_value is null or jsonb_typeof(target_binding_value)<>'object'
    or octet_length(target_binding_value::text)>32768 then
    raise exception using errcode='P0001',message='invalid_travel_evidence_binding';
  end if;
  insert into private.travel_evidence_bindings(
    evidence_id,binding_type,binding_key,binding_value,privacy
  ) values(
    target_evidence_id,target_binding_type,left(target_binding_key,240),
    target_binding_value,target_privacy
  )
  on conflict(evidence_id,binding_type,binding_key) do update
    set binding_value=excluded.binding_value,privacy=excluded.privacy
  returning id into binding_id;
  return binding_id;
end; $$;

create function public.upsert_travel_cache_entry(
  target_environment text,
  target_provider text,
  target_capability text,
  target_cache_key text,
  target_evidence_id uuid,
  target_negative_result boolean,
  target_expires_at timestamptz,
  target_stale_until timestamptz default null
) returns uuid
language plpgsql security definer set search_path='' as $$
declare cache_id uuid;
begin
  if target_expires_at<=now()-interval '1 day'
    or target_expires_at>now()+interval '400 days'
    or (target_stale_until is not null and target_stale_until<target_expires_at)
    or (target_negative_result and target_evidence_id is not null)
    or (not target_negative_result and target_evidence_id is null) then
    raise exception using errcode='P0001',message='invalid_travel_cache_entry';
  end if;
  insert into private.travel_cache_entries(
    environment,provider,capability,schema_version,cache_key,evidence_id,
    negative_result,expires_at,stale_until,last_accessed_at
  ) values(
    target_environment,left(target_provider,80),left(target_capability,80),'1',
    left(target_cache_key,240),target_evidence_id,target_negative_result,
    target_expires_at,target_stale_until,now()
  )
  on conflict(environment,provider,capability,schema_version,cache_key)
  do update set
    evidence_id=excluded.evidence_id,negative_result=excluded.negative_result,
    expires_at=excluded.expires_at,stale_until=excluded.stale_until,
    last_accessed_at=now()
  returning id into cache_id;
  return cache_id;
end; $$;

create function public.get_travel_cache_response(
  target_environment text,
  target_provider text,
  target_capability text,
  target_cache_key text
) returns jsonb
language sql security definer set search_path='' as $$
  select case
    when entry.id is null
      or coalesce(entry.stale_until,entry.expires_at)<=now() then null
    else jsonb_build_object(
      'response',entry.response_json,
      'expiresAt',entry.expires_at,
      'staleUntil',entry.stale_until,
      'negative',entry.negative_result
    )
  end
  from (select cache.* from private.travel_cache_entries cache
    where cache.environment=target_environment
      and cache.provider=target_provider
      and cache.capability=target_capability
      and cache.schema_version='1'
      and cache.cache_key=target_cache_key) entry;
$$;

create function public.put_travel_cache_response(
  target_environment text,
  target_provider text,
  target_capability text,
  target_cache_key text,
  target_response jsonb,
  target_expires_at timestamptz,
  target_stale_until timestamptz,
  target_negative_result boolean
) returns uuid
language plpgsql security definer set search_path='' as $$
declare cache_id uuid;
begin
  if target_response is null or jsonb_typeof(target_response)<>'object'
    or octet_length(target_response::text)>1048576
    or target_expires_at<=now()-interval '1 day'
    or target_expires_at>now()+interval '400 days'
    or (target_stale_until is not null and target_stale_until<target_expires_at) then
    raise exception using errcode='P0001',message='invalid_travel_cache_response';
  end if;
  insert into private.travel_cache_entries(
    environment,provider,capability,schema_version,cache_key,evidence_id,
    response_json,negative_result,expires_at,stale_until,last_accessed_at
  ) values(
    target_environment,left(target_provider,80),left(target_capability,80),'1',
    left(target_cache_key,240),null,target_response,target_negative_result,
    target_expires_at,target_stale_until,now()
  )
  on conflict(environment,provider,capability,schema_version,cache_key)
  do update set
    evidence_id=null,response_json=excluded.response_json,
    negative_result=excluded.negative_result,expires_at=excluded.expires_at,
    stale_until=excluded.stale_until,last_accessed_at=now()
  returning id into cache_id;
  return cache_id;
end; $$;

create function public.bind_plan_evidence_snapshot(
  target_trip_plan_id uuid,
  target_evidence_id uuid,
  target_item_id text default null
) returns uuid
language plpgsql security definer set search_path='' as $$
declare plan public.trip_plans%rowtype; evidence private.travel_evidence%rowtype;
  existing uuid; snapshot_id uuid; snapshot_json jsonb;
begin
  select * into plan from public.trip_plans where id=target_trip_plan_id for update;
  if not found then raise exception using errcode='P0001',message='trip_plan_not_found'; end if;
  select * into evidence from private.travel_evidence where id=target_evidence_id;
  if not found then raise exception using errcode='P0001',message='travel_evidence_not_found'; end if;
  select snapshot.id into existing from private.plan_evidence_snapshots snapshot
    where snapshot.trip_plan_id=plan.id
      and snapshot.evidence_external_id=evidence.evidence_id
      and coalesce($3,'')=coalesce(snapshot.target_item_id,'');
  if existing is not null then return existing; end if;
  snapshot_json:=jsonb_build_object(
    'schemaVersion',evidence.schema_version,'evidenceId',evidence.evidence_id,
    'evidenceType',evidence.evidence_type,'provider',evidence.provider,
    'sourceName',evidence.source_name,'sourceUrl',evidence.source_url,
    'sourceEntityId',evidence.source_entity_id,'retrievedAt',evidence.retrieved_at,
    'observedAt',evidence.observed_at,'validFrom',evidence.valid_from,
    'validUntil',evidence.valid_until,'freshnessState',evidence.freshness_state,
    'verificationState',evidence.verification_state,'confidence',evidence.confidence,
    'availabilityState',evidence.availability_state,
    'normalizedValue',evidence.normalized_value,'attribution',evidence.attribution,
    'restrictions',evidence.restrictions,'errorState',evidence.error_state
  );
  insert into private.plan_evidence_snapshots(
    trip_plan_id,plan_version,evidence_id,evidence_external_id,evidence_type,
    target_item_id,semantic_hash,freshness_at_publication,
    verification_at_publication,provider,source_name,source_url,retrieved_at,evidence_json
  ) values(
    plan.id,plan.version,evidence.id,evidence.evidence_id,evidence.evidence_type,
    nullif(left(coalesce($3,''),240),''),
    encode(extensions.digest((snapshot_json
      -'retrievedAt'-'freshnessState'-'providerMetadata')::text,'sha256'),'hex'),
    evidence.freshness_state,evidence.verification_state,evidence.provider,
    evidence.source_name,evidence.source_url,evidence.retrieved_at,snapshot_json
  ) returning id into snapshot_id;
  return snapshot_id;
end; $$;

create function public.copy_plan_evidence_snapshots(
  target_base_trip_plan_id uuid,
  target_candidate_trip_plan_id uuid,
  excluded_target_item_ids text[] default '{}',
  excluded_evidence_types text[] default '{}'
) returns integer
language plpgsql security definer set search_path='' as $$
declare base public.trip_plans%rowtype; candidate public.trip_plans%rowtype;
  copied integer;
begin
  select * into base from public.trip_plans where id=target_base_trip_plan_id;
  select * into candidate from public.trip_plans where id=target_candidate_trip_plan_id;
  if base.id is null or candidate.id is null or base.room_id<>candidate.room_id
    or candidate.version<>base.version+1 then
    raise exception using errcode='P0001',message='invalid_travel_snapshot_copy';
  end if;
  insert into private.plan_evidence_snapshots(
    trip_plan_id,plan_version,evidence_id,evidence_external_id,evidence_type,
    target_item_id,semantic_hash,freshness_at_publication,
    verification_at_publication,provider,source_name,source_url,retrieved_at,
    evidence_json
  )
  select
    candidate.id,candidate.version,snapshot.evidence_id,
    snapshot.evidence_external_id,snapshot.evidence_type,
    snapshot.target_item_id,snapshot.semantic_hash,
    snapshot.freshness_at_publication,snapshot.verification_at_publication,
    snapshot.provider,snapshot.source_name,snapshot.source_url,
    snapshot.retrieved_at,snapshot.evidence_json
  from private.plan_evidence_snapshots snapshot
  where snapshot.trip_plan_id=base.id
    and not (
      snapshot.target_item_id is not null
      and snapshot.target_item_id=any(coalesce(excluded_target_item_ids,'{}'))
    )
    and not (
      snapshot.target_item_id is null
      and snapshot.evidence_type=any(coalesce(excluded_evidence_types,'{}'))
    )
  on conflict do nothing;
  get diagnostics copied=row_count;
  return copied;
end; $$;

create function public.enqueue_travel_refresh_job(
  target_room_id uuid,
  target_trip_plan_id uuid,
  target_job_key text,
  target_capability text,
  target_key text
) returns uuid
language plpgsql security definer set search_path='' as $$
declare job_id uuid;
begin
  insert into private.travel_refresh_jobs(
    room_id,trip_plan_id,job_key,capability,target_key
  ) values(
    target_room_id,target_trip_plan_id,left(target_job_key,240),
    target_capability,left(target_key,240)
  )
  on conflict(room_id,job_key) do update
    set updated_at=private.travel_refresh_jobs.updated_at
  returning id into job_id;
  return job_id;
end; $$;

create function public.claim_travel_refresh_job(
  target_lease_owner uuid,
  target_lease_ms integer
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare claimed private.travel_refresh_jobs%rowtype;
begin
  if target_lease_owner is null or target_lease_ms not between 60000 and 900000 then
    raise exception using errcode='P0001',message='invalid_travel_refresh_lease';
  end if;
  select * into claimed from private.travel_refresh_jobs
    where next_retry_at<=now()
      and (
        status='pending'
        or (status='running' and lease_expires_at<=now())
        or (status='failed' and retryable and attempt<3)
      )
    order by created_at,id for update skip locked limit 1;
  if not found then return null; end if;
  update private.travel_refresh_jobs set
    status='running',attempt=claimed.attempt+1,lease_owner=target_lease_owner,
    lease_expires_at=now()+make_interval(secs=>target_lease_ms/1000.0),
    retryable=false,error_class=null,updated_at=now()
    where id=claimed.id returning * into claimed;
  return jsonb_build_object(
    'jobId',claimed.id,'roomId',claimed.room_id,'tripPlanId',claimed.trip_plan_id,
    'jobKey',claimed.job_key,'capability',claimed.capability,
    'targetKey',claimed.target_key,'attempt',claimed.attempt
  );
end; $$;

create function public.complete_travel_refresh_job(
  target_job_id uuid,
  target_lease_owner uuid,
  target_success boolean,
  target_error_class text default null,
  target_retryable boolean default false
) returns void
language plpgsql security definer set search_path='' as $$
declare job private.travel_refresh_jobs%rowtype;
begin
  select * into job from private.travel_refresh_jobs where id=target_job_id for update;
  if not found or job.status<>'running' or job.lease_owner<>target_lease_owner
    or job.lease_expires_at<=now() then
    raise exception using errcode='P0001',message='travel_refresh_lease_not_owned';
  end if;
  if target_success then
    update private.travel_refresh_jobs set status='succeeded',completed_at=now(),
      lease_owner=null,lease_expires_at=null,updated_at=now()
      where id=job.id;
  else
    update private.travel_refresh_jobs set status='failed',
      error_class=left(coalesce(target_error_class,'provider_unavailable'),80),
      retryable=target_retryable and attempt<3,
      next_retry_at=case when target_retryable and attempt<3
        then now()+make_interval(secs=>least(300,power(2,attempt)::integer*10))
        else now() end,
      completed_at=case when target_retryable and attempt<3 then null else now() end,
      lease_owner=null,lease_expires_at=null,updated_at=now()
      where id=job.id;
  end if;
end; $$;

create function public.cleanup_travel_provider_data(
  target_retention_days integer default 30,
  target_batch_size integer default 500
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cache_count integer:=0; request_count integer:=0;
  job_count integer:=0; evidence_count integer:=0;
begin
  if target_retention_days not between 1 and 365
    or target_batch_size not between 1 and 5000 then
    raise exception using errcode='P0001',message='invalid_travel_cleanup_policy';
  end if;
  with doomed as (
    select id from private.travel_cache_entries
    where coalesce(stale_until,expires_at)<now()-make_interval(days=>target_retention_days)
    order by last_accessed_at limit target_batch_size
  )
  delete from private.travel_cache_entries entry using doomed
    where entry.id=doomed.id;
  get diagnostics cache_count=row_count;
  with doomed as (
    select id from private.travel_provider_requests
    where completed_at<now()-make_interval(days=>target_retention_days)
    order by completed_at limit target_batch_size
  )
  delete from private.travel_provider_requests request using doomed
    where request.id=doomed.id;
  get diagnostics request_count=row_count;
  with doomed as (
    select id from private.travel_refresh_jobs
    where completed_at<now()-make_interval(days=>target_retention_days)
    order by completed_at limit target_batch_size
  )
  delete from private.travel_refresh_jobs job using doomed
    where job.id=doomed.id;
  get diagnostics job_count=row_count;
  with doomed as (
    select evidence.id from private.travel_evidence evidence
    where evidence.created_at<now()-make_interval(days=>target_retention_days)
      and not exists (
        select 1 from private.plan_evidence_snapshots snapshot
        where snapshot.evidence_id=evidence.id
      )
      and not exists (
        select 1 from private.travel_cache_entries cache
        where cache.evidence_id=evidence.id
      )
    order by evidence.created_at limit target_batch_size
  )
  delete from private.travel_evidence evidence using doomed
    where evidence.id=doomed.id;
  get diagnostics evidence_count=row_count;
  return jsonb_build_object(
    'cacheEntries',cache_count,'providerRequests',request_count,
    'refreshJobs',job_count,'unreferencedEvidence',evidence_count
  );
end; $$;

revoke execute on function private.reject_travel_snapshot_mutation()
  from public,anon,authenticated,service_role;
revoke execute on function public.record_travel_provider_request(text,text,text,uuid,text,text,text,text,text,integer,text,boolean,timestamptz,integer),
  public.claim_travel_provider_request(text,text,text,uuid,text,text,integer,integer),
  public.store_travel_evidence(jsonb,uuid),
  public.bind_travel_evidence(uuid,text,text,jsonb,text),
  public.upsert_travel_cache_entry(text,text,text,text,uuid,boolean,timestamptz,timestamptz),
  public.get_travel_cache_response(text,text,text,text),
  public.put_travel_cache_response(text,text,text,text,jsonb,timestamptz,timestamptz,boolean),
  public.bind_plan_evidence_snapshot(uuid,uuid,text),
  public.copy_plan_evidence_snapshots(uuid,uuid,text[],text[]),
  public.enqueue_travel_refresh_job(uuid,uuid,text,text,text),
  public.claim_travel_refresh_job(uuid,integer),
  public.complete_travel_refresh_job(uuid,uuid,boolean,text,boolean),
  public.cleanup_travel_provider_data(integer,integer)
  from public,anon,authenticated;
grant execute on function public.record_travel_provider_request(text,text,text,uuid,text,text,text,text,text,integer,text,boolean,timestamptz,integer),
  public.claim_travel_provider_request(text,text,text,uuid,text,text,integer,integer),
  public.store_travel_evidence(jsonb,uuid),
  public.bind_travel_evidence(uuid,text,text,jsonb,text),
  public.upsert_travel_cache_entry(text,text,text,text,uuid,boolean,timestamptz,timestamptz),
  public.get_travel_cache_response(text,text,text,text),
  public.put_travel_cache_response(text,text,text,text,jsonb,timestamptz,timestamptz,boolean),
  public.bind_plan_evidence_snapshot(uuid,uuid,text),
  public.copy_plan_evidence_snapshots(uuid,uuid,text[],text[]),
  public.enqueue_travel_refresh_job(uuid,uuid,text,text,text),
  public.claim_travel_refresh_job(uuid,integer),
  public.complete_travel_refresh_job(uuid,uuid,boolean,text,boolean),
  public.cleanup_travel_provider_data(integer,integer)
  to service_role;

comment on table private.travel_cache_entries is
  'Bounded provider-aware current cache; never used as an immutable published-plan snapshot.';
comment on table private.plan_evidence_snapshots is
  'Immutable copy of the normalized evidence bound to an exact trip plan version.';

create function private.safe_travel_source_url(target_url text) returns text
language sql immutable set search_path='' as $$
  select case
    when target_url ~* '^https://([a-z0-9-]+\.)*(nps\.gov|recreation\.gov|mapbox\.com|openweathermap\.org)(/|$)'
      and target_url !~ '[<>"[:space:]]'
    then left(target_url,2048)
    else null
  end;
$$;

create function private.safe_travel_label(target_text text,target_fallback text) returns text
language sql immutable set search_path='' as $$
  select coalesce(
    nullif(left(regexp_replace(coalesce(target_text,''),'[<>[:cntrl:]]','','g'),300),''),
    target_fallback
  );
$$;

create function private.project_plan_travel_evidence(target_trip_plan_id uuid)
returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'evidenceId',snapshot.evidence_external_id,
    'evidenceType',snapshot.evidence_type,
    'provider',snapshot.provider,
    'sourceName',private.safe_travel_label(snapshot.source_name,'Official travel source'),
    'sourceUrl',private.safe_travel_source_url(snapshot.source_url),
    'retrievedAt',snapshot.retrieved_at,
    'validUntil',nullif(snapshot.evidence_json->>'validUntil','')::timestamptz,
    'freshnessState',snapshot.freshness_at_publication,
    'verificationState',snapshot.verification_at_publication,
    'availabilityState',snapshot.evidence_json->>'availabilityState',
    'confidence',snapshot.evidence_json->>'confidence',
    'targetItemId',snapshot.target_item_id,
    'headline',private.safe_travel_label(
      coalesce(
        snapshot.evidence_json->'normalizedValue'->'data'->>'title',
        snapshot.evidence_json->'normalizedValue'->'data'->>'officialName',
        snapshot.evidence_json->'normalizedValue'->'data'->>'name',
        snapshot.evidence_json->'normalizedValue'->'data'->>'event',
        snapshot.evidence_json->'normalizedValue'->'data'->>'condition'
      ),
      null
    )
  ) order by snapshot.evidence_type,snapshot.provider,snapshot.evidence_external_id),'[]'::jsonb)
  from private.plan_evidence_snapshots snapshot
  where snapshot.trip_plan_id=target_trip_plan_id;
$$;

create or replace function public.get_trip_plan(target_room_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare plan public.trip_plans%rowtype; room public.rooms%rowtype; events jsonb;
begin
  if not private.is_room_member(target_room_id) then raise exception using errcode='P0001',message='Membership required.'; end if;
  select * into room from public.rooms where id=target_room_id;
  if room.current_plan_version is not null then
    select * into plan from public.trip_plans
      where room_id=target_room_id
        and version=room.current_plan_version
        and status='published';
  else
    select * into plan from public.trip_plans
      where room_id=target_room_id
        and change_request_id is null
        and status<>'superseded'
      order by version desc limit 1;
  end if;
  if not found then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'tripPlanId',e.trip_plan_id,'type',e.event_type,'createdAt',e.created_at) order by e.created_at,e.id),'[]'::jsonb) into events from public.trip_plan_events e where e.trip_plan_id=plan.id;
  return jsonb_build_object(
    'id',plan.id,'roomId',plan.room_id,'planningRequestId',plan.planning_request_id,'version',plan.version,
    'status',plan.status,'validationStatus',plan.validation_status,'basisSummaryVersion',plan.basis_summary_version,
    'itinerary',case when plan.status='published' then plan.itinerary_json else null end,
    'validationSummary',plan.validation_summary,'progressEvents',events,'createdAt',plan.created_at,'updatedAt',plan.updated_at,
    'publishedAt',plan.published_at,'errorCode',plan.error_code,
    'travelEvidence',case when plan.status='published' then private.project_plan_travel_evidence(plan.id) else '[]'::jsonb end
  );
end; $$;

alter function private.project_public_itinerary(uuid)
  rename to project_public_itinerary_phase4b;

create function private.project_public_itinerary(target_plan_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select case when projected is null then null else projected || jsonb_build_object(
    'travelEvidence',private.project_plan_travel_evidence(target_plan_id),
    'conditionsDisclaimer','Conditions may have changed since this version was published.'
  ) end
  from (select private.project_public_itinerary_phase4b(target_plan_id) projected) source;
$$;

revoke execute on function private.safe_travel_source_url(text),
  private.safe_travel_label(text,text),
  private.project_plan_travel_evidence(uuid),
  private.project_public_itinerary_phase4b(uuid),
  private.project_public_itinerary(uuid)
  from public,anon,authenticated,service_role;
