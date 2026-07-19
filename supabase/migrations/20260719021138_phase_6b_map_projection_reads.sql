create function private.plan_map_projection_source(target_trip_plan_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  plan public.trip_plans%rowtype;
  evidence jsonb;
  resolution jsonb;
begin
  select * into plan
  from public.trip_plans
  where id=target_trip_plan_id
    and status='published'
    and published_at is not null;
  if not found then
    raise exception using errcode='P0001',message='Plan not published.';
  end if;

  if exists(
    select 1
    from private.plan_evidence_snapshots snapshot
    where snapshot.trip_plan_id=plan.id
      and coalesce(snapshot.evidence_json#>>'{restrictions,storage}','unknown')='prohibited'
  ) then
    raise exception using errcode='P0001',message='Map projection storage prohibited.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'evidence',snapshot.evidence_json,
        'targetItemId',snapshot.target_item_id
      )
      order by snapshot.created_at,snapshot.id
    ),
    '[]'::jsonb
  )
  into evidence
  from private.plan_evidence_snapshots snapshot
  where snapshot.trip_plan_id=plan.id
    and snapshot.plan_version=plan.version;

  select destination.resolution_json
  into resolution
  from private.canonical_destination_resolutions destination
  where destination.trip_plan_id=plan.id;

  return jsonb_build_object(
    'roomId',plan.room_id,
    'tripPlanId',plan.id,
    'planVersion',plan.version,
    'currentPlanVersion',(select room.current_plan_version from public.rooms room where room.id=plan.room_id),
    'publishedAt',plan.published_at,
    'itinerary',plan.itinerary_json,
    'evidenceSnapshots',evidence,
    'destinationResolution',resolution
  );
end;
$$;

create function public.get_plan_map_projection_source(
  target_room_id uuid,
  target_plan_version integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  plan public.trip_plans%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode='P0001',message='Authentication required.';
  end if;
  if target_plan_version is null or target_plan_version<1 then
    raise exception using errcode='P0001',message='Plan not published.';
  end if;
  if not private.is_room_member(target_room_id) then
    raise exception using errcode='P0001',message='Membership required.';
  end if;
  select * into plan
  from public.trip_plans
  where room_id=target_room_id
    and version=target_plan_version
    and status='published'
    and published_at is not null;
  if not found then
    raise exception using errcode='P0001',message='Plan not published.';
  end if;
  return private.plan_map_projection_source(plan.id);
end;
$$;

create function public.get_public_plan_map_projection_source(
  target_token_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  link public.plan_share_links%rowtype;
  plan public.trip_plans%rowtype;
  current_snapshot jsonb;
begin
  if target_token_hash is null or target_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into link
  from public.plan_share_links
  where token_hash=target_token_hash;
  if not found
    or link.status<>'active'
    or (link.expires_at is not null and link.expires_at<=now()) then
    return null;
  end if;
  select * into plan
  from public.trip_plans
  where id=link.trip_plan_id
    and room_id=link.room_id
    and version=link.plan_version
    and status='published';
  if not found
    or plan.published_at is null
    or plan.plan_hash is distinct from link.snapshot_plan_hash then
    return null;
  end if;
  current_snapshot:=private.project_public_itinerary(plan.id);
  if current_snapshot is null
    or encode(extensions.digest(current_snapshot::text,'sha256'),'hex')<>link.snapshot_hash
    or current_snapshot<>link.public_snapshot then
    return null;
  end if;
  return private.plan_map_projection_source(plan.id);
end;
$$;

revoke execute on function private.plan_map_projection_source(uuid)
  from public,anon,authenticated,service_role;
revoke execute on function public.get_plan_map_projection_source(uuid,integer),
  public.get_public_plan_map_projection_source(text)
  from public,anon,authenticated,service_role;
grant execute on function public.get_plan_map_projection_source(uuid,integer)
  to authenticated;
grant execute on function public.get_public_plan_map_projection_source(text)
  to service_role;

comment on function private.plan_map_projection_source(uuid) is
  'Phase 6B exact-version source assembler. Returns immutable source data only to narrow security-definer wrappers and rejects prohibited storage.';
comment on function public.get_plan_map_projection_source(uuid,integer) is
  'Phase 6B active-member exact-version map projection source.';
comment on function public.get_public_plan_map_projection_source(text) is
  'Phase 6B service-only exact-version share map source with token, revocation, expiration, and snapshot integrity checks.';
