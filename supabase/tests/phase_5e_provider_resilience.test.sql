begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(28);

select has_column('private','ai_provider_attempts','provider_status_code','provider attempts persist the safe HTTP status');
select has_column('private','ai_provider_attempts','retry_after_ms','provider attempts persist bounded retry guidance');
select has_column('private','ai_provider_attempts','next_retry_at','provider attempts persist deferred eligibility');
select has_column('private','ai_provider_attempts','correlation_id','provider attempts retain the safe correlation identity');
select has_column('private','ai_provider_attempts','recovery_count','provider attempts count bounded recovery claims');
select has_function('public','get_ai_invocation_context',array['uuid'],'focused recovery can load bounded persisted invocation context');
select has_function('public','list_recoverable_ai_invocations',array['integer'],'focused recovery lists only eligible parent workflows');
select has_function('public','get_provider_resilience_report',array['uuid'],'service can read content-free provider acceptance metrics');
select has_function(
  'public',
  'fail_ai_provider_attempt',
  array['uuid','uuid','text','boolean','integer','integer','text','timestamptz'],
  'provider failures retain safe retry metadata'
);
select has_function(
  'public',
  'fail_ai_provider_attempt',
  array[
    'uuid','uuid','text','boolean','integer','integer','text','timestamptz',
    'integer','integer'
  ],
  'failed provider attempts retain bounded provider and workflow latency'
);
select function_privs_are('public','get_ai_invocation_context',array['uuid'],'authenticated',array[]::text[],'browser roles cannot load private focused context');
select function_privs_are('public','list_recoverable_ai_invocations',array['integer'],'authenticated',array[]::text[],'browser roles cannot inspect focused recovery work');
select function_privs_are('public','get_provider_resilience_report',array['uuid'],'authenticated',array[]::text[],'browser roles cannot inspect provider acceptance metrics');
select is((select relrowsecurity from pg_class where oid='private.ai_provider_attempts'::regclass),true,'provider attempts keep RLS enabled');
select is((select relforcerowsecurity from pg_class where oid='private.ai_provider_attempts'::regclass),true,'provider attempts keep forced RLS');
select table_privs_are('private','ai_provider_attempts','authenticated',array[]::text[],'browser roles cannot read provider retry metadata');
select ok(
  (select count(*)=count(distinct (workflow,operation_key,attempt)) from private.ai_provider_attempts),
  'provider attempt identity remains unique'
);
select ok(
  not exists(
    select 1 from private.ai_provider_attempts
    where provider_status_code is not null
      and provider_status_code not between 100 and 599
  ),
  'persisted provider status is always safe and bounded'
);

insert into private.ai_provider_attempts(
  id,workflow,operation_key,attempt,model,status,lease_owner,lease_expires_at
) values(
  '5e000000-0000-4000-8000-000000000002',
  'memory_extraction','phase-5e-metric-check',2,'gpt-5.6-luna','running',
  '5e000000-0000-4000-8000-000000000003',now()+interval '1 minute'
);
set local role service_role;
select public.fail_ai_provider_attempt(
  '5e000000-0000-4000-8000-000000000002',
  '5e000000-0000-4000-8000-000000000003',
  'model_unavailable',true,503,1000,'req_phase5e_metric',
  now()+interval '1 second',275,400
);
reset role;
select results_eq(
  $$select retry_count,provider_duration_ms,total_duration_ms
    from private.ai_provider_attempts
    where id='5e000000-0000-4000-8000-000000000002'$$,
  $$select 1::integer,275::integer,400::integer$$,
  'a failed second attempt records one retry and bounded latency'
);

insert into auth.users(id,instance_id,aud,role,created_at,updated_at,is_anonymous)
values(
  '5e100000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated',now(),now(),true
);
insert into public.rooms(id,name,room_code,host_user_id,status)
values(
  '5e200000-0000-4000-8000-000000000001',
  'Phase 5E durability room','PHSE2222',
  '5e100000-0000-4000-8000-000000000001','active'
);
insert into public.participants(id,room_id,user_id,display_name,role,status)
values(
  '5e300000-0000-4000-8000-000000000001',
  '5e200000-0000-4000-8000-000000000001',
  '5e100000-0000-4000-8000-000000000001',
  'Recovery tester','host','active'
);
insert into public.messages(
  id,room_id,participant_id,sender_user_id,message_type,body,client_message_id
) values(
  '5e350000-0000-4000-8000-000000000001',
  '5e200000-0000-4000-8000-000000000001',
  '5e300000-0000-4000-8000-000000000001',
  '5e100000-0000-4000-8000-000000000001',
  'user','I prefer hiking',
  '5e350000-0000-4000-8000-000000000002'
);
insert into private.message_extractions(
  room_id,message_id,participant_id,user_id,model,prompt_version,schema_version,
  status,attempt_count,error_code
) values(
  '5e200000-0000-4000-8000-000000000001',
  '5e350000-0000-4000-8000-000000000001',
  '5e300000-0000-4000-8000-000000000001',
  '5e100000-0000-4000-8000-000000000001',
  'gpt-5.6-luna','memory-v1','memory-schema-v1',
  'failed',1,'model_unavailable'
);
insert into private.ai_provider_attempts(
  workflow,operation_key,attempt,model,status,lease_owner,lease_expires_at,
  error_code,retryable,next_retry_at
) values(
  'memory_extraction',
  'memory:5e350000-0000-4000-8000-000000000001',
  1,'gpt-5.6-luna','failed',
  '5e400000-0000-4000-8000-000000000001',
  now()-interval '1 second','model_unavailable',true,
  now()+interval '5 minutes'
);

set local role service_role;
select is(
  public.reserve_ai_quota(
    '5e100000-0000-4000-8000-000000000001',
    '5e200000-0000-4000-8000-000000000001',
    'memory_extraction','gpt-5.6-luna',3000,
    '5e500000-0000-4000-8000-000000000001'
  )->>'status',
  'reserved','one logical extraction reserves quota'
);
select is(
  public.reconcile_ai_quota(
    '5e500000-0000-4000-8000-000000000001',0,'released'
  )->>'status',
  'released','a provider failure can release the logical reservation'
);
select is(
  public.reserve_ai_quota(
    '5e100000-0000-4000-8000-000000000001',
    '5e200000-0000-4000-8000-000000000001',
    'memory_extraction','gpt-5.6-luna',3000,
    '5e500000-0000-4000-8000-000000000001'
  )->>'status',
  'reserved','recovery reactivates the same logical reservation'
);
select is(
  (select count(*) from public.list_recoverable_message_extractions(10)
    as recovered(message_id)
    where recovered.message_id='5e350000-0000-4000-8000-000000000001'),
  0::bigint,'recovery skips extraction attempts before next_retry_at'
);
reset role;

select is(
  (select count(*) from private.ai_quota_reservations
    where id='5e500000-0000-4000-8000-000000000001'),
  1::bigint,'reactivation never creates a duplicate quota row'
);
update private.ai_provider_attempts
set next_retry_at=now()-interval '1 second'
where operation_key='memory:5e350000-0000-4000-8000-000000000001';
set local role service_role;
select is(
  (select count(*) from public.list_recoverable_message_extractions(10)
    as recovered(message_id)
    where recovered.message_id='5e350000-0000-4000-8000-000000000001'),
  1::bigint,'recovery claims an extraction only after next_retry_at'
);
reset role;
update private.ai_provider_attempts
set retryable=false,next_retry_at=null
where operation_key='memory:5e350000-0000-4000-8000-000000000001';
set local role service_role;
select is(
  (select count(*) from public.list_recoverable_message_extractions(10)
    as recovered(message_id)
    where recovered.message_id='5e350000-0000-4000-8000-000000000001'),
  0::bigint,'non-retryable extraction failures remain terminal'
);
reset role;

insert into public.planning_requests(
  id,room_id,requested_by_participant_id,requested_by_user_id,status,
  approval_mode,current_summary_version,approved_summary_version,
  basis_memory_version,basis_participant_ids,basis_membership_fingerprint,
  idempotency_key,approved_at
) values(
  '5e600000-0000-4000-8000-000000000001',
  '5e200000-0000-4000-8000-000000000001',
  '5e300000-0000-4000-8000-000000000001',
  '5e100000-0000-4000-8000-000000000001',
  'approved_for_generation','all_active',1,1,1,
  array['5e300000-0000-4000-8000-000000000001'::uuid],
  'phase-5e-terminal-attempt','phase-5e-terminal-attempt',now()
);
insert into public.planning_summaries(
  id,planning_request_id,room_id,version,schema_version,prompt_version,model,
  summary_json,readiness_status,summary_hash,basis_memory_version,
  basis_participant_ids,basis_membership_fingerprint
) values(
  '5e700000-0000-4000-8000-000000000001',
  '5e600000-0000-4000-8000-000000000001',
  '5e200000-0000-4000-8000-000000000001',
  1,'1','planning-v1','gpt-5.6-sol',
  '{"schemaVersion":"1","title":"Synthetic recovery summary"}'::jsonb,
  'ready_for_review','phase-5e-terminal-summary',1,
  array['5e300000-0000-4000-8000-000000000001'::uuid],
  'phase-5e-terminal-attempt'
);
insert into public.trip_plans(
  id,room_id,planning_request_id,planning_summary_id,version,status,
  schema_version,prompt_version,model,validation_status,
  basis_summary_version,basis_summary_hash,created_by_participant_id,
  created_by_user_id,error_code,failed_at
) values(
  '5e800000-0000-4000-8000-000000000001',
  '5e200000-0000-4000-8000-000000000001',
  '5e600000-0000-4000-8000-000000000001',
  '5e700000-0000-4000-8000-000000000001',
  1,'failed','1','trailie-itinerary-v1','gpt-5.6-sol','needs_revision',
  1,'phase-5e-terminal-summary',
  '5e300000-0000-4000-8000-000000000001',
  '5e100000-0000-4000-8000-000000000001',
  'model_unavailable',now()
);
insert into private.ai_provider_attempts(
  id,workflow,operation_key,attempt,model,status,lease_owner,lease_expires_at
) values(
  '5e900000-0000-4000-8000-000000000001',
  'itinerary_repair',
  '5e800000-0000-4000-8000-000000000001:repair',
  2,'gpt-5.6-sol','running',
  '5e900000-0000-4000-8000-000000000002',
  now()-interval '10 minutes'
);
set local role service_role;
select public.prepare_ai_recovery();
reset role;
select results_eq(
  $$select status,error_code,retryable,recovery_required
    from private.ai_provider_attempts
    where id='5e900000-0000-4000-8000-000000000001'$$,
  $$select 'failed'::text,'model_unavailable'::text,
      false,false$$,
  'recovery finalizes an expired provider attempt after its itinerary is terminal'
);
set local role service_role;
select is(
  (select count(*) from public.list_recoverable_ai_provider_attempts(50)
    where attempt_id='5e900000-0000-4000-8000-000000000001'),
  0::bigint,
  'terminal itinerary attempts do not remain in the provider recovery backlog'
);
reset role;

select * from finish();
rollback;
