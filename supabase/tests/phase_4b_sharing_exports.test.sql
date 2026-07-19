begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(60);

select has_type('public','plan_share_mode','share mode enum exists');
select has_type('public','plan_share_status','share status enum exists');
select has_table('public','plan_share_links','share link audit table exists');
select has_function('public','create_plan_share_link',array['uuid','uuid','text','text','text','timestamp with time zone'],'host create/rotate RPC exists');
select has_function('public','revoke_plan_share_link',array['uuid','uuid'],'host revoke RPC exists');
select has_function('public','get_plan_share_status',array['uuid','integer'],'safe member status RPC exists');
select has_function('public','verify_plan_share_token_hash',array['text'],'server-only verification RPC exists');
select has_function('private','ensure_trip_plan_hash',array[]::text[],'plan hash maintenance function exists');
select has_trigger('public','trip_plans','trip_plans_ensure_hash','newly published initial plans receive immutable hashes');
select has_table('private','plan_export_rate_events','private export rate ledger exists');
select has_function('public','authorize_plan_export',array['uuid','integer','text'],'exact-version export authorization exists');
select ok(not has_table_privilege('authenticated','private.plan_export_rate_events','select'),'browser cannot read export rate events');
select isnt((select relrowsecurity from pg_class where oid='public.plan_share_links'::regclass),false,'share link RLS enabled');
select ok(not has_table_privilege('anon','public.plan_share_links','select'),'anonymous cannot read share table');
select ok(not has_table_privilege('authenticated','public.plan_share_links','select'),'members cannot read token hashes or snapshots directly');
select ok(not has_table_privilege('authenticated','public.plan_share_links','insert'),'browser cannot directly insert links');
select ok(not has_table_privilege('authenticated','public.plan_share_links','update'),'browser cannot directly update links');
select ok(has_function_privilege('authenticated','public.create_plan_share_link(uuid,uuid,text,text,text,timestamp with time zone)','execute'),'authenticated server action can invoke host workflow');
select ok(not has_function_privilege('anon','public.verify_plan_share_token_hash(text)','execute'),'anonymous cannot invoke token verifier directly');
select ok(not has_function_privilege('authenticated','public.verify_plan_share_token_hash(text)','execute'),'authenticated browser cannot invoke token verifier directly');
select ok(has_function_privilege('service_role','public.verify_plan_share_token_hash(text)','execute'),'server secret role can invoke narrow verifier');
select hasnt_column('public','plan_share_links','raw_token','raw token is never stored');
select hasnt_column('public','plan_share_links','public_url','token-bearing URL is never stored');

insert into auth.users(id,instance_id,aud,role,created_at,updated_at,is_anonymous) values
('a0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated',now(),now(),true),
('a0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated',now(),now(),true),
('a0000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated',now(),now(),true),
('a0000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated',now(),now(),true);
insert into public.rooms(id,name,room_code,host_user_id,status,approval_mode,current_plan_version) values
('a1000000-0000-4000-8000-000000000001','Share Trip','SHAR4B22','a0000000-0000-4000-8000-000000000001','active','all_active',2),
('a1000000-0000-4000-8000-000000000002','Other Trip','PTHR4B22','a0000000-0000-4000-8000-000000000004','active','host_only',null);
insert into public.participants(id,room_id,user_id,display_name,role,status) values
('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','Maya','host','active'),
('a2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','Alex','member','active'),
('a2000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000003','Former host','host','left'),
('a2000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000004','Other host','host','active');
insert into public.planning_requests(id,room_id,requested_by_participant_id,requested_by_user_id,status,approval_mode,current_summary_version,approved_summary_version,basis_memory_version,basis_participant_ids,basis_membership_fingerprint,idempotency_key,approved_at)
values('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','approved_for_generation','all_active',1,1,1,array['a2000000-0000-4000-8000-000000000001'::uuid],'members','phase-4b-basis',now());
insert into public.planning_summaries(id,planning_request_id,room_id,version,schema_version,prompt_version,model,summary_json,readiness_status,summary_hash,basis_memory_version,basis_participant_ids,basis_membership_fingerprint)
values('a4000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',1,'1','planning-v1','model-private','{"schemaVersion":"1","title":"Before I build the trip"}'::jsonb,'ready_for_review','summary-hash',1,array['a2000000-0000-4000-8000-000000000001'::uuid],'members');

insert into public.trip_plans(id,room_id,planning_request_id,planning_summary_id,version,status,schema_version,prompt_version,model,itinerary_json,validation_status,validation_summary,basis_summary_version,basis_summary_hash,created_by_participant_id,created_by_user_id,published_at,plan_hash) values
('a5000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001',1,'published','1','itinerary-v1','model-private',
'{"schemaVersion":"1","title":"Yosemite Version One","destinationSummary":"Yosemite Valley","timezone":"America/Los_Angeles","startDate":"2026-09-12","endDate":"2026-09-13","travelers":[{"id":"traveler:maya","displayName":"Maya","origin":"123 Private Street","accessibilityNotes":["Maya has a mobility constraint"],"dietaryNotes":["Alex is vegetarian"]}],"arrivals":[],"departures":[],"lodging":[{"id":"stay:1","name":"Valley Lodge","area":"Yosemite Valley","checkInDate":"2026-09-12","checkOutDate":"2026-09-13","location":{"name":"Yosemite Valley","address":"Exact private address","latitude":37.7,"longitude":-119.6,"timezone":"America/Los_Angeles","verificationStatus":"verified"},"reservation":{"status":"required","details":"Confirmation ABC123","evidenceRefs":["evidence:secret"]},"cost":{"amount":400,"currency":"USD","status":"estimated"},"evidenceRefs":["evidence:secret"],"notes":["Maya requested this"]}],"days":[{"id":"day:one","date":"2026-09-12","title":"Arrival","summary":"Accessible pacing with vegetarian-friendly dining.","items":[{"id":"item:v1","type":"activity","startTime":"17:30","endTime":"19:00","title":"Glacier Point sunset","description":"Watch sunset.","location":{"name":"Maya home","address":"Exact address","latitude":37.7,"longitude":-119.5,"timezone":"America/Los_Angeles","verificationStatus":"verified"},"reservation":{"status":"recommended","details":"Reserve ahead","evidenceRefs":["evidence:secret"]},"cost":{"amount":null,"currency":null,"status":"unknown"},"evidenceRefs":["evidence:secret"],"notes":["Private traveler note"]}],"travelSegments":[],"estimatedDailyCost":{"amount":5000,"currency":"USD","status":"estimated"},"warnings":["Road timing can change"]}],"restaurants":[],"unresolvedItems":[],"assumptions":[],"validationMetadata":{"validatorVersion":"validator-private","validatedAt":"2026-07-14T00:00:00Z"}}'::jsonb,
'pass','{"status":"pass","validatorVersion":"validator-private","issues":[{"providerRequestId":"secret"}]}'::jsonb,1,'summary-hash','a2000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','2026-07-14T00:00:00Z','plan-hash-v1'),
('a5000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001',2,'published','1','itinerary-v2','model-private',
'{"schemaVersion":"1","title":"Yosemite Version Two","destinationSummary":"Yosemite Valley","timezone":"America/Los_Angeles","startDate":"2026-09-12","endDate":"2026-09-13","travelers":[],"arrivals":[],"departures":[],"lodging":[],"days":[{"id":"day:two","date":"2026-09-12","title":"Revision","summary":"A revised day.","items":[{"id":"item:v2","type":"activity","startTime":"18:00","endTime":"19:30","title":"Later sunset","description":"Version two only.","location":null,"reservation":{"status":"unknown","details":null,"evidenceRefs":[]},"cost":{"amount":null,"currency":null,"status":"unknown"},"evidenceRefs":[],"notes":[]}],"travelSegments":[],"estimatedDailyCost":{"amount":null,"currency":null,"status":"unknown"},"warnings":[]}],"restaurants":[],"unresolvedItems":[],"assumptions":[],"validationMetadata":{"validatorVersion":"validator-private","validatedAt":"2026-07-14T01:00:00Z"}}'::jsonb,
'pass','{"status":"pass","validatorVersion":"validator-private"}'::jsonb,1,'summary-hash','a2000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','2026-07-14T01:00:00Z','plan-hash-v2'),
('a5000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001',3,'validating','1','itinerary-v3','model-private','{}'::jsonb,'pending',null,1,'summary-hash','a2000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',null,'plan-hash-v3');

select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
select throws_ok($$select public.authorize_plan_export('a1000000-0000-4000-8000-000000000001',1,'calendar')$$,'P0001','Authentication required.','unauthenticated export rejected');
reset role;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(public.authorize_plan_export('a1000000-0000-4000-8000-000000000001',1,'calendar'),true,'active member may export an exact published version');
select throws_ok($$select public.authorize_plan_export('a1000000-0000-4000-8000-000000000001',3,'calendar')$$,'P0001','Export not allowed.','unpublished export rejected');
reset role;
insert into private.plan_export_rate_events(room_id,trip_plan_id,plan_version,export_type,requested_by_user_id)
select 'a1000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001',1,'calendar','a0000000-0000-4000-8000-000000000001' from generate_series(1,29);
set local role authenticated;
select throws_ok($$select public.authorize_plan_export('a1000000-0000-4000-8000-000000000001',1,'calendar')$$,'P0001','Rate limited.','calendar export rate is bounded per user and room');
reset role;

select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
select throws_ok($$select public.create_plan_share_link('a5000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','public_link',repeat('a',64),'tokenAAA',null)$$,'P0001','Authentication required.','unauthenticated share creation rejected');
reset role;

select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok($$select public.create_plan_share_link('a5000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000003','public_link',repeat('b',64),'tokenBBB',null)$$,'P0001','Host required.','inactive host rejected');
reset role;

select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok($$select public.create_plan_share_link('a5000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002','public_link',repeat('c',64),'tokenCCC',null)$$,'P0001','Host required.','non-host rejected');
select throws_ok($$select public.create_plan_share_link('a5000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','public_link',repeat('c',64),'tokenCCC',null)$$,'P0001','Host required.','spoofed host participant rejected');
reset role;

select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select throws_ok($$select public.create_plan_share_link('a5000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000004','public_link',repeat('d',64),'tokenDDD',null)$$,'P0001','Host required.','cross-room host rejected');
reset role;

select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select throws_ok($$select public.create_plan_share_link('a5000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000001','public_link',repeat('e',64),'tokenEEE',null)$$,'P0001','Plan not published.','unpublished candidate rejected');
select throws_ok($$select public.create_plan_share_link('a5000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','expiring_link',repeat('f',64),'tokenFFF',now()-interval '1 minute')$$,'P0001','Invalid expiration.','past expiration rejected');
create temporary table first_share as select public.create_plan_share_link('a5000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','public_link',repeat('1',64),'token111',null) payload;
reset role;

select is((select count(*) from public.plan_share_links where trip_plan_id='a5000000-0000-4000-8000-000000000001' and status='active'),1::bigint,'historical published Version 1 can be shared');
select is((select plan_version from public.plan_share_links where id=((select payload->>'id' from first_share)::uuid)),1,'share permanently records Version 1');
select is((select snapshot_hash from public.plan_share_links where id=((select payload->>'id' from first_share)::uuid)),encode(digest((select public_snapshot::text from public.plan_share_links where id=((select payload->>'id' from first_share)::uuid)),'sha256'),'hex'),'snapshot hash is deterministic');
select ok((select public_snapshot ? 'version' and not public_snapshot ? 'travelers' and public_snapshot->'days'->0->'items'->0->>'reservationStatus'='recommended' from public.plan_share_links where id=((select payload->>'id' from first_share)::uuid)),'public snapshot retains version, public reservation state, and removes travelers');
select ok((select public_snapshot::text !~* 'Maya|Alex|Private Street|ABC123|evidence:secret|model-private|validator-private' from public.plan_share_links where id=((select payload->>'id' from first_share)::uuid)),'public snapshot excludes identities and private metadata');

set local role service_role;
create temporary table valid_verification as select public.verify_plan_share_token_hash(repeat('1',64)) payload;
create temporary table valid_map_source as select public.get_public_plan_map_projection_source(repeat('1',64)) payload;
reset role;
select is((select payload->'itinerary'->>'version' from valid_verification),'1','valid token returns pinned Version 1 while room current is Version 2');
select is((select payload->'itinerary'->>'title' from valid_verification),'Yosemite Version One','Version 1 token never resolves latest Version 2');
select is((select payload->>'planVersion' from valid_map_source),'1','public map source remains pinned to shared Version 1');

select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(public.get_plan_share_status('a5000000-0000-4000-8000-000000000001',1)->>'status','active','active member reads safe link status');
select ok(not (public.get_plan_share_status('a5000000-0000-4000-8000-000000000001',1) ? 'tokenHash'),'safe status omits token hash');
select throws_ok(format('update public.plan_share_links set status=''revoked'' where id=%L',(select payload->>'id' from first_share)),'42501',null,'direct browser DML denied');
reset role;

select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
set local role authenticated;
create temporary table rotated_share as select public.create_plan_share_link('a5000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','public_link',repeat('2',64),'token222',null) payload;
reset role;
select is((select status::text from public.plan_share_links where id=((select payload->>'id' from first_share)::uuid)),'revoked','rotation revokes prior Version 1 link');
select is((select count(*) from public.plan_share_links where trip_plan_id='a5000000-0000-4000-8000-000000000001' and status='active'),1::bigint,'one active link per version after rotation');
select isnt((select payload->>'id' from rotated_share),(select payload->>'id' from first_share),'rotation preserves prior audit row and creates a new row');

set local role service_role;
select is(public.verify_plan_share_token_hash(repeat('1',64)),null,'rotated old token is unavailable immediately');
select is(public.get_public_plan_map_projection_source(repeat('1',64)),null,'rotated old token cannot load a map source');
select is(public.verify_plan_share_token_hash(repeat('2',64))->'itinerary'->>'version','1','new rotated token works');
reset role;

select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.revoke_plan_share_link(((select payload->>'id' from rotated_share)::uuid),'a2000000-0000-4000-8000-000000000001');
select public.revoke_plan_share_link(((select payload->>'id' from rotated_share)::uuid),'a2000000-0000-4000-8000-000000000001');
create temporary table expiring_share as select public.create_plan_share_link('a5000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000001','expiring_link',repeat('3',64),'token333',now()+interval '1 hour') payload;
reset role;
select is((select status::text from public.plan_share_links where id=((select payload->>'id' from rotated_share)::uuid)),'revoked','revoke is idempotent');
select is((select mode::text from public.plan_share_links where id=((select payload->>'id' from expiring_share)::uuid)),'expiring_link','expiring mode is persisted');
set local role service_role;
select is(public.get_public_plan_map_projection_source(repeat('2',64)),null,'revoked share cannot load its map projection source');
reset role;

update public.plan_share_links set expires_at=now()-interval '1 second' where id=((select payload->>'id' from expiring_share)::uuid);
set local role service_role;
select is(public.verify_plan_share_token_hash(repeat('3',64)),null,'expired token rejected');
reset role;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(public.get_plan_share_status('a5000000-0000-4000-8000-000000000002',2)->>'status','expired','expiration state is deterministic');
reset role;

update public.plan_share_links set expires_at=now()+interval '1 hour',snapshot_hash=repeat('0',64) where id=((select payload->>'id' from expiring_share)::uuid);
set local role service_role;
select is(public.verify_plan_share_token_hash(repeat('3',64)),null,'snapshot hash mismatch fails closed');
select is(public.verify_plan_share_token_hash(repeat('9',64)),null,'unknown token is generically unavailable');
reset role;

select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok($$select public.get_plan_share_status('a5000000-0000-4000-8000-000000000001',1)$$,'P0001','Membership required.','inactive outsider cannot read share status');
reset role;

select throws_ok($$insert into public.plan_share_links(room_id,trip_plan_id,plan_version,mode,status,token_hash,snapshot_plan_hash,snapshot_hash,public_snapshot,created_by_participant_id,created_by_user_id) values('a1000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001',1,'public_link','active',repeat('2',64),'plan-hash-v1',repeat('4',64),'{}','a2000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001')$$,'23505',null,'token hash uniqueness enforced');

select * from finish();
rollback;
