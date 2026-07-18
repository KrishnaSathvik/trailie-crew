begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(38);

select has_table('private','travel_evidence','normalized travel evidence is private');
select has_table('private','travel_evidence_bindings','evidence bindings are private');
select has_table('private','travel_provider_requests','provider operations are private');
select has_table('private','travel_cache_entries','provider cache is private');
select has_table('private','plan_evidence_snapshots','published evidence snapshots are private');
select has_table('private','travel_refresh_jobs','travel refresh work is durable');
select has_function('public','store_travel_evidence',array['jsonb','uuid'],'service evidence recorder exists');
select has_function('public','bind_plan_evidence_snapshot',array['uuid','uuid','text'],'snapshot binder exists');
select has_function('public','claim_travel_refresh_job',array['uuid','integer'],'durable refresh claim exists');
select has_function('public','cleanup_travel_provider_data',array['integer','integer'],'bounded travel cleanup exists');
select function_privs_are('public','cleanup_travel_provider_data',array['integer','integer'],'service_role',array['EXECUTE'],'only service role can clean travel data');
select has_function('public','get_travel_provider_acceptance_report',array['uuid'],'safe hosted acceptance report exists');
select function_privs_are('public','get_travel_provider_acceptance_report',array['uuid'],'authenticated',array[]::text[],'browser cannot read provider acceptance operations');
select has_function('public','get_itinerary_validation_acceptance_report',array['uuid'],'safe validation acceptance report exists');
select function_privs_are('public','get_itinerary_validation_acceptance_report',array['uuid'],'authenticated',array[]::text[],'browser cannot read private validation acceptance records');
select ok((select relforcerowsecurity from pg_class where oid='private.travel_evidence'::regclass),'evidence RLS is forced');
select ok((select relforcerowsecurity from pg_class where oid='private.plan_evidence_snapshots'::regclass),'snapshot RLS is forced');
select table_privs_are('private','travel_evidence','authenticated',array[]::text[],'browser cannot read evidence');
select table_privs_are('private','travel_cache_entries','authenticated',array[]::text[],'browser cannot access provider cache');
select table_privs_are('private','plan_evidence_snapshots','authenticated',array[]::text[],'browser cannot read private snapshots');
select function_privs_are('public','store_travel_evidence',array['jsonb','uuid'],'authenticated',array[]::text[],'browser cannot store evidence');
select ok(has_function_privilege('service_role','public.store_travel_evidence(jsonb,uuid)','execute'),'service can store normalized evidence');
select hasnt_column('private','travel_provider_requests','api_key','provider requests never store API keys');
select hasnt_column('private','travel_provider_requests','raw_payload','provider requests never store raw provider payloads');

insert into auth.users(id,instance_id,aud,role,created_at,updated_at,is_anonymous)
values(
  '6a100000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated',now(),now(),true
);
insert into public.rooms(id,name,room_code,host_user_id,status)
values(
  '6a200000-0000-4000-8000-000000000001',
  'Phase 6A evidence room','PHSA6222',
  '6a100000-0000-4000-8000-000000000001','active'
);
insert into public.participants(id,room_id,user_id,display_name,role,status)
values(
  '6a300000-0000-4000-8000-000000000001',
  '6a200000-0000-4000-8000-000000000001',
  '6a100000-0000-4000-8000-000000000001',
  'Evidence tester','host','active'
);
insert into public.planning_requests(
  id,room_id,requested_by_participant_id,requested_by_user_id,status,
  approval_mode,current_summary_version,approved_summary_version,
  basis_memory_version,basis_participant_ids,basis_membership_fingerprint,
  idempotency_key,approved_at
) values(
  '6a400000-0000-4000-8000-000000000001',
  '6a200000-0000-4000-8000-000000000001',
  '6a300000-0000-4000-8000-000000000001',
  '6a100000-0000-4000-8000-000000000001',
  'approved_for_generation','all_active',2,2,1,
  array['6a300000-0000-4000-8000-000000000001'::uuid],
  'phase-6a-membership','phase-6a-request',now()
);
insert into public.planning_summaries(
  id,planning_request_id,room_id,version,schema_version,prompt_version,model,
  summary_json,readiness_status,summary_hash,basis_memory_version,
  basis_participant_ids,basis_membership_fingerprint
) values
(
  '6a500000-0000-4000-8000-000000000001',
  '6a400000-0000-4000-8000-000000000001',
  '6a200000-0000-4000-8000-000000000001',
  1,'1','planning-v1','fixture','{"schemaVersion":"1"}',
  'ready_for_review','phase-6a-summary-v1',1,
  array['6a300000-0000-4000-8000-000000000001'::uuid],
  'phase-6a-membership'
),
(
  '6a500000-0000-4000-8000-000000000002',
  '6a400000-0000-4000-8000-000000000001',
  '6a200000-0000-4000-8000-000000000001',
  2,'1','planning-v1','fixture','{"schemaVersion":"1"}',
  'ready_for_review','phase-6a-summary-v2',1,
  array['6a300000-0000-4000-8000-000000000001'::uuid],
  'phase-6a-membership'
);
insert into public.trip_plans(
  id,room_id,planning_request_id,planning_summary_id,version,status,
  schema_version,prompt_version,model,itinerary_json,validation_status,
  validation_summary,basis_summary_version,basis_summary_hash,
  created_by_participant_id,created_by_user_id,published_at
) values
(
  '6a600000-0000-4000-8000-000000000001',
  '6a200000-0000-4000-8000-000000000001',
  '6a400000-0000-4000-8000-000000000001',
  '6a500000-0000-4000-8000-000000000001',
  1,'published','1','itinerary-v1','fixture',
  '{"schemaVersion":"1","title":"Version 1"}','pass','{}',1,
  'phase-6a-summary-v1',
  '6a300000-0000-4000-8000-000000000001',
  '6a100000-0000-4000-8000-000000000001',now()
),
(
  '6a600000-0000-4000-8000-000000000002',
  '6a200000-0000-4000-8000-000000000001',
  '6a400000-0000-4000-8000-000000000001',
  '6a500000-0000-4000-8000-000000000002',
  2,'published','1','itinerary-v1','fixture',
  '{"schemaVersion":"1","title":"Version 2"}','pass','{}',2,
  'phase-6a-summary-v2',
  '6a300000-0000-4000-8000-000000000001',
  '6a100000-0000-4000-8000-000000000001',now()
);

set local role service_role;
create temporary table evidence_ids as
select public.store_travel_evidence(
  '{
    "schemaVersion":"1",
    "evidenceId":"evidence:nps:park_closure:phase6a-v1",
    "evidenceType":"park_closure",
    "provider":"nps",
    "sourceName":"National Park Service",
    "sourceUrl":"https://www.nps.gov/yose/planyourvisit/conditions.htm",
    "sourceEntityId":"alert-v1",
    "retrievedAt":"2026-07-17T20:00:00Z",
    "observedAt":"2026-07-17T20:00:00Z",
    "validFrom":"2026-07-17T20:00:00Z",
    "validUntil":"2026-07-18T20:00:00Z",
    "freshnessState":"fresh",
    "verificationState":"verified",
    "confidence":"high",
    "availabilityState":"available",
    "normalizedValue":{"kind":"park_closure","data":{"title":"Road closed","active":true}},
    "providerMetadata":{},
    "attribution":{"label":"National Park Service","url":"https://www.nps.gov/","required":true},
    "restrictions":{"storage":"bounded","display":"Link to official source"},
    "errorState":null
  }'::jsonb
) evidence_v1;
create temporary table snapshot_ids as
select public.bind_plan_evidence_snapshot(
  '6a600000-0000-4000-8000-000000000001',
  (select evidence_v1 from evidence_ids),
  'item:glacier-point'
) snapshot_v1;
create temporary table duplicate_snapshot_ids as
select public.bind_plan_evidence_snapshot(
  '6a600000-0000-4000-8000-000000000001',
  (select evidence_v1 from evidence_ids),
  'item:glacier-point'
) snapshot_v1;
select public.copy_plan_evidence_snapshots(
  '6a600000-0000-4000-8000-000000000001',
  '6a600000-0000-4000-8000-000000000002',
  array['item:unrelated'],
  array[]::text[]
);
reset role;

select is(
  (select snapshot_v1 from snapshot_ids),
  (select snapshot_v1 from duplicate_snapshot_ids),
  'snapshot binding is exactly once'
);
select is(
  (select count(*) from private.plan_evidence_snapshots where trip_plan_id='6a600000-0000-4000-8000-000000000001'),
  1::bigint,
  'Version 1 has one immutable evidence snapshot'
);
select is(
  jsonb_array_length(private.project_plan_travel_evidence('6a600000-0000-4000-8000-000000000001')),
  1,
  'member evidence projection reads the pinned snapshot'
);
select ok(
  private.project_plan_travel_evidence('6a600000-0000-4000-8000-000000000001')::text !~* 'coordinates|providerMetadata|requestKey',
  'reader evidence projection excludes precise coordinates and provider internals'
);
select is(
  private.project_public_itinerary('6a600000-0000-4000-8000-000000000001')->>'conditionsDisclaimer',
  'Conditions may have changed since this version was published.',
  'public projection discloses that conditions may have changed'
);
select is(
  jsonb_array_length(private.project_public_itinerary('6a600000-0000-4000-8000-000000000001')->'travelEvidence'),
  1,
  'public projection keeps privacy-safe exact-version source labels'
);
select throws_ok(
  $$update private.plan_evidence_snapshots set source_name='mutated' where trip_plan_id='6a600000-0000-4000-8000-000000000001'$$,
  'P0001','travel_evidence_snapshot_immutable',
  'published evidence snapshots cannot be updated'
);
select throws_ok(
  $$delete from private.plan_evidence_snapshots where trip_plan_id='6a600000-0000-4000-8000-000000000001'$$,
  'P0001','travel_evidence_snapshot_immutable',
  'published evidence snapshots cannot be deleted'
);

set local role service_role;
select public.upsert_travel_cache_entry(
  'local','nps','park_alerts','cache:phase6a:park-alerts',
  (select evidence_v1 from evidence_ids),false,now()+interval '10 minutes'
);
select public.upsert_travel_cache_entry(
  'hosted-acceptance','nps','park_alerts','cache:phase6a:park-alerts',
  (select evidence_v1 from evidence_ids),false,now()+interval '10 minutes'
);
reset role;
select is(
  (select count(*) from private.travel_cache_entries where cache_key='cache:phase6a:park-alerts'),
  2::bigint,
  'cache keys are isolated by environment'
);

set local role service_role;
select public.enqueue_travel_refresh_job(
  '6a200000-0000-4000-8000-000000000001',
  '6a600000-0000-4000-8000-000000000002',
  'refresh:phase6a:route:item-1','route','item:1'
);
create temporary table refresh_claim as
select public.claim_travel_refresh_job(
  '6a700000-0000-4000-8000-000000000001',60000
) payload;
create temporary table duplicate_refresh_claim as
select public.claim_travel_refresh_job(
  '6a700000-0000-4000-8000-000000000002',60000
) payload;
reset role;
select is((select payload->>'capability' from refresh_claim),'route','eligible refresh job is claimed');
select is((select payload from duplicate_refresh_claim),null::jsonb,'refresh lease prevents duplicate work');

select is(
  (select evidence_json->'normalizedValue'->'data'->>'title'
    from private.plan_evidence_snapshots
    where trip_plan_id='6a600000-0000-4000-8000-000000000001'),
  'Road closed',
  'Version 1 retains the exact normalized evidence used at publication'
);
select is(
  (select count(*) from private.plan_evidence_snapshots
    where trip_plan_id='6a600000-0000-4000-8000-000000000002'),
  1::bigint,
  'a later plan version explicitly preserves unaffected evidence snapshots'
);
select ok(
  not exists(
    select 1 from information_schema.role_table_grants
    where table_schema='private'
      and table_name like 'travel_%'
      and grantee in ('anon','authenticated')
  ),
  'travel tables expose no browser grants'
);

select * from finish();
rollback;
