begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(51);

select has_table('public','trip_plans','trip plans exist');
select has_table('public','trip_plan_events','safe progress events exist');
select has_table('private','itinerary_runs','itinerary runs are private');
select has_table('private','tool_evidence','tool evidence is private');
select has_table('private','validation_reports','validation reports are private');
select has_function('public','create_itinerary_generation',array['uuid','uuid'],'generation RPC exists');
select has_function('public','get_trip_plan',array['uuid'],'safe plan query exists');
select has_function('public','claim_itinerary_generation',array['uuid'],'service claim wrapper exists');
select has_function('public','record_itinerary_draft',array['uuid','jsonb','text','text','bigint','bigint','bigint','bigint','bigint','integer'],'draft recorder exists');
select has_function('public','record_tool_evidence',array['uuid','text','text','text','timestamptz','timestamptz','text','jsonb','jsonb','text'],'evidence recorder exists');
select has_function('public','record_validation_report',array['uuid','integer','text','text','jsonb','jsonb'],'report recorder exists');
select has_function('public','complete_itinerary_publication',array['uuid','jsonb'],'publication function exists');
select has_function('public','mark_itinerary_needs_revision',array['uuid'],'repair transition exists');
select has_function('public','fail_itinerary_generation',array['uuid','text'],'failure transition exists');
select isnt((select relrowsecurity from pg_class where oid='public.trip_plans'::regclass),false,'trip plan RLS enabled');
select isnt((select relrowsecurity from pg_class where oid='public.trip_plan_events'::regclass),false,'event RLS enabled');
select ok((select relforcerowsecurity from pg_class where oid='private.itinerary_runs'::regclass),'run RLS forced');
select ok((select relforcerowsecurity from pg_class where oid='private.tool_evidence'::regclass),'evidence RLS forced');
select ok((select relforcerowsecurity from pg_class where oid='private.validation_reports'::regclass),'report RLS forced');
select ok(not has_table_privilege('authenticated','public.trip_plans','insert'),'browser cannot insert plans');
select ok(not has_table_privilege('authenticated','public.trip_plans','update'),'browser cannot update plans');
select ok(not has_table_privilege('authenticated','public.trip_plans','delete'),'browser cannot delete plans');
select ok(not has_table_privilege('authenticated','private.tool_evidence','select'),'browser cannot read evidence');
select ok(not has_function_privilege('authenticated','public.claim_itinerary_generation(uuid)','execute'),'browser cannot claim generation');
select ok(has_function_privilege('service_role','public.claim_itinerary_generation(uuid)','execute'),'service can claim generation');
select hasnt_column('private','itinerary_runs','raw_prompt','raw prompts are absent');
select hasnt_column('private','itinerary_runs','reasoning','hidden reasoning is absent');
select hasnt_column('private','tool_evidence','authorization_header','authorization headers are absent');

insert into auth.users(id,instance_id,aud,role,created_at,updated_at,is_anonymous) values
('80000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated',now(),now(),true),
('80000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated',now(),now(),true),
('80000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated',now(),now(),true);

insert into public.rooms(id,name,room_code,host_user_id,status) values
('81000000-0000-4000-8000-000000000001','Itinerary Trip','PLAN3B22','80000000-0000-4000-8000-000000000001','active');
insert into public.participants(id,room_id,user_id,display_name,role,status) values
('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','Maya','host','active'),
('82000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000002','Alex','member','active');
insert into private.room_memory(room_id,memory_version) values ('81000000-0000-4000-8000-000000000001',1);
insert into public.planning_requests(
  id,room_id,requested_by_participant_id,requested_by_user_id,status,approval_mode,
  current_summary_version,approved_summary_version,basis_memory_version,basis_participant_ids,
  basis_membership_fingerprint,idempotency_key,approved_at
) values (
  '83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001',
  'approved_for_generation','all_active',1,1,1,
  array['82000000-0000-4000-8000-000000000001'::uuid,'82000000-0000-4000-8000-000000000002'::uuid],
  encode(digest('82000000-0000-4000-8000-000000000001,82000000-0000-4000-8000-000000000002','sha256'),'hex'),
  'phase-3b-approved',now()
);
insert into public.planning_summaries(
  id,planning_request_id,room_id,version,schema_version,prompt_version,model,summary_json,
  readiness_status,summary_hash,basis_memory_version,basis_participant_ids,basis_membership_fingerprint
) values (
  '84000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',1,'1','trailie-planning-summary-v1','gpt-5.6-sol',
  jsonb_build_object(
    'schemaVersion','1','title','Before I build the trip',
    'tripSnapshot',jsonb_build_object('destinations',jsonb_build_array('Yosemite'),'dateWindows',jsonb_build_array('2026-09-12 to 2026-09-15'),'travelerCount',2,'origins','[]'::jsonb,'budget','[]'::jsonb,'approvalMode','all_active'),
    'confirmedDecisions',jsonb_build_array(jsonb_build_object('id','confirmed:0','label','Destination','detail','Yosemite','sourceMessageIds','[]'::jsonb)),
    'travelerPreferences','[]'::jsonb,'constraints','[]'::jsonb,'proposals','[]'::jsonb,'rejectedOptions','[]'::jsonb,'conflicts','[]'::jsonb,'openQuestions','[]'::jsonb,'missingCriticalInformation','[]'::jsonb,'nonAssumptions','[]'::jsonb,
    'readiness',jsonb_build_object('status','ready_for_review','blockers','[]'::jsonb,'warnings','[]'::jsonb),
    'evidence',jsonb_build_object('memoryVersion',1,'latestMessageId',null,'sourceMessageIds','[]'::jsonb)
  ),'ready_for_review','approved-hash',1,
  array['82000000-0000-4000-8000-000000000001'::uuid,'82000000-0000-4000-8000-000000000002'::uuid],
  encode(digest('82000000-0000-4000-8000-000000000001,82000000-0000-4000-8000-000000000002','sha256'),'hex')
);
insert into public.planning_requests(
  id,room_id,requested_by_participant_id,requested_by_user_id,status,approval_mode,
  current_summary_version,approved_summary_version,basis_memory_version,basis_participant_ids,
  basis_membership_fingerprint,idempotency_key,approved_at
) select
  '83000000-0000-4000-8000-000000000002',room_id,requested_by_participant_id,requested_by_user_id,
  'approved_for_generation',approval_mode,1,1,basis_memory_version,basis_participant_ids,
  basis_membership_fingerprint,'phase-3b-blocked',now()
from public.planning_requests where id='83000000-0000-4000-8000-000000000001';
insert into public.planning_summaries(
  id,planning_request_id,room_id,version,schema_version,prompt_version,model,summary_json,
  readiness_status,summary_hash,basis_memory_version,basis_participant_ids,basis_membership_fingerprint
) select
  '84000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000002',room_id,version,
  schema_version,prompt_version,model,jsonb_set(summary_json,'{readiness,blockers}','["missing dates"]'::jsonb),
  'blocked','blocked-hash',basis_memory_version,basis_participant_ids,basis_membership_fingerprint
from public.planning_summaries where id='84000000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
select throws_ok(
  $$select public.create_itinerary_generation('83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001')$$,
  'P0001','Authentication required.','unauthenticated generation rejected'
);
reset role;

select set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok(
  $$select public.create_itinerary_generation('83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001')$$,
  'P0001','Membership required.','outsider and spoofed participant rejected'
);
reset role;

select set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000001',true);
update public.participants set status='left' where id='82000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok(
  $$select public.create_itinerary_generation('83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001')$$,
  'P0001','Membership required.','inactive participant rejected'
);
reset role;
update public.participants set status='active' where id='82000000-0000-4000-8000-000000000001';
update public.planning_requests set status='awaiting_review',approved_summary_version=null,approved_at=null where id='83000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok(
  $$select public.create_itinerary_generation('83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001')$$,
  'P0001','Approved summary required.','unapproved request rejected'
);
reset role;
update public.planning_requests set status='approved_for_generation',approved_summary_version=1,approved_at=now() where id='83000000-0000-4000-8000-000000000001';
update private.room_memory set memory_version=2 where room_id='81000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok(
  $$select public.create_itinerary_generation('83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001')$$,
  'P0001','Approved summary is stale.','stale summary rejected'
);
reset role;
update private.room_memory set memory_version=1 where room_id='81000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok(
  $$select public.create_itinerary_generation('83000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000001')$$,
  'P0001','Plan generation not allowed.','readiness blockers reject generation'
);
reset role;
set local role authenticated;
create temporary table created_plan as
  select public.create_itinerary_generation('83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001') payload;
create temporary table duplicate_plan as
  select public.create_itinerary_generation('83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001') payload;
reset role;
grant select on created_plan, duplicate_plan to service_role;

select is((select payload->>'id' from duplicate_plan),(select payload->>'id' from created_plan),'duplicate generation reuses plan');
select is((select count(*) from public.trip_plans where planning_request_id='83000000-0000-4000-8000-000000000001'),1::bigint,'one plan for approved summary version');
select is((select basis_summary_hash from public.trip_plans where id=((select payload->>'id' from created_plan)::uuid)),'approved-hash','approved hash snapshotted');
select is((select version from public.trip_plans where id=((select payload->>'id' from created_plan)::uuid)),1,'first plan is version one');

set local role service_role;
create temporary table first_claim as select public.claim_itinerary_generation(((select payload->>'id' from created_plan)::uuid)) payload;
create temporary table second_claim as select public.claim_itinerary_generation(((select payload->>'id' from created_plan)::uuid)) payload;
reset role;
select ok((select (payload->>'claimed')::boolean from first_claim) and not (select (payload->>'claimed')::boolean from second_claim),'one worker claim wins');

update private.itinerary_runs set created_at=now()-interval '6 minutes' where trip_plan_id=((select payload->>'id' from created_plan)::uuid) and status='running';
set local role service_role;
create temporary table recovery_claim as select public.claim_itinerary_generation(((select payload->>'id' from created_plan)::uuid)) payload;
create temporary table duplicate_recovery_claim as select public.claim_itinerary_generation(((select payload->>'id' from created_plan)::uuid)) payload;
reset role;
select ok((select (payload->>'claimed')::boolean from recovery_claim),'stale worker lease is recovered once');
select ok(not (select (payload->>'claimed')::boolean from duplicate_recovery_claim),'stale worker recovery remains exclusive');

set local role service_role;
select public.record_itinerary_draft(
  ((select payload->>'id' from created_plan)::uuid),
  jsonb_build_object('schemaVersion','1','title','Validated Yosemite','days','[]'::jsonb),
  'resp-1','req-1',100,50,10,0,160,90
);
select throws_ok(
  format('select public.complete_itinerary_publication(%L,%L::jsonb)',(select payload->>'id' from created_plan),'{"schemaVersion":"1"}'),
  'P0001','Publication not allowed.','publication requires a passing report'
);
select public.record_validation_report(
  ((select payload->>'id' from created_plan)::uuid),1,'trailie-itinerary-validator-v1','pass','[]'::jsonb,'[]'::jsonb
);
select public.complete_itinerary_publication(
  ((select payload->>'id' from created_plan)::uuid),
  jsonb_build_object('schemaVersion','1','title','Validated Yosemite','days','[]'::jsonb)
);
reset role;

insert into public.trip_plans(
  id,room_id,planning_request_id,planning_summary_id,version,status,schema_version,prompt_version,model,
  basis_summary_version,basis_summary_hash,created_by_participant_id,created_by_user_id
) values (
  '85000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000002','84000000-0000-4000-8000-000000000002',
  2,'generating','1','trailie-itinerary-v1','gpt-5.6-sol',1,'blocked-fixture','82000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001'
);
set local role service_role;
select public.claim_itinerary_generation('85000000-0000-4000-8000-000000000002');
select public.record_itinerary_draft('85000000-0000-4000-8000-000000000002','{"schemaVersion":"1"}'::jsonb,null,null,0,0,0,0,0,1);
select public.record_validation_report('85000000-0000-4000-8000-000000000002',2,'trailie-itinerary-validator-v1','blocked','[{"code":"hard_constraint","severity":"critical"}]'::jsonb,'[]'::jsonb);
reset role;
select is((select status::text from public.trip_plans where id='85000000-0000-4000-8000-000000000002'),'blocked','blocked validation persists terminal state');
set local role service_role;
select throws_ok(
  $$select public.complete_itinerary_publication('85000000-0000-4000-8000-000000000002','{"schemaVersion":"1"}'::jsonb)$$,
  'P0001','Publication not allowed.','blocked plan cannot publish'
);
reset role;
delete from public.trip_plans where id='85000000-0000-4000-8000-000000000002';
select is((select status::text from public.trip_plans where id=((select payload->>'id' from created_plan)::uuid)),'published','passing plan publishes');
select is((select current_plan_version from public.rooms where id='81000000-0000-4000-8000-000000000001'),1,'room current plan updated once');
select is((select count(*) from public.trip_plan_events where trip_plan_id=((select payload->>'id' from created_plan)::uuid) and event_type='published'),1::bigint,'publication emits one event');
select throws_ok(
  format('update public.trip_plans set itinerary_json=%L where id=%L','{}',(select payload->>'id' from created_plan)),
  'P0001','Published trip plans are immutable.','published plan immutable'
);

select set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select ok(not has_table_privilege('authenticated','public.trip_plans','select'),'browser must use the safe plan projection');
select throws_ok(
  $$select public.get_trip_plan('81000000-0000-4000-8000-000000000001')$$,
  'P0001','Membership required.','outsider cannot query plan projection'
);
reset role;

select set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select ok((public.get_trip_plan('81000000-0000-4000-8000-000000000001')->>'status')='published','member reads safe published plan');
reset role;

select * from finish();
rollback;
