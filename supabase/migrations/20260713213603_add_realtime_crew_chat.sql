create type public.message_type as enum ('user', 'system', 'trailie');

alter table public.participants
  add constraint participants_message_identity_unique
  unique (id, room_id, user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  participant_id uuid not null,
  sender_user_id uuid not null references auth.users(id),
  message_type public.message_type not null default 'user',
  body text not null,
  client_message_id uuid,
  reply_to_message_id uuid,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint messages_user_body_valid check (
    message_type <> 'user'
    or (body = btrim(body) and char_length(body) between 1 and 4000)
  ),
  constraint messages_participant_sender_room_fkey
    foreign key (participant_id, room_id, sender_user_id)
    references public.participants (id, room_id, user_id),
  constraint messages_id_room_unique unique (id, room_id),
  constraint messages_reply_same_room_fkey
    foreign key (reply_to_message_id, room_id)
    references public.messages (id, room_id)
);

create unique index messages_client_reconciliation_unique
  on public.messages (room_id, sender_user_id, client_message_id)
  where client_message_id is not null;
create index messages_room_created_desc_idx
  on public.messages (room_id, created_at desc);
create index messages_room_cursor_idx
  on public.messages (room_id, created_at desc, id desc);
create index messages_participant_idx
  on public.messages (participant_id);

create table public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  reaction text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, participant_id, reaction),
  constraint message_reactions_canonical check (
    reaction in ('like', 'love', 'laugh', 'celebrate', 'thinking')
  )
);

create index message_reactions_message_id_idx
  on public.message_reactions (message_id);
create index message_reactions_participant_id_idx
  on public.message_reactions (participant_id);

create function private.validate_message_reaction_room()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.messages as message
    join public.participants as participant
      on participant.id = new.participant_id
     and participant.room_id = message.room_id
    where message.id = new.message_id
  ) then
    raise exception using errcode = '23514', message = 'Reaction participant must belong to the message room.';
  end if;
  return new;
end;
$$;

create trigger message_reactions_validate_room
before insert or update on public.message_reactions
for each row execute function private.validate_message_reaction_room();

create function private.message_payload(
  target_message_id uuid,
  current_participant_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', message.id,
    'room_id', message.room_id,
    'participant_id', message.participant_id,
    'message_type', message.message_type,
    'body', message.body,
    'client_message_id', message.client_message_id,
    'reply_to_message_id', message.reply_to_message_id,
    'sender', pg_catalog.jsonb_build_object(
      'participant_id', sender.id,
      'display_name', sender.display_name,
      'role', sender.role
    ),
    'reply', case
      when reply.id is null then null
      else pg_catalog.jsonb_build_object(
        'id', reply.id,
        'body', reply.body,
        'sender_display_name', reply_sender.display_name
      )
    end,
    'reactions', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'reaction', summary.reaction,
          'count', summary.reaction_count,
          'reacted_by_current_participant', summary.reacted_by_current_participant
        )
        order by summary.reaction_order
      )
      from (
        select
          reaction.reaction,
          pg_catalog.count(*)::integer as reaction_count,
          pg_catalog.bool_or(reaction.participant_id = current_participant_id) as reacted_by_current_participant,
          case reaction.reaction
            when 'like' then 1
            when 'love' then 2
            when 'laugh' then 3
            when 'celebrate' then 4
            when 'thinking' then 5
          end as reaction_order
        from public.message_reactions as reaction
        where reaction.message_id = message.id
        group by reaction.reaction
      ) as summary
    ), '[]'::jsonb),
    'created_at', message.created_at,
    'edited_at', message.edited_at,
    'deleted_at', message.deleted_at
  )
  from public.messages as message
  join public.participants as sender on sender.id = message.participant_id
  left join public.messages as reply on reply.id = message.reply_to_message_id
  left join public.participants as reply_sender on reply_sender.id = reply.participant_id
  where message.id = target_message_id
    and message.deleted_at is null;
$$;

create function public.send_message(
  target_room_id uuid,
  participant_id uuid,
  body text,
  client_message_id uuid,
  reply_to_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  caller_user_id uuid := (select auth.uid());
  normalized_body text := pg_catalog.btrim($3);
  owned_participant public.participants%rowtype;
  existing_message_id uuid;
  inserted_message_id uuid;
begin
  if caller_user_id is null then
    raise exception using errcode = 'P0001', message = 'Authentication required.';
  end if;

  if not (select private.is_room_member(target_room_id)) then
    raise exception using errcode = 'P0001', message = 'Membership required.';
  end if;

  select participant.* into owned_participant
  from public.participants as participant
  where participant.id = $2
    and participant.room_id = target_room_id;

  if not found or owned_participant.user_id <> caller_user_id then
    raise exception using errcode = 'P0001', message = 'Participant mismatch.';
  end if;

  if owned_participant.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'Membership required.';
  end if;

  if normalized_body is null or pg_catalog.char_length(normalized_body) = 0 then
    raise exception using errcode = 'P0001', message = 'Message cannot be empty.';
  end if;

  if pg_catalog.char_length(normalized_body) > 4000 then
    raise exception using errcode = 'P0001', message = 'Message is too long.';
  end if;

  if $4 is null then
    raise exception using errcode = 'P0001', message = 'Client message id is required.';
  end if;

  select message.id into existing_message_id
  from public.messages as message
  where message.room_id = target_room_id
    and message.sender_user_id = caller_user_id
    and message.client_message_id = $4;

  if found then
    return private.message_payload(existing_message_id, $2);
  end if;

  if $5 is not null and not exists (
    select 1 from public.messages as reply
    where reply.id = $5
      and reply.room_id = target_room_id
      and reply.deleted_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'Invalid reply target.';
  end if;

  if (
    select pg_catalog.count(*)
    from public.messages as recent
    where recent.room_id = target_room_id
      and recent.sender_user_id = caller_user_id
      and recent.created_at > pg_catalog.clock_timestamp() - interval '10 seconds'
  ) >= 8 then
    raise exception using errcode = 'P0001', message = 'Rate limit exceeded.';
  end if;

  insert into public.messages (
    room_id,
    participant_id,
    sender_user_id,
    message_type,
    body,
    client_message_id,
    reply_to_message_id
  ) values (
    target_room_id,
    $2,
    caller_user_id,
    'user',
    normalized_body,
    $4,
    $5
  )
  on conflict (room_id, sender_user_id, client_message_id)
    where client_message_id is not null
  do nothing
  returning id into inserted_message_id;

  if inserted_message_id is null then
    select message.id into inserted_message_id
    from public.messages as message
    where message.room_id = target_room_id
      and message.sender_user_id = caller_user_id
      and message.client_message_id = $4;
  end if;

  return private.message_payload(inserted_message_id, $2);
end;
$$;

create function public.toggle_message_reaction(
  target_message_id uuid,
  participant_id uuid,
  reaction text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := (select auth.uid());
  target_room_id uuid;
  owned_participant public.participants%rowtype;
  reaction_is_active boolean;
  reaction_count integer;
begin
  if caller_user_id is null then
    raise exception using errcode = 'P0001', message = 'Authentication required.';
  end if;

  if $3 is null or $3 not in ('like', 'love', 'laugh', 'celebrate', 'thinking') then
    raise exception using errcode = 'P0001', message = 'Reaction is invalid.';
  end if;

  select message.room_id into target_room_id
  from public.messages as message
  where message.id = target_message_id
    and message.deleted_at is null;

  if not found then
    raise exception using errcode = 'P0001', message = 'Message is not visible.';
  end if;

  select participant.* into owned_participant
  from public.participants as participant
  where participant.id = $2;

  if not found or owned_participant.user_id <> caller_user_id then
    if not (select private.is_room_member(target_room_id)) then
      raise exception using errcode = 'P0001', message = 'Membership required.';
    end if;
    raise exception using errcode = 'P0001', message = 'Participant mismatch.';
  end if;

  if owned_participant.room_id <> target_room_id then
    raise exception using errcode = 'P0001', message = 'Message is not visible.';
  end if;

  if owned_participant.status <> 'active'
    or not (select private.is_room_member(target_room_id)) then
    raise exception using errcode = 'P0001', message = 'Membership required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_message_id::text || ':' || $2::text || ':' || $3,
      0
    )
  );

  delete from public.message_reactions as existing
  where existing.message_id = target_message_id
    and existing.participant_id = $2
    and existing.reaction = $3;

  if found then
    reaction_is_active := false;
  else
    insert into public.message_reactions (message_id, participant_id, reaction)
    values (target_message_id, $2, $3);
    reaction_is_active := true;
  end if;

  select pg_catalog.count(*)::integer into reaction_count
  from public.message_reactions as summary
  where summary.message_id = target_message_id
    and summary.reaction = $3;

  return pg_catalog.jsonb_build_object(
    'message_id', target_message_id,
    'reaction', $3,
    'active', reaction_is_active,
    'count', reaction_count
  );
end;
$$;

create function public.get_room_messages(
  target_room_id uuid,
  before_created_at timestamptz default null,
  before_id uuid default null,
  page_size integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := (select auth.uid());
  caller_participant_id uuid;
  safe_page_size integer := least(greatest(coalesce(page_size, 30), 1), 50);
  result jsonb;
begin
  if caller_user_id is null then
    raise exception using errcode = 'P0001', message = 'Authentication required.';
  end if;

  if not (select private.is_room_member(target_room_id)) then
    raise exception using errcode = 'P0001', message = 'Membership required.';
  end if;

  if (before_created_at is null) <> (before_id is null) then
    raise exception using errcode = 'P0001', message = 'Invalid message cursor.';
  end if;

  select participant.id into caller_participant_id
  from public.participants as participant
  where participant.room_id = target_room_id
    and participant.user_id = caller_user_id
    and participant.status = 'active';

  with candidate as (
    select message.id, message.created_at
    from public.messages as message
    where message.room_id = target_room_id
      and message.deleted_at is null
      and (
        before_created_at is null
        or (message.created_at, message.id) < (before_created_at, before_id)
      )
    order by message.created_at desc, message.id desc
    limit safe_page_size + 1
  ), page as (
    select candidate.id, candidate.created_at
    from candidate
    order by candidate.created_at desc, candidate.id desc
    limit safe_page_size
  ), cursor_row as (
    select page.id, page.created_at
    from page
    order by page.created_at asc, page.id asc
    limit 1
  )
  select pg_catalog.jsonb_build_object(
    'messages', coalesce((
      select pg_catalog.jsonb_agg(
        private.message_payload(page.id, caller_participant_id)
        order by page.created_at desc, page.id desc
      ) from page
    ), '[]'::jsonb),
    'has_more', (select pg_catalog.count(*) > safe_page_size from candidate),
    'next_cursor', case
      when (select pg_catalog.count(*) > safe_page_size from candidate)
      then (
        select pg_catalog.jsonb_build_object('created_at', cursor_row.created_at, 'id', cursor_row.id)
        from cursor_row
      )
      else null
    end
  ) into result;

  return result;
end;
$$;

create function private.room_id_from_realtime_topic(topic text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if topic !~ '^room:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;
  return pg_catalog.substr(topic, 6)::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create function private.notify_room_chat_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_room_id uuid;
  changed_message_id uuid;
  event_kind text;
begin
  if tg_table_name = 'messages' then
    changed_room_id := new.room_id;
    changed_message_id := new.id;
    event_kind := 'message';
  elsif tg_table_name = 'message_reactions' then
    changed_message_id := case when tg_op = 'DELETE' then old.message_id else new.message_id end;
    select message.room_id into changed_room_id
    from public.messages as message where message.id = changed_message_id;
    event_kind := 'reaction';
  else
    changed_room_id := case when tg_op = 'DELETE' then old.room_id else new.room_id end;
    event_kind := 'crew';
  end if;

  if changed_room_id is not null then
    perform realtime.send(
      pg_catalog.jsonb_build_object(
        'kind', event_kind,
        'roomId', changed_room_id,
        'messageId', changed_message_id
      ),
      'chat_changed',
      'room:' || changed_room_id::text,
      true
    );
  end if;

  return null;
end;
$$;

create trigger messages_notify_room
after insert on public.messages
for each row execute function private.notify_room_chat_change();

create trigger message_reactions_notify_room
after insert or delete on public.message_reactions
for each row execute function private.notify_room_chat_change();

create trigger participants_notify_room
after insert or update of status, display_name on public.participants
for each row execute function private.notify_room_chat_change();

alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;

revoke all on table public.messages from public, anon, authenticated;
revoke all on table public.message_reactions from public, anon, authenticated;
grant select on table public.messages to authenticated;
grant select on table public.message_reactions to authenticated;

create policy messages_select_active_room_members
on public.messages for select
to authenticated
using (
  deleted_at is null
  and (select private.is_room_member(room_id))
);

create policy message_reactions_select_active_room_members
on public.message_reactions for select
to authenticated
using (
  exists (
    select 1 from public.messages as message
    where message.id = message_id
      and message.deleted_at is null
      and (select private.is_room_member(message.room_id))
  )
);

create policy room_members_receive_room_events
on realtime.messages for select
to authenticated
using (
  extension in ('broadcast', 'presence')
  and (select private.is_room_member(private.room_id_from_realtime_topic(realtime.topic())))
);

create policy room_members_send_room_events
on realtime.messages for insert
to authenticated
with check (
  extension in ('broadcast', 'presence')
  and (select private.is_room_member(private.room_id_from_realtime_topic(realtime.topic())))
);

revoke execute on function private.validate_message_reaction_room() from public, anon, authenticated;
revoke execute on function private.message_payload(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.room_id_from_realtime_topic(text) from public, anon, authenticated;
revoke execute on function private.notify_room_chat_change() from public, anon, authenticated;
revoke execute on function public.send_message(uuid, uuid, text, uuid, uuid) from public, anon;
revoke execute on function public.toggle_message_reaction(uuid, uuid, text) from public, anon;
revoke execute on function public.get_room_messages(uuid, timestamptz, uuid, integer) from public, anon;

grant execute on function private.room_id_from_realtime_topic(text) to authenticated;
grant execute on function public.send_message(uuid, uuid, text, uuid, uuid) to authenticated;
grant execute on function public.toggle_message_reaction(uuid, uuid, text) to authenticated;
grant execute on function public.get_room_messages(uuid, timestamptz, uuid, integer) to authenticated;
