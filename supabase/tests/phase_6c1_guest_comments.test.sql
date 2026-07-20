begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_type('public','guest_role','guest role enum exists');
select has_table('private','guest_invites','guest invites are private');
select has_table('private','guest_sessions','guest sessions are private');
select has_table('private','plan_comments','plan comments are private');
select has_function('public','create_guest_invite',array['uuid','uuid','text','text','text','timestamp with time zone','integer'],'host invite creation RPC exists');
select has_function('public','rotate_guest_invite',array['uuid','uuid','text','text'],'atomic host invite rotation RPC exists');
select has_function('public','list_guest_invites',array['uuid','integer'],'member-safe invite list RPC exists');
select has_function('public','revoke_guest_invite',array['uuid','uuid'],'host invite revocation RPC exists');
select has_function('public','verify_guest_invite_token_hash',array['text'],'service-only invite verification RPC exists');
select has_function('public','create_guest_session',array['text','text','text'],'service-only session creation RPC exists');
select has_function('public','get_guest_session_context',array['text'],'service-only exact-version context RPC exists');
select has_function('public','create_guest_plan_comment',array['text','text','text','text'],'guest comment creation RPC exists');
select has_function('public','update_guest_plan_comment',array['text','uuid','text'],'guest comment update RPC exists');
select has_function('public','delete_guest_plan_comment',array['text','uuid'],'guest comment deletion RPC exists');
select has_function('public','list_member_plan_comments',array['uuid','integer'],'member comment list RPC exists');
select has_function('public','create_member_plan_comment',array['uuid','integer','uuid','text','text','text'],'member comment creation RPC exists');
select has_function('public','resolve_plan_comment',array['uuid','uuid'],'member resolution RPC exists');

select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid='private.guest_invites'::regclass),
  'guest invites force RLS'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid='private.guest_sessions'::regclass),
  'guest sessions force RLS'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid='private.plan_comments'::regclass),
  'plan comments force RLS'
);
select ok(not has_table_privilege('anon','private.guest_invites','select'),'anonymous browser cannot read invite hashes');
select ok(not has_table_privilege('authenticated','private.guest_invites','select'),'member browser cannot read invite hashes');
select ok(not has_table_privilege('service_role','private.guest_invites','select'),'service role cannot select private invites directly');
select ok(not has_table_privilege('anon','private.guest_sessions','select'),'anonymous browser cannot read guest sessions');
select ok(not has_table_privilege('authenticated','private.guest_sessions','select'),'member browser cannot read guest sessions');
select ok(not has_table_privilege('anon','private.plan_comments','select'),'anonymous browser cannot read comments directly');
select ok(not has_table_privilege('authenticated','private.plan_comments','select'),'member browser cannot read comments directly');
select hasnt_column('private','guest_invites','token','raw invite token is never stored');
select hasnt_column('private','guest_invites','raw_token','raw invite token is never stored');
select hasnt_column('private','guest_sessions','token','raw guest session token is never stored');
select ok(not has_function_privilege('anon','public.verify_guest_invite_token_hash(text)','execute'),'anonymous cannot invoke invite verification');
select ok(not has_function_privilege('authenticated','public.verify_guest_invite_token_hash(text)','execute'),'member browser cannot invoke invite verification');
select ok(has_function_privilege('service_role','public.verify_guest_invite_token_hash(text)','execute'),'server can invoke invite verification');
select ok(not has_function_privilege('anon','public.create_guest_session(text,text,text)','execute'),'anonymous cannot create sessions directly');
select ok(not has_function_privilege('authenticated','public.create_guest_session(text,text,text)','execute'),'member browser cannot create sessions directly');
select ok(has_function_privilege('service_role','public.create_guest_session(text,text,text)','execute'),'server can create scoped sessions');
select ok(not has_function_privilege('service_role','public.resolve_plan_comment(uuid,uuid)','execute'),'guest service path cannot resolve comments');

insert into auth.users(id,instance_id,aud,role,created_at,updated_at,is_anonymous) values
('c6100000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated',now(),now(),true),
('c6100000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated',now(),now(),true),
('c6100000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated',now(),now(),true);

insert into public.rooms(id,name,room_code,host_user_id,status,approval_mode,current_plan_version) values
('c6110000-0000-4000-8000-000000000001','Guest comments trip','GUESTC22','c6100000-0000-4000-8000-000000000001','active','all_active',2),
('c6110000-0000-4000-8000-000000000002','Other private trip','PTHRC622','c6100000-0000-4000-8000-000000000003','active','host_only',1);

insert into public.participants(id,room_id,user_id,display_name,role,status) values
('c6120000-0000-4000-8000-000000000001','c6110000-0000-4000-8000-000000000001','c6100000-0000-4000-8000-000000000001','Maya','host','active'),
('c6120000-0000-4000-8000-000000000002','c6110000-0000-4000-8000-000000000001','c6100000-0000-4000-8000-000000000002','Alex','member','active'),
('c6120000-0000-4000-8000-000000000003','c6110000-0000-4000-8000-000000000002','c6100000-0000-4000-8000-000000000003','Other host','host','active');

insert into public.planning_requests(
  id,room_id,requested_by_participant_id,requested_by_user_id,status,approval_mode,
  current_summary_version,approved_summary_version,basis_memory_version,
  basis_participant_ids,basis_membership_fingerprint,idempotency_key,approved_at
) values
('c6130000-0000-4000-8000-000000000001','c6110000-0000-4000-8000-000000000001','c6120000-0000-4000-8000-000000000001','c6100000-0000-4000-8000-000000000001','approved_for_generation','all_active',1,1,1,array['c6120000-0000-4000-8000-000000000001'::uuid],'members-one','phase-6c1-one',now()),
('c6130000-0000-4000-8000-000000000002','c6110000-0000-4000-8000-000000000002','c6120000-0000-4000-8000-000000000003','c6100000-0000-4000-8000-000000000003','approved_for_generation','host_only',1,1,1,array['c6120000-0000-4000-8000-000000000003'::uuid],'members-two','phase-6c1-two',now());

insert into public.planning_summaries(
  id,planning_request_id,room_id,version,schema_version,prompt_version,model,
  summary_json,readiness_status,summary_hash,basis_memory_version,
  basis_participant_ids,basis_membership_fingerprint
) values
('c6140000-0000-4000-8000-000000000001','c6130000-0000-4000-8000-000000000001','c6110000-0000-4000-8000-000000000001',1,'1','planning-v1','model-private','{"schemaVersion":"1","title":"Guest comments"}','ready_for_review','summary-one',1,array['c6120000-0000-4000-8000-000000000001'::uuid],'members-one'),
('c6140000-0000-4000-8000-000000000002','c6130000-0000-4000-8000-000000000002','c6110000-0000-4000-8000-000000000002',1,'1','planning-v1','model-private','{"schemaVersion":"1","title":"Other trip"}','ready_for_review','summary-two',1,array['c6120000-0000-4000-8000-000000000003'::uuid],'members-two');

insert into public.trip_plans(
  id,room_id,planning_request_id,planning_summary_id,version,status,schema_version,
  prompt_version,model,itinerary_json,validation_status,validation_summary,
  basis_summary_version,basis_summary_hash,created_by_participant_id,
  created_by_user_id,published_at,plan_hash
) values
('c6150000-0000-4000-8000-000000000001','c6110000-0000-4000-8000-000000000001','c6130000-0000-4000-8000-000000000001','c6140000-0000-4000-8000-000000000001',1,'published','1','itinerary-v1','model-private',
'{"schemaVersion":"1","title":"Yosemite Version One","destinationSummary":"Yosemite Valley","timezone":"America/Los_Angeles","startDate":"2026-09-12","endDate":"2026-09-13","travelers":[],"arrivals":[],"departures":[],"lodging":[{"id":"stay:private","name":"Valley Lodge","area":"Yosemite Valley","checkInDate":"2026-09-12","checkOutDate":"2026-09-13","location":{"name":"Private lodge","address":"Exact private address","latitude":37.7,"longitude":-119.6,"timezone":"America/Los_Angeles","verificationStatus":"verified"},"reservation":{"status":"required","details":"Confirmation ABC123","evidenceRefs":[]},"cost":{"amount":400,"currency":"USD","status":"estimated"},"evidenceRefs":[],"notes":[]}],"days":[{"id":"day:v1","date":"2026-09-12","title":"Arrival","summary":"A private-safe day.","items":[{"id":"item:v1","type":"activity","startTime":"17:30","endTime":"19:00","title":"Glacier Point sunset","description":"Watch sunset.","location":{"name":"Glacier Point","address":"Private pickup","latitude":37.7,"longitude":-119.5,"timezone":"America/Los_Angeles","verificationStatus":"verified"},"reservation":{"status":"recommended","details":null,"evidenceRefs":[]},"cost":{"amount":null,"currency":null,"status":"unknown"},"evidenceRefs":[],"notes":[]}],"travelSegments":[],"estimatedDailyCost":{"amount":null,"currency":null,"status":"unknown"},"warnings":[]}],"restaurants":[],"unresolvedItems":[],"assumptions":[],"validationMetadata":{"validatorVersion":"private","validatedAt":"2026-07-19T00:00:00Z"}}',
'pass','{"status":"pass"}',1,'summary-one','c6120000-0000-4000-8000-000000000001','c6100000-0000-4000-8000-000000000001','2026-07-19T00:00:00Z','plan-hash-v1'),
('c6150000-0000-4000-8000-000000000002','c6110000-0000-4000-8000-000000000001','c6130000-0000-4000-8000-000000000001','c6140000-0000-4000-8000-000000000001',2,'published','1','itinerary-v2','model-private',
'{"schemaVersion":"1","title":"Yosemite Version Two","destinationSummary":"Yosemite Valley","timezone":"America/Los_Angeles","startDate":"2026-09-12","endDate":"2026-09-13","travelers":[],"arrivals":[],"departures":[],"lodging":[],"days":[{"id":"day:v2","date":"2026-09-12","title":"Revised arrival","summary":"Version two.","items":[{"id":"item:v2","type":"activity","startTime":"18:30","endTime":"20:00","title":"Later sunset","description":"Version two only.","location":null,"reservation":{"status":"unknown","details":null,"evidenceRefs":[]},"cost":{"amount":null,"currency":null,"status":"unknown"},"evidenceRefs":[],"notes":[]}],"travelSegments":[],"estimatedDailyCost":{"amount":null,"currency":null,"status":"unknown"},"warnings":[]}],"restaurants":[],"unresolvedItems":[],"assumptions":[],"validationMetadata":{"validatorVersion":"private","validatedAt":"2026-07-19T01:00:00Z"}}',
'pass','{"status":"pass"}',1,'summary-one','c6120000-0000-4000-8000-000000000001','c6100000-0000-4000-8000-000000000001','2026-07-19T01:00:00Z','plan-hash-v2'),
('c6150000-0000-4000-8000-000000000003','c6110000-0000-4000-8000-000000000002','c6130000-0000-4000-8000-000000000002','c6140000-0000-4000-8000-000000000002',1,'published','1','itinerary-v1','model-private',
'{"schemaVersion":"1","title":"Other Version One","destinationSummary":"Private other room","timezone":"UTC","startDate":"2026-10-01","endDate":"2026-10-01","travelers":[],"arrivals":[],"departures":[],"lodging":[],"days":[],"restaurants":[],"unresolvedItems":[],"assumptions":[],"validationMetadata":{"validatorVersion":"private","validatedAt":"2026-07-19T00:00:00Z"}}',
'pass','{"status":"pass"}',1,'summary-two','c6120000-0000-4000-8000-000000000003','c6100000-0000-4000-8000-000000000003','2026-07-19T00:00:00Z','plan-hash-other');

select set_config('request.jwt.claim.sub','c6100000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok(
  $$select public.create_guest_invite('c6150000-0000-4000-8000-000000000001','c6120000-0000-4000-8000-000000000002','guest_commenter',repeat('1',64),'comment1',now()+interval '1 day',5)$$,
  'P0001','Host required.','non-host cannot create a guest link'
);
select throws_ok(
  $$select public.create_guest_invite('c6150000-0000-4000-8000-000000000001','c6120000-0000-4000-8000-000000000003','guest_commenter',repeat('2',64),'comment2',now()+interval '1 day',5)$$,
  'P0001','Host required.','cross-room host cannot create a guest link'
);
reset role;

select set_config('request.jwt.claim.sub','c6100000-0000-4000-8000-000000000001',true);
set local role authenticated;
select throws_ok(
  $$select public.create_guest_invite('c6150000-0000-4000-8000-000000000001','c6120000-0000-4000-8000-000000000001','guest_admin',repeat('3',64),'invalid3',now()+interval '1 day',5)$$,
  'P0001','Guest role not allowed.','role escalation is denied'
);
create temporary table viewer_invite as
  select public.create_guest_invite(
    'c6150000-0000-4000-8000-000000000001',
    'c6120000-0000-4000-8000-000000000001',
    'guest_viewer',repeat('4',64),'viewer44',now()+interval '1 day',5
  ) payload;
create temporary table commenter_invite as
  select public.create_guest_invite(
    'c6150000-0000-4000-8000-000000000001',
    'c6120000-0000-4000-8000-000000000001',
    'guest_commenter',repeat('5',64),'comment5',now()+interval '1 day',5
  ) payload;
create temporary table suggester_invite as
  select public.create_guest_invite(
    'c6150000-0000-4000-8000-000000000001',
    'c6120000-0000-4000-8000-000000000001',
    'guest_suggester',repeat('8',64),'suggest8',now()+interval '1 day',5
  ) payload;
reset role;

select is((select payload->>'planVersion' from viewer_invite),'1','viewer invite is bound to Version 1');
select is((select payload->>'role' from commenter_invite),'guest_commenter','commenter role is fixed at creation');
select ok((select payload ? 'tokenHash' from viewer_invite)=false,'safe invite metadata omits token hash');

set local role service_role;
create temporary table verified_viewer as
  select public.verify_guest_invite_token_hash(repeat('4',64)) payload;
create temporary table viewer_session as
  select public.create_guest_session(repeat('4',64),repeat('a',64),'Riley') payload;
create temporary table commenter_session as
  select public.create_guest_session(repeat('5',64),repeat('b',64),'Jordan') payload;
create temporary table second_commenter_session as
  select public.create_guest_session(repeat('5',64),repeat('c',64),'Casey') payload;
create temporary table suggester_session as
  select public.create_guest_session(repeat('8',64),repeat('e',64),'Morgan') payload;
create temporary table second_suggester_session as
  select public.create_guest_session(repeat('8',64),repeat('f',64),'Drew') payload;
reset role;

select is((select payload->>'planVersion' from verified_viewer),'1','invite verification remains exact-version bound');
select is((select payload->'itinerary'->>'version' from verified_viewer),'1','verification returns the existing privacy-safe Version 1 projection');
select ok((select payload::text !~* 'Exact private address|Private pickup|ABC123|latitude|longitude' from verified_viewer),'private lodging and coordinates stay hidden');
select is((select payload->>'role' from viewer_session),'guest_viewer','viewer session cannot escalate its role');
select is((select payload->>'role' from commenter_session),'guest_commenter','commenter session retains invite role');
select is((select payload->>'role' from suggester_session),'guest_suggester','suggester session retains its suggestion-only role');
select ok((select payload ? 'sessionHash' from commenter_session)=false,'session metadata omits the session credential hash');

set local role service_role;
select throws_ok(
  $$select public.create_guest_plan_comment(repeat('a',64),'2026-09-12','item:v1','Viewer must not comment')$$,
  'P0001','Commenting not allowed.','viewer cannot comment'
);
select throws_ok(
  $$select public.create_guest_plan_comment(repeat('b',64),'2026-09-12','item:v2','Wrong version target')$$,
  'P0001','Comment target not found.','comment target must exist in the exact invited version'
);
select throws_ok(
  $$select public.create_guest_plan_comment(repeat('b',64),'2026-09-12','item:v1','<b>HTML is not allowed</b>')$$,
  'P0001','Comment body not allowed.','HTML-shaped comment input is rejected'
);
create temporary table guest_comment as
  select public.create_guest_plan_comment(
    repeat('b',64),'2026-09-12','item:v1','Could we start 30 minutes earlier?'
  ) payload;
reset role;

select is((select payload->>'authorDisplayName' from guest_comment),'Jordan','guest display name is shown without an internal ID');
select is((select payload->>'planVersion' from guest_comment),'1','comment remains pinned to Version 1');
select is((select payload->>'itemKey' from guest_comment),'item:v1','comment stays attached to its itinerary item');
select ok((select payload ? 'guestSessionId' from guest_comment)=false,'safe comment output omits guest session ID');
set local role service_role;
select is(
  public.get_guest_session_context(repeat('b',64))->'comments'->0->>'isOwn',
  'true',
  'guest context marks ownership without exposing a session ID'
);
reset role;

set local role service_role;
select throws_ok(
  format(
    'select public.update_guest_plan_comment(%L,%L,%L)',
    repeat('c',64),
    (select payload->>'id' from guest_comment),
    'Trying to edit another guest comment'
  ),
  'P0001','Comment ownership required.','guest cannot edit another guest comment'
);
select throws_ok(
  format(
    'select public.delete_guest_plan_comment(%L,%L)',
    repeat('c',64),
    (select payload->>'id' from guest_comment)
  ),
  'P0001','Comment ownership required.','guest cannot delete another guest comment'
);
create temporary table edited_comment as
  select public.update_guest_plan_comment(
    repeat('b',64),
    ((select payload->>'id' from guest_comment)::uuid),
    'Could we start 45 minutes earlier?'
  ) payload;
reset role;

select is((select payload->>'body' from edited_comment),'Could we start 45 minutes earlier?','guest can edit their own comment');
select set_config('test.guest_comment_id',(select payload->>'id' from guest_comment),true);

select set_config('request.jwt.claim.sub','c6100000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(
  public.resolve_plan_comment(
    current_setting('test.guest_comment_id')::uuid,
    'c6120000-0000-4000-8000-000000000002'
  )->>'resolved',
  'true',
  'active member can resolve a comment'
);
select ok(
  (select public.list_member_plan_comments('c6110000-0000-4000-8000-000000000001',1)::text like '%Could we start 45 minutes earlier?%'),
  'member reads the Version 1 comment'
);
select is(
  jsonb_array_length(public.list_member_plan_comments('c6110000-0000-4000-8000-000000000001',2)),
  0,
  'Version 1 comments do not move to Version 2'
);
reset role;

select set_config('request.jwt.claim.sub','c6100000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok(
  $$select public.list_member_plan_comments('c6110000-0000-4000-8000-000000000001',1)$$,
  'P0001','Membership required.','cross-room member comment read is denied'
);
reset role;

set local role service_role;
create temporary table deleted_comment as
  select public.delete_guest_plan_comment(
    repeat('b',64),
    ((select payload->>'id' from guest_comment)::uuid)
  ) payload;
reset role;
select is((select payload->>'body' from deleted_comment),null,'deleting a comment removes its content');
select is((select payload->>'deleted' from deleted_comment),'true','safe deletion metadata remains visible');

set local role service_role;
select ok(
  (public.get_guest_session_context(repeat('b',64))::text !~* 'memory|messages|participants|approvals|revisions'),
  'guest context excludes private room systems'
);
select throws_ok(
  $$select public.create_guest_suggestion(repeat('a',64),'plan',null,'general','Viewer try','Viewer must not suggest',null,null,null)$$,
  'P0001','Suggestions not allowed.','viewer cannot create suggestions'
);
select throws_ok(
  $$select public.create_guest_suggestion(repeat('b',64),'plan',null,'general','Commenter try','Commenter must not suggest',null,null,null)$$,
  'P0001','Suggestions not allowed.','commenter cannot create suggestions'
);
create temporary table stale_item_suggestion as
  select public.create_guest_suggestion(
    repeat('e',64),'item','item:v1','remove_item',
    'Skip sunset','Use the evening for dinner.',null,null,null
  ) payload;
create temporary table stale_plan_suggestion as
  select public.create_guest_suggestion(
    repeat('e',64),'plan',null,'general',
    'Slow down','Leave the current afternoon less crowded.',null,null,null
  ) payload;
create temporary table dismissible_suggestion as
  select public.create_guest_suggestion(
    repeat('e',64),'plan',null,'general',
    'Add snacks','Bring snacks for the drive.',null,null,null
  ) payload;
create temporary table deletable_suggestion as
  select public.create_guest_suggestion(
    repeat('e',64),'plan',null,'general',
    'Temporary idea','This one will be deleted.',null,null,null
  ) payload;
select throws_ok(
  format(
    'select public.update_guest_suggestion(%L,%L,%L,%L,null,null,null)',
    repeat('f',64),
    (select payload->>'id' from stale_item_suggestion),
    'Other guest edit',
    'A different session cannot edit this.'
  ),
  'P0001','Suggestion ownership required.','guest cannot edit another guest suggestion'
);
create temporary table edited_suggestion as
  select public.update_guest_suggestion(
    repeat('e',64),
    ((select payload->>'id' from stale_item_suggestion)::uuid),
    'Skip the sunset stop',
    'Use the evening for an earlier dinner.',
    null,null,null
  ) payload;
create temporary table deleted_suggestion as
  select public.delete_guest_suggestion(
    repeat('e',64),
    ((select payload->>'id' from deletable_suggestion)::uuid)
  ) payload;
reset role;

select is((select payload->>'originalPlanVersion' from edited_suggestion),'1','suggestion attribution remains pinned to Version 1');
select is((select payload->>'title' from edited_suggestion),'Skip the sunset stop','guest edits their own open suggestion');
select is((select payload->>'deleted' from deleted_suggestion),'true','guest deletes their own open suggestion');
select ok(
  (select payload ? 'guestSessionId' from edited_suggestion)=false,
  'safe suggestion projection omits the guest session credential'
);
select ok(
  (select public.get_guest_session_context(repeat('e',64))::text !~* 'memory|messages|participants|approvals|revisionRequestId'),
  'suggester context excludes private crew systems and internal revision state'
);

select set_config('request.jwt.claim.sub','c6100000-0000-4000-8000-000000000002',true);
set local role authenticated;
create temporary table stale_warning as
  select public.convert_guest_suggestion(
    ((select payload->>'id' from stale_item_suggestion)::uuid),
    'c6120000-0000-4000-8000-000000000002',
    false
  ) payload;
select is((select payload->>'requiresRebaseConfirmation' from stale_warning),'true','stale suggestion never auto-converts');
select like(
  (select payload->>'warning' from stale_warning),
  'This suggestion was made on Version 1. The trip is now on Version 2.%',
  'stale warning identifies original and current versions'
);
select throws_ok(
  format(
    'select public.convert_guest_suggestion(%L,%L,true)',
    (select payload->>'id' from stale_item_suggestion),
    'c6120000-0000-4000-8000-000000000002'
  ),
  'P0001','Suggestion no longer applies. Rewrite or dismiss it.',
  'missing current target blocks rebase conversion safely'
);
create temporary table plan_warning as
  select public.convert_guest_suggestion(
    ((select payload->>'id' from stale_plan_suggestion)::uuid),
    'c6120000-0000-4000-8000-000000000002',
    false
  ) payload;
create temporary table converted_suggestion as
  select public.convert_guest_suggestion(
    ((select payload->>'id' from stale_plan_suggestion)::uuid),
    'c6120000-0000-4000-8000-000000000002',
    true
  ) payload;
create temporary table converted_again as
  select public.convert_guest_suggestion(
    ((select payload->>'id' from stale_plan_suggestion)::uuid),
    'c6120000-0000-4000-8000-000000000002',
    true
  ) payload;
create temporary table dismissed_suggestion as
  select public.dismiss_guest_suggestion(
    ((select payload->>'id' from dismissible_suggestion)::uuid),
    'c6120000-0000-4000-8000-000000000002'
  ) payload;
reset role;

select is((select payload->>'requiresRebaseConfirmation' from plan_warning),'true','applicable stale suggestion still requires explicit confirmation');
select is((select payload->'suggestion'->>'status' from converted_suggestion),'converted','confirmed suggestion becomes converted');
select is((select payload->'suggestion'->>'originalPlanVersion' from converted_suggestion),'1','converted suggestion preserves original Version 1 attribution');
select is((select payload->'suggestion'->>'rebasedToPlanVersion' from converted_suggestion),'2','converted suggestion records the current rebased Version 2');
select is((select payload->>'revisionRequestId' from converted_suggestion),(select payload->>'revisionRequestId' from converted_again),'one suggestion converts to at most one revision request');
select is(
  (select base_plan_version::text from public.plan_change_requests where id=((select payload->>'revisionRequestId' from converted_suggestion)::uuid)),
  '2',
  'converted revision request is based on the current published version'
);
select is(
  (select status::text from public.plan_change_requests where id=((select payload->>'revisionRequestId' from converted_suggestion)::uuid)),
  'draft',
  'conversion does not auto-approve the normal revision request'
);
select like(
  (select request_text from public.plan_change_requests where id=((select payload->>'revisionRequestId' from converted_suggestion)::uuid)),
  'Guest suggestion % from Version 1; rebased to Version 2 by Alex.%',
  'revision copy records original version, rebased version, confirmer, and guest suggestion attribution'
);
select is((select payload->>'status' from dismissed_suggestion),'dismissed','member can dismiss an open suggestion');

set local role service_role;
select throws_ok(
  format(
    'select public.update_guest_suggestion(%L,%L,%L,%L,null,null,null)',
    repeat('e',64),
    (select payload->>'id' from dismissible_suggestion),
    'Try terminal edit',
    'Dismissed suggestions cannot change.'
  ),
  'P0001','Suggestion is immutable.','dismissed suggestion is immutable'
);
reset role;

select set_config('request.jwt.claim.sub','c6100000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok(
  format(
    'select public.convert_guest_suggestion(%L,%L,true)',
    (select payload->>'id' from stale_item_suggestion),
    'c6120000-0000-4000-8000-000000000003'
  ),
  'P0001','Membership required.','cross-room conversion is denied'
);
reset role;

select set_config('request.jwt.claim.sub','c6100000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.revoke_guest_invite(
  ((select payload->>'id' from commenter_invite)::uuid),
  'c6120000-0000-4000-8000-000000000001'
);
select public.revoke_guest_invite(
  ((select payload->>'id' from suggester_invite)::uuid),
  'c6120000-0000-4000-8000-000000000001'
);
reset role;

set local role service_role;
select is(public.get_guest_session_context(repeat('b',64)),null,'revocation immediately invalidates an existing guest session');
select is(public.verify_guest_invite_token_hash(repeat('5',64)),null,'revoked invite cannot be verified');
select is(public.get_guest_session_context(repeat('e',64)),null,'revocation immediately invalidates suggester sessions');
select throws_ok(
  $$select public.create_guest_plan_comment(repeat('b',64),'2026-09-12','item:v1','After revoke')$$,
  'P0001','Guest session unavailable.','revoked session cannot create comments'
);
reset role;

select set_config('request.jwt.claim.sub','c6100000-0000-4000-8000-000000000001',true);
set local role authenticated;
create temporary table expired_invite as
  select public.create_guest_invite(
    'c6150000-0000-4000-8000-000000000002',
    'c6120000-0000-4000-8000-000000000001',
    'guest_viewer',repeat('6',64),'expired6',now()+interval '1 minute',1
  ) payload;
reset role;
update private.guest_invites
set created_at=now()-interval '2 days',expires_at=now()-interval '1 second'
where id=((select payload->>'id' from expired_invite)::uuid);
set local role service_role;
select is(public.verify_guest_invite_token_hash(repeat('6',64)),null,'expired invite is denied');
select is(public.create_guest_session(repeat('6',64),repeat('d',64),'Taylor'),null,'expired invite cannot create a session');
reset role;

select set_config('request.jwt.claim.sub','c6100000-0000-4000-8000-000000000001',true);
set local role authenticated;
create temporary table rotated_viewer_invite as
  select public.rotate_guest_invite(
    ((select payload->>'id' from viewer_invite)::uuid),
    'c6120000-0000-4000-8000-000000000001',
    repeat('7',64),
    'viewer77'
  ) payload;
reset role;
select isnt((select payload->>'id' from rotated_viewer_invite),(select payload->>'id' from viewer_invite),'rotation creates a distinct invite');
select is((select payload->>'role' from rotated_viewer_invite),'guest_viewer','rotation preserves the fixed guest role');
select ok((select revoked_at is not null from private.guest_invites where id=((select payload->>'id' from viewer_invite)::uuid)),'rotation revokes the prior invite');
set local role service_role;
select is(public.get_guest_session_context(repeat('a',64)),null,'rotation immediately invalidates prior invite sessions');
select is(public.verify_guest_invite_token_hash(repeat('7',64))->>'role','guest_viewer','rotated token verifies with the same role');
reset role;

select * from finish();
rollback;
