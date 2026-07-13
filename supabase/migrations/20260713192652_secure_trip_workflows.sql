create function private.is_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.participants as participant
      where participant.room_id = target_room_id
        and participant.user_id = (select auth.uid())
        and participant.status = 'active'
    );
$$;

create function private.is_room_host(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.participants as participant
      where participant.room_id = target_room_id
        and participant.user_id = (select auth.uid())
        and participant.role = 'host'
        and participant.status = 'active'
    );
$$;

create function private.owns_participant(target_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.participants as participant
      where participant.id = target_participant_id
        and participant.user_id = (select auth.uid())
    );
$$;

create function private.generate_room_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  random_bytes bytea := extensions.gen_random_bytes(8);
  generated_code text := '';
begin
  for byte_index in 0..7 loop
    generated_code := generated_code || pg_catalog.substr(
      alphabet,
      (pg_catalog.get_byte(random_bytes, byte_index) % pg_catalog.length(alphabet)) + 1,
      1
    );
  end loop;

  return generated_code;
end;
$$;

create function private.generate_invite_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select pg_catalog.translate(
    pg_catalog.encode(extensions.gen_random_bytes(32), 'base64'),
    '+/=',
    '-_'
  );
$$;

create function private.hash_invite_token(invite_token text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.encode(extensions.digest(invite_token, 'sha256'), 'hex');
$$;

create function public.create_trip(
  trip_name text,
  display_name text,
  expected_travelers integer default null
)
returns table (
  room_id uuid,
  room_name text,
  participant_id uuid,
  room_code text,
  invite_token text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := (select auth.uid());
  normalized_trip_name text := pg_catalog.btrim(trip_name);
  normalized_display_name text := pg_catalog.btrim(display_name);
  new_room_id uuid := pg_catalog.gen_random_uuid();
  new_participant_id uuid := pg_catalog.gen_random_uuid();
  new_room_code text;
  raw_invite_token text;
  invite_token_hash text;
  room_created_at timestamptz := pg_catalog.clock_timestamp();
begin
  if caller_user_id is null then
    raise exception using errcode = 'P0001', message = 'Authentication required.';
  end if;

  if normalized_trip_name is null or pg_catalog.char_length(normalized_trip_name) not between 1 and 100 then
    raise exception using errcode = 'P0001', message = 'Trip name must be between 1 and 100 characters.';
  end if;

  if normalized_display_name is null or pg_catalog.char_length(normalized_display_name) not between 1 and 50 then
    raise exception using errcode = 'P0001', message = 'Display name must be between 1 and 50 characters.';
  end if;

  if expected_travelers is not null and expected_travelers not between 1 and 50 then
    raise exception using errcode = 'P0001', message = 'Expected travelers must be between 1 and 50.';
  end if;

  for attempt in 1..20 loop
    new_room_code := private.generate_room_code();
    begin
      insert into public.rooms (
        id, name, room_code, host_user_id, expected_travelers, created_at, updated_at
      ) values (
        new_room_id,
        normalized_trip_name,
        new_room_code,
        caller_user_id,
        expected_travelers,
        room_created_at,
        room_created_at
      );
      exit;
    exception when unique_violation then
      if attempt = 20 then
        raise exception using errcode = 'P0001', message = 'Unable to generate a unique room code.';
      end if;
    end;
  end loop;

  insert into public.participants (
    id, room_id, user_id, display_name, role, status, joined_at
  ) values (
    new_participant_id,
    new_room_id,
    caller_user_id,
    normalized_display_name,
    'host',
    'active',
    room_created_at
  );

  for attempt in 1..5 loop
    raw_invite_token := private.generate_invite_token();
    invite_token_hash := private.hash_invite_token(raw_invite_token);
    begin
      insert into public.room_invites (
        room_id, token_hash, short_code, created_by, created_at
      ) values (
        new_room_id,
        invite_token_hash,
        new_room_code,
        caller_user_id,
        room_created_at
      );
      exit;
    exception when unique_violation then
      if attempt = 5 then
        raise exception using errcode = 'P0001', message = 'Unable to generate a unique invite token.';
      end if;
    end;
  end loop;

  insert into private.room_memory (room_id, updated_at)
  values (new_room_id, room_created_at);

  return query
  select
    new_room_id,
    normalized_trip_name,
    new_participant_id,
    new_room_code,
    raw_invite_token,
    room_created_at;
end;
$$;

create function public.join_trip(
  invite_value text,
  display_name text
)
returns table (
  room_id uuid,
  room_name text,
  participant_id uuid,
  member_display_name text,
  participant_role public.participant_role,
  room_code text,
  joined_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := (select auth.uid());
  normalized_invite_value text := pg_catalog.btrim(invite_value);
  normalized_display_name text := pg_catalog.btrim(display_name);
  lookup_token_hash text;
  matched_invite_id uuid;
  matched_room_id uuid;
  matched_room_name text;
  matched_room_code text;
  matched_room_status public.room_status;
  matched_revoked_at timestamptz;
  matched_expires_at timestamptz;
  matched_max_uses integer;
  matched_use_count integer;
  new_participant_id uuid := pg_catalog.gen_random_uuid();
  participant_joined_at timestamptz := pg_catalog.clock_timestamp();
begin
  if caller_user_id is null then
    raise exception using errcode = 'P0001', message = 'Authentication required.';
  end if;

  if normalized_invite_value is null or pg_catalog.char_length(normalized_invite_value) not between 1 and 128 then
    raise exception using errcode = 'P0001', message = 'Invite is invalid.';
  end if;

  if normalized_display_name is null or pg_catalog.char_length(normalized_display_name) not between 1 and 50 then
    raise exception using errcode = 'P0001', message = 'Display name must be between 1 and 50 characters.';
  end if;

  lookup_token_hash := private.hash_invite_token(normalized_invite_value);

  select
    invitation.id,
    room.id,
    room.name,
    room.room_code,
    room.status,
    invitation.revoked_at,
    invitation.expires_at,
    invitation.max_uses,
    invitation.use_count
  into
    matched_invite_id,
    matched_room_id,
    matched_room_name,
    matched_room_code,
    matched_room_status,
    matched_revoked_at,
    matched_expires_at,
    matched_max_uses,
    matched_use_count
  from public.room_invites as invitation
  join public.rooms as room on room.id = invitation.room_id
  where invitation.token_hash = lookup_token_hash
    or invitation.short_code = pg_catalog.upper(normalized_invite_value)
  order by case when invitation.token_hash = lookup_token_hash then 0 else 1 end
  limit 1
  for update of invitation, room;

  if not found then
    raise exception using errcode = 'P0001', message = 'Invite is invalid.';
  end if;

  if matched_revoked_at is not null then
    raise exception using errcode = 'P0001', message = 'Invite is revoked.';
  end if;

  if matched_expires_at is not null and matched_expires_at <= pg_catalog.now() then
    raise exception using errcode = 'P0001', message = 'Invite has expired.';
  end if;

  if matched_max_uses is not null and matched_use_count >= matched_max_uses then
    raise exception using errcode = 'P0001', message = 'Invite has reached its usage limit.';
  end if;

  if matched_room_status <> 'active' then
    raise exception using errcode = 'P0001', message = 'Trip is not active.';
  end if;

  if exists (
    select 1 from public.participants as participant
    where participant.room_id = matched_room_id and participant.user_id = caller_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'You are already a member of this Trip.';
  end if;

  if exists (
    select 1 from public.participants as participant
    where participant.room_id = matched_room_id
      and participant.status = 'active'
      and pg_catalog.lower(participant.display_name) = pg_catalog.lower(normalized_display_name)
  ) then
    raise exception using errcode = 'P0001', message = 'That display name is already active in this Trip.';
  end if;

  insert into public.participants (
    id, room_id, user_id, display_name, role, status, joined_at
  ) values (
    new_participant_id,
    matched_room_id,
    caller_user_id,
    normalized_display_name,
    'member',
    'active',
    participant_joined_at
  );

  update public.room_invites
  set use_count = use_count + 1
  where id = matched_invite_id;

  return query
  select
    matched_room_id,
    matched_room_name,
    new_participant_id,
    normalized_display_name,
    'member'::public.participant_role,
    matched_room_code,
    participant_joined_at;
end;
$$;

revoke execute on function private.is_room_member(uuid) from public, anon, authenticated;
revoke execute on function private.is_room_host(uuid) from public, anon, authenticated;
revoke execute on function private.owns_participant(uuid) from public, anon, authenticated;
revoke execute on function private.generate_room_code() from public, anon, authenticated;
revoke execute on function private.generate_invite_token() from public, anon, authenticated;
revoke execute on function private.hash_invite_token(text) from public, anon, authenticated;
revoke execute on function public.create_trip(text, text, integer) from public, anon;
revoke execute on function public.join_trip(text, text) from public, anon;

grant execute on function private.is_room_member(uuid) to authenticated;
grant execute on function private.is_room_host(uuid) to authenticated;
grant execute on function public.create_trip(text, text, integer) to authenticated;
grant execute on function public.join_trip(text, text) to authenticated;

grant select on table public.rooms to authenticated;
grant update (name, expected_travelers, approval_mode) on table public.rooms to authenticated;
grant select on table public.participants to authenticated;
grant select (
  id, room_id, short_code, created_by, expires_at, max_uses, use_count, revoked_at, created_at
) on table public.room_invites to authenticated;

create policy rooms_select_active_members
on public.rooms for select
to authenticated
using ((select private.is_room_member(id)));

create policy rooms_update_safe_settings_by_host
on public.rooms for update
to authenticated
using ((select private.is_room_host(id)))
with check ((select private.is_room_host(id)));

create policy participants_select_active_room_members
on public.participants for select
to authenticated
using ((select private.is_room_member(room_id)));

create policy room_invites_select_host_metadata
on public.room_invites for select
to authenticated
using ((select private.is_room_host(room_id)));

create view public.room_invite_metadata
with (security_invoker = true, security_barrier = true)
as
select
  id,
  room_id,
  short_code,
  created_by,
  expires_at,
  max_uses,
  use_count,
  revoked_at,
  created_at
from public.room_invites;

revoke all on table public.room_invite_metadata from public, anon, authenticated;
grant select on table public.room_invite_metadata to authenticated;
