begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(5);

select ok(
  pg_get_functiondef('public.get_trip_plan(uuid)'::regprocedure)
    like '%plan.status=''validating'' and plan.validation_status=''pass''%',
  'members can receive a validated core preview'
);
select ok(
  pg_get_functiondef('public.get_trip_plan(uuid)'::regprocedure)
    like '%case when plan.status=''published'' then private.project_plan_travel_evidence(plan.id)%',
  'draft previews never expose unbound travel evidence'
);
select ok(
  pg_get_functiondef('public.get_trip_plan(uuid)'::regprocedure)
    like '%private.is_room_member(target_room_id)%',
  'preview access remains membership scoped'
);
select ok(
  not has_function_privilege('anon','public.get_trip_plan(uuid)','execute'),
  'anonymous callers cannot read private previews'
);
select ok(
  pg_get_functiondef('private.project_public_itinerary(uuid)'::regprocedure)
    not like '%validating%',
  'public itinerary projection never exposes previews'
);

select * from finish();
rollback;
