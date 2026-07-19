create table private.canonical_destination_resolutions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  trip_plan_id uuid not null unique references public.trip_plans(id) on delete cascade,
  planning_summary_id uuid not null references public.planning_summaries(id) on delete restrict,
  schema_version text not null check (schema_version='1'),
  status text not null check (status in ('resolved','ambiguous','not_found','unavailable')),
  canonical_place_id text check (canonical_place_id is null or length(canonical_place_id) between 1 and 200),
  nps_park_code text check (nps_park_code is null or length(nps_park_code) between 1 and 200),
  semantic_hash text not null check (semantic_hash ~ '^[0-9a-f]{64}$'),
  resolution_json jsonb not null check (
    jsonb_typeof(resolution_json)='object'
    and octet_length(resolution_json::text)<=131072
  ),
  created_at timestamptz not null default now(),
  constraint canonical_destination_resolution_plan_room_fkey
    foreign key (trip_plan_id,room_id) references public.trip_plans(id,room_id)
);
create index canonical_destination_resolutions_room_idx
  on private.canonical_destination_resolutions(room_id,created_at desc);

create table private.destination_resolution_evidence (
  id uuid primary key default gen_random_uuid(),
  resolution_id uuid not null references private.canonical_destination_resolutions(id) on delete cascade,
  evidence_id uuid not null references private.travel_evidence(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(resolution_id,evidence_id)
);

alter table private.plan_evidence_snapshots
  add column destination_resolution_id uuid
    references private.canonical_destination_resolutions(id) on delete restrict,
  add column destination_resolution_hash text
    check (
      destination_resolution_hash is null
      or destination_resolution_hash ~ '^[0-9a-f]{64}$'
    ),
  add constraint plan_snapshot_destination_resolution_pair check (
    (destination_resolution_id is null) =
    (destination_resolution_hash is null)
  );

alter table private.canonical_destination_resolutions enable row level security;
alter table private.canonical_destination_resolutions force row level security;
alter table private.destination_resolution_evidence enable row level security;
alter table private.destination_resolution_evidence force row level security;

create policy canonical_destination_resolutions_deny_browser
  on private.canonical_destination_resolutions
  as restrictive for all to anon,authenticated using(false) with check(false);
create policy destination_resolution_evidence_deny_browser
  on private.destination_resolution_evidence
  as restrictive for all to anon,authenticated using(false) with check(false);

revoke all on private.canonical_destination_resolutions,
  private.destination_resolution_evidence
  from public,anon,authenticated,service_role;

create trigger canonical_destination_resolutions_immutable
before update or delete on private.canonical_destination_resolutions
for each row execute function private.reject_travel_snapshot_mutation();

create function public.store_canonical_destination_resolution(
  target_trip_plan_id uuid,
  target_resolution jsonb
) returns uuid
language plpgsql security definer set search_path='' as $$
declare plan public.trip_plans%rowtype;
  stored private.canonical_destination_resolutions%rowtype;
begin
  if target_resolution is null
    or jsonb_typeof(target_resolution)<>'object'
    or target_resolution->>'schemaVersion'<>'1'
    or target_resolution->>'status' not in ('resolved','ambiguous','not_found','unavailable')
    or coalesce(target_resolution->>'semanticHash','') !~ '^[0-9a-f]{64}$'
    or octet_length(target_resolution::text)>131072 then
    raise exception using errcode='P0001',message='invalid_destination_resolution';
  end if;
  if target_resolution->>'status'='resolved'
    and (
      nullif(target_resolution->>'canonicalPlaceId','') is null
      or nullif(target_resolution->>'canonicalName','') is null
      or target_resolution->'selectedCandidateIndex'='null'::jsonb
    ) then
    raise exception using errcode='P0001',message='invalid_destination_resolution';
  end if;
  select * into plan from public.trip_plans where id=target_trip_plan_id;
  if not found then
    raise exception using errcode='P0001',message='trip_plan_not_found';
  end if;
  insert into private.canonical_destination_resolutions(
    room_id,trip_plan_id,planning_summary_id,schema_version,status,
    canonical_place_id,nps_park_code,semantic_hash,resolution_json
  ) values(
    plan.room_id,plan.id,plan.planning_summary_id,
    target_resolution->>'schemaVersion',target_resolution->>'status',
    nullif(target_resolution->>'canonicalPlaceId',''),
    nullif(target_resolution->>'npsParkCode',''),
    target_resolution->>'semanticHash',target_resolution
  )
  on conflict(trip_plan_id) do nothing
  returning * into stored;
  if stored.id is null then
    select * into stored from private.canonical_destination_resolutions
      where trip_plan_id=plan.id;
    if stored.semantic_hash<>target_resolution->>'semanticHash'
      or stored.resolution_json is distinct from target_resolution then
      raise exception using errcode='P0001',message='destination_resolution_identity_conflict';
    end if;
  end if;
  return stored.id;
end; $$;

create function public.get_canonical_destination_resolution(
  target_resolution_id uuid,
  target_semantic_hash text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare stored private.canonical_destination_resolutions%rowtype;
begin
  select * into stored from private.canonical_destination_resolutions
    where id=target_resolution_id;
  if not found then
    raise exception using errcode='P0001',message='destination_resolution_not_found';
  end if;
  if stored.semantic_hash<>target_semantic_hash then
    raise exception using errcode='P0001',message='destination_resolution_stale_hash';
  end if;
  return stored.resolution_json;
end; $$;

create function public.bind_destination_resolution_evidence(
  target_resolution_id uuid,
  target_evidence_id uuid
) returns uuid
language plpgsql security definer set search_path='' as $$
declare binding_id uuid;
  storage_mode text;
begin
  select evidence.restrictions->>'storage' into storage_mode
  from private.travel_evidence evidence where evidence.id=target_evidence_id;
  if not found then
    raise exception using errcode='P0001',message='travel_evidence_not_found';
  end if;
  if storage_mode='prohibited' then
    raise exception using errcode='P0001',message='travel_evidence_storage_prohibited';
  end if;
  insert into private.destination_resolution_evidence(resolution_id,evidence_id)
  values(target_resolution_id,target_evidence_id)
  on conflict(resolution_id,evidence_id) do update
    set resolution_id=excluded.resolution_id
  returning id into binding_id;
  return binding_id;
end; $$;

create or replace function public.store_travel_evidence(
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
    or target_evidence#>>'{restrictions,storage}'='prohibited'
    or octet_length(target_evidence::text)>262144 then
    raise exception using errcode='P0001',message=
      case when target_evidence#>>'{restrictions,storage}'='prohibited'
        then 'travel_evidence_storage_prohibited'
        else 'invalid_travel_evidence'
      end;
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

create or replace function public.put_travel_cache_response(
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
    or (target_stale_until is not null and target_stale_until<target_expires_at)
    or exists(
      select 1
      from jsonb_array_elements(coalesce(target_response->'evidence','[]'::jsonb)) item
      where item#>>'{restrictions,storage}'='prohibited'
    ) then
    raise exception using errcode='P0001',message=
      case when exists(
        select 1
        from jsonb_array_elements(coalesce(target_response->'evidence','[]'::jsonb)) item
        where item#>>'{restrictions,storage}'='prohibited'
      ) then 'travel_cache_storage_prohibited'
      else 'invalid_travel_cache_response'
      end;
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

create or replace function public.bind_plan_evidence_snapshot(
  target_trip_plan_id uuid,
  target_evidence_id uuid,
  target_item_id text default null
) returns uuid
language plpgsql security definer set search_path='' as $$
declare plan public.trip_plans%rowtype;
  evidence private.travel_evidence%rowtype;
  resolution private.canonical_destination_resolutions%rowtype;
  existing uuid; snapshot_id uuid; snapshot_json jsonb;
begin
  select * into plan from public.trip_plans where id=target_trip_plan_id for update;
  if not found then raise exception using errcode='P0001',message='trip_plan_not_found'; end if;
  select * into evidence from private.travel_evidence where id=target_evidence_id;
  if not found then raise exception using errcode='P0001',message='travel_evidence_not_found'; end if;
  if evidence.restrictions->>'storage'='prohibited' then
    raise exception using errcode='P0001',message='travel_evidence_storage_prohibited';
  end if;
  select * into resolution from private.canonical_destination_resolutions
    where trip_plan_id=plan.id;
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
    verification_at_publication,provider,source_name,source_url,retrieved_at,
    evidence_json,destination_resolution_id,destination_resolution_hash
  ) values(
    plan.id,plan.version,evidence.id,evidence.evidence_id,evidence.evidence_type,
    nullif(left(coalesce($3,''),240),''),
    encode(extensions.digest((snapshot_json
      -'retrievedAt'-'freshnessState'-'providerMetadata')::text,'sha256'),'hex'),
    evidence.freshness_state,evidence.verification_state,evidence.provider,
    evidence.source_name,evidence.source_url,evidence.retrieved_at,snapshot_json,
    resolution.id,resolution.semantic_hash
  ) returning id into snapshot_id;
  return snapshot_id;
end; $$;

create or replace function public.copy_plan_evidence_snapshots(
  target_base_trip_plan_id uuid,
  target_candidate_trip_plan_id uuid,
  excluded_target_item_ids text[] default '{}',
  excluded_evidence_types text[] default '{}'
) returns integer
language plpgsql security definer set search_path='' as $$
declare base public.trip_plans%rowtype;
  candidate public.trip_plans%rowtype;
  base_resolution private.canonical_destination_resolutions%rowtype;
  candidate_resolution private.canonical_destination_resolutions%rowtype;
  copied integer;
begin
  select * into base from public.trip_plans where id=target_base_trip_plan_id;
  select * into candidate from public.trip_plans where id=target_candidate_trip_plan_id;
  if base.id is null or candidate.id is null or base.room_id<>candidate.room_id
    or candidate.version<>base.version+1 then
    raise exception using errcode='P0001',message='invalid_travel_snapshot_copy';
  end if;
  select * into candidate_resolution
    from private.canonical_destination_resolutions
    where trip_plan_id=candidate.id;
  if candidate_resolution.id is null then
    select * into base_resolution
      from private.canonical_destination_resolutions
      where trip_plan_id=base.id;
    if base_resolution.id is not null then
      insert into private.canonical_destination_resolutions(
        room_id,trip_plan_id,planning_summary_id,schema_version,status,
        canonical_place_id,nps_park_code,semantic_hash,resolution_json
      ) values(
        candidate.room_id,candidate.id,candidate.planning_summary_id,
        base_resolution.schema_version,base_resolution.status,
        base_resolution.canonical_place_id,base_resolution.nps_park_code,
        base_resolution.semantic_hash,base_resolution.resolution_json
      )
      returning * into candidate_resolution;
    end if;
  end if;
  insert into private.plan_evidence_snapshots(
    trip_plan_id,plan_version,evidence_id,evidence_external_id,evidence_type,
    target_item_id,semantic_hash,freshness_at_publication,
    verification_at_publication,provider,source_name,source_url,retrieved_at,
    evidence_json,destination_resolution_id,destination_resolution_hash
  )
  select
    candidate.id,candidate.version,snapshot.evidence_id,
    snapshot.evidence_external_id,snapshot.evidence_type,
    snapshot.target_item_id,snapshot.semantic_hash,
    snapshot.freshness_at_publication,snapshot.verification_at_publication,
    snapshot.provider,snapshot.source_name,snapshot.source_url,
    snapshot.retrieved_at,snapshot.evidence_json,
    candidate_resolution.id,candidate_resolution.semantic_hash
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

revoke all on function
  public.store_canonical_destination_resolution(uuid,jsonb),
  public.get_canonical_destination_resolution(uuid,text),
  public.bind_destination_resolution_evidence(uuid,uuid)
  from public,anon,authenticated;
grant execute on function
  public.store_canonical_destination_resolution(uuid,jsonb),
  public.get_canonical_destination_resolution(uuid,text),
  public.bind_destination_resolution_evidence(uuid,uuid)
  to service_role;
