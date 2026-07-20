alter type public.guest_role add value if not exists 'guest_suggester';

create type private.guest_suggestion_target_type as enum (
  'plan','day','item','route'
);
create type private.guest_suggestion_type as enum (
  'add_item','remove_item','replace_item','reschedule_item','move_item',
  'update_note','change_route','general'
);
create type private.guest_suggestion_status as enum (
  'open','dismissed','converted'
);

alter table private.guest_sessions
  add column suggestion_window_started_at timestamptz,
  add column suggestion_count integer not null default 0
    check (suggestion_count >= 0),
  add constraint guest_sessions_suggestion_scope_unique
    unique(session_hash,room_id,plan_version_id);

create table private.guest_suggestions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  plan_version_id uuid not null references public.trip_plans(id) on delete restrict,
  guest_session_id text not null,
  target_type private.guest_suggestion_target_type not null,
  target_id text,
  suggestion_type private.guest_suggestion_type not null,
  title text not null,
  details text not null,
  proposed_date date,
  proposed_start_time time,
  proposed_end_time time,
  status private.guest_suggestion_status not null default 'open',
  dismissed_at timestamptz,
  dismissed_by uuid references public.participants(id) on delete set null,
  converted_at timestamptz,
  converted_by uuid references public.participants(id) on delete set null,
  rebased_to_plan_version_id uuid references public.trip_plans(id) on delete restrict,
  rebase_confirmed_at timestamptz,
  rebase_confirmed_by uuid references public.participants(id) on delete set null,
  revision_request_id uuid references public.plan_change_requests(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guest_suggestions_plan_room_fkey
    foreign key(plan_version_id,room_id)
    references public.trip_plans(id,room_id),
  constraint guest_suggestions_session_scope_fkey
    foreign key(guest_session_id,room_id,plan_version_id)
    references private.guest_sessions(session_hash,room_id,plan_version_id),
  constraint guest_suggestions_rebased_room_fkey
    foreign key(rebased_to_plan_version_id,room_id)
    references public.trip_plans(id,room_id),
  constraint guest_suggestions_revision_room_fkey
    foreign key(revision_request_id,room_id)
    references public.plan_change_requests(id,room_id),
  constraint guest_suggestions_title_check check (
    char_length(btrim(title)) between 1 and 120
    and title !~ '[<>]'
    and translate(title,E'\n\r\t','') !~ '[[:cntrl:]]'
  ),
  constraint guest_suggestions_details_check check (
    char_length(btrim(details)) between 1 and 2000
    and details !~ '[<>]'
    and translate(details,E'\n\r\t','') !~ '[[:cntrl:]]'
  ),
  constraint guest_suggestions_time_check check (
    proposed_start_time is null or proposed_end_time is null
    or proposed_end_time > proposed_start_time
  ),
  constraint guest_suggestions_state_check check (
    (
      status='open'
      and dismissed_at is null and dismissed_by is null
      and converted_at is null and converted_by is null
      and rebased_to_plan_version_id is null
      and rebase_confirmed_at is null and rebase_confirmed_by is null
      and revision_request_id is null
    )
    or (
      status='dismissed'
      and dismissed_at is not null and dismissed_by is not null
      and converted_at is null and converted_by is null
      and rebased_to_plan_version_id is null
      and rebase_confirmed_at is null and rebase_confirmed_by is null
      and revision_request_id is null
    )
    or (
      status='converted'
      and dismissed_at is null and dismissed_by is null
      and converted_at is not null and converted_by is not null
      and rebased_to_plan_version_id is not null
      and revision_request_id is not null
      and (
        (rebase_confirmed_at is null and rebase_confirmed_by is null)
        or
        (rebase_confirmed_at is not null and rebase_confirmed_by is not null)
      )
    )
  )
);

create index guest_suggestions_room_status_idx
  on private.guest_suggestions(room_id,status,created_at desc,id);
create index guest_suggestions_guest_owner_idx
  on private.guest_suggestions(guest_session_id,created_at desc,id);
create unique index guest_suggestions_one_conversion_idx
  on private.guest_suggestions(revision_request_id)
  where revision_request_id is not null;

alter table private.guest_suggestions enable row level security;
alter table private.guest_suggestions force row level security;
create policy guest_suggestions_deny_direct on private.guest_suggestions
  as restrictive for all to public using(false) with check(false);
revoke all on private.guest_suggestions
  from public,anon,authenticated,service_role;

create trigger guest_suggestions_set_updated_at
before update on private.guest_suggestions
for each row execute function private.set_updated_at();

create function private.guest_suggestion_text_allowed(
  target_value text,
  maximum_length integer
) returns boolean language sql immutable set search_path='' as $$
  select target_value is not null
    and maximum_length between 1 and 2000
    and char_length(btrim(target_value)) between 1 and maximum_length
    and target_value !~ '[<>]'
    and translate(target_value,E'\n\r\t','') !~ '[[:cntrl:]]';
$$;

create function private.resolve_guest_suggestion_target(
  target_plan_version_id uuid,
  target_type text,
  target_key text
) returns table(target_id text,target_label text)
language plpgsql stable security definer set search_path='' as $$
declare itinerary jsonb; matched_day jsonb; matched_item jsonb;
begin
  select plan.itinerary_json into itinerary
  from public.trip_plans plan
  where plan.id=target_plan_version_id
    and plan.status='published'
    and plan.published_at is not null;
  if itinerary is null then
    raise exception using errcode='P0001',message='Suggestion target not found.';
  end if;
  if target_type='plan' then
    if target_key is not null then
      raise exception using errcode='P0001',message='Suggestion target not found.';
    end if;
    return query select null::text,itinerary->>'title';
    return;
  end if;
  if target_type='day' then
    select day.value into matched_day
    from jsonb_array_elements(coalesce(itinerary->'days','[]'::jsonb)) day(value)
    where day.value->>'id'=target_key or day.value->>'date'=target_key
    limit 1;
    if matched_day is null then
      raise exception using errcode='P0001',message='Suggestion target not found.';
    end if;
    return query select matched_day->>'id',matched_day->>'title';
    return;
  end if;
  if target_type in ('item','route') then
    select item.value into matched_item
    from jsonb_array_elements(coalesce(itinerary->'days','[]'::jsonb)) day(value)
    cross join lateral jsonb_array_elements(coalesce(day.value->'items','[]'::jsonb)) item(value)
    where item.value->>'id'=target_key
    limit 1;
    if matched_item is null then
      raise exception using errcode='P0001',message='Suggestion target not found.';
    end if;
    return query select matched_item->>'id',matched_item->>'title';
    return;
  end if;
  raise exception using errcode='P0001',message='Suggestion target not found.';
end; $$;

create function private.project_guest_suggestion(
  target private.guest_suggestions,
  include_revision boolean default false
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare original public.trip_plans%rowtype; rebased public.trip_plans%rowtype;
  guest_name text; safe_target record; safe_target_key text;
begin
  select * into original from public.trip_plans
  where id=target.plan_version_id and room_id=target.room_id;
  if not found then return null; end if;
  if target.rebased_to_plan_version_id is not null then
    select * into rebased from public.trip_plans
    where id=target.rebased_to_plan_version_id and room_id=target.room_id;
  end if;
  select session.display_name into guest_name
  from private.guest_sessions session
  where session.session_hash=target.guest_session_id;
  select * into safe_target from private.resolve_guest_suggestion_target(
    target.plan_version_id,target.target_type::text,target.target_id
  );
  safe_target_key:=target.target_id;
  if target.target_type='day' then
    select day.value->>'date' into safe_target_key
    from jsonb_array_elements(coalesce(original.itinerary_json->'days','[]'::jsonb)) day(value)
    where day.value->>'id'=target.target_id
    limit 1;
  end if;
  return jsonb_build_object(
    'id',target.id,
    'originalPlanVersionId',target.plan_version_id,
    'originalPlanVersion',original.version,
    'rebasedToPlanVersionId',target.rebased_to_plan_version_id,
    'rebasedToPlanVersion',rebased.version,
    'targetType',target.target_type,
    'targetKey',safe_target_key,
    'targetLabel',safe_target.target_label,
    'suggestionType',target.suggestion_type,
    'title',target.title,
    'details',target.details,
    'proposedDate',target.proposed_date,
    'proposedStartTime',to_char(target.proposed_start_time,'HH24:MI'),
    'proposedEndTime',to_char(target.proposed_end_time,'HH24:MI'),
    'status',target.status,
    'guestDisplayName',coalesce(guest_name,'Former guest'),
    'dismissedAt',target.dismissed_at,
    'convertedAt',target.converted_at,
    'createdAt',target.created_at,
    'updatedAt',target.updated_at
  )||case when include_revision
    then jsonb_build_object('revisionRequestId',target.revision_request_id)
    else '{}'::jsonb end;
end; $$;

create or replace function public.create_guest_invite(
  target_plan_version_id uuid,
  participant_id uuid,
  target_role text,
  target_token_hash text,
  target_token_prefix text,
  target_expires_at timestamptz,
  target_max_uses integer default 25
) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); plan public.trip_plans%rowtype;
  created private.guest_invites%rowtype;
begin
  if caller is null then
    raise exception using errcode='P0001',message='Authentication required.';
  end if;
  select * into plan from public.trip_plans
  where id=target_plan_version_id and status='published'
    and published_at is not null;
  if not found then
    raise exception using errcode='P0001',message='Plan not published.';
  end if;
  perform 1 from public.participants participant
  where participant.id=participant_id and participant.room_id=plan.room_id
    and participant.user_id=caller and participant.role='host'
    and participant.status='active';
  if not found or not exists(
    select 1 from public.rooms room
    where room.id=plan.room_id and room.host_user_id=caller
      and room.status='active'
  ) then
    raise exception using errcode='P0001',message='Host required.';
  end if;
  if target_role not in (
    'guest_viewer','guest_commenter','guest_suggester'
  ) then
    raise exception using errcode='P0001',message='Guest role not allowed.';
  end if;
  if target_token_hash is null
    or target_token_hash !~ '^[0-9a-f]{64}$'
    or target_token_prefix is null
    or target_token_prefix !~ '^[A-Za-z0-9_-]{6,12}$' then
    raise exception using errcode='P0001',message='Guest invite not allowed.';
  end if;
  if target_expires_at is null or target_expires_at<=now()
    or target_expires_at>now()+interval '90 days'
    or target_max_uses not between 1 and 100 then
    raise exception using errcode='P0001',message='Invalid expiration.';
  end if;
  if (
    select count(*) from private.guest_invites recent
    where recent.room_id=plan.room_id
      and recent.created_at>now()-interval '10 minutes'
  )>=10 then
    raise exception using errcode='P0001',message='Rate limited.';
  end if;
  insert into private.guest_invites(
    room_id,plan_version_id,role,token_hash,token_prefix,expires_at,
    created_by,created_by_user_id,max_uses
  ) values(
    plan.room_id,plan.id,target_role::public.guest_role,target_token_hash,
    target_token_prefix,target_expires_at,participant_id,caller,target_max_uses
  ) returning * into created;
  return jsonb_build_object(
    'id',created.id,
    'planVersionId',created.plan_version_id,
    'planVersion',plan.version,
    'role',created.role,
    'tokenPrefix',created.token_prefix,
    'expiresAt',created.expires_at,
    'maxUses',created.max_uses,
    'useCount',created.use_count,
    'createdAt',created.created_at
  );
exception when unique_violation then
  raise exception using errcode='P0001',message='Guest invite not allowed.';
end; $$;

create or replace function public.get_guest_session_context(target_session_hash text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare session private.guest_sessions%rowtype; plan public.trip_plans%rowtype; snapshot jsonb;
begin
  if target_session_hash is null or target_session_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into session from private.guest_sessions where session_hash=target_session_hash;
  if not found or not private.guest_session_is_available(session) then return null; end if;
  select * into plan from public.trip_plans
  where id=session.plan_version_id and room_id=session.room_id
    and status='published' and published_at is not null;
  if not found then return null; end if;
  snapshot:=private.project_public_itinerary(plan.id);
  if snapshot is null then return null; end if;
  return jsonb_build_object(
    'role',session.role,
    'displayName',session.display_name,
    'planVersionId',session.plan_version_id,
    'planVersion',plan.version,
    'expiresAt',session.expires_at,
    'itinerary',snapshot,
    'comments',coalesce((
      select jsonb_agg(
        private.project_plan_comment(comment_row)
        || jsonb_build_object('isOwn',comment_row.guest_session_id=session.session_hash)
        order by comment_row.created_at,comment_row.id
      )
      from private.plan_comments comment_row
      where comment_row.plan_version_id=plan.id
    ),'[]'::jsonb),
    'suggestions',coalesce((
      select jsonb_agg(
        private.project_guest_suggestion(suggestion_row,false)
        || jsonb_build_object('isOwn',true)
        order by suggestion_row.created_at,suggestion_row.id
      )
      from private.guest_suggestions suggestion_row
      where suggestion_row.guest_session_id=session.session_hash
        and suggestion_row.plan_version_id=plan.id
    ),'[]'::jsonb)
  );
end; $$;

create function public.create_guest_suggestion(
  target_session_hash text,
  target_type text,
  target_key text,
  target_suggestion_type text,
  target_title text,
  target_details text,
  target_proposed_date date default null,
  target_proposed_start_time time default null,
  target_proposed_end_time time default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare session private.guest_sessions%rowtype; resolved record;
  created private.guest_suggestions%rowtype;
begin
  select * into session from private.guest_sessions
  where session_hash=target_session_hash for update;
  if not found or not private.guest_session_is_available(session) then
    raise exception using errcode='P0001',message='Guest session unavailable.';
  end if;
  if session.role::text<>'guest_suggester' then
    raise exception using errcode='P0001',message='Suggestions not allowed.';
  end if;
  if target_type not in ('plan','day','item','route')
    or target_suggestion_type not in (
      'add_item','remove_item','replace_item','reschedule_item','move_item',
      'update_note','change_route','general'
    )
    or not private.guest_suggestion_text_allowed(target_title,120)
    or not private.guest_suggestion_text_allowed(target_details,2000)
    or (
      target_proposed_start_time is not null
      and target_proposed_end_time is not null
      and target_proposed_end_time<=target_proposed_start_time
    ) then
    raise exception using errcode='P0001',message='Suggestion not allowed.';
  end if;
  if target_suggestion_type in (
      'remove_item','replace_item','reschedule_item','move_item','update_note'
    ) and target_type<>'item' then
    raise exception using errcode='P0001',message='Suggestion target not found.';
  end if;
  if target_suggestion_type='add_item' and target_type not in ('plan','day') then
    raise exception using errcode='P0001',message='Suggestion target not found.';
  end if;
  if target_suggestion_type='change_route' and target_type not in ('item','route') then
    raise exception using errcode='P0001',message='Suggestion target not found.';
  end if;
  if session.suggestion_window_started_at is null
    or session.suggestion_window_started_at<=now()-interval '1 minute' then
    update private.guest_sessions
    set suggestion_window_started_at=now(),suggestion_count=1
    where session_hash=session.session_hash;
  elsif session.suggestion_count>=10 then
    raise exception using errcode='P0001',message='Rate limited.';
  else
    update private.guest_sessions
    set suggestion_count=suggestion_count+1
    where session_hash=session.session_hash;
  end if;
  select * into resolved from private.resolve_guest_suggestion_target(
    session.plan_version_id,target_type,target_key
  );
  insert into private.guest_suggestions(
    room_id,plan_version_id,guest_session_id,target_type,target_id,
    suggestion_type,title,details,proposed_date,proposed_start_time,
    proposed_end_time
  ) values(
    session.room_id,session.plan_version_id,session.session_hash,
    target_type::private.guest_suggestion_target_type,resolved.target_id,
    target_suggestion_type::private.guest_suggestion_type,btrim(target_title),
    btrim(target_details),target_proposed_date,target_proposed_start_time,
    target_proposed_end_time
  ) returning * into created;
  return private.project_guest_suggestion(created,false)
    ||jsonb_build_object('isOwn',true);
end; $$;

create function public.update_guest_suggestion(
  target_session_hash text,
  target_suggestion_id uuid,
  target_title text,
  target_details text,
  target_proposed_date date default null,
  target_proposed_start_time time default null,
  target_proposed_end_time time default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare session private.guest_sessions%rowtype; target private.guest_suggestions%rowtype;
begin
  select * into session from private.guest_sessions
  where session_hash=target_session_hash;
  if not found or not private.guest_session_is_available(session) then
    raise exception using errcode='P0001',message='Guest session unavailable.';
  end if;
  if session.role::text<>'guest_suggester'
    or not private.guest_suggestion_text_allowed(target_title,120)
    or not private.guest_suggestion_text_allowed(target_details,2000)
    or (
      target_proposed_start_time is not null
      and target_proposed_end_time is not null
      and target_proposed_end_time<=target_proposed_start_time
    ) then
    raise exception using errcode='P0001',message='Suggestion not allowed.';
  end if;
  select * into target from private.guest_suggestions
  where id=target_suggestion_id for update;
  if not found or target.guest_session_id<>session.session_hash
    or target.room_id<>session.room_id
    or target.plan_version_id<>session.plan_version_id then
    raise exception using errcode='P0001',message='Suggestion ownership required.';
  end if;
  if target.status<>'open' then
    raise exception using errcode='P0001',message='Suggestion is immutable.';
  end if;
  update private.guest_suggestions set
    title=btrim(target_title),
    details=btrim(target_details),
    proposed_date=target_proposed_date,
    proposed_start_time=target_proposed_start_time,
    proposed_end_time=target_proposed_end_time
  where id=target.id returning * into target;
  return private.project_guest_suggestion(target,false)
    ||jsonb_build_object('isOwn',true);
end; $$;

create function public.delete_guest_suggestion(
  target_session_hash text,
  target_suggestion_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare session private.guest_sessions%rowtype; target private.guest_suggestions%rowtype;
  projected jsonb;
begin
  select * into session from private.guest_sessions
  where session_hash=target_session_hash;
  if not found or not private.guest_session_is_available(session) then
    raise exception using errcode='P0001',message='Guest session unavailable.';
  end if;
  if session.role::text<>'guest_suggester' then
    raise exception using errcode='P0001',message='Suggestions not allowed.';
  end if;
  select * into target from private.guest_suggestions
  where id=target_suggestion_id for update;
  if not found or target.guest_session_id<>session.session_hash
    or target.room_id<>session.room_id
    or target.plan_version_id<>session.plan_version_id then
    raise exception using errcode='P0001',message='Suggestion ownership required.';
  end if;
  if target.status<>'open' then
    raise exception using errcode='P0001',message='Suggestion is immutable.';
  end if;
  projected:=private.project_guest_suggestion(target,false)
    ||jsonb_build_object('isOwn',true,'deleted',true);
  delete from private.guest_suggestions where id=target.id;
  return projected;
end; $$;

create function public.list_member_guest_suggestions(target_room_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_room_member(target_room_id) then
    raise exception using errcode='P0001',message='Membership required.';
  end if;
  return coalesce((
    select jsonb_agg(
      private.project_guest_suggestion(suggestion_row,true)
      order by suggestion_row.created_at desc,suggestion_row.id desc
    )
    from private.guest_suggestions suggestion_row
    where suggestion_row.room_id=target_room_id
  ),'[]'::jsonb);
end; $$;

create function public.dismiss_guest_suggestion(
  target_suggestion_id uuid,
  participant_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); target private.guest_suggestions%rowtype;
begin
  if caller is null then
    raise exception using errcode='P0001',message='Authentication required.';
  end if;
  select * into target from private.guest_suggestions
  where id=target_suggestion_id for update;
  if not found then
    raise exception using errcode='P0001',message='Suggestion unavailable.';
  end if;
  perform 1 from public.participants participant
  where participant.id=participant_id and participant.room_id=target.room_id
    and participant.user_id=caller and participant.status='active';
  if not found then
    raise exception using errcode='P0001',message='Membership required.';
  end if;
  if target.status='dismissed' then
    return private.project_guest_suggestion(target,true);
  end if;
  if target.status<>'open' then
    raise exception using errcode='P0001',message='Suggestion is immutable.';
  end if;
  update private.guest_suggestions
  set status='dismissed',dismissed_at=now(),dismissed_by=participant_id
  where id=target.id returning * into target;
  return private.project_guest_suggestion(target,true);
end; $$;

create function public.convert_guest_suggestion(
  target_suggestion_id uuid,
  participant_id uuid,
  confirm_rebase boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); target private.guest_suggestions%rowtype;
  member public.participants%rowtype; original public.trip_plans%rowtype;
  current_plan public.trip_plans%rowtype; original_day jsonb; current_day jsonb;
  current_target text; mapped_type text; request_copy text; created jsonb;
  stale boolean;
begin
  if caller is null then
    raise exception using errcode='P0001',message='Authentication required.';
  end if;
  select * into target from private.guest_suggestions
  where id=target_suggestion_id for update;
  if not found then
    raise exception using errcode='P0001',message='Suggestion unavailable.';
  end if;
  select * into member from public.participants
  where id=participant_id and room_id=target.room_id
    and user_id=caller and status='active';
  if not found then
    raise exception using errcode='P0001',message='Membership required.';
  end if;
  if target.status='converted' then
    return jsonb_build_object(
      'suggestion',private.project_guest_suggestion(target,true),
      'requiresRebaseConfirmation',false,
      'revisionRequestId',target.revision_request_id,
      'created',false
    );
  end if;
  if target.status<>'open' then
    raise exception using errcode='P0001',message='Suggestion is immutable.';
  end if;
  select * into original from public.trip_plans
  where id=target.plan_version_id and room_id=target.room_id
    and status='published' and published_at is not null;
  select plan.* into current_plan
  from public.trip_plans plan
  join public.rooms room
    on room.id=plan.room_id and room.current_plan_version=plan.version
  where plan.room_id=target.room_id
    and plan.status='published' and plan.published_at is not null
  limit 1;
  if original.id is null or current_plan.id is null then
    raise exception using errcode='P0001',message='Suggestion conversion unavailable.';
  end if;
  stale:=original.id<>current_plan.id;
  if stale and not confirm_rebase then
    return jsonb_build_object(
      'suggestion',private.project_guest_suggestion(target,true),
      'requiresRebaseConfirmation',true,
      'originalPlanVersion',original.version,
      'currentPlanVersion',current_plan.version,
      'warning',format(
        'This suggestion was made on Version %s. The trip is now on Version %s. Convert it into a new revision request based on the current version?',
        original.version,current_plan.version
      ),
      'revisionRequestId',null,
      'created',false
    );
  end if;

  current_target:=null;
  if target.target_type='day' then
    select day.value into original_day
    from jsonb_array_elements(coalesce(original.itinerary_json->'days','[]'::jsonb)) day(value)
    where day.value->>'id'=target.target_id
    limit 1;
    select day.value into current_day
    from jsonb_array_elements(coalesce(current_plan.itinerary_json->'days','[]'::jsonb)) day(value)
    where day.value->>'date'=original_day->>'date'
    limit 1;
    if original_day is null or current_day is null then
      raise exception using errcode='P0001',
        message='Suggestion no longer applies. Rewrite or dismiss it.';
    end if;
    -- Re-resolve day targets on the current version during rebase.  The
    -- original day id is immutable attribution only; revision requests must
    -- reference the current version's day identifier.
    -- Revision requests accept item targets only. Keep the day anchor in the
    -- request text while leaving target_item_id null for day-scoped additions.
    current_target:=case when target.suggestion_type='add_item' then null else current_day->>'id' end;
  elsif target.target_type in ('item','route') then
    select item.value->>'id' into current_target
    from jsonb_array_elements(coalesce(current_plan.itinerary_json->'days','[]'::jsonb)) day(value)
    cross join lateral jsonb_array_elements(coalesce(day.value->'items','[]'::jsonb)) item(value)
    where item.value->>'id'=target.target_id
    limit 1;
    if current_target is null then
      raise exception using errcode='P0001',
        message='Suggestion no longer applies. Rewrite or dismiss it.';
    end if;
  end if;

  mapped_type:=case target.suggestion_type
    when 'add_item' then 'add_item'
    when 'remove_item' then 'remove_item'
    when 'replace_item' then 'replace_item'
    when 'reschedule_item' then 'reschedule_item'
    when 'move_item' then 'move_item'
    when 'update_note' then 'update_note'
    when 'change_route' then 'change_route'
    else 'general_revision'
  end;
  request_copy:=format(
    'Guest suggestion %s from Version %s; rebased to Version %s by %s. Guest attribution: %s. %s — %s',
    target.id,original.version,current_plan.version,member.display_name,
    coalesce((select display_name from private.guest_sessions where session_hash=target.guest_session_id),'Former guest'),
    target.title,target.details
  );
  if target.proposed_date is not null then
    request_copy:=request_copy||format(' Proposed date: %s.',target.proposed_date);
  end if;
  if target.proposed_start_time is not null then
    request_copy:=request_copy||format(
      ' Proposed time: %s%s.',
      to_char(target.proposed_start_time,'HH24:MI'),
      case when target.proposed_end_time is null then ''
        else '–'||to_char(target.proposed_end_time,'HH24:MI') end
    );
  end if;
  created:=public.create_plan_change_request(
    current_plan.id,participant_id,mapped_type,current_target,left(request_copy,2000)
  );
  update private.guest_suggestions set
    status='converted',
    converted_at=now(),
    converted_by=participant_id,
    rebased_to_plan_version_id=current_plan.id,
    rebase_confirmed_at=case when stale then now() else null end,
    rebase_confirmed_by=case when stale then participant_id else null end,
    revision_request_id=(created->>'id')::uuid
  where id=target.id returning * into target;
  return jsonb_build_object(
    'suggestion',private.project_guest_suggestion(target,true),
    'requiresRebaseConfirmation',false,
    'originalPlanVersion',original.version,
    'currentPlanVersion',current_plan.version,
    'revisionRequestId',target.revision_request_id,
    'created',(created->>'created')::boolean,
    -- Preserve an audit-friendly, immutable rebase trail for the crew UI.
    'originalPlanVersionId',target.plan_version_id,
    'rebasedToPlanVersionId',target.rebased_to_plan_version_id,
    'convertedBy',target.converted_by,
    'convertedAt',target.converted_at,
    'rebaseConfirmedBy',target.rebase_confirmed_by,
    'rebaseConfirmedAt',target.rebase_confirmed_at,
    'guestSuggestionId',target.id
  );
end; $$;

revoke execute on function
  private.guest_suggestion_text_allowed(text,integer),
  private.resolve_guest_suggestion_target(uuid,text,text),
  private.project_guest_suggestion(private.guest_suggestions,boolean)
from public,anon,authenticated,service_role;

revoke execute on function
  public.create_guest_suggestion(text,text,text,text,text,text,date,time,time),
  public.update_guest_suggestion(text,uuid,text,text,date,time,time),
  public.delete_guest_suggestion(text,uuid),
  public.list_member_guest_suggestions(uuid),
  public.dismiss_guest_suggestion(uuid,uuid),
  public.convert_guest_suggestion(uuid,uuid,boolean)
from public,anon,authenticated,service_role;

grant execute on function
  public.create_guest_suggestion(text,text,text,text,text,text,date,time,time),
  public.update_guest_suggestion(text,uuid,text,text,date,time,time),
  public.delete_guest_suggestion(text,uuid)
to service_role;

grant execute on function
  public.list_member_guest_suggestions(uuid),
  public.dismiss_guest_suggestion(uuid,uuid),
  public.convert_guest_suggestion(uuid,uuid,boolean)
to authenticated;
