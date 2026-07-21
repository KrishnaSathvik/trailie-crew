begin;
select plan(8);

select has_column(
  'private',
  'ai_runtime_telemetry',
  'expansion_ms',
  'compact expansion duration is stored privately'
);
select has_function(
  'public',
  'record_ai_runtime_expansion_metric',
  array['uuid', 'integer'],
  'bounded expansion metric recorder exists'
);
select has_function(
  'public',
  'get_phase8d_itinerary_runtime_samples',
  array['text', 'timestamp with time zone'],
  'Phase 8D service benchmark reader exists'
);
select function_privs_are(
  'public',
  'record_ai_runtime_expansion_metric',
  array['uuid', 'integer'],
  'authenticated',
  array[]::text[],
  'browser members cannot write expansion telemetry'
);
select function_privs_are(
  'public',
  'get_phase8d_itinerary_runtime_samples',
  array['text', 'timestamp with time zone'],
  'authenticated',
  array[]::text[],
  'browser members cannot read private runtime samples'
);
select function_privs_are(
  'public',
  'record_ai_runtime_expansion_metric',
  array['uuid', 'integer'],
  'service_role',
  array['EXECUTE'],
  'service role records expansion telemetry'
);
select function_privs_are(
  'public',
  'get_phase8d_itinerary_runtime_samples',
  array['text', 'timestamp with time zone'],
  'service_role',
  array['EXECUTE'],
  'service role reads bounded runtime samples'
);
select throws_ok(
  $$select public.record_ai_runtime_expansion_metric(
    '8d000000-0000-4000-8000-000000000001',
    -1
  )$$,
  '22023',
  'invalid_runtime_expansion_metric',
  'negative expansion duration is rejected'
);

select * from finish();
rollback;
