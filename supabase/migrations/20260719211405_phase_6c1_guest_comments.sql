create type public.guest_role as enum ('guest_viewer','guest_commenter');
create type private.plan_comment_author_type as enum ('member','guest');

create table private.guest_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  plan_version_id uuid not null references public.trip_plans(id) on delete restrict,
  role public.guest_role not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_prefix text not null check (token_prefix ~ '^[A-Za-z0-9_-]{6,12}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid not null,
  created_by_user_id uuid not null references auth.users(id),
  max_uses integer not null default 25 check (max_uses between 1 and 100),
  use_count integer not null default 0 check (use_count >= 0 and use_count <= max_uses),
  verification_window_started_at timestamptz,
  verification_count integer not null default 0 check (verification_count >= 0),
  created_at timestamptz not null default now(),
  constraint guest_invites_plan_room_fkey foreign key (plan_version_id,room_id)
    references public.trip_plans(id,room_id),
  constraint guest_invites_creator_fkey foreign key (created_by,room_id,created_by_user_id)
    references public.participants(id,room_id,user_id),
  constraint guest_invites_session_scope_unique unique (id,room_id,plan_version_id),
  constraint guest_invites_expiry_check check (
    expires_at > created_at and expires_at <= created_at + interval '90 days'
  )
);
create index guest_invites_room_plan_idx
  on private.guest_invites(room_id,plan_version_id,created_at desc);
create index guest_invites_active_expiry_idx
  on private.guest_invites(expires_at)
  where revoked_at is null;

create table private.guest_sessions (
  session_hash text primary key check (session_hash ~ '^[0-9a-f]{64}$'),
  invite_id uuid not null references private.guest_invites(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  plan_version_id uuid not null references public.trip_plans(id) on delete restrict,
  role public.guest_role not null,
  display_name text not null check (
    char_length(btrim(display_name)) between 1 and 50
    and display_name !~ '[<>]'
    and translate(display_name,E'\n\r\t','') !~ '[[:cntrl:]]'
  ),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  comment_window_started_at timestamptz,
  comment_count integer not null default 0 check (comment_count >= 0),
  created_at timestamptz not null default now(),
  constraint guest_sessions_invite_scope_fkey foreign key (invite_id,room_id,plan_version_id)
    references private.guest_invites(id,room_id,plan_version_id),
  constraint guest_sessions_expiry_check check (expires_at > created_at)
);
create index guest_sessions_invite_idx on private.guest_sessions(invite_id);
create index guest_sessions_scope_idx
  on private.guest_sessions(room_id,plan_version_id,expires_at);

create table private.plan_comments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  plan_version_id uuid not null references public.trip_plans(id) on delete restrict,
  item_id text,
  day_id text,
  author_type private.plan_comment_author_type not null,
  member_id uuid references public.participants(id) on delete set null,
  guest_session_id text references private.guest_sessions(session_hash) on delete set null,
  body text,
  resolved_at timestamptz,
  resolved_by_member_id uuid references public.participants(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_comments_plan_room_fkey foreign key (plan_version_id,room_id)
    references public.trip_plans(id,room_id),
  constraint plan_comments_target_check check (
    item_id is null or day_id is not null
  ),
  constraint plan_comments_author_check check (
    (author_type='member' and member_id is not null and guest_session_id is null)
    or
    (author_type='guest' and member_id is null and guest_session_id is not null)
  ),
  constraint plan_comments_body_check check (
    (deleted_at is null and body is not null and char_length(btrim(body)) between 1 and 2000
      and body !~ '[<>]' and translate(body,E'\n\r\t','') !~ '[[:cntrl:]]')
    or
    (deleted_at is not null and body is null)
  )
);
create index plan_comments_plan_target_idx
  on private.plan_comments(plan_version_id,day_id,item_id,created_at,id);
create index plan_comments_guest_owner_idx
  on private.plan_comments(guest_session_id,created_at)
  where guest_session_id is not null;

alter table private.guest_invites enable row level security;
alter table private.guest_invites force row level security;
alter table private.guest_sessions enable row level security;
alter table private.guest_sessions force row level security;
alter table private.plan_comments enable row level security;
alter table private.plan_comments force row level security;

create policy guest_invites_deny_direct on private.guest_invites
  as restrictive for all to public using(false) with check(false);
create policy guest_sessions_deny_direct on private.guest_sessions
  as restrictive for all to public using(false) with check(false);
create policy plan_comments_deny_direct on private.plan_comments
  as restrictive for all to public using(false) with check(false);

revoke all on private.guest_invites,private.guest_sessions,private.plan_comments
  from public,anon,authenticated,service_role;

create trigger plan_comments_set_updated_at
before update on private.plan_comments
for each row execute function private.set_updated_at();

create function private.guest_comment_body_allowed(target_body text) returns boolean
language sql immutable set search_path='' as $$
  select target_body is not null
    and char_length(btrim(target_body)) between 1 and 2000
    and target_body !~ '[<>]'
    and translate(target_body,E'\n\r\t','') !~ '[[:cntrl:]]';
$$;

create function private.guest_invite_is_available(invite private.guest_invites)
returns boolean language sql stable set search_path='' as $$
  select invite.revoked_at is null
    and invite.expires_at > now()
    and invite.use_count < invite.max_uses;
$$;

create function private.guest_session_is_available(session private.guest_sessions)
returns boolean language sql stable security definer set search_path='' as $$
  select session.revoked_at is null
    and session.expires_at > now()
    and exists(
      select 1 from private.guest_invites invite
      where invite.id=session.invite_id
        and invite.room_id=session.room_id
        and invite.plan_version_id=session.plan_version_id
        and invite.role=session.role
        and invite.revoked_at is null
        and invite.expires_at>now()
    );
$$;

create function private.resolve_plan_comment_target(
  target_plan_version_id uuid,
  target_day_key text,
  target_item_key text
) returns table(day_id text,item_id text)
language plpgsql stable security definer set search_path='' as $$
declare itinerary jsonb; matched_day jsonb; matched_item jsonb;
begin
  select plan.itinerary_json into itinerary
  from public.trip_plans plan
  where plan.id=target_plan_version_id
    and plan.status='published'
    and plan.published_at is not null;
  if itinerary is null then
    raise exception using errcode='P0001',message='Comment target not found.';
  end if;
  if target_day_key is null and target_item_key is null then
    return query select null::text,null::text;
    return;
  end if;
  if target_day_key is null or btrim(target_day_key)='' then
    raise exception using errcode='P0001',message='Comment target not found.';
  end if;
  select day.value into matched_day
  from jsonb_array_elements(coalesce(itinerary->'days','[]'::jsonb)) day(value)
  where day.value->>'id'=target_day_key or day.value->>'date'=target_day_key
  limit 1;
  if matched_day is null then
    raise exception using errcode='P0001',message='Comment target not found.';
  end if;
  if target_item_key is null then
    return query select matched_day->>'id',null::text;
    return;
  end if;
  select item.value into matched_item
  from jsonb_array_elements(coalesce(matched_day->'items','[]'::jsonb)) item(value)
  where item.value->>'id'=target_item_key
  limit 1;
  if matched_item is null then
    raise exception using errcode='P0001',message='Comment target not found.';
  end if;
  return query select matched_day->>'id',matched_item->>'id';
end; $$;

create function private.project_plan_comment(target_comment private.plan_comments)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare plan public.trip_plans%rowtype; author_name text; safe_day_key text;
begin
  select * into plan from public.trip_plans
  where id=target_comment.plan_version_id and room_id=target_comment.room_id;
  if not found then return null; end if;
  if target_comment.author_type='guest' then
    select session.display_name into author_name
    from private.guest_sessions session
    where session.session_hash=target_comment.guest_session_id;
  else
    select participant.display_name into author_name
    from public.participants participant
    where participant.id=target_comment.member_id;
  end if;
  if target_comment.day_id is not null then
    select day.value->>'date' into safe_day_key
    from jsonb_array_elements(coalesce(plan.itinerary_json->'days','[]'::jsonb)) day(value)
    where day.value->>'id'=target_comment.day_id
    limit 1;
  end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'id',target_comment.id,
    'planVersionId',target_comment.plan_version_id,
    'planVersion',plan.version,
    'dayKey',safe_day_key,
    'itemKey',target_comment.item_id,
    'authorType',target_comment.author_type,
    'authorDisplayName',coalesce(author_name,'Former guest'),
    'body',target_comment.body,
    'resolved',target_comment.resolved_at is not null,
    'resolvedAt',target_comment.resolved_at,
    'deleted',target_comment.deleted_at is not null,
    'deletedAt',target_comment.deleted_at,
    'createdAt',target_comment.created_at,
    'updatedAt',target_comment.updated_at
  ));
end; $$;

create function private.project_plan_comments(target_plan_version_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(
    jsonb_agg(private.project_plan_comment(comment_row) order by comment_row.created_at,comment_row.id),
    '[]'::jsonb
  )
  from private.plan_comments comment_row
  where comment_row.plan_version_id=target_plan_version_id;
$$;

create function private.project_guest_invite(invite private.guest_invites)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare plan public.trip_plans%rowtype; snapshot jsonb;
begin
  select * into plan from public.trip_plans
  where id=invite.plan_version_id and room_id=invite.room_id
    and status='published' and published_at is not null;
  if not found then return null; end if;
  snapshot:=private.project_public_itinerary(plan.id);
  if snapshot is null then return null; end if;
  return jsonb_build_object(
    'inviteId',invite.id,
    'roomId',invite.room_id,
    'planVersionId',plan.id,
    'planVersion',plan.version,
    'role',invite.role,
    'expiresAt',invite.expires_at,
    'itinerary',snapshot
  );
end; $$;

create function public.create_guest_invite(
  target_plan_version_id uuid,
  participant_id uuid,
  target_role text,
  target_token_hash text,
  target_token_prefix text,
  target_expires_at timestamptz,
  target_max_uses integer default 25
) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); plan public.trip_plans%rowtype; created private.guest_invites%rowtype;
begin
  if caller is null then
    raise exception using errcode='P0001',message='Authentication required.';
  end if;
  select * into plan from public.trip_plans
  where id=target_plan_version_id and status='published' and published_at is not null;
  if not found then
    raise exception using errcode='P0001',message='Plan not published.';
  end if;
  perform 1 from public.participants participant
  where participant.id=participant_id and participant.room_id=plan.room_id
    and participant.user_id=caller and participant.role='host' and participant.status='active';
  if not found or not exists(
    select 1 from public.rooms room
    where room.id=plan.room_id and room.host_user_id=caller and room.status='active'
  ) then
    raise exception using errcode='P0001',message='Host required.';
  end if;
  if target_role not in ('guest_viewer','guest_commenter') then
    raise exception using errcode='P0001',message='Guest role not allowed.';
  end if;
  if target_token_hash is null or target_token_hash !~ '^[0-9a-f]{64}$'
    or target_token_prefix is null or target_token_prefix !~ '^[A-Za-z0-9_-]{6,12}$' then
    raise exception using errcode='P0001',message='Guest invite not allowed.';
  end if;
  if target_expires_at is null or target_expires_at<=now()
    or target_expires_at>now()+interval '90 days'
    or target_max_uses not between 1 and 100 then
    raise exception using errcode='P0001',message='Invalid expiration.';
  end if;
  if (
    select count(*) from private.guest_invites recent
    where recent.room_id=plan.room_id and recent.created_at>now()-interval '10 minutes'
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

create function public.list_guest_invites(target_room_id uuid,target_plan_version integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare plan public.trip_plans%rowtype;
begin
  select * into plan from public.trip_plans
  where room_id=target_room_id and version=target_plan_version
    and status='published' and published_at is not null;
  if not found or not private.is_room_member(target_room_id) then
    raise exception using errcode='P0001',message='Membership required.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',invite.id,
      'planVersionId',invite.plan_version_id,
      'planVersion',plan.version,
      'role',invite.role,
      'tokenPrefix',invite.token_prefix,
      'expiresAt',invite.expires_at,
      'maxUses',invite.max_uses,
      'useCount',invite.use_count,
      'createdAt',invite.created_at
    ) order by invite.created_at desc,invite.id desc)
    from private.guest_invites invite
    where invite.room_id=target_room_id
      and invite.plan_version_id=plan.id
      and invite.revoked_at is null
      and invite.expires_at>now()
      and invite.use_count<invite.max_uses
  ),'[]'::jsonb);
end; $$;

create function public.revoke_guest_invite(invite_id uuid,participant_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); invite private.guest_invites%rowtype; plan public.trip_plans%rowtype;
begin
  if caller is null then
    raise exception using errcode='P0001',message='Authentication required.';
  end if;
  select * into invite from private.guest_invites where id=invite_id for update;
  if not found then
    raise exception using errcode='P0001',message='Guest invite not found.';
  end if;
  select * into plan from public.trip_plans
  where id=invite.plan_version_id and room_id=invite.room_id;
  perform 1 from public.participants participant
  where participant.id=participant_id and participant.room_id=invite.room_id
    and participant.user_id=caller and participant.role='host' and participant.status='active';
  if not found or not exists(
    select 1 from public.rooms room
    where room.id=invite.room_id and room.host_user_id=caller and room.status='active'
  ) then
    raise exception using errcode='P0001',message='Host required.';
  end if;
  if invite.revoked_at is null then
    update private.guest_invites set revoked_at=now() where id=invite.id;
    update private.guest_sessions set revoked_at=coalesce(revoked_at,now())
    where guest_sessions.invite_id=invite.id;
  end if;
  return jsonb_build_object(
    'id',invite.id,
    'planVersionId',invite.plan_version_id,
    'planVersion',plan.version,
    'status','revoked'
  );
end; $$;

create function public.rotate_guest_invite(
  invite_id uuid,
  participant_id uuid,
  target_token_hash text,
  target_token_prefix text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); prior private.guest_invites%rowtype; plan public.trip_plans%rowtype; created private.guest_invites%rowtype;
begin
  if caller is null then
    raise exception using errcode='P0001',message='Authentication required.';
  end if;
  select * into prior from private.guest_invites where id=invite_id for update;
  if not found or prior.revoked_at is not null or prior.expires_at<=now()
    or prior.use_count>=prior.max_uses then
    raise exception using errcode='P0001',message='Guest invite not found.';
  end if;
  select * into plan from public.trip_plans
  where id=prior.plan_version_id and room_id=prior.room_id
    and status='published' and published_at is not null;
  perform 1 from public.participants participant
  where participant.id=participant_id and participant.room_id=prior.room_id
    and participant.user_id=caller and participant.role='host' and participant.status='active';
  if not found or plan.id is null or not exists(
    select 1 from public.rooms room
    where room.id=prior.room_id and room.host_user_id=caller and room.status='active'
  ) then
    raise exception using errcode='P0001',message='Host required.';
  end if;
  if target_token_hash is null or target_token_hash !~ '^[0-9a-f]{64}$'
    or target_token_prefix is null or target_token_prefix !~ '^[A-Za-z0-9_-]{6,12}$' then
    raise exception using errcode='P0001',message='Guest invite not allowed.';
  end if;
  update private.guest_invites set revoked_at=now() where id=prior.id;
  update private.guest_sessions set revoked_at=coalesce(revoked_at,now())
  where guest_sessions.invite_id=prior.id;
  insert into private.guest_invites(
    room_id,plan_version_id,role,token_hash,token_prefix,expires_at,
    created_by,created_by_user_id,max_uses
  ) values(
    prior.room_id,prior.plan_version_id,prior.role,target_token_hash,
    target_token_prefix,prior.expires_at,participant_id,caller,prior.max_uses
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

create function public.verify_guest_invite_token_hash(target_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare invite private.guest_invites%rowtype; projected jsonb;
begin
  if target_token_hash is null or target_token_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into invite from private.guest_invites where token_hash=target_token_hash for update;
  if not found or not private.guest_invite_is_available(invite) then return null; end if;
  if invite.verification_window_started_at is null
    or invite.verification_window_started_at<=now()-interval '10 minutes' then
    update private.guest_invites set verification_window_started_at=now(),verification_count=1
    where id=invite.id;
  elsif invite.verification_count>=30 then
    raise exception using errcode='P0001',message='Rate limited.';
  else
    update private.guest_invites set verification_count=verification_count+1 where id=invite.id;
  end if;
  projected:=private.project_guest_invite(invite);
  return projected;
end; $$;

create function public.create_guest_session(
  target_token_hash text,
  target_session_hash text,
  target_display_name text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare invite private.guest_invites%rowtype; plan public.trip_plans%rowtype; session_expiry timestamptz; created private.guest_sessions%rowtype;
begin
  if target_token_hash is null or target_token_hash !~ '^[0-9a-f]{64}$'
    or target_session_hash is null or target_session_hash !~ '^[0-9a-f]{64}$'
    or target_display_name is null or char_length(btrim(target_display_name)) not between 1 and 50
    or target_display_name ~ '[<>]'
    or translate(target_display_name,E'\n\r\t','') ~ '[[:cntrl:]]' then
    return null;
  end if;
  select * into invite from private.guest_invites where token_hash=target_token_hash for update;
  if not found or not private.guest_invite_is_available(invite) then return null; end if;
  if invite.verification_window_started_at is null
    or invite.verification_window_started_at<=now()-interval '10 minutes' then
    update private.guest_invites set verification_window_started_at=now(),verification_count=1
    where id=invite.id;
  elsif invite.verification_count>=30 then
    raise exception using errcode='P0001',message='Rate limited.';
  else
    update private.guest_invites set verification_count=verification_count+1 where id=invite.id;
  end if;
  select * into plan from public.trip_plans
  where id=invite.plan_version_id and room_id=invite.room_id
    and status='published' and published_at is not null;
  if not found then return null; end if;
  session_expiry:=least(invite.expires_at,now()+interval '7 days');
  insert into private.guest_sessions(
    session_hash,invite_id,room_id,plan_version_id,role,display_name,expires_at
  ) values(
    target_session_hash,invite.id,invite.room_id,invite.plan_version_id,
    invite.role,btrim(target_display_name),session_expiry
  ) returning * into created;
  update private.guest_invites set use_count=use_count+1 where id=invite.id;
  return jsonb_build_object(
    'role',created.role,
    'displayName',created.display_name,
    'planVersionId',created.plan_version_id,
    'planVersion',plan.version,
    'expiresAt',created.expires_at
  );
exception when unique_violation then
  return null;
end; $$;

create function public.get_guest_session_context(target_session_hash text)
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
    ),'[]'::jsonb)
  );
end; $$;

create function public.create_guest_plan_comment(
  target_session_hash text,
  target_day_key text,
  target_item_key text,
  target_body text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare session private.guest_sessions%rowtype; resolved record; created private.plan_comments%rowtype;
begin
  select * into session from private.guest_sessions
  where session_hash=target_session_hash for update;
  if not found or not private.guest_session_is_available(session) then
    raise exception using errcode='P0001',message='Guest session unavailable.';
  end if;
  if session.role<>'guest_commenter' then
    raise exception using errcode='P0001',message='Commenting not allowed.';
  end if;
  if not private.guest_comment_body_allowed(target_body) then
    raise exception using errcode='P0001',message='Comment body not allowed.';
  end if;
  if session.comment_window_started_at is null
    or session.comment_window_started_at<=now()-interval '1 minute' then
    update private.guest_sessions set comment_window_started_at=now(),comment_count=1
    where session_hash=session.session_hash;
  elsif session.comment_count>=10 then
    raise exception using errcode='P0001',message='Rate limited.';
  else
    update private.guest_sessions set comment_count=comment_count+1
    where session_hash=session.session_hash;
  end if;
  select * into resolved from private.resolve_plan_comment_target(
    session.plan_version_id,target_day_key,target_item_key
  );
  insert into private.plan_comments(
    room_id,plan_version_id,item_id,day_id,author_type,guest_session_id,body
  ) values(
    session.room_id,session.plan_version_id,resolved.item_id,resolved.day_id,
    'guest',session.session_hash,btrim(target_body)
  ) returning * into created;
  return private.project_plan_comment(created)||jsonb_build_object('isOwn',true);
end; $$;

create function public.update_guest_plan_comment(
  target_session_hash text,
  target_comment_id uuid,
  target_body text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare session private.guest_sessions%rowtype; target private.plan_comments%rowtype;
begin
  select * into session from private.guest_sessions where session_hash=target_session_hash;
  if not found or not private.guest_session_is_available(session) then
    raise exception using errcode='P0001',message='Guest session unavailable.';
  end if;
  if session.role<>'guest_commenter' then
    raise exception using errcode='P0001',message='Commenting not allowed.';
  end if;
  if not private.guest_comment_body_allowed(target_body) then
    raise exception using errcode='P0001',message='Comment body not allowed.';
  end if;
  select * into target from private.plan_comments
  where id=target_comment_id for update;
  if not found or target.guest_session_id is distinct from session.session_hash
    or target.plan_version_id<>session.plan_version_id
    or target.room_id<>session.room_id then
    raise exception using errcode='P0001',message='Comment ownership required.';
  end if;
  if target.deleted_at is not null then
    raise exception using errcode='P0001',message='Comment unavailable.';
  end if;
  update private.plan_comments set body=btrim(target_body)
  where id=target.id returning * into target;
  return private.project_plan_comment(target)||jsonb_build_object('isOwn',true);
end; $$;

create function public.delete_guest_plan_comment(
  target_session_hash text,
  target_comment_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare session private.guest_sessions%rowtype; target private.plan_comments%rowtype;
begin
  select * into session from private.guest_sessions where session_hash=target_session_hash;
  if not found or not private.guest_session_is_available(session) then
    raise exception using errcode='P0001',message='Guest session unavailable.';
  end if;
  if session.role<>'guest_commenter' then
    raise exception using errcode='P0001',message='Commenting not allowed.';
  end if;
  select * into target from private.plan_comments
  where id=target_comment_id for update;
  if not found or target.guest_session_id is distinct from session.session_hash
    or target.plan_version_id<>session.plan_version_id
    or target.room_id<>session.room_id then
    raise exception using errcode='P0001',message='Comment ownership required.';
  end if;
  if target.deleted_at is null then
    update private.plan_comments set body=null,deleted_at=now()
    where id=target.id returning * into target;
  end if;
  return private.project_plan_comment(target)||jsonb_build_object('isOwn',true);
end; $$;

create function public.list_member_plan_comments(target_room_id uuid,target_plan_version integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare plan public.trip_plans%rowtype;
begin
  select * into plan from public.trip_plans
  where room_id=target_room_id and version=target_plan_version
    and status='published' and published_at is not null;
  if not found or not private.is_room_member(target_room_id) then
    raise exception using errcode='P0001',message='Membership required.';
  end if;
  return private.project_plan_comments(plan.id);
end; $$;

create function public.create_member_plan_comment(
  target_room_id uuid,
  target_plan_version integer,
  participant_id uuid,
  target_body text,
  target_day_key text,
  target_item_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); plan public.trip_plans%rowtype; resolved record; created private.plan_comments%rowtype;
begin
  if caller is null then
    raise exception using errcode='P0001',message='Authentication required.';
  end if;
  select * into plan from public.trip_plans
  where room_id=target_room_id and version=target_plan_version
    and status='published' and published_at is not null;
  perform 1 from public.participants participant
  where participant.id=participant_id and participant.room_id=target_room_id
    and participant.user_id=caller and participant.status='active';
  if not found or plan.id is null then
    raise exception using errcode='P0001',message='Membership required.';
  end if;
  if not private.guest_comment_body_allowed(target_body) then
    raise exception using errcode='P0001',message='Comment body not allowed.';
  end if;
  if (
    select count(*) from private.plan_comments recent
    where recent.member_id=participant_id and recent.created_at>now()-interval '1 minute'
  )>=10 then
    raise exception using errcode='P0001',message='Rate limited.';
  end if;
  select * into resolved from private.resolve_plan_comment_target(
    plan.id,target_day_key,target_item_key
  );
  insert into private.plan_comments(
    room_id,plan_version_id,item_id,day_id,author_type,member_id,body
  ) values(
    target_room_id,plan.id,resolved.item_id,resolved.day_id,'member',
    participant_id,btrim(target_body)
  ) returning * into created;
  return private.project_plan_comment(created);
end; $$;

create function public.resolve_plan_comment(target_comment_id uuid,participant_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); target private.plan_comments%rowtype;
begin
  if caller is null then
    raise exception using errcode='P0001',message='Authentication required.';
  end if;
  select * into target from private.plan_comments where id=target_comment_id for update;
  if not found then
    raise exception using errcode='P0001',message='Comment unavailable.';
  end if;
  perform 1 from public.participants participant
  where participant.id=participant_id and participant.room_id=target.room_id
    and participant.user_id=caller and participant.status='active';
  if not found then
    raise exception using errcode='P0001',message='Membership required.';
  end if;
  if target.resolved_at is null then
    update private.plan_comments
    set resolved_at=now(),resolved_by_member_id=participant_id
    where id=target.id returning * into target;
  end if;
  return private.project_plan_comment(target);
end; $$;

revoke execute on function
  private.guest_comment_body_allowed(text),
  private.guest_invite_is_available(private.guest_invites),
  private.guest_session_is_available(private.guest_sessions),
  private.resolve_plan_comment_target(uuid,text,text),
  private.project_plan_comment(private.plan_comments),
  private.project_plan_comments(uuid),
  private.project_guest_invite(private.guest_invites)
from public,anon,authenticated,service_role;

revoke execute on function
  public.create_guest_invite(uuid,uuid,text,text,text,timestamptz,integer),
  public.rotate_guest_invite(uuid,uuid,text,text),
  public.list_guest_invites(uuid,integer),
  public.revoke_guest_invite(uuid,uuid),
  public.verify_guest_invite_token_hash(text),
  public.create_guest_session(text,text,text),
  public.get_guest_session_context(text),
  public.create_guest_plan_comment(text,text,text,text),
  public.update_guest_plan_comment(text,uuid,text),
  public.delete_guest_plan_comment(text,uuid),
  public.list_member_plan_comments(uuid,integer),
  public.create_member_plan_comment(uuid,integer,uuid,text,text,text),
  public.resolve_plan_comment(uuid,uuid)
from public,anon,authenticated,service_role;

grant execute on function
  public.create_guest_invite(uuid,uuid,text,text,text,timestamptz,integer),
  public.rotate_guest_invite(uuid,uuid,text,text),
  public.list_guest_invites(uuid,integer),
  public.revoke_guest_invite(uuid,uuid),
  public.list_member_plan_comments(uuid,integer),
  public.create_member_plan_comment(uuid,integer,uuid,text,text,text),
  public.resolve_plan_comment(uuid,uuid)
to authenticated;

grant execute on function
  public.verify_guest_invite_token_hash(text),
  public.create_guest_session(text,text,text),
  public.get_guest_session_context(text),
  public.create_guest_plan_comment(text,text,text,text),
  public.update_guest_plan_comment(text,uuid,text),
  public.delete_guest_plan_comment(text,uuid)
to service_role;
