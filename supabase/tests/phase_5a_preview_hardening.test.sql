begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(11);

select has_table('private','recovery_executions','private recovery rate-limit ledger exists');
select has_function('public','claim_recovery_execution',array['integer'],'server recovery lease RPC exists');
select isnt((select relrowsecurity from pg_class where oid='private.recovery_executions'::regclass),false,'recovery ledger has RLS');
select isnt((select relforcerowsecurity from pg_class where oid='private.recovery_executions'::regclass),false,'recovery ledger forces RLS');
select is((select count(*) from pg_policies where schemaname='private' and tablename='recovery_executions'),1::bigint,'recovery ledger has an explicit deny policy');
select ok(not has_table_privilege('anon','private.recovery_executions','select'),'anonymous cannot read recovery ledger');
select ok(not has_table_privilege('authenticated','private.recovery_executions','select'),'browser cannot read recovery ledger');
select ok(not has_function_privilege('authenticated','public.claim_recovery_execution(integer)','execute'),'browser cannot claim recovery execution');
select ok(has_function_privilege('service_role','public.claim_recovery_execution(integer)','execute'),'service role can claim recovery execution');

set local role service_role;
select ok(public.claim_recovery_execution(10),'first recovery execution acquires the lease');
select ok(not public.claim_recovery_execution(10),'duplicate execution inside cooldown is rate limited');
reset role;

select * from finish();
rollback;
