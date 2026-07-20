create function public.get_ai_runtime_benchmark_report(
  target_room_id_hash text,
  window_started_at timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as (
    select
      telemetry.*,
      coalesce((
        select sum(value::integer)
        from jsonb_each_text(telemetry.tool_call_ms)
      ), 0) as total_tool_ms
    from private.ai_runtime_telemetry as telemetry
    where telemetry.room_id_hash = target_room_id_hash
      and telemetry.started_at >= window_started_at
  ),
  categories as (
    select
      response_type,
      count(*)::integer as request_count,
      round(percentile_cont(0.5) within group (
        order by time_to_first_visible_output_ms
      )::numeric)::integer as visible_p50_ms,
      round(percentile_cont(0.95) within group (
        order by time_to_first_visible_output_ms
      )::numeric)::integer as visible_p95_ms,
      round(percentile_cont(0.5) within group (
        order by time_to_first_model_token_ms
      )::numeric)::integer as first_token_p50_ms,
      round(percentile_cont(0.95) within group (
        order by time_to_first_model_token_ms
      )::numeric)::integer as first_token_p95_ms,
      round(percentile_cont(0.5) within group (
        order by total_duration_ms
      )::numeric)::integer as total_p50_ms,
      round(percentile_cont(0.95) within group (
        order by total_duration_ms
      )::numeric)::integer as total_p95_ms,
      max(total_duration_ms)::integer as maximum_ms,
      round(percentile_cont(0.5) within group (
        order by total_tool_ms
      )::numeric)::integer as tool_p50_ms,
      round(percentile_cont(0.95) within group (
        order by total_tool_ms
      )::numeric)::integer as tool_p95_ms,
      round(percentile_cont(0.5) within group (
        order by validation_ms
      )::numeric)::integer as validation_p50_ms,
      round(percentile_cont(0.95) within group (
        order by validation_ms
      )::numeric)::integer as validation_p95_ms,
      sum(coalesce(input_tokens, 0))::bigint as input_tokens,
      sum(coalesce(output_tokens, 0))::bigint as output_tokens,
      sum(estimated_cost) as estimated_cost,
      count(*) filter (where success_state = 'failure')::integer
        as failure_count,
      count(*) filter (where success_state = 'fallback')::integer
        as fallback_count,
      count(*) filter (where success_state = 'cancelled')::integer
        as cancellation_count
    from filtered
    group by response_type
  ),
  category_json as (
    select jsonb_object_agg(
      category.response_type,
      jsonb_build_object(
        'requestCount', category.request_count,
        'visibleP50Ms', category.visible_p50_ms,
        'visibleP95Ms', category.visible_p95_ms,
        'firstTokenP50Ms', category.first_token_p50_ms,
        'firstTokenP95Ms', category.first_token_p95_ms,
        'totalP50Ms', category.total_p50_ms,
        'totalP95Ms', category.total_p95_ms,
        'maximumMs', category.maximum_ms,
        'toolP50Ms', category.tool_p50_ms,
        'toolP95Ms', category.tool_p95_ms,
        'validationP50Ms', category.validation_p50_ms,
        'validationP95Ms', category.validation_p95_ms,
        'inputTokens', category.input_tokens,
        'outputTokens', category.output_tokens,
        'estimatedCost', category.estimated_cost,
        'failures', category.failure_count,
        'fallbacks', category.fallback_count,
        'cancellations', category.cancellation_count,
        'routeUsage', coalesce((
          select jsonb_object_agg(route.selected_model_route, route.route_count)
          from (
            select
              selected_model_route,
              count(*)::integer as route_count
            from filtered
            where response_type = category.response_type
              and selected_model_route is not null
            group by selected_model_route
          ) as route
        ), '{}'::jsonb)
      )
    ) as value
    from categories as category
  )
  select jsonb_build_object(
    'windowStartedAt', window_started_at,
    'requestCount', (select count(*)::integer from filtered),
    'categories', coalesce(
      (select category_json.value from category_json),
      '{}'::jsonb
    ),
    'failures', (
      select count(*)::integer
      from filtered
      where success_state = 'failure'
    ),
    'fallbacks', (
      select count(*)::integer
      from filtered
      where success_state = 'fallback'
    ),
    'cancellations', (
      select count(*)::integer
      from filtered
      where success_state = 'cancelled'
    )
  )
  where target_room_id_hash ~ '^[a-f0-9]{64}$';
$$;

revoke all on function public.get_ai_runtime_benchmark_report(text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_ai_runtime_benchmark_report(text, timestamptz)
  to service_role;
