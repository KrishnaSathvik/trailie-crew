begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(35);

select has_table('private','ai_provider_attempts','provider attempts are durable private state');
select has_function('public','claim_ai_provider_attempt',array['text','text','integer','text','uuid','integer','uuid'],'service can claim one bounded provider attempt');
select has_function('public','complete_ai_provider_attempt',array['uuid','uuid','text','text','jsonb','bigint','bigint','bigint','bigint','bigint','integer','integer','integer','integer'],'validated provider output is staged before domain transition');
select has_function('public','get_staged_ai_provider_result',array['uuid','uuid'],'a lease owner can load staged validated output');
select has_function('public','mark_ai_provider_attempt_applied',array['uuid','uuid'],'domain application is recorded exactly once');
select has_function('public','fail_ai_provider_attempt',array['uuid','uuid','text','boolean'],'provider attempt failure is safe and recovery-aware');
select has_function('public','list_recoverable_ai_provider_attempts',array['integer'],'stale provider attempts are observable to recovery');
select has_function('public','prepare_ai_recovery',array[]::text[],'recovery reconciles completed domain transitions and stale extraction claims');
select function_privs_are('public','prepare_ai_recovery',array[]::text[],'authenticated',array[]::text[],'browser roles cannot prepare recovery');

select is((select relrowsecurity from pg_class where oid='private.ai_provider_attempts'::regclass),true,'provider attempts enable RLS');
select is((select relforcerowsecurity from pg_class where oid='private.ai_provider_attempts'::regclass),true,'provider attempts force RLS');
select table_privs_are('private','ai_provider_attempts','authenticated',array[]::text[],'authenticated cannot inspect staged output');
select table_privs_are('private','ai_provider_attempts','anon',array[]::text[],'anonymous cannot inspect staged output');

set local role service_role;
create temporary table first_claim as
select public.claim_ai_provider_attempt(
  'planning_summary','planning:request-1:summary-1',1,'gpt-5.6-sol',
  '5c000000-0000-4000-8000-000000000001',360000,null
) value;
select is((select value->>'claimed' from first_claim),'true','first worker claims the attempt');
select is(
  public.claim_ai_provider_attempt('planning_summary','planning:request-1:summary-1',1,'gpt-5.6-sol','5c000000-0000-4000-8000-000000000002',360000,null)->>'claimed',
  'false','an active lease rejects a concurrent worker'
);
select throws_ok(
  $$select public.complete_ai_provider_attempt(
    (select (value->>'attemptId')::uuid from first_claim),'5c000000-0000-4000-8000-000000000002',
    'response-1','request-1','{"schemaVersion":"1","title":"validated"}'::jsonb,
    100,50,0,0,150,1200,1300,0,0
  )$$,
  'P0001','provider_attempt_lease_not_owned','only the lease owner can stage output'
);
select is(
  public.complete_ai_provider_attempt(
    (select (value->>'attemptId')::uuid from first_claim),'5c000000-0000-4000-8000-000000000001',
    'response-1','request-1','{"schemaVersion":"1","title":"validated"}'::jsonb,
    100,50,0,0,150,1200,1300,0,0
  )->>'status',
  'provider_completed','validated output becomes durable before application'
);
select is(
  public.get_staged_ai_provider_result(
    (select (value->>'attemptId')::uuid from first_claim),'5c000000-0000-4000-8000-000000000001'
  )->'validatedResult'->>'title',
  'validated','the current owner can load staged validated output'
);
select is(
  public.claim_ai_provider_attempt('planning_summary','planning:request-1:summary-1',1,'gpt-5.6-sol','5c000000-0000-4000-8000-000000000002',360000,null)->>'claimed',
  'false','staged output remains exclusively leased before expiry'
);
reset role;

update private.ai_provider_attempts set lease_expires_at=now()-interval '1 second'
where workflow='planning_summary' and operation_key='planning:request-1:summary-1';

set local role service_role;
create temporary table recovery_claim as
select public.claim_ai_provider_attempt(
  'planning_summary','planning:request-1:summary-1',2,'gpt-5.6-sol',
  '5c000000-0000-4000-8000-000000000002',360000,null
) value;
select is((select value->>'claimed' from recovery_claim),'true','recovery claims staged output after lease expiry');
select is((select value->>'resultAvailable' from recovery_claim),'true','recovery is told not to repeat the provider call');
select is(
  public.mark_ai_provider_attempt_applied(
    (select (value->>'attemptId')::uuid from recovery_claim),'5c000000-0000-4000-8000-000000000002'
  )->>'status',
  'applied','domain application is recorded'
);
select is(
  public.claim_ai_provider_attempt('planning_summary','planning:request-1:summary-1',1,'gpt-5.6-sol','5c000000-0000-4000-8000-000000000003',360000,null)->>'applied',
  'true','completed work is not claimed again'
);
reset role;
select is(
  (select count(*) from private.ai_provider_attempts where workflow='planning_summary' and operation_key='planning:request-1:summary-1' and attempt=1),
  1::bigint,'attempt identity is unique under concurrent retries'
);

set local role service_role;
select throws_ok(
  $$select public.claim_ai_provider_attempt('memory_extraction','memory:bad',4,'gpt-5.6-luna','5c000000-0000-4000-8000-000000000004',360000,null)$$,
  'P0001','invalid_provider_attempt','attempt caps are enforced'
);
select throws_ok(
  $$select public.claim_ai_provider_attempt('memory_extraction','memory:bad',1,'gpt-5.6-luna','5c000000-0000-4000-8000-000000000004',1000,null)$$,
  'P0001','invalid_provider_lease','lease bounds are enforced'
);
create temporary table failed_claim as
select public.claim_ai_provider_attempt(
  'memory_extraction','memory:message-1',1,'gpt-5.6-luna',
  '5c000000-0000-4000-8000-000000000004',60000,null
) value;
select is(
  public.fail_ai_provider_attempt(
    (select (value->>'attemptId')::uuid from failed_claim),'5c000000-0000-4000-8000-000000000004','model_unavailable',true
  )->>'status',
  'failed','retryable provider failure is recorded without content'
);
reset role;
update private.ai_provider_attempts set lease_expires_at=now()-interval '1 second'
where workflow='memory_extraction' and operation_key='memory:message-1';
set local role service_role;
select is(
  (select count(*) from public.list_recoverable_ai_provider_attempts(10) where operation_key='memory:message-1'),
  1::bigint,'retryable failed work appears in the bounded recovery backlog'
);
reset role;

insert into auth.users(id,instance_id,aud,role,created_at,updated_at,is_anonymous)
values('5c100000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated',now(),now(),true);
insert into public.rooms(id,name,room_code,host_user_id,status)
values('5c200000-0000-4000-8000-000000000001','Phase 5C quota room','QWERTY24','5c100000-0000-4000-8000-000000000001','active');
insert into public.participants(id,room_id,user_id,display_name,role,status)
values('5c300000-0000-4000-8000-000000000001','5c200000-0000-4000-8000-000000000001','5c100000-0000-4000-8000-000000000001','Quota tester','host','active');
insert into public.messages(id,room_id,participant_id,sender_user_id,message_type,body,client_message_id)
values(
  '5c350000-0000-4000-8000-000000000001','5c200000-0000-4000-8000-000000000001',
  '5c300000-0000-4000-8000-000000000001','5c100000-0000-4000-8000-000000000001',
  'user','@Trailie give us a focused answer','5c350000-0000-4000-8000-000000000002'
);

set local role service_role;
create temporary table focused_invocation as
select public.create_ai_invocation(
  '5c200000-0000-4000-8000-000000000001','5c350000-0000-4000-8000-000000000001',
  '5c300000-0000-4000-8000-000000000001','explicit_mention','give us a focused answer','trailie-focused-v1'
) value;
create temporary table focused_run as
select public.start_ai_run(
  (select (value->>'id')::uuid from focused_invocation),'gpt-5.6-terra','trailie-focused-v1'
) value;
create temporary table focused_claim as
select public.claim_ai_provider_attempt(
  'focused_answer','focused:'||(select value->>'id' from focused_invocation),1,'gpt-5.6-terra',
  '5c000000-0000-4000-8000-000000000006',60000,null
) value;
select is(
  public.complete_ai_provider_attempt(
    (select (value->>'attemptId')::uuid from focused_claim),'5c000000-0000-4000-8000-000000000006',
    'focused-response','focused-request',
    '{"schemaVersion":"1","body":"Recovered answer","sourceMessageId":"5c350000-0000-4000-8000-000000000001","status":"completed"}'::jsonb,
    20,10,0,0,30,500,550,0,0
  )->>'status',
  'provider_completed','focused output is staged before its chat message is persisted'
);
reset role;
update private.ai_provider_attempts set lease_expires_at=now()-interval '1 second'
where workflow='focused_answer';
set local role service_role;
select is(
  public.prepare_ai_recovery()->>'reconciledProviderAttempts','1',
  'recovery applies an interrupted focused result without another provider call'
);
reset role;
select is(
  (select count(*) from public.messages where room_id='5c200000-0000-4000-8000-000000000001' and message_type='trailie' and body='Recovered answer'),
  1::bigint,'focused recovery persists exactly one Trailie response'
);

set local role service_role;
select is(
  public.reserve_ai_quota(
    '5c100000-0000-4000-8000-000000000001','5c200000-0000-4000-8000-000000000001',
    'planning_summary','gpt-5.6-sol',1000,'5c400000-0000-4000-8000-000000000001'
  )->>'status',
  'reserved','first allowance reservation succeeds'
);
select is(
  public.reserve_ai_quota(
    '5c100000-0000-4000-8000-000000000001','5c200000-0000-4000-8000-000000000001',
    'planning_summary','gpt-5.6-sol',1000,'5c400000-0000-4000-8000-000000000001'
  )->>'status',
  'reserved','the same attempt reuses its allowance reservation'
);
reset role;
select is(
  (select count(*) from private.ai_quota_reservations where id='5c400000-0000-4000-8000-000000000001'),
  1::bigint,'repeat reservation cannot double count usage'
);

set local role authenticated;
select throws_ok(
  $$select public.claim_ai_provider_attempt('memory_extraction','browser:bypass',1,'gpt-5.6-luna','5c000000-0000-4000-8000-000000000005',60000,null)$$,
  '42501',null,'browser roles cannot claim provider attempts directly'
);
reset role;

select * from finish();
rollback;
