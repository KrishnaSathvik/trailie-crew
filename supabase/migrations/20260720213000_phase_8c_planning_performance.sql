-- Phase 8C: expose only a validated core draft to authenticated room members
-- while optional enrichment finishes. Public/share projections remain published-only.
create or replace function public.get_trip_plan(target_room_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare plan public.trip_plans%rowtype; room public.rooms%rowtype; events jsonb;
begin
  if not private.is_room_member(target_room_id) then raise exception using errcode='P0001',message='Membership required.'; end if;
  select * into room from public.rooms where id=target_room_id;
  if room.current_plan_version is not null then
    select * into plan from public.trip_plans
      where room_id=target_room_id
        and version=room.current_plan_version
        and status='published';
  else
    select * into plan from public.trip_plans
      where room_id=target_room_id
        and change_request_id is null
        and status<>'superseded'
      order by version desc limit 1;
  end if;
  if not found then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'tripPlanId',e.trip_plan_id,'type',e.event_type,'createdAt',e.created_at) order by e.created_at,e.id),'[]'::jsonb) into events from public.trip_plan_events e where e.trip_plan_id=plan.id;
  return jsonb_build_object(
    'id',plan.id,'roomId',plan.room_id,'planningRequestId',plan.planning_request_id,'version',plan.version,
    'status',plan.status,'validationStatus',plan.validation_status,'basisSummaryVersion',plan.basis_summary_version,
    'itinerary',case when plan.status='published' or (plan.status='validating' and plan.validation_status='pass') then plan.itinerary_json else null end,
    'validationSummary',plan.validation_summary,'progressEvents',events,'createdAt',plan.created_at,'updatedAt',plan.updated_at,
    'publishedAt',plan.published_at,'errorCode',plan.error_code,
    'travelEvidence',case when plan.status='published' then private.project_plan_travel_evidence(plan.id) else '[]'::jsonb end
  );
end; $$;

comment on function public.get_trip_plan(uuid) is
  'Returns the current plan to room members; a validating draft is visible only after required validation passes.';
