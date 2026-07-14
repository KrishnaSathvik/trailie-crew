begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(54);

select has_table('public','plan_change_requests','change requests exist');
select has_table('public','plan_change_analyses','immutable analyses exist');
select has_table('public','plan_change_approvals','analysis approvals exist');
select has_table('public','plan_change_confirmations','candidate confirmations exist');
select has_table('public','plan_change_events','safe revision events exist');
select has_table('private','plan_change_runs','revision runs are private');
select has_function('public','create_plan_change_request',array['uuid','uuid','text','text','text'],'create change RPC exists');
select has_function('public','review_plan_change',array['uuid','integer','uuid','text','text'],'review RPC exists');
select has_function('public','confirm_plan_change_candidate',array['uuid','uuid','uuid','text','text'],'confirmation RPC exists');
select has_function('public','cancel_plan_change_request',array['uuid','uuid'],'cancel RPC exists');
select has_function('public','get_plan_change_request',array['uuid'],'safe change projection exists');
select has_function('public','list_plan_versions',array['uuid'],'version history RPC exists');
select has_function('public','get_trip_plan_version',array['uuid','integer'],'historical plan RPC exists');
select has_function('public','compare_plan_versions',array['uuid','integer','integer'],'compare RPC exists');
select has_function('public','claim_change_analysis',array['uuid','text','text','text'],'analysis claim exists');
select has_function('public','complete_change_analysis',array['uuid','jsonb','text','text','text','text','text','text'],'analysis completion exists');
select has_function('public','claim_candidate_generation',array['uuid'],'candidate claim exists');
select has_function('public','attach_candidate_trip_plan',array['uuid','jsonb','text','text','text'],'candidate attachment exists');
select has_function('public','complete_plan_change_candidate',array['uuid','jsonb','jsonb'],'candidate completion exists');
select has_function('public','complete_plan_change_publication',array['uuid'],'publication exists');
select isnt((select relrowsecurity from pg_class where oid='public.plan_change_requests'::regclass),false,'request RLS enabled');
select isnt((select relrowsecurity from pg_class where oid='public.plan_change_analyses'::regclass),false,'analysis RLS enabled');
select isnt((select relrowsecurity from pg_class where oid='public.plan_change_approvals'::regclass),false,'approval RLS enabled');
select ok((select relforcerowsecurity from pg_class where oid='private.plan_change_runs'::regclass),'private run RLS forced');
select ok(not has_table_privilege('authenticated','public.plan_change_requests','insert'),'browser cannot insert requests');
select ok(not has_table_privilege('authenticated','public.plan_change_requests','update'),'browser cannot update requests');
select ok(not has_table_privilege('authenticated','public.plan_change_analyses','insert'),'browser cannot insert analyses');
select ok(not has_table_privilege('authenticated','private.plan_change_runs','select'),'browser cannot read runs');
select ok(not has_function_privilege('authenticated','public.claim_change_analysis(uuid,text,text,text)','execute'),'browser cannot claim analysis');
select ok(has_function_privilege('service_role','public.claim_change_analysis(uuid,text,text,text)','execute'),'service can claim analysis');
select hasnt_column('private','plan_change_runs','raw_prompt','raw prompts are absent');
select hasnt_column('private','plan_change_runs','raw_model_output','raw model output is absent');
select hasnt_column('public','plan_change_analyses','provider_response_id','provider IDs are private');

insert into auth.users(id,instance_id,aud,role,created_at,updated_at,is_anonymous) values
('90000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated',now(),now(),true),
('90000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated',now(),now(),true),
('90000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated',now(),now(),true);
insert into public.rooms(id,name,room_code,host_user_id,status,approval_mode,current_plan_version) values
('91000000-0000-4000-8000-000000000001','Revision Trip','REVJ4A22','90000000-0000-4000-8000-000000000001','active','all_active',1);
insert into public.participants(id,room_id,user_id,display_name,role,status) values
('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','Maya','host','active'),
('92000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000002','Alex','member','active');
insert into public.planning_requests(id,room_id,requested_by_participant_id,requested_by_user_id,status,approval_mode,current_summary_version,approved_summary_version,basis_memory_version,basis_participant_ids,basis_membership_fingerprint,idempotency_key,approved_at)
values('93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','approved_for_generation','all_active',1,1,1,array['92000000-0000-4000-8000-000000000001'::uuid,'92000000-0000-4000-8000-000000000002'::uuid],encode(digest('members','sha256'),'hex'),'phase-4a-basis',now());
insert into public.planning_summaries(id,planning_request_id,room_id,version,schema_version,prompt_version,model,summary_json,readiness_status,summary_hash,basis_memory_version,basis_participant_ids,basis_membership_fingerprint)
values('94000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',1,'1','trailie-planning-summary-v1','gpt-5.6-sol','{"schemaVersion":"1","title":"Before I build the trip"}'::jsonb,'ready_for_review','summary-hash',1,array['92000000-0000-4000-8000-000000000001'::uuid,'92000000-0000-4000-8000-000000000002'::uuid],encode(digest('members','sha256'),'hex'));
insert into public.trip_plans(id,room_id,planning_request_id,planning_summary_id,version,status,schema_version,prompt_version,model,itinerary_json,validation_status,validation_summary,basis_summary_version,basis_summary_hash,created_by_participant_id,created_by_user_id,published_at)
values('95000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001',1,'published','1','trailie-itinerary-v1','gpt-5.6-sol',
'{"schemaVersion":"1","title":"Yosemite","destinationSummary":"Yosemite Valley","startDate":"2026-09-12","endDate":"2026-09-13","days":[{"id":"day:2026-09-12","date":"2026-09-12","items":[{"id":"item:sunset","title":"Glacier Point sunset","startTime":"17:30","endTime":"19:00"}],"travelSegments":[]}]}'::jsonb,
'pass','{"status":"pass","validatorVersion":"trailie-itinerary-validator-v1"}'::jsonb,1,'summary-hash','92000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001',now());

select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
select throws_ok($$select public.create_plan_change_request('95000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','move_item','item:sunset','Move it later')$$,'P0001','Authentication required.','unauthenticated request rejected');
reset role;

select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok($$select public.create_plan_change_request('95000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','move_item','item:sunset','Move it later')$$,'P0001','Membership required.','outsider and spoofed participant rejected');
reset role;

select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select throws_ok($$select public.create_plan_change_request('95000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','move_item','item:missing','Move it later')$$,'P0001','Target item not found.','target mismatch rejected');
create temporary table revision_request as select public.create_plan_change_request('95000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','move_item','item:sunset','Move it later') payload;
create temporary table duplicate_revision as select public.create_plan_change_request('95000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','move_item','item:sunset','  Move it later  ') payload;
reset role;
grant select on revision_request to service_role;
select is((select payload->>'id' from duplicate_revision),(select payload->>'id' from revision_request),'duplicate normalized request reused');

set local role service_role;
create temporary table analysis_claim as select public.claim_change_analysis(((select payload->>'id' from revision_request)::uuid),'gpt-5.6-terra','trailie-change-analysis-v1','1') payload;
create temporary table duplicate_claim as select public.claim_change_analysis(((select payload->>'id' from revision_request)::uuid),'gpt-5.6-terra','trailie-change-analysis-v1','1') payload;
reset role;
select ok((select (payload->>'claimed')::boolean from analysis_claim) and not (select (payload->>'claimed')::boolean from duplicate_claim),'one analysis claim wins');

set local role service_role;
select public.complete_change_analysis(((select payload->>'id' from revision_request)::uuid),
'{"schemaVersion":"1","title":"Move sunset later","requestSummary":"Move the sunset stop later.","requestedChange":{"type":"move_item","targetItemIds":["item:sunset"],"normalizedInstruction":"Move it later"},"affectedDays":["2026-09-12"],"affectedItems":[{"itemId":"item:sunset","dayId":"day:2026-09-12","summary":"Sunset moves later","direct":true}],"impacts":{"schedule":["Later time"],"routes":["Refresh inbound route"],"budget":[],"reservations":[],"lodging":[],"food":[],"travelerConstraints":[],"confirmedDecisions":[]},"proposedApproach":["Shift timing"],"preservedItems":["Other days"],"risks":[],"missingInformation":[],"materiality":"material","feasibility":"feasible","blockers":[],"approvalSummary":"All active members approve"}'::jsonb,
'material','feasible','analysis-hash','gpt-5.6-terra','trailie-change-analysis-v1','1');
reset role;
select throws_ok(format('update public.plan_change_analyses set analysis_json=%L where change_request_id=%L','{}',(select payload->>'id' from revision_request)),'P0001','Published change analyses are immutable.','analysis immutable');

select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.review_plan_change(((select payload->>'id' from revision_request)::uuid),1,'92000000-0000-4000-8000-000000000001','approved',null);
reset role;
select is((select status::text from public.plan_change_requests where id=((select payload->>'id' from revision_request)::uuid)),'awaiting_review','all-active one approval is insufficient');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select public.review_plan_change(((select payload->>'id' from revision_request)::uuid),1,'92000000-0000-4000-8000-000000000002','approved',null);
reset role;
select is((select status::text from public.plan_change_requests where id=((select payload->>'id' from revision_request)::uuid)),'approved','all-active completes deterministically');

set local role service_role;
select ok((public.claim_candidate_generation(((select payload->>'id' from revision_request)::uuid))->>'claimed')::boolean,'approved request claims candidate generation');
create temporary table attached_candidate as select public.attach_candidate_trip_plan(((select payload->>'id' from revision_request)::uuid),
'{"schemaVersion":"1","title":"Yosemite","destinationSummary":"Yosemite Valley","startDate":"2026-09-12","endDate":"2026-09-13","days":[{"id":"day:2026-09-12","date":"2026-09-12","items":[{"id":"item:sunset","title":"Glacier Point sunset","startTime":"18:00","endTime":"19:30"}],"travelSegments":[]}]}'::jsonb,
'gpt-5.6-sol','trailie-itinerary-revision-v1','1');
select public.record_validation_report(((select attach_candidate_trip_plan->>'id' from attached_candidate)::uuid),2,'trailie-itinerary-validator-v1','pass','[]'::jsonb,'[]'::jsonb);
select public.complete_plan_change_candidate(((select payload->>'id' from revision_request)::uuid),'{"validatorVersion":"trailie-change-boundary-v1","status":"pass","issues":[]}'::jsonb,'{"schemaVersion":"1","baseVersion":1,"candidateVersion":2,"summary":"One item moved","changedDays":["2026-09-12"],"items":[],"routeChanges":[],"budgetDelta":null,"warningsAdded":[],"warningsResolved":[]}'::jsonb);
reset role;
select is((select status::text from public.plan_change_requests where id=((select payload->>'id' from revision_request)::uuid)),'awaiting_confirmation','passing candidate awaits final confirmation');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((public.get_trip_plan('91000000-0000-4000-8000-000000000001')->>'version')::integer,1,'unpublished revision candidate never replaces current plan projection');
reset role;

set local role service_role;
select throws_ok(format('select public.complete_plan_change_publication(%L)',(select payload->>'id' from revision_request)),'P0001','Candidate confirmation required.','publication requires confirmation');
reset role;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.confirm_plan_change_candidate(((select payload->>'id' from revision_request)::uuid),(select candidate_trip_plan_id from public.plan_change_requests where id=((select payload->>'id' from revision_request)::uuid)),'92000000-0000-4000-8000-000000000001','confirmed',null);
reset role;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select public.confirm_plan_change_candidate(((select payload->>'id' from revision_request)::uuid),(select candidate_trip_plan_id from public.plan_change_requests where id=((select payload->>'id' from revision_request)::uuid)),'92000000-0000-4000-8000-000000000002','confirmed',null);
reset role;
set local role service_role;
select is((select count(*) from public.list_recoverable_plan_change_publications(10) id where id=((select payload->>'id' from revision_request)::uuid)),1::bigint,'completed confirmations expose an interrupted publication for recovery');
select public.complete_plan_change_publication(((select payload->>'id' from revision_request)::uuid));
select public.complete_plan_change_publication(((select payload->>'id' from revision_request)::uuid));
reset role;
select is((select current_plan_version from public.rooms where id='91000000-0000-4000-8000-000000000001'),2,'current version advances once');
select is((select count(*) from public.trip_plans where room_id='91000000-0000-4000-8000-000000000001' and version=2),1::bigint,'one next version only');
select is((select status::text from public.trip_plans where id='95000000-0000-4000-8000-000000000001'),'published','Version 1 remains immutable and readable');

select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select throws_ok($$select public.create_plan_change_request('95000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','move_item','item:sunset','Move it again')$$,'P0001','Base plan is not current.','stale Version 1 request cannot start after Version 2');
reset role;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok($$select public.list_plan_versions('91000000-0000-4000-8000-000000000001')$$,'P0001','Membership required.','outsider cannot read version history');
reset role;

select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(jsonb_array_length(public.list_plan_versions('91000000-0000-4000-8000-000000000001')),2,'member sees two historical versions');
select is(public.get_trip_plan_version('91000000-0000-4000-8000-000000000001',1)->>'version','1','member reads Version 1');
select is(public.compare_plan_versions('91000000-0000-4000-8000-000000000001',1,2)->>'candidateVersion','2','compare projection identifies Version 2');
reset role;

select * from finish();
rollback;
