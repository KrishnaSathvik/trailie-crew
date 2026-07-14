begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(46);

select has_table('public','planning_requests','planning requests exist');
select has_table('public','planning_summaries','planning summaries exist');
select has_table('public','planning_approvals','planning approvals exist');
select has_table('private','planning_runs','planning AI runs are private');
select has_function('public','create_planning_request',array['uuid','uuid'],'create RPC exists');
select has_function('public','review_planning_summary',array['uuid','integer','uuid','text','text'],'review RPC exists');
select has_function('public','regenerate_planning_summary',array['uuid','integer','uuid'],'regenerate RPC exists');
select has_function('public','get_planning_request',array['uuid'],'safe query RPC exists');
select has_function('public','claim_planning_summary_generation',array['uuid','text','text','text'],'service claim exists');
select has_function('private','complete_planning_summary',array['uuid','jsonb','text','text','text','text','text','text','text','bigint','bigint','bigint','bigint','bigint','integer'],'private completion exists');
select isnt((select relrowsecurity from pg_class where oid='public.planning_requests'::regclass),false,'request RLS enabled');
select isnt((select relrowsecurity from pg_class where oid='public.planning_summaries'::regclass),false,'summary RLS enabled');
select isnt((select relrowsecurity from pg_class where oid='public.planning_approvals'::regclass),false,'approval RLS enabled');
select ok(not has_table_privilege('authenticated','public.planning_requests','insert'),'browser cannot insert requests');
select ok(not has_table_privilege('authenticated','public.planning_summaries','update'),'browser cannot mutate summaries');
select ok(not has_function_privilege('authenticated','public.claim_planning_summary_generation(uuid,text,text,text)','execute'),'browser cannot claim generation');
select ok(has_function_privilege('service_role','public.claim_planning_summary_generation(uuid,text,text,text)','execute'),'service can claim generation');
select hasnt_column('private','planning_runs','raw_provider_response','raw provider output absent');
select hasnt_column('private','planning_runs','reasoning','hidden reasoning absent');

insert into auth.users(id,instance_id,aud,role,created_at,updated_at,is_anonymous) values
('70000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated',now(),now(),true),
('70000000-0000-4000-8000-000000000002','00000000-0000-0000-8000-000000000000','authenticated','authenticated',now(),now(),true),
('70000000-0000-4000-8000-000000000003','00000000-0000-0000-8000-000000000000','authenticated','authenticated',now(),now(),true);

select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
set local role authenticated;
create temporary table plan_trip as select * from public.create_trip('Approval Trip','Maya',null);
reset role;
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);
set local role authenticated;
create temporary table plan_member as select * from public.join_trip((select invite_token from plan_trip),'Alex');
reset role;

select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok(format('select public.create_planning_request(%L,%L)',(select room_id from plan_trip),(select participant_id from plan_trip)),'P0001','Membership required.','outsider cannot create');
reset role;

select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
set local role authenticated;
create temporary table plan_request as select public.create_planning_request((select room_id from plan_trip),(select participant_id from plan_trip)) payload;
create temporary table plan_request_duplicate as select public.create_planning_request((select room_id from plan_trip),(select participant_id from plan_trip)) payload;
reset role;
grant select on plan_request to service_role;
select is((select payload->>'id' from plan_request_duplicate),(select payload->>'id' from plan_request),'duplicate create is idempotent');
select is((select count(*) from public.planning_requests where room_id=(select room_id from plan_trip)),1::bigint,'one active request per room');
select is((select basis_memory_version from public.planning_requests where id=((select payload->>'id' from plan_request)::uuid)),1,'memory basis captured');

set local role service_role;
create temporary table plan_claim as select public.claim_planning_summary_generation(((select payload->>'id' from plan_request)::uuid),'gpt-5.6-sol','trailie-planning-summary-v1','1') payload;
create temporary table plan_claim_duplicate as select public.claim_planning_summary_generation(((select payload->>'id' from plan_request)::uuid),'gpt-5.6-sol','trailie-planning-summary-v1','1') payload;
select public.complete_planning_summary(((select payload->>'id' from plan_request)::uuid), jsonb_build_object(
  'schemaVersion','1','title','Before I build the trip','tripSnapshot',jsonb_build_object('destinations',jsonb_build_array('Yosemite'),'dateWindows',jsonb_build_array('Sep 12–16'),'travelerCount',2,'origins','[]'::jsonb,'budget','[]'::jsonb,'approvalMode','all_active'),
  'confirmedDecisions','[]'::jsonb,'travelerPreferences','[]'::jsonb,'constraints','[]'::jsonb,'proposals','[]'::jsonb,'rejectedOptions','[]'::jsonb,'conflicts','[]'::jsonb,'openQuestions','[]'::jsonb,'missingCriticalInformation','[]'::jsonb,'nonAssumptions','[]'::jsonb,
  'readiness',jsonb_build_object('status','ready_for_review','blockers','[]'::jsonb,'warnings','[]'::jsonb),
  'evidence',jsonb_build_object('memoryVersion',1,'latestMessageId',null,'sourceMessageIds','[]'::jsonb)
),'ready_for_review','hash-1','resp-1','req-1','gpt-5.6-sol','trailie-planning-summary-v1','1',100,50,10,0,150,80);
reset role;
select is((select payload->>'claimed' from plan_claim),'true','first worker claims');
select is((select payload->>'claimed' from plan_claim_duplicate),'false','duplicate worker does not claim');
select is((select status::text from public.planning_requests where id=((select payload->>'id' from plan_request)::uuid)),'awaiting_review','completion awaits review');
select is((select current_summary_version from public.planning_requests where id=((select payload->>'id' from plan_request)::uuid)),1,'first immutable version stored');
select throws_ok(format('update public.planning_summaries set summary_hash=%L where planning_request_id=%L','changed',(select payload->>'id' from plan_request)),'P0001','Published planning summaries are immutable.','published summary immutable');

select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select throws_ok(format('select public.review_planning_summary(%L,1,%L,%L,null)',(select payload->>'id' from plan_request),(select participant_id from plan_trip),'changes_requested'),'P0001','Changes note required.','changes request requires a note');
select throws_ok(format('select public.review_planning_summary(%L,1,%L,%L,null)',(select payload->>'id' from plan_request),(select participant_id from plan_member),'approved'),'P0001','Membership required.','approval participant identity cannot be spoofed');
create temporary table host_approval as select public.review_planning_summary(((select payload->>'id' from plan_request)::uuid),1,(select participant_id from plan_trip),'approved',null) payload;
reset role;
select is((select payload->>'isComplete' from host_approval),'false','all-active host approval alone insufficient');

select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);
set local role authenticated;
create temporary table member_approval as select public.review_planning_summary(((select payload->>'id' from plan_request)::uuid),1,(select participant_id from plan_member),'approved',null) payload;
reset role;
select is((select payload->>'isComplete' from member_approval),'true','all active participants complete approval');
select is((select status::text from public.planning_requests where id=((select payload->>'id' from plan_request)::uuid)),'approved_for_generation','approved state set exactly after requirement');
select is((select count(*) from public.messages where room_id=(select room_id from plan_trip) and message_type='trailie'),0::bigint,'planning creates no Trailie message');
select ok(to_regclass('public.itineraries') is null,'phase creates no itinerary table');

update public.rooms set approval_mode='host_only' where id=(select room_id from plan_trip);
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
set local role authenticated;
create temporary table host_only_request as select public.create_planning_request((select room_id from plan_trip),(select participant_id from plan_trip)) payload;
reset role;
grant select on host_only_request to service_role;
set local role service_role;
select public.claim_planning_summary_generation(((select payload->>'id' from host_only_request)::uuid),'gpt-5.6-sol','trailie-planning-summary-v1','1');
select public.complete_planning_summary(((select payload->>'id' from host_only_request)::uuid), jsonb_build_object(
  'schemaVersion','1','title','Before I build the trip','tripSnapshot',jsonb_build_object('destinations',jsonb_build_array('Yosemite'),'dateWindows',jsonb_build_array('Sep 12–16'),'travelerCount',2,'origins','[]'::jsonb,'budget','[]'::jsonb,'approvalMode','host_only'),
  'confirmedDecisions','[]'::jsonb,'travelerPreferences','[]'::jsonb,'constraints','[]'::jsonb,'proposals','[]'::jsonb,'rejectedOptions','[]'::jsonb,'conflicts','[]'::jsonb,'openQuestions','[]'::jsonb,'missingCriticalInformation','[]'::jsonb,'nonAssumptions','[]'::jsonb,
  'readiness',jsonb_build_object('status','ready_for_review','blockers','[]'::jsonb,'warnings','[]'::jsonb),
  'evidence',jsonb_build_object('memoryVersion',1,'latestMessageId',null,'sourceMessageIds','[]'::jsonb)
),'ready_for_review','hash-host-only','resp-host-only','req-host-only','gpt-5.6-sol','trailie-planning-summary-v1','1',100,50,10,0,150,80);
reset role;
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
set local role authenticated;
create temporary table host_only_approval as select public.review_planning_summary(((select payload->>'id' from host_only_request)::uuid),1,(select participant_id from plan_trip),'approved',null) payload;
reset role;
select is((select approval_mode::text from public.planning_requests where id=((select payload->>'id' from host_only_request)::uuid)),'host_only','request snapshots host-only approval mode');
select is((select payload->>'isComplete' from host_only_approval),'true','host-only request completes with active host approval');

select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is((select count(*) from public.planning_requests),0::bigint,'outsider cannot read requests');
select is((select count(*) from public.planning_summaries),0::bigint,'outsider cannot read summaries');
select is((select count(*) from public.planning_approvals),0::bigint,'outsider cannot read approvals');
reset role;

select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
set local role authenticated;
create temporary table recovery_messages(kind,payload) as values
('queued',public.send_message((select room_id from plan_trip),(select participant_id from plan_trip),'Queued durable detail','71000000-0000-4000-8000-000000000001',null)),
('running',public.send_message((select room_id from plan_trip),(select participant_id from plan_trip),'Running durable detail','71000000-0000-4000-8000-000000000002',null)),
('completed',public.send_message((select room_id from plan_trip),(select participant_id from plan_trip),'Completed durable detail','71000000-0000-4000-8000-000000000003',null)),
('skipped',public.send_message((select room_id from plan_trip),(select participant_id from plan_trip),'Skipped chatter','71000000-0000-4000-8000-000000000004',null)),
('capped',public.send_message((select room_id from plan_trip),(select participant_id from plan_trip),'Capped durable detail','71000000-0000-4000-8000-000000000005',null));
reset role;
insert into private.message_extractions(room_id,message_id,participant_id,user_id,model,prompt_version,schema_version,status,attempt_count,created_at,started_at,completed_at)
select (select room_id from plan_trip),(payload->>'id')::uuid,(select participant_id from plan_trip),'70000000-0000-4000-8000-000000000001','gpt-5.6-luna','trailie-memory-v1','1',
case kind when 'queued' then 'queued' when 'running' then 'running' when 'completed' then 'completed' when 'skipped' then 'skipped' else 'failed' end,
case kind when 'running' then 1 when 'completed' then 1 when 'skipped' then 0 when 'capped' then 2 else 0 end,
now()-interval '10 minutes',case when kind='running' then now()-interval '10 minutes' else null end,case when kind in ('completed','skipped') then now()-interval '9 minutes' else null end
from recovery_messages;
grant select on recovery_messages to service_role;

select ok((select (payload->>'id')::uuid from recovery_messages where kind='queued') in (select public.list_recoverable_message_extractions(20)),'stale queued extraction is recoverable');
select ok((select (payload->>'id')::uuid from recovery_messages where kind='running') in (select public.list_recoverable_message_extractions(20)),'stale running extraction is recoverable');
select ok(not ((select (payload->>'id')::uuid from recovery_messages where kind='completed') in (select public.list_recoverable_message_extractions(20))),'completed extraction is not recoverable');
select ok(not ((select (payload->>'id')::uuid from recovery_messages where kind='skipped') in (select public.list_recoverable_message_extractions(20))),'skipped extraction is not recoverable');
select ok(not ((select (payload->>'id')::uuid from recovery_messages where kind='capped') in (select public.list_recoverable_message_extractions(20))),'retry cap is enforced');
set local role service_role;
create temporary table recovered_once as select public.claim_message_extraction((select (payload->>'id')::uuid from recovery_messages where kind='running'),'gpt-5.6-luna','trailie-memory-v1','1') payload;
create temporary table recovered_twice as select public.claim_message_extraction((select (payload->>'id')::uuid from recovery_messages where kind='running'),'gpt-5.6-luna','trailie-memory-v1','1') payload;
reset role;
select ok((select (payload->>'claimed')::boolean from recovered_once) and not (select (payload->>'claimed')::boolean from recovered_twice),'concurrent recovery claims stale work once');

select * from finish();
rollback;
