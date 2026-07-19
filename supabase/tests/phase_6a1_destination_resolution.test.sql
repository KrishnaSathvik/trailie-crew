begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(25);

select has_table(
  'private','canonical_destination_resolutions',
  'canonical destination resolution is private'
);
select has_table(
  'private','destination_resolution_evidence',
  'destination evidence binding is private'
);
select has_function(
  'public','store_canonical_destination_resolution',array['uuid','jsonb'],
  'service resolution recorder exists'
);
select has_function(
  'public','get_canonical_destination_resolution',array['uuid','text'],
  'service resolution loader exists'
);
select has_function(
  'public','bind_destination_resolution_evidence',array['uuid','uuid'],
  'service resolution evidence binder exists'
);
select ok(
  (select relforcerowsecurity
    from pg_class
    where oid='private.canonical_destination_resolutions'::regclass),
  'resolution RLS is forced'
);
select table_privs_are(
  'private','canonical_destination_resolutions','authenticated',array[]::text[],
  'browser cannot read canonical resolution'
);
select function_privs_are(
  'public','store_canonical_destination_resolution',array['uuid','jsonb'],
  'authenticated',array[]::text[],
  'browser cannot store canonical resolution'
);
select has_function(
  'private','plan_map_projection_source',array['uuid'],
  'private exact-version map source assembler exists'
);
select has_function(
  'public','get_plan_map_projection_source',array['uuid','integer'],
  'member exact-version map source reader exists'
);
select has_function(
  'public','get_public_plan_map_projection_source',array['text'],
  'service-only public share map source reader exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.get_plan_map_projection_source(uuid,integer)',
    'execute'
  ),
  'authenticated members may invoke the membership-checking map source function'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_public_plan_map_projection_source(text)',
    'execute'
  ),
  'browser roles cannot invoke the public share map source reader'
);

insert into auth.users(id,instance_id,aud,role,created_at,updated_at,is_anonymous)
values(
  '6b100000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated',now(),now(),true
);
insert into public.rooms(id,name,room_code,host_user_id,status)
values(
  '6b200000-0000-4000-8000-000000000001',
  'Phase 6A.1 resolution room','P6A2TST2',
  '6b100000-0000-4000-8000-000000000001','active'
);
insert into public.participants(id,room_id,user_id,display_name,role,status)
values(
  '6b300000-0000-4000-8000-000000000001',
  '6b200000-0000-4000-8000-000000000001',
  '6b100000-0000-4000-8000-000000000001',
  'Resolution tester','host','active'
);
insert into public.planning_requests(
  id,room_id,requested_by_participant_id,requested_by_user_id,status,
  approval_mode,current_summary_version,approved_summary_version,
  basis_memory_version,basis_participant_ids,basis_membership_fingerprint,
  idempotency_key,approved_at
) values(
  '6b400000-0000-4000-8000-000000000001',
  '6b200000-0000-4000-8000-000000000001',
  '6b300000-0000-4000-8000-000000000001',
  '6b100000-0000-4000-8000-000000000001',
  'approved_for_generation','all_active',1,1,1,
  array['6b300000-0000-4000-8000-000000000001'::uuid],
  'phase-6a1-membership','phase-6a1-request',now()
);
insert into public.planning_summaries(
  id,planning_request_id,room_id,version,schema_version,prompt_version,model,
  summary_json,readiness_status,summary_hash,basis_memory_version,
  basis_participant_ids,basis_membership_fingerprint
) values(
  '6b500000-0000-4000-8000-000000000001',
  '6b400000-0000-4000-8000-000000000001',
  '6b200000-0000-4000-8000-000000000001',
  1,'1','planning-v1','fixture','{"schemaVersion":"1"}',
  'ready_for_review','phase-6a1-summary',1,
  array['6b300000-0000-4000-8000-000000000001'::uuid],
  'phase-6a1-membership'
);
insert into public.trip_plans(
  id,room_id,planning_request_id,planning_summary_id,version,status,
  schema_version,prompt_version,model,itinerary_json,validation_status,
  validation_summary,basis_summary_version,basis_summary_hash,
  created_by_participant_id,created_by_user_id
) values(
  '6b600000-0000-4000-8000-000000000001',
  '6b200000-0000-4000-8000-000000000001',
  '6b400000-0000-4000-8000-000000000001',
  '6b500000-0000-4000-8000-000000000001',
  1,'validating','1','itinerary-v1','fixture',
  '{"schemaVersion":"1","title":"Version 1"}','pending','{}',1,
  'phase-6a1-summary',
  '6b300000-0000-4000-8000-000000000001',
  '6b100000-0000-4000-8000-000000000001'
);

set local role service_role;
create temporary table resolution_ids as
select public.store_canonical_destination_resolution(
  '6b600000-0000-4000-8000-000000000001',
  '{
    "schemaVersion":"1",
    "originalQuery":"Yosemite National Park",
    "normalizedQuery":"Yosemite",
    "status":"resolved",
    "canonicalPlaceId":"nps:yose",
    "canonicalName":"Yosemite National Park",
    "providerPlaceId":null,
    "npsParkCode":"yose",
    "coordinates":{"latitude":37.8651,"longitude":-119.5383},
    "boundingBox":null,
    "locality":null,
    "region":"California",
    "country":"United States",
    "candidateCount":3,
    "selectedCandidateIndex":0,
    "resolutionMethod":"exact_official_match",
    "corroborationSources":["mapbox","nps"],
    "corroborationScore":1,
    "confidence":"high",
    "ambiguityReasons":[],
    "evidenceIds":["evidence:nps:park:yose"],
    "semanticHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }'::jsonb
) resolution_id;
create temporary table duplicate_resolution_ids as
select public.store_canonical_destination_resolution(
  '6b600000-0000-4000-8000-000000000001',
  public.get_canonical_destination_resolution(
    (select resolution_id from resolution_ids),
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  )
) resolution_id;
reset role;

select is(
  (select resolution_id from resolution_ids),
  (select resolution_id from duplicate_resolution_ids),
  'one canonical row is stored idempotently per plan operation'
);
select is(
  (select count(*) from private.canonical_destination_resolutions),
  1::bigint,
  'duplicate operation cannot create another canonical row'
);

set local role service_role;
select is(
  public.get_canonical_destination_resolution(
    (select resolution_id from resolution_ids),
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  )->>'canonicalPlaceId',
  'nps:yose',
  'durable canonical identity reloads by ID and semantic hash'
);
select throws_ok(
  format(
    'select public.get_canonical_destination_resolution(%L,%L)',
    (select resolution_id from resolution_ids),
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  ),
  'P0001','destination_resolution_stale_hash',
  'stale canonical hash is rejected'
);
reset role;
select throws_ok(
  $$update private.canonical_destination_resolutions set status='ambiguous'$$,
  'P0001','travel_evidence_snapshot_immutable',
  'canonical resolution is immutable'
);
set local role service_role;
select throws_ok(
  $$select public.store_travel_evidence('{
    "schemaVersion":"1",
    "evidenceId":"evidence:mapbox:temporary:yosemite",
    "evidenceType":"geocode",
    "provider":"mapbox",
    "sourceName":"Mapbox",
    "sourceUrl":null,
    "sourceEntityId":"mapbox.temp",
    "retrievedAt":"2026-07-18T14:00:00Z",
    "observedAt":null,
    "validFrom":null,
    "validUntil":null,
    "freshnessState":"fresh",
    "verificationState":"verified",
    "confidence":"high",
    "availabilityState":"available",
    "normalizedValue":{"kind":"geocode","data":{}},
    "providerMetadata":{},
    "attribution":{"label":"Mapbox","url":null,"required":true},
    "restrictions":{"storage":"prohibited","display":"temporary"},
    "errorState":null
  }'::jsonb)$$,
  'P0001','travel_evidence_storage_prohibited',
  'temporary Mapbox evidence cannot cross the database boundary'
);
create temporary table evidence_ids as
select public.store_travel_evidence(
  '{
    "schemaVersion":"1",
    "evidenceId":"evidence:nps:park:yose",
    "evidenceType":"park",
    "provider":"nps",
    "sourceName":"National Park Service",
    "sourceUrl":"https://www.nps.gov/yose/",
    "sourceEntityId":"yose",
    "retrievedAt":"2026-07-18T14:00:00Z",
    "observedAt":null,
    "validFrom":null,
    "validUntil":null,
    "freshnessState":"fresh",
    "verificationState":"verified",
    "confidence":"high",
    "availabilityState":"available",
    "normalizedValue":{"kind":"park","data":{"parkCode":"yose","officialName":"Yosemite National Park"}},
    "providerMetadata":{},
    "attribution":{"label":"National Park Service","url":"https://www.nps.gov/","required":true},
    "restrictions":{"storage":"permanent","display":"official source"},
    "errorState":null
  }'::jsonb
) evidence_id;
select public.bind_destination_resolution_evidence(
  (select resolution_id from resolution_ids),
  (select evidence_id from evidence_ids)
);
select public.bind_plan_evidence_snapshot(
  '6b600000-0000-4000-8000-000000000001',
  (select evidence_id from evidence_ids),
  null
);
reset role;

select is(
  (select count(*) from private.destination_resolution_evidence),
  1::bigint,
  'evidence binding references the canonical resolution'
);
select is(
  (select destination_resolution_id from private.plan_evidence_snapshots limit 1),
  (select resolution_id from resolution_ids),
  'plan snapshot retains canonical resolution ID'
);
select is(
  (select destination_resolution_hash from private.plan_evidence_snapshots limit 1),
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'plan snapshot retains canonical semantic hash'
);

update public.trip_plans
set status='published',validation_status='pass',published_at=now()
where id='6b600000-0000-4000-8000-000000000001';

select set_config(
  'request.jwt.claim.sub',
  '6b100000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;
select ok(
  public.get_plan_map_projection_source(
    '6b200000-0000-4000-8000-000000000001',
    1
  )->'destinationResolution'->>'canonicalPlaceId'='nps:yose'
  and jsonb_array_length(
    public.get_plan_map_projection_source(
      '6b200000-0000-4000-8000-000000000001',
      1
    )->'evidenceSnapshots'
  )=1,
  'active member receives exact-version immutable evidence and canonical destination'
);
reset role;

select set_config(
  'request.jwt.claim.sub',
  '6b100000-0000-4000-8000-000000000099',
  true
);
set local role authenticated;
select throws_ok(
  $$select public.get_plan_map_projection_source(
    '6b200000-0000-4000-8000-000000000001',1
  )$$,
  'P0001','Membership required.',
  'cross-room map projection access is denied'
);
reset role;

set local role service_role;
select is(
  public.get_public_plan_map_projection_source(repeat('f',64)),
  null,
  'unknown public share map token has one generic unavailable state'
);
reset role;

select * from finish();
rollback;
