create type public.plan_share_mode as enum ('private','public_link','expiring_link');
create type public.plan_share_status as enum ('active','revoked','expired');

-- Phase 3B's original publish workflow predates plan hashes. Maintain the
-- immutable hash for every newly written itinerary without changing that
-- committed migration or permitting callers to clear an existing hash.
create function private.ensure_trip_plan_hash() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.itinerary_json is not null and new.plan_hash is null then
    new.plan_hash:=encode(extensions.digest(new.itinerary_json::text,'sha256'),'hex');
  end if;
  return new;
end; $$;
update public.trip_plans set plan_hash=encode(extensions.digest(itinerary_json::text,'sha256'),'hex')
  where itinerary_json is not null and plan_hash is null;
create trigger trip_plans_ensure_hash before insert or update of itinerary_json,status,plan_hash
  on public.trip_plans for each row execute function private.ensure_trip_plan_hash();

create table private.plan_export_rate_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  trip_plan_id uuid not null references public.trip_plans(id) on delete cascade,
  plan_version integer not null check (plan_version > 0),
  export_type text not null check (export_type in ('calendar','print')),
  requested_by_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint plan_export_rate_events_plan_room_fkey foreign key (trip_plan_id,room_id)
    references public.trip_plans(id,room_id)
);
create index plan_export_rate_events_window_idx on private.plan_export_rate_events
  (requested_by_user_id,room_id,export_type,created_at desc);
alter table private.plan_export_rate_events enable row level security;
alter table private.plan_export_rate_events force row level security;
create policy plan_export_rate_events_deny_direct on private.plan_export_rate_events
  as restrictive for all to public using(false) with check(false);
revoke all on private.plan_export_rate_events from public,anon,authenticated,service_role;

create function public.authorize_plan_export(
  target_room_id uuid,target_version integer,target_export_type text
) returns boolean language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); plan public.trip_plans%rowtype; request_limit integer;
begin
  if caller is null then raise exception using errcode='P0001',message='Authentication required.'; end if;
  request_limit:=case target_export_type when 'calendar' then 30 when 'print' then 10 else null end;
  if request_limit is null then raise exception using errcode='P0001',message='Invalid export type.'; end if;
  select * into plan from public.trip_plans
    where room_id=target_room_id and version=target_version and status='published' and published_at is not null;
  if not found or not private.is_room_member(target_room_id) then
    raise exception using errcode='P0001',message='Export not allowed.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text||':'||target_room_id::text||':'||target_export_type,0));
  delete from private.plan_export_rate_events where created_at<now()-interval '1 day';
  if (select count(*) from private.plan_export_rate_events event
      where event.requested_by_user_id=caller and event.room_id=target_room_id
        and event.export_type=target_export_type and event.created_at>now()-interval '10 minutes')>=request_limit then
    raise exception using errcode='P0001',message='Rate limited.';
  end if;
  insert into private.plan_export_rate_events(
    room_id,trip_plan_id,plan_version,export_type,requested_by_user_id
  ) values(target_room_id,plan.id,plan.version,target_export_type,caller);
  return true;
end; $$;

create table public.plan_share_links (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  trip_plan_id uuid not null references public.trip_plans(id) on delete restrict,
  plan_version integer not null check (plan_version > 0),
  mode public.plan_share_mode not null check (mode <> 'private'),
  status public.plan_share_status not null default 'active' check (status <> 'expired'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_prefix text check (token_prefix is null or token_prefix ~ '^[A-Za-z0-9_-]{6,12}$'),
  snapshot_plan_hash text not null check (char_length(snapshot_plan_hash) between 1 and 128),
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  public_snapshot jsonb not null check (jsonb_typeof(public_snapshot)='object'),
  created_by_participant_id uuid not null,
  created_by_user_id uuid not null references auth.users(id),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_accessed_at timestamptz,
  access_count bigint not null default 0 check (access_count >= 0),
  constraint plan_share_links_plan_room_fkey foreign key (trip_plan_id,room_id)
    references public.trip_plans(id,room_id),
  constraint plan_share_links_creator_fkey foreign key
    (created_by_participant_id,room_id,created_by_user_id)
    references public.participants(id,room_id,user_id),
  constraint plan_share_links_mode_expiry_check check (
    (mode='public_link' and expires_at is null) or
    (mode='expiring_link' and expires_at is not null)
  ),
  constraint plan_share_links_revocation_check check (
    (status='active' and revoked_at is null) or
    (status='revoked' and revoked_at is not null)
  )
);
create unique index plan_share_links_one_active_version_idx
  on public.plan_share_links(trip_plan_id) where status='active';
create index plan_share_links_room_version_idx
  on public.plan_share_links(room_id,plan_version,created_at desc);
create index plan_share_links_expiry_idx
  on public.plan_share_links(expires_at) where status='active' and expires_at is not null;

alter table public.plan_share_links enable row level security;
create policy plan_share_links_deny_browser on public.plan_share_links
  as restrictive for all to anon,authenticated using(false) with check(false);
revoke all on public.plan_share_links from public,anon,authenticated,service_role;

create trigger plan_share_links_set_updated_at before update on public.plan_share_links
  for each row execute function private.set_updated_at();

create function private.public_safe_itinerary_text(target_text text,target_room_id uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare clean text:=nullif(btrim(target_text),'');
begin
  if clean is null or clean ~ '[<>]' or clean ~* '[[:cntrl:]]' or
     clean ~* '(^|[^a-z])(confirmation|booking reference|passport|email address|provider request|model id|api key)([^a-z]|$)' or
     clean ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[A-Za-z]{2,}' or
     exists(select 1 from public.participants participant where participant.room_id=target_room_id and position(lower(participant.display_name) in lower(clean))>0)
  then return null; end if;
  return clean;
end; $$;

create function private.public_itinerary_location(location jsonb,target_room_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select case when location is null or jsonb_typeof(location)<>'object' or private.public_safe_itinerary_text(location->>'name',target_room_id) is null then null else jsonb_strip_nulls(jsonb_build_object(
    'name',private.public_safe_itinerary_text(location->>'name',target_room_id),
    'timezone',nullif(location->>'timezone',''),
    'verificationStatus',case when location->>'verificationStatus' in ('verified','estimated','unknown') then location->>'verificationStatus' else 'unknown' end
  )) end;
$$;

create function private.project_public_itinerary(target_plan_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare plan public.trip_plans%rowtype; itinerary jsonb; projected jsonb;
begin
  select * into plan from public.trip_plans where id=target_plan_id;
  if not found or plan.status<>'published' or plan.published_at is null or plan.itinerary_json is null then return null; end if;
  itinerary:=plan.itinerary_json;
  select jsonb_strip_nulls(jsonb_build_object(
    'schemaVersion','1',
    'title',private.public_safe_itinerary_text(itinerary->>'title',plan.room_id),
    'destinationSummary',private.public_safe_itinerary_text(itinerary->>'destinationSummary',plan.room_id),
    'timezone',itinerary->>'timezone',
    'startDate',itinerary->>'startDate',
    'endDate',itinerary->>'endDate',
    'version',plan.version,
    'publishedAt',plan.published_at,
    'validation',jsonb_build_object('status',plan.validation_status,'passed',plan.validation_status='pass'),
    'days',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'date',day->>'date',
      'title',private.public_safe_itinerary_text(day->>'title',plan.room_id),
      'summary',private.public_safe_itinerary_text(day->>'summary',plan.room_id),
      'items',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'key',item->>'id',
        'type',item->>'type',
        'startTime',nullif(item->>'startTime',''),
        'endTime',nullif(item->>'endTime',''),
        'title',private.public_safe_itinerary_text(item->>'title',plan.room_id),
        'description',private.public_safe_itinerary_text(item->>'description',plan.room_id),
        'location',private.public_itinerary_location(item->'location',plan.room_id),
        'reservationStatus',case when item->'reservation'->>'status' in ('required','recommended','not_required','unknown') then item->'reservation'->>'status' else 'unknown' end,
        'dataStatus',coalesce(private.public_itinerary_location(item->'location',plan.room_id)->>'verificationStatus','unknown')
      )) order by item->>'startTime',item->>'id') from jsonb_array_elements(coalesce(day->'items','[]'::jsonb)) item),'[]'::jsonb),
      'travelSegments',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'mode',segment->>'mode',
        'origin',private.public_itinerary_location(segment->'origin',plan.room_id),
        'destination',private.public_itinerary_location(segment->'destination',plan.room_id),
        'durationMinutes',case when jsonb_typeof(segment->'durationMinutes')='number' then (segment->>'durationMinutes')::integer else null end,
        'bufferMinutes',case when jsonb_typeof(segment->'bufferMinutes')='number' then (segment->>'bufferMinutes')::integer else null end,
        'dataStatus',case when segment->>'verificationStatus' in ('verified','estimated','unknown') then segment->>'verificationStatus' else 'unknown' end
      )) order by segment->>'id') from jsonb_array_elements(coalesce(day->'travelSegments','[]'::jsonb)) segment),'[]'::jsonb),
      'warnings',coalesce((select jsonb_agg(safe_warning order by ordinal) from (
        select private.public_safe_itinerary_text(warning.value,plan.room_id) safe_warning,warning.ordinality ordinal
        from jsonb_array_elements_text(coalesce(day->'warnings','[]'::jsonb)) with ordinality warning(value,ordinality)
      ) filtered where safe_warning is not null),'[]'::jsonb)
    )) order by day->>'date') from jsonb_array_elements(coalesce(itinerary->'days','[]'::jsonb)) day),'[]'::jsonb),
    'lodging',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'name',private.public_safe_itinerary_text(stay->>'name',plan.room_id),
      'area',private.public_safe_itinerary_text(stay->>'area',plan.room_id),
      'checkInDate',stay->>'checkInDate','checkOutDate',stay->>'checkOutDate',
      'location',private.public_itinerary_location(stay->'location',plan.room_id),
      'reservationStatus',case when stay->'reservation'->>'status' in ('required','recommended','not_required','unknown') then stay->'reservation'->>'status' else 'unknown' end
    )) order by stay->>'checkInDate',stay->>'id') from jsonb_array_elements(coalesce(itinerary->'lodging','[]'::jsonb)) stay),'[]'::jsonb),
    'food',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'name',private.public_safe_itinerary_text(food->>'name',plan.room_id),
      'mealWindow',food->>'mealWindow',
      'location',private.public_itinerary_location(food->'location',plan.room_id),
      'dietaryNote',case when jsonb_array_length(coalesce(food->'dietaryAlignment','[]'::jsonb))>0 then 'Dietary-friendly options are included.' else null end,
      'reservationStatus',case when food->'reservation'->>'status' in ('required','recommended','not_required','unknown') then food->'reservation'->>'status' else 'unknown' end
    )) order by food->>'mealWindow',food->>'id') from jsonb_array_elements(coalesce(itinerary->'restaurants','[]'::jsonb)) food),'[]'::jsonb),
    'disclaimer','No bookings were made by Trailie'
  )) into projected;
  return projected;
end; $$;

create function private.notify_plan_share_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'kind','plan_share','roomId',new.room_id,'tripPlanId',new.trip_plan_id,
      'planVersion',new.plan_version,
      'eventType',case when tg_op='INSERT' then 'created' when new.status='revoked' and old.status='active' then 'revoked' else 'changed' end
    ),
    'plan_share_changed','room:'||new.room_id::text,true
  );
  return null;
end; $$;
create trigger plan_share_links_notify_room after insert or update of status,expires_at on public.plan_share_links
  for each row execute function private.notify_plan_share_change();

create function public.create_plan_share_link(
  target_trip_plan_id uuid,participant_id uuid,share_mode text,
  target_token_hash text,target_token_prefix text,target_expires_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); plan public.trip_plans%rowtype; member public.participants%rowtype; snapshot jsonb; created public.plan_share_links%rowtype;
begin
  if caller is null then raise exception using errcode='P0001',message='Authentication required.'; end if;
  select * into plan from public.trip_plans where id=target_trip_plan_id for share;
  if not found then raise exception using errcode='P0001',message='Plan not published.'; end if;
  select * into member from public.participants where id=participant_id and room_id=plan.room_id and user_id=caller and role='host' and status='active';
  if not found or not exists(select 1 from public.rooms room where room.id=plan.room_id and room.host_user_id=caller and room.status='active') then
    raise exception using errcode='P0001',message='Host required.';
  end if;
  if plan.status<>'published' or plan.published_at is null or plan.itinerary_json is null or plan.plan_hash is null then
    raise exception using errcode='P0001',message='Plan not published.';
  end if;
  if share_mode not in ('public_link','expiring_link') or target_token_hash !~ '^[0-9a-f]{64}$' or target_token_prefix !~ '^[A-Za-z0-9_-]{6,12}$' then
    raise exception using errcode='P0001',message='Share not allowed.';
  end if;
  if (share_mode='public_link' and target_expires_at is not null) or
     (share_mode='expiring_link' and (target_expires_at is null or target_expires_at<=now())) then
    raise exception using errcode='P0001',message='Invalid expiration.';
  end if;
  if (select count(*) from public.plan_share_links link where link.room_id=plan.room_id and link.created_at>now()-interval '10 minutes')>=5 then
    raise exception using errcode='P0001',message='Rate limited.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(plan.id::text,0));
  update public.plan_share_links set status='revoked',revoked_at=now()
    where trip_plan_id=plan.id and status='active';
  snapshot:=private.project_public_itinerary(plan.id);
  if snapshot is null then raise exception using errcode='P0001',message='Plan not published.'; end if;
  insert into public.plan_share_links(
    room_id,trip_plan_id,plan_version,mode,status,token_hash,token_prefix,
    snapshot_plan_hash,snapshot_hash,public_snapshot,created_by_participant_id,created_by_user_id,expires_at
  ) values(
    plan.room_id,plan.id,plan.version,share_mode::public.plan_share_mode,'active',target_token_hash,target_token_prefix,
    plan.plan_hash,encode(extensions.digest(snapshot::text,'sha256'),'hex'),snapshot,member.id,caller,target_expires_at
  ) returning * into created;
  return jsonb_build_object(
    'id',created.id,'tripPlanId',created.trip_plan_id,'planVersion',created.plan_version,
    'mode',created.mode,'status','active','tokenPrefix',created.token_prefix,
    'snapshotHash',created.snapshot_hash,'expiresAt',created.expires_at,'createdAt',created.created_at
  );
exception when unique_violation then
  raise exception using errcode='P0001',message='Share rotation failed.';
end; $$;

create function public.revoke_plan_share_link(share_link_id uuid,participant_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); link public.plan_share_links%rowtype;
begin
  if caller is null then raise exception using errcode='P0001',message='Authentication required.'; end if;
  select * into link from public.plan_share_links where id=share_link_id for update;
  if not found then raise exception using errcode='P0001',message='Share link not found.'; end if;
  perform 1 from public.participants where id=participant_id and room_id=link.room_id and user_id=caller and role='host' and status='active';
  if not found or not exists(select 1 from public.rooms room where room.id=link.room_id and room.host_user_id=caller and room.status='active') then
    raise exception using errcode='P0001',message='Host required.';
  end if;
  if link.status='active' then
    update public.plan_share_links set status='revoked',revoked_at=now() where id=link.id;
  end if;
  return jsonb_build_object('id',link.id,'tripPlanId',link.trip_plan_id,'planVersion',link.plan_version,'status','revoked');
end; $$;

create function public.get_plan_share_status(target_trip_plan_id uuid,target_plan_version integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare plan public.trip_plans%rowtype; link public.plan_share_links%rowtype; derived_status text;
begin
  select * into plan from public.trip_plans where id=target_trip_plan_id and version=target_plan_version and status='published';
  if not found then raise exception using errcode='P0001',message='Plan not published.'; end if;
  if not private.is_room_member(plan.room_id) then raise exception using errcode='P0001',message='Membership required.'; end if;
  select * into link from public.plan_share_links where trip_plan_id=plan.id order by created_at desc,id desc limit 1;
  if not found then return jsonb_build_object('tripPlanId',plan.id,'planVersion',plan.version,'mode','private','status','revoked'); end if;
  derived_status:=case when link.status='revoked' then 'revoked' when link.expires_at is not null and link.expires_at<=now() then 'expired' else 'active' end;
  return jsonb_build_object(
    'id',link.id,'tripPlanId',link.trip_plan_id,'planVersion',link.plan_version,
    'mode',link.mode,'status',derived_status,'tokenPrefix',link.token_prefix,
    'snapshotHash',link.snapshot_hash,'expiresAt',link.expires_at,
    'createdAt',link.created_at,'revokedAt',link.revoked_at
  );
end; $$;

create function public.verify_plan_share_token_hash(target_token_hash text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare link public.plan_share_links%rowtype; plan public.trip_plans%rowtype; current_snapshot jsonb;
begin
  if target_token_hash is null or target_token_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into link from public.plan_share_links where token_hash=target_token_hash;
  if not found or link.status<>'active' or (link.expires_at is not null and link.expires_at<=now()) then return null; end if;
  select * into plan from public.trip_plans where id=link.trip_plan_id and room_id=link.room_id and version=link.plan_version and status='published';
  if not found or plan.published_at is null or plan.plan_hash is distinct from link.snapshot_plan_hash then return null; end if;
  current_snapshot:=private.project_public_itinerary(plan.id);
  if current_snapshot is null or encode(extensions.digest(current_snapshot::text,'sha256'),'hex')<>link.snapshot_hash or current_snapshot<>link.public_snapshot then return null; end if;
  return jsonb_build_object(
    'itinerary',link.public_snapshot,'snapshotHash',link.snapshot_hash,
    'mode',link.mode,'expiresAt',link.expires_at
  );
end; $$;

revoke execute on function private.ensure_trip_plan_hash(),private.public_safe_itinerary_text(text,uuid),private.public_itinerary_location(jsonb,uuid),private.project_public_itinerary(uuid),private.notify_plan_share_change() from public,anon,authenticated,service_role;
revoke execute on function public.authorize_plan_export(uuid,integer,text),public.create_plan_share_link(uuid,uuid,text,text,text,timestamptz),public.revoke_plan_share_link(uuid,uuid),public.get_plan_share_status(uuid,integer),public.verify_plan_share_token_hash(text) from public,anon,authenticated,service_role;
grant execute on function public.authorize_plan_export(uuid,integer,text),public.create_plan_share_link(uuid,uuid,text,text,text,timestamptz),public.revoke_plan_share_link(uuid,uuid),public.get_plan_share_status(uuid,integer) to authenticated;
grant execute on function public.verify_plan_share_token_hash(text) to service_role;
