begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(39);

select has_table('private','plan_change_manifests','allowed-change manifests are private durable state');
select has_table('private','plan_change_patches','revision patches are private durable state');
select has_table('private','change_scope_repair_reports','scope repair reports are private durable state');
select has_function('public','persist_plan_change_manifest',array['uuid','jsonb','text'],'service manifest persistence exists');
select has_function('public','persist_plan_change_patch',array['uuid','jsonb'],'service patch persistence exists');
select has_function('public','start_plan_change_scope_repair',array['uuid','jsonb'],'bounded scope repair claim exists');
select has_function('public','complete_plan_change_scope_repair',array['uuid'],'scope repair completion is a separate validated transition');
select has_function('public','prepare_revision_ai_recovery',array[]::text[],'revision provider applications can be reconciled after interruption');
select ok((select relforcerowsecurity from pg_class where oid='private.plan_change_manifests'::regclass),'manifest RLS is forced');
select ok((select relforcerowsecurity from pg_class where oid='private.plan_change_patches'::regclass),'patch RLS is forced');
select ok((select relforcerowsecurity from pg_class where oid='private.change_scope_repair_reports'::regclass),'scope report RLS is forced');
select table_privs_are('private','plan_change_manifests','authenticated',array[]::text[],'browser cannot read manifests');
select table_privs_are('private','plan_change_patches','authenticated',array[]::text[],'browser cannot read patches');
select table_privs_are('private','change_scope_repair_reports','authenticated',array[]::text[],'browser cannot read scope reports');
select function_privs_are('public','persist_plan_change_manifest',array['uuid','jsonb','text'],'authenticated',array[]::text[],'browser cannot persist manifests');
select function_privs_are('public','start_plan_change_scope_repair',array['uuid','jsonb'],'authenticated',array[]::text[],'browser cannot claim scope repair');
select function_privs_are('public','complete_plan_change_scope_repair',array['uuid'],'authenticated',array[]::text[],'browser cannot complete scope repair');
select hasnt_column('private','plan_change_manifests','raw_prompt','manifest storage has no raw prompt');
select hasnt_column('private','change_scope_repair_reports','raw_model_output','scope storage has no raw model output');
select ok(
  exists(
    select 1
    from pg_indexes
    where schemaname='private'
      and tablename='plan_change_patches'
      and indexdef like '%(manifest_id, change_request_id)%'
  ),
  'patch manifest foreign key has a covering composite index'
);
set local role service_role;
select is(
  public.claim_ai_provider_attempt('revision_patch','5d-patch-attempt',1,'gpt-5.6-terra','5d000000-0000-4000-8000-000000000001',60000,null)->>'claimed',
  'true',
  'revision patch has a separately durable provider-attempt class'
);
reset role;

insert into auth.users(id,instance_id,aud,role,created_at,updated_at,is_anonymous)
values('5d100000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated',now(),now(),true);
insert into public.rooms(id,name,room_code,host_user_id,status,approval_mode,current_plan_version)
values('5d200000-0000-4000-8000-000000000001','Phase 5D Trip','SCPED522','5d100000-0000-4000-8000-000000000001','active','all_active',1);
insert into public.participants(id,room_id,user_id,display_name,role,status)
values('5d300000-0000-4000-8000-000000000001','5d200000-0000-4000-8000-000000000001','5d100000-0000-4000-8000-000000000001','Maya','host','active');
insert into public.planning_requests(id,room_id,requested_by_participant_id,requested_by_user_id,status,approval_mode,current_summary_version,approved_summary_version,basis_memory_version,basis_participant_ids,basis_membership_fingerprint,idempotency_key,approved_at)
values('5d400000-0000-4000-8000-000000000001','5d200000-0000-4000-8000-000000000001','5d300000-0000-4000-8000-000000000001','5d100000-0000-4000-8000-000000000001','approved_for_generation','all_active',1,1,1,array['5d300000-0000-4000-8000-000000000001'::uuid],encode(digest('5d300000-0000-4000-8000-000000000001:host','sha256'),'hex'),'phase-5d-basis',now());
insert into public.planning_summaries(id,planning_request_id,room_id,version,schema_version,prompt_version,model,summary_json,readiness_status,summary_hash,basis_memory_version,basis_participant_ids,basis_membership_fingerprint)
values('5d500000-0000-4000-8000-000000000001','5d400000-0000-4000-8000-000000000001','5d200000-0000-4000-8000-000000000001',1,'1','trailie-planning-summary-v1','gpt-5.6-sol','{"schemaVersion":"1","title":"Before I build the trip"}'::jsonb,'ready_for_review','5d-summary',1,array['5d300000-0000-4000-8000-000000000001'::uuid],encode(digest('5d300000-0000-4000-8000-000000000001:host','sha256'),'hex'));
insert into public.trip_plans(id,room_id,planning_request_id,planning_summary_id,version,status,schema_version,prompt_version,model,itinerary_json,plan_hash,validation_status,validation_summary,basis_summary_version,basis_summary_hash,created_by_participant_id,created_by_user_id,published_at)
values('5d600000-0000-4000-8000-000000000001','5d200000-0000-4000-8000-000000000001','5d400000-0000-4000-8000-000000000001','5d500000-0000-4000-8000-000000000001',1,'published','1','trailie-itinerary-v1','gpt-5.6-sol','{"schemaVersion":"1","title":"Yosemite","destinationSummary":"Yosemite Valley","startDate":"2026-09-12","endDate":"2026-09-13","days":[{"id":"day:one","date":"2026-09-12","items":[{"id":"item:kayaking","title":"Timed kayaking"}],"travelSegments":[]}]}'::jsonb,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','pass','{"status":"pass"}'::jsonb,1,'5d-summary','5d300000-0000-4000-8000-000000000001','5d100000-0000-4000-8000-000000000001',now());
insert into public.plan_change_requests(id,room_id,base_trip_plan_id,base_plan_version,basis_plan_hash,basis_membership_fingerprint,requested_by_participant_id,requested_by_user_id,request_type,target_item_id,request_text,normalized_request_text,status,approval_mode,current_analysis_version,approved_analysis_version,idempotency_key,approved_at)
values('5d700000-0000-4000-8000-000000000001','5d200000-0000-4000-8000-000000000001','5d600000-0000-4000-8000-000000000001',1,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',encode(digest('5d300000-0000-4000-8000-000000000001:host','sha256'),'hex'),'5d300000-0000-4000-8000-000000000001','5d100000-0000-4000-8000-000000000001','remove_item','item:kayaking','Remove kayaking','remove kayaking','approved','all_active',1,1,'phase-5d-request',now());
insert into public.plan_change_analyses(change_request_id,room_id,version,schema_version,prompt_version,model,analysis_json,analysis_hash,materiality,feasibility,basis_plan_hash,basis_plan_version)
values('5d700000-0000-4000-8000-000000000001','5d200000-0000-4000-8000-000000000001',1,'1','trailie-change-analysis-v1','gpt-5.6-terra','{"schemaVersion":"1","requestedChange":{"type":"remove_item","targetItemIds":["item:kayaking"]}}'::jsonb,'5d-analysis','material','feasible','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',1);

set local role service_role;
create temporary table stored_manifest as
select public.persist_plan_change_manifest(
  '5d700000-0000-4000-8000-000000000001',
  '{"schemaVersion":"1","changeRequestId":"5d700000-0000-4000-8000-000000000001","basePlanId":"5d600000-0000-4000-8000-000000000001","baseVersion":1,"basePlanHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","analysisVersion":1,"requestType":"remove_item","targetItemIds":["item:kayaking"],"affectedDayIds":["day:one"],"allowedOperations":["remove"],"allowedFieldsByItem":{"item:kayaking":[]},"allowedDownstreamEffects":[],"protectedItemIds":[],"protectedDayIds":[],"protectedTopLevelFields":["destinationSummary"],"requiredPreservations":["stable_ids"],"forbiddenChanges":["destination"],"evidenceRefreshTargets":["item:kayaking"],"maximumAffectedItems":1,"maximumAffectedDays":1}'::jsonb,
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
) value;
select is((select value->>'manifestHash' from stored_manifest),'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','manifest identity is persisted');
select is(public.persist_plan_change_manifest('5d700000-0000-4000-8000-000000000001','{"schemaVersion":"1","changeRequestId":"5d700000-0000-4000-8000-000000000001","basePlanId":"5d600000-0000-4000-8000-000000000001","baseVersion":1,"basePlanHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","analysisVersion":1,"requestType":"remove_item","targetItemIds":["item:kayaking"],"affectedDayIds":["day:one"],"allowedOperations":["remove"],"allowedFieldsByItem":{"item:kayaking":[]},"allowedDownstreamEffects":[],"protectedItemIds":[],"protectedDayIds":[],"protectedTopLevelFields":["destinationSummary"],"requiredPreservations":["stable_ids"],"forbiddenChanges":["destination"],"evidenceRefreshTargets":["item:kayaking"],"maximumAffectedItems":1,"maximumAffectedDays":1}'::jsonb,'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')->>'manifestHash','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','same manifest replays idempotently');
select throws_ok($$select public.persist_plan_change_manifest('5d700000-0000-4000-8000-000000000001','{"schemaVersion":"1","changeRequestId":"5d700000-0000-4000-8000-000000000001","basePlanId":"5d600000-0000-4000-8000-000000000001","baseVersion":1,"basePlanHash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","analysisVersion":1,"requestType":"remove_item","targetItemIds":["item:kayaking"],"affectedDayIds":["day:one"],"allowedOperations":["remove"],"allowedFieldsByItem":{"item:kayaking":[]},"allowedDownstreamEffects":[],"protectedItemIds":[],"protectedDayIds":[],"protectedTopLevelFields":["destinationSummary"],"requiredPreservations":["stable_ids"],"forbiddenChanges":["destination"],"evidenceRefreshTargets":["item:kayaking"],"maximumAffectedItems":1,"maximumAffectedDays":1}'::jsonb,'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc')$$,'P0001','revision_manifest_identity_mismatch','stale base hash is rejected');
reset role;
select throws_ok($$update private.plan_change_manifests set manifest_json='{}'::jsonb where change_request_id='5d700000-0000-4000-8000-000000000001'$$,'P0001','completed_revision_artifact_immutable','completed manifest is immutable');

set local role service_role;
select is(public.persist_plan_change_patch('5d700000-0000-4000-8000-000000000001','{"schemaVersion":"1","status":"ready","blockers":[],"baseVersion":1,"manifestHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","operations":[{"operation":"remove","targetId":"item:kayaking","dayId":"day:one","fieldChanges":{},"reason":"Approved removal","downstreamEffects":[]}],"preservedItemIds":[],"evidenceRefreshTargets":["item:kayaking"]}'::jsonb)->>'status','ready','one validated patch is persisted');
select is(public.persist_plan_change_patch('5d700000-0000-4000-8000-000000000001','{"schemaVersion":"1","status":"ready","blockers":[],"baseVersion":1,"manifestHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","operations":[{"operation":"remove","targetId":"item:kayaking","dayId":"day:one","fieldChanges":{},"reason":"Approved removal","downstreamEffects":[]}],"preservedItemIds":[],"evidenceRefreshTargets":["item:kayaking"]}'::jsonb)->>'status','ready','same patch replays idempotently');
select throws_ok($$select public.persist_plan_change_patch('5d700000-0000-4000-8000-000000000001','{"schemaVersion":"1","status":"ready","blockers":[],"baseVersion":1,"manifestHash":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","operations":[{"operation":"remove","targetId":"item:kayaking","dayId":"day:one","fieldChanges":{},"reason":"Approved removal","downstreamEffects":[]}],"preservedItemIds":[],"evidenceRefreshTargets":["item:kayaking"]}'::jsonb)$$,'P0001','revision_patch_identity_mismatch','patch cannot detach from manifest');
reset role;

insert into public.trip_plans(id,room_id,planning_request_id,planning_summary_id,version,status,schema_version,prompt_version,model,itinerary_json,plan_hash,validation_status,basis_summary_version,basis_summary_hash,created_by_participant_id,created_by_user_id,change_request_id,base_trip_plan_id)
values('5d600000-0000-4000-8000-000000000002','5d200000-0000-4000-8000-000000000001','5d400000-0000-4000-8000-000000000001','5d500000-0000-4000-8000-000000000001',2,'validating','1','trailie-itinerary-revision-v2','gpt-5.6-sol','{"schemaVersion":"1","title":"Yosemite","days":[]}'::jsonb,'5d-candidate','pending',1,'5d-summary','5d300000-0000-4000-8000-000000000001','5d100000-0000-4000-8000-000000000001','5d700000-0000-4000-8000-000000000001','5d600000-0000-4000-8000-000000000001');
update public.plan_change_requests set status='validating',candidate_trip_plan_id='5d600000-0000-4000-8000-000000000002' where id='5d700000-0000-4000-8000-000000000001';

set local role service_role;
select is(public.start_plan_change_scope_repair('5d700000-0000-4000-8000-000000000001','{"validatorVersion":"trailie-change-boundary-v2","status":"blocked","issues":[{"code":"protected_item_changed"}],"preservation":{"unauthorizedDifferences":["items.item:other"]}}'::jsonb)->>'claimed','true','first scope repair claim wins');
select is(public.start_plan_change_scope_repair('5d700000-0000-4000-8000-000000000001','{"validatorVersion":"trailie-change-boundary-v2","status":"blocked","issues":[],"preservation":{"unauthorizedDifferences":[]}}'::jsonb)->>'claimed','false','second scope repair is not claimed');
select throws_ok(
  $$select public.complete_plan_change_scope_repair('5d700000-0000-4000-8000-000000000001')$$,
  'P0001','scope_repair_not_complete','scope repair cannot report success before its candidate update is durable'
);
select public.record_plan_change_run_usage(
  '5d700000-0000-4000-8000-000000000001','candidate_scope_repair',
  'response-5d-scope','request-5d-scope',10,10,0,0,20,100
);
select lives_ok(
  $$select public.complete_plan_change_scope_repair('5d700000-0000-4000-8000-000000000001')$$,
  'scope repair completes only after its durable run has completed'
);
reset role;
select is((select scope_repair_count from public.plan_change_requests where id='5d700000-0000-4000-8000-000000000001'),1,'scope repair counter is bounded to one');
select is((select count(*) from private.change_scope_repair_reports where change_request_id='5d700000-0000-4000-8000-000000000001'),1::bigint,'one scope repair report exists');
select is((select status from private.change_scope_repair_reports where change_request_id='5d700000-0000-4000-8000-000000000001'),'completed','scope report records success only after explicit completion');
select is((select count(*) from private.plan_change_patches where change_request_id='5d700000-0000-4000-8000-000000000001'),1::bigint,'one patch exists per analysis version');
select is((select count(*) from private.plan_change_manifests where change_request_id='5d700000-0000-4000-8000-000000000001'),1::bigint,'one manifest exists per analysis version');

insert into private.ai_provider_attempts(
  workflow,operation_key,attempt,model,status,lease_owner,lease_expires_at,
  validated_result,result_hash,recovery_required
) values(
  'revision_patch','5d700000-0000-4000-8000-000000000001:patch:1',1,'gpt-5.6-terra',
  'provider_completed','5d000000-0000-4000-8000-000000000099',now()-interval '1 second',
  '{"patch":"validated"}'::jsonb,encode(digest('validated','sha256'),'hex'),true
);
set local role service_role;
select lives_ok(
  $$select public.prepare_revision_ai_recovery()$$,
  'recovery reconciles a staged provider result whose patch was already persisted'
);
reset role;
select is(
  (select status from private.ai_provider_attempts where operation_key='5d700000-0000-4000-8000-000000000001:patch:1'),
  'applied','reconciled revision provider result is applied exactly once'
);

select * from finish();
rollback;
