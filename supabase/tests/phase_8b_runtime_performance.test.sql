begin;
select plan(31);

select has_table(
  'private',
  'ai_runtime_telemetry',
  'runtime telemetry is private durable state'
);
select has_column(
  'private',
  'ai_runtime_telemetry',
  'time_to_first_visible_output_ms',
  'visible-output timing is recorded'
);
select has_column(
  'private',
  'ai_runtime_telemetry',
  'time_to_first_model_token_ms',
  'first-model-token timing is recorded'
);
select has_column(
  'private',
  'ai_runtime_telemetry',
  'tool_observations',
  'bounded provider observations are recorded'
);
select has_column(
  'private',
  'ai_runtime_telemetry',
  'selected_model_route',
  'the internal route name is recorded'
);
select has_column(
  'private',
  'ai_runtime_telemetry',
  'request_complexity',
  'request complexity is recorded'
);
select has_function(
  'public',
  'record_ai_runtime_telemetry',
  array['jsonb'],
  'service-only telemetry recorder exists'
);
select has_function(
  'public',
  'get_ai_runtime_benchmark_report',
  array['text', 'timestamptz'],
  'service-only aggregate benchmark report exists'
);

select is(
  (select relrowsecurity from pg_class where oid = 'private.ai_runtime_telemetry'::regclass),
  true,
  'runtime telemetry enables RLS'
);
select is(
  (select relforcerowsecurity from pg_class where oid = 'private.ai_runtime_telemetry'::regclass),
  true,
  'runtime telemetry forces RLS'
);
select table_privs_are(
  'private',
  'ai_runtime_telemetry',
  'authenticated',
  array[]::text[],
  'members cannot inspect runtime telemetry'
);
select table_privs_are(
  'private',
  'ai_runtime_telemetry',
  'anon',
  array[]::text[],
  'anonymous clients cannot inspect runtime telemetry'
);
select table_privs_are(
  'private',
  'ai_runtime_telemetry',
  'service_role',
  array[]::text[],
  'service role uses the narrow recorder instead of table access'
);
select function_privs_are(
  'public',
  'record_ai_runtime_telemetry',
  array['jsonb'],
  'authenticated',
  array[]::text[],
  'members cannot write runtime telemetry'
);
select function_privs_are(
  'public',
  'record_ai_runtime_telemetry',
  array['jsonb'],
  'service_role',
  array['EXECUTE'],
  'service role can record validated runtime telemetry'
);
select function_privs_are(
  'public',
  'get_ai_runtime_benchmark_report',
  array['text', 'timestamptz'],
  'authenticated',
  array[]::text[],
  'members cannot read runtime benchmark telemetry'
);
select function_privs_are(
  'public',
  'get_ai_runtime_benchmark_report',
  array['text', 'timestamptz'],
  'anon',
  array[]::text[],
  'anonymous clients cannot read runtime benchmark telemetry'
);
select function_privs_are(
  'public',
  'get_ai_runtime_benchmark_report',
  array['text', 'timestamptz'],
  'service_role',
  array['EXECUTE'],
  'service role can read aggregate runtime benchmark telemetry'
);
select hasnt_column(
  'private',
  'ai_runtime_telemetry',
  'prompt',
  'runtime telemetry cannot store prompts'
);
select hasnt_column(
  'private',
  'ai_runtime_telemetry',
  'messages',
  'runtime telemetry cannot store conversation bodies'
);
select hasnt_column(
  'private',
  'ai_runtime_telemetry',
  'session_token',
  'runtime telemetry cannot store session tokens'
);
select has_function(
  'public',
  'cancel_planning_generation',
  array['uuid', 'uuid'],
  'planning generation has an idempotent Stop boundary'
);
select has_function(
  'public',
  'cancel_itinerary_generation',
  array['uuid', 'uuid'],
  'itinerary generation has an idempotent Stop boundary'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.cancel_planning_generation(uuid,uuid)',
    'execute'
  ),
  'members may stop planning generation'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.cancel_itinerary_generation(uuid,uuid)',
    'execute'
  ),
  'members may stop itinerary generation'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.cancel_planning_generation(uuid,uuid)',
    'execute'
  ),
  'anonymous callers cannot stop planning generation'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.cancel_itinerary_generation(uuid,uuid)',
    'execute'
  ),
  'anonymous callers cannot stop itinerary generation'
);
select ok(
  pg_get_functiondef('public.start_ai_run(uuid,text,text)'::regprocedure)
    like '%invocation.status in (''failed'', ''cancelled'')%',
  'a stopped focused answer may be explicitly retried'
);
select ok(
  pg_get_functiondef('public.start_ai_run(uuid,text,text)'::regprocedure)
    not like '%invocation.status = ''cancelled'' or%',
  'a stopped focused answer is not rejected as an automatic retry'
);

select public.record_ai_runtime_telemetry(
  jsonb_build_object(
    'requestId', '8b000000-0000-4000-8000-000000000001',
    'roomIdHash', repeat('a', 64),
    'responseType', 'normal_chat',
    'detectedIntent', 'direct_question',
    'requestComplexity', 'simple',
    'selectedModelRoute', 'fast',
    'toolClassesSelected', '[]'::jsonb,
    'startedAt', '2026-07-20T18:00:00.000Z',
    'permissionCheckMs', 12,
    'timeToFirstModelTokenMs', 40,
    'timeToFirstVisibleOutputMs', 15,
    'providerCallCount', 1,
    'toolCallMs', '{}'::jsonb,
    'toolObservations', '{}'::jsonb,
    'repairCount', 0,
    'totalDurationMs', 80,
    'inputTokens', 100,
    'outputTokens', 25,
    'estimatedCost', null,
    'successState', 'success'
  )
);

select is(
  (
    select success_state
    from private.ai_runtime_telemetry
    where request_id = '8b000000-0000-4000-8000-000000000001'
  ),
  'success',
  'the recorder persists one bounded successful observation'
);

select is(
  (
    public.get_ai_runtime_benchmark_report(
      repeat('a', 64),
      '2026-07-20T17:59:00.000Z'
    )->>'requestCount'
  )::integer,
  1,
  'the benchmark report returns only bounded room observations'
);

select * from finish();
rollback;
