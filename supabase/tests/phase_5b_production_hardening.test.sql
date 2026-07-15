begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(46);

select has_table('private', 'captcha_receipts', 'CAPTCHA receipts are private durable state');
select has_table('private', 'ai_quota_reservations', 'AI quota reservations are private durable state');
select has_table('private', 'ai_model_limits', 'model-specific AI limits are private configuration');
select has_table('private', 'lifecycle_executions', 'lifecycle execution leases are private durable state');
select has_table('private', 'deletion_events', 'deletion audit events are private and content-free');

select has_function('public', 'record_captcha_receipt', array['uuid', 'text', 'text', 'timestamptz'], 'service records a bounded CAPTCHA receipt');
select has_function('public', 'create_trip_protected', array['text', 'text', 'integer', 'uuid'], 'create Trip consumes a CAPTCHA receipt');
select has_function('public', 'join_trip_protected', array['text', 'text', 'uuid'], 'join Trip consumes a CAPTCHA receipt');
select has_function('public', 'delete_room', array['uuid', 'text'], 'host-only room deletion is explicit');
select has_function('public', 'assess_account_deletion', array[]::text[], 'account deletion assessment exposes safe obligations');
select has_function('public', 'prepare_account_deletion', array['text'], 'account deletion preparation enforces host rules');
select has_function('public', 'transfer_room_host', array['uuid','uuid'], 'host transfer is locked and explicit');
select has_function('public', 'list_anonymous_cleanup_candidates', array['interval', 'integer', 'boolean'], 'cleanup candidates are bounded and support dry-run');
select has_function('public', 'claim_lifecycle_execution', array['text', 'integer'], 'lifecycle jobs use a distributed lease');
select has_function('public', 'reserve_ai_quota', array['uuid', 'uuid', 'text', 'text', 'bigint', 'uuid'], 'AI quota is reserved transactionally');
select has_function('public', 'get_ai_quota_subject', array['text','uuid'], 'quota subjects use a narrow service-only lookup');
select has_function('public', 'reconcile_ai_quota', array['uuid', 'bigint', 'text'], 'AI quota is reconciled with actual usage');
select has_function('public', 'get_ai_usage_report', array['date'], 'safe usage reporting is available to operations');
select has_function('public', 'set_ai_generation_enabled', array['boolean'], 'service-only emergency quota switch is explicit');

select table_privs_are(
  'private',
  'captcha_receipts',
  'authenticated',
  array[]::text[],
  'browser roles cannot inspect CAPTCHA receipt state'
);
select table_privs_are(
  'private',
  'ai_quota_reservations',
  'authenticated',
  array[]::text[],
  'browser roles cannot inspect AI budget state'
);

insert into auth.users(id,instance_id,aud,role,created_at,updated_at,is_anonymous)
values
('5b000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated',now()-interval '60 days',now()-interval '60 days',true),
('5b000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated',now()-interval '60 days',now()-interval '60 days',true),
('5b000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated',now()-interval '60 days',now()-interval '60 days',true),
('5b000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated',now()-interval '60 days',now()-interval '60 days',true);

grant execute on function public.create_trip_unprotected(text,text,integer),public.join_trip_unprotected(text,text) to authenticated;
select set_config('request.jwt.claim.sub','5b000000-0000-4000-8000-000000000001',true);
set local role authenticated;
create temporary table phase5b_room as select * from public.create_trip_unprotected('Disposable lifecycle room','Host',2);
reset role;
revoke execute on function public.create_trip_unprotected(text,text,integer),public.join_trip_unprotected(text,text) from authenticated;

select set_config('request.jwt.claim.sub','5b000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok(
  $$select * from public.create_trip_protected('Bypass','Bot',1,null)$$,
  'P0001','captcha_invalid','create Trip cannot bypass CAPTCHA with a direct RPC'
);
reset role;

set local role service_role;
create temporary table captcha_receipt as select public.record_captcha_receipt(
  '5b000000-0000-4000-8000-000000000002','join_trip','verified-test-event',now()+interval '5 minutes'
) receipt_id;
select is(
  public.record_captcha_receipt('5b000000-0000-4000-8000-000000000002','join_trip','verified-test-event',now()+interval '5 minutes'),
  (select receipt_id from captcha_receipt),
  'an unconsumed receipt can be retried after a downstream validation failure'
);
reset role;
grant select on captcha_receipt to authenticated;
select set_config('request.jwt.claim.sub','5b000000-0000-4000-8000-000000000002',true);
set local role authenticated;
create temporary table phase5b_member as select * from public.join_trip_protected(
  (select invite_token from phase5b_room),'Member',(select receipt_id from captcha_receipt)
);
select is((select participant_role::text from phase5b_member),'member','a valid CAPTCHA receipt permits one join');
select throws_ok(
  format('select * from public.join_trip_protected(%L,%L,%L)',(select invite_token from phase5b_room),'Again',(select receipt_id from captcha_receipt)),
  'P0001','captcha_invalid','CAPTCHA receipt cannot be replayed'
);
select throws_ok(
  format('select public.delete_room(%L,%L)',(select room_id from phase5b_room),'Disposable lifecycle room'),
  'P0001','host_required','ordinary member cannot delete a room'
);
reset role;

set local role service_role;
select throws_ok(
  $$select public.record_captcha_receipt('5b000000-0000-4000-8000-000000000002','join_trip','verified-test-event',now()+interval '5 minutes')$$,
  'P0001','captcha_invalid','a consumed hosted Auth verification cannot mint another receipt'
);
reset role;

select set_config('request.jwt.claim.sub','5b000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok(
  format('select public.delete_room(%L,%L)',(select room_id from phase5b_room),'Disposable lifecycle room'),
  'P0001','host_required','outsider cannot delete a room'
);
reset role;

select set_config('request.jwt.claim.sub','5b000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select ok(public.transfer_room_host((select room_id from phase5b_room),(select member.participant_id from phase5b_member member)),'current host can transfer to an active member');
select is((select host_user_id from public.rooms where id=(select room_id from phase5b_room)),'5b000000-0000-4000-8000-000000000002'::uuid,'host transfer atomically updates room ownership');
reset role;
select set_config('request.jwt.claim.sub','5b000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select ok(public.transfer_room_host((select room_id from phase5b_room),(select p.id from public.participants p where p.room_id=(select room_id from phase5b_room) and p.user_id='5b000000-0000-4000-8000-000000000001')),'new host can transfer ownership back');
reset role;
select set_config('request.jwt.claim.sub','5b000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select throws_ok(
  $$select public.prepare_account_deletion('DELETE MY ACCOUNT')$$,
  'P0001','host_transfer_or_room_deletion_required','active host account deletion is blocked'
);
select ok(public.delete_room((select room_id from phase5b_room),'Disposable lifecycle room'),'host can delete a disposable room');
select ok(public.delete_room((select room_id from phase5b_room),'Disposable lifecycle room'),'room deletion is idempotent');
reset role;
select is((select count(*) from public.rooms where id=(select room_id from phase5b_room)),0::bigint,'room deletion leaves no room row');

select set_config('request.jwt.claim.sub','5b000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is((public.prepare_account_deletion('DELETE MY ACCOUNT')->>'prepared')::boolean,true,'ordinary account can be prepared for trusted deletion');
reset role;

set local role service_role;
select is(
  (select count(*) from public.list_anonymous_cleanup_candidates(interval '30 days',100,true) where user_id='5b000000-0000-4000-8000-000000000004'::uuid),
  1::bigint,
  'inactive anonymous user is cleanup eligible'
);
select is(public.claim_lifecycle_execution('anonymous_cleanup',300),true,'cleanup lease can be claimed');
select is(public.claim_lifecycle_execution('anonymous_cleanup',300),false,'overlapping cleanup lease is rejected');
reset role;

-- Quota fixtures are inserted directly so the quota contract can be tested independently.
insert into public.rooms(id,name,room_code,host_user_id,status)
values('5b100000-0000-4000-8000-000000000001','Quota room','QWERTY23','5b000000-0000-4000-8000-000000000004','active');
insert into public.participants(id,room_id,user_id,display_name,role,status)
values('5b200000-0000-4000-8000-000000000001','5b100000-0000-4000-8000-000000000001','5b000000-0000-4000-8000-000000000004','Quota user','host','active');
set local role service_role;
select is(
  (select count(*) from public.list_anonymous_cleanup_candidates(interval '30 days',100,true) where user_id='5b000000-0000-4000-8000-000000000004'::uuid),
  0::bigint,
  'cleanup excludes users tied to active rooms'
);
create temporary table quota_usage_baseline as
select (public.get_ai_usage_report((timezone('utc',now()))::date)->>'totalTokens')::bigint total;
select is(
  public.reserve_ai_quota('5b000000-0000-4000-8000-000000000004','5b100000-0000-4000-8000-000000000001','focused_answer','test-model',1000,'5b300000-0000-4000-8000-000000000001')->>'status',
  'reserved','AI allowance reserves before a provider call'
);
select is(
  public.reconcile_ai_quota('5b300000-0000-4000-8000-000000000001',750,'used')->>'actualTokens',
  '750','actual token usage reconciles the reservation'
);
select is(
  public.reconcile_ai_quota('5b300000-0000-4000-8000-000000000001',750,'used')->>'status',
  'used','quota reconciliation is idempotent'
);
select is(
  (public.get_ai_usage_report((timezone('utc',now()))::date)->>'totalTokens')::bigint-(select total from quota_usage_baseline),
  750::bigint,
  'usage reporting reconciles tokens without private content'
);
reset role;
insert into private.ai_model_limits(model,daily_invocations,daily_tokens,enabled) values('disabled-model',1,1000,false);
set local role service_role;
select throws_ok(
  $$select public.reserve_ai_quota('5b000000-0000-4000-8000-000000000004','5b100000-0000-4000-8000-000000000001','focused_answer','disabled-model',100,'5b300000-0000-4000-8000-000000000003')$$,
  'P0001','provider_budget_unavailable','model-specific disable blocks a provider reservation'
);
reset role;
update private.ai_quota_settings set generation_enabled=false where singleton;
set local role service_role;
select throws_ok(
  $$select public.reserve_ai_quota('5b000000-0000-4000-8000-000000000004','5b100000-0000-4000-8000-000000000001','focused_answer','test-model',1000,'5b300000-0000-4000-8000-000000000002')$$,
  'P0001','ai_disabled','database emergency disable blocks new reservations'
);
reset role;

select * from finish();
rollback;
