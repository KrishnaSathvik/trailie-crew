create table private.captcha_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('create_trip','join_trip')),
  verification_hash text not null check (verification_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint captcha_receipts_expiry_check check (expires_at > created_at and expires_at <= created_at + interval '10 minutes')
);
create index captcha_receipts_user_purpose_idx
  on private.captcha_receipts(user_id,purpose,created_at desc)
  where consumed_at is null;
create unique index captcha_receipts_verification_hash_unique
  on private.captcha_receipts(verification_hash);
alter table private.captcha_receipts enable row level security;
alter table private.captcha_receipts force row level security;

create table private.lifecycle_executions (
  category text primary key check (category in ('anonymous_cleanup','account_deletion')),
  lease_until timestamptz not null,
  last_started_at timestamptz not null default now(),
  last_completed_at timestamptz,
  last_safe_count integer not null default 0 check (last_safe_count >= 0)
);
alter table private.lifecycle_executions enable row level security;
alter table private.lifecycle_executions force row level security;

create table private.deletion_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('room_deleted','account_prepared','account_deleted','cleanup_deleted','cleanup_failed')),
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  safe_room_count integer not null default 0 check (safe_room_count >= 0),
  created_at timestamptz not null default now()
);
alter table private.deletion_events enable row level security;
alter table private.deletion_events force row level security;

create table private.ai_quota_settings (
  singleton boolean primary key default true check (singleton),
  generation_enabled boolean not null default true,
  user_daily_invocations integer not null default 25 check (user_daily_invocations > 0),
  room_daily_invocations integer not null default 100 check (room_daily_invocations > 0),
  global_daily_invocations integer not null default 1000 check (global_daily_invocations > 0),
  user_daily_tokens bigint not null default 250000 check (user_daily_tokens > 0),
  room_daily_tokens bigint not null default 1000000 check (room_daily_tokens > 0),
  global_daily_tokens bigint not null default 10000000 check (global_daily_tokens > 0),
  updated_at timestamptz not null default now()
);
insert into private.ai_quota_settings(singleton) values(true);
alter table private.ai_quota_settings enable row level security;
alter table private.ai_quota_settings force row level security;

create table private.ai_model_limits (
  model text primary key check (char_length(model) between 1 and 100),
  daily_invocations integer not null check (daily_invocations > 0),
  daily_tokens bigint not null check (daily_tokens > 0),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table private.ai_model_limits enable row level security;
alter table private.ai_model_limits force row level security;

create table private.ai_quota_reservations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  workflow text not null check (workflow in ('focused_answer','memory_extraction','planning_summary','itinerary_generation','itinerary_repair','revision_analysis','revision_candidate')),
  model text not null check (char_length(model) between 1 and 100),
  reserved_tokens bigint not null check (reserved_tokens > 0),
  actual_tokens bigint check (actual_tokens is null or actual_tokens >= 0),
  status text not null default 'reserved' check (status in ('reserved','used','released')),
  error_code text,
  usage_day date not null default (timezone('utc',now()))::date,
  created_at timestamptz not null default now(),
  reconciled_at timestamptz
);
create index ai_quota_reservations_user_day_idx on private.ai_quota_reservations(user_id,usage_day,status);
create index ai_quota_reservations_room_day_idx on private.ai_quota_reservations(room_id,usage_day,status);
alter table private.ai_quota_reservations enable row level security;
alter table private.ai_quota_reservations force row level security;

revoke all on private.captcha_receipts,private.lifecycle_executions,private.deletion_events,private.ai_quota_settings,private.ai_model_limits,private.ai_quota_reservations from public,anon,authenticated,service_role;

create function public.record_captcha_receipt(
  target_user_id uuid,
  target_purpose text,
  verification_id text,
  target_expires_at timestamptz
) returns uuid language plpgsql security definer set search_path='' as $$
declare receipt_id uuid;
begin
  if target_purpose not in ('create_trip','join_trip') or target_expires_at <= now() or target_expires_at > now()+interval '10 minutes' then
    raise exception using errcode='P0001',message='captcha_invalid';
  end if;
  if not exists(select 1 from auth.users where id=target_user_id) then
    raise exception using errcode='P0001',message='captcha_invalid';
  end if;
  begin
    insert into private.captcha_receipts(user_id,purpose,verification_hash,expires_at)
    values(target_user_id,target_purpose,encode(extensions.digest(verification_id,'sha256'),'hex'),target_expires_at)
    returning id into receipt_id;
  exception when unique_violation then
    select id into receipt_id from private.captcha_receipts
    where verification_hash=encode(extensions.digest(verification_id,'sha256'),'hex')
      and user_id=target_user_id and purpose=target_purpose
      and consumed_at is null and expires_at>now();
    if receipt_id is null then
      raise exception using errcode='P0001',message='captcha_invalid';
    end if;
  end;
  return receipt_id;
end; $$;

create function private.consume_captcha_receipt(target_receipt_id uuid,target_purpose text) returns void
language plpgsql security definer set search_path='' as $$
declare receipt private.captcha_receipts%rowtype; caller uuid:=(select auth.uid());
begin
  select * into receipt from private.captcha_receipts where id=target_receipt_id for update;
  if not found or caller is null or receipt.user_id<>caller or receipt.purpose<>target_purpose or receipt.consumed_at is not null then
    raise exception using errcode='P0001',message='captcha_invalid';
  end if;
  if receipt.expires_at<=now() then raise exception using errcode='P0001',message='captcha_expired'; end if;
  update private.captcha_receipts set consumed_at=now() where id=receipt.id;
end; $$;

alter function public.create_trip(text,text,integer) rename to create_trip_unprotected;
alter function public.join_trip(text,text) rename to join_trip_unprotected;

create function public.create_trip_protected(trip_name text,display_name text,expected_travelers integer,target_receipt_id uuid)
returns table(room_id uuid,room_name text,participant_id uuid,room_code text,invite_token text,created_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  perform private.consume_captcha_receipt(target_receipt_id,'create_trip');
  return query select * from public.create_trip_unprotected(trip_name,display_name,expected_travelers);
end; $$;

create function public.join_trip_protected(invite_value text,display_name text,target_receipt_id uuid)
returns table(room_id uuid,room_name text,participant_id uuid,member_display_name text,participant_role public.participant_role,room_code text,joined_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  perform private.consume_captcha_receipt(target_receipt_id,'join_trip');
  return query select * from public.join_trip_unprotected(invite_value,display_name);
end; $$;

create function public.delete_room(target_room_id uuid,confirmation text) returns boolean
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); target public.rooms%rowtype;
begin
  select * into target from public.rooms where id=target_room_id for update;
  if not found then return true; end if;
  if caller is null or target.host_user_id<>caller or not private.is_room_host(target_room_id) then
    raise exception using errcode='P0001',message='host_required';
  end if;
  if confirmation<>target.name then raise exception using errcode='P0001',message='confirmation_required'; end if;
  delete from public.plan_share_links where room_id=target_room_id;
  delete from public.rooms where id=target_room_id;
  insert into private.deletion_events(event_type,subject_hash,safe_room_count)
  values('room_deleted',encode(extensions.digest(target_room_id::text,'sha256'),'hex'),1);
  return true;
end; $$;

create function public.transfer_room_host(target_room_id uuid,target_participant_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); room public.rooms%rowtype; target public.participants%rowtype;
begin
  select * into room from public.rooms where id=target_room_id and status='active' for update;
  if not found or caller is null or room.host_user_id<>caller or not private.is_room_host(target_room_id) then
    raise exception using errcode='P0001',message='host_required';
  end if;
  select * into target from public.participants where id=target_participant_id and room_id=target_room_id for update;
  if not found or target.status<>'active' then raise exception using errcode='P0001',message='active_member_required'; end if;
  if target.user_id=caller then return true; end if;
  update public.participants set role='member' where room_id=target_room_id and user_id=caller and status='active';
  update public.participants set role='host' where id=target.id;
  update public.rooms set host_user_id=target.user_id where id=target_room_id;
  return true;
end; $$;

create function public.assess_account_deletion() returns jsonb
language sql stable security definer set search_path='' as $$
  with caller as (select auth.uid() id), rooms as (
    select p.room_id,p.role,p.status,r.name,
      (select count(*) from public.participants other where other.room_id=p.room_id and other.status='active' and other.user_id<>p.user_id) other_active
    from public.participants p join public.rooms r on r.id=p.room_id join caller on caller.id=p.user_id
  ) select jsonb_build_object(
    'soleHostRooms',coalesce(jsonb_agg(jsonb_build_object('id',room_id,'name',name)) filter(where role='host' and status='active' and other_active=0),'[]'::jsonb),
    'hostRooms',coalesce(jsonb_agg(jsonb_build_object('id',room_id,'name',name)) filter(where role='host' and status='active' and other_active>0),'[]'::jsonb),
    'ordinaryMemberships',count(*) filter(where role='member' and status='active')
  ) from rooms;
$$;

create function public.prepare_account_deletion(confirmation text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); affected integer;
begin
  if caller is null then raise exception using errcode='P0001',message='authentication_required'; end if;
  if confirmation<>'DELETE MY ACCOUNT' then raise exception using errcode='P0001',message='confirmation_required'; end if;
  if exists(select 1 from public.participants where user_id=caller and role='host' and status='active') then
    raise exception using errcode='P0001',message='host_transfer_or_room_deletion_required';
  end if;
  update private.room_memory memory set participant_profiles=memory.participant_profiles-caller::text
  where memory.participant_profiles ? caller::text;
  update public.participants set status='left',display_name='Deleted traveler',last_seen_at=now()
  where user_id=caller and status='active';
  get diagnostics affected=row_count;
  insert into private.deletion_events(event_type,subject_hash,safe_room_count)
  values('account_prepared',encode(extensions.digest(caller::text,'sha256'),'hex'),affected);
  return jsonb_build_object('prepared',true,'affectedMemberships',affected);
end; $$;

create function public.list_anonymous_cleanup_candidates(retention interval,batch_size integer,dry_run boolean)
returns table(user_id uuid,created_at timestamptz) language plpgsql stable security definer set search_path='' as $$
begin
  if retention<interval '1 day' or batch_size not between 1 and 500 then raise exception using errcode='P0001',message='invalid_cleanup_configuration'; end if;
  return query select u.id,u.created_at from auth.users u
  where u.is_anonymous is true and u.deleted_at is null and u.created_at<now()-retention
    and not exists(select 1 from public.participants p where p.user_id=u.id and p.status='active')
    and not exists(select 1 from public.rooms r where r.host_user_id=u.id and r.status='active')
    and not exists(select 1 from public.plan_share_links s where s.created_by_user_id=u.id and s.status='active')
    and not exists(select 1 from private.ai_invocations i where i.requested_by_user_id=u.id and i.status in ('queued','running'))
    and not exists(select 1 from public.planning_requests p where p.requested_by_user_id=u.id and p.status in ('draft','generating_summary','approved_for_generation'))
    and not exists(select 1 from public.trip_plans p where p.created_by_user_id=u.id and p.status in ('generating','validating','needs_revision'))
    and not exists(select 1 from public.plan_change_requests p where p.requested_by_user_id=u.id and p.status in ('draft','analyzing','approved','applying','validating'))
  order by u.created_at,u.id limit batch_size;
end; $$;

create function public.record_anonymous_cleanup_result(target_user_id uuid,succeeded boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  insert into private.deletion_events(event_type,subject_hash,safe_room_count)
  values(
    case when succeeded then 'cleanup_deleted' else 'cleanup_failed' end,
    encode(extensions.digest(target_user_id::text,'sha256'),'hex'),
    0
  );
end; $$;

create function public.claim_lifecycle_execution(target_category text,lease_seconds integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare claimed boolean:=false;
begin
  if target_category not in ('anonymous_cleanup','account_deletion') or lease_seconds not between 30 and 3600 then return false; end if;
  insert into private.lifecycle_executions(category,lease_until,last_started_at)
  values(target_category,now()+make_interval(secs=>lease_seconds),now())
  on conflict(category) do update set lease_until=excluded.lease_until,last_started_at=excluded.last_started_at
  where private.lifecycle_executions.lease_until<=now();
  get diagnostics claimed=row_count;
  return claimed;
end; $$;

create function public.reserve_ai_quota(target_user_id uuid,target_room_id uuid,target_workflow text,target_model text,estimated_tokens bigint,reservation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare settings private.ai_quota_settings%rowtype; model_limit private.ai_model_limits%rowtype; user_count bigint;room_count bigint;global_count bigint;model_count bigint;user_tokens bigint;room_tokens bigint;global_tokens bigint;model_tokens bigint;today date:=(timezone('utc',now()))::date;
begin
  perform pg_advisory_xact_lock(hashtextextended('trailie-ai-quota:'||today::text,0));
  select * into settings from private.ai_quota_settings where singleton for update;
  if not settings.generation_enabled then raise exception using errcode='P0001',message='ai_disabled'; end if;
  if estimated_tokens<=0 then raise exception using errcode='P0001',message='provider_budget_unavailable'; end if;
  if not exists(select 1 from public.participants where room_id=target_room_id and user_id=target_user_id and status='active') then raise exception using errcode='P0001',message='membership_required'; end if;
  select count(*),coalesce(sum(coalesce(actual_tokens,reserved_tokens)),0) into user_count,user_tokens from private.ai_quota_reservations where user_id=target_user_id and usage_day=today and status<>'released';
  select count(*),coalesce(sum(coalesce(actual_tokens,reserved_tokens)),0) into room_count,room_tokens from private.ai_quota_reservations where room_id=target_room_id and usage_day=today and status<>'released';
  select count(*),coalesce(sum(coalesce(actual_tokens,reserved_tokens)),0) into global_count,global_tokens from private.ai_quota_reservations where usage_day=today and status<>'released';
  if user_count>=settings.user_daily_invocations or user_tokens+estimated_tokens>settings.user_daily_tokens then raise exception using errcode='P0001',message='user_ai_limit_reached'; end if;
  if room_count>=settings.room_daily_invocations or room_tokens+estimated_tokens>settings.room_daily_tokens then raise exception using errcode='P0001',message='room_ai_limit_reached'; end if;
  if global_count>=settings.global_daily_invocations or global_tokens+estimated_tokens>settings.global_daily_tokens then raise exception using errcode='P0001',message='global_ai_limit_reached'; end if;
  select * into model_limit from private.ai_model_limits where model=target_model;
  if found then
    if not model_limit.enabled then raise exception using errcode='P0001',message='provider_budget_unavailable'; end if;
    select count(*),coalesce(sum(coalesce(actual_tokens,reserved_tokens)),0) into model_count,model_tokens from private.ai_quota_reservations where usage_day=today and model=target_model and status<>'released';
    if model_count>=model_limit.daily_invocations or model_tokens+estimated_tokens>model_limit.daily_tokens then raise exception using errcode='P0001',message='global_ai_limit_reached'; end if;
  end if;
  insert into private.ai_quota_reservations(id,user_id,room_id,workflow,model,reserved_tokens) values(reservation_id,target_user_id,target_room_id,target_workflow,target_model,estimated_tokens)
  on conflict(id) do nothing;
  return jsonb_build_object('reservationId',reservation_id,'status','reserved');
end; $$;

create function public.get_ai_quota_subject(target_kind text,target_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare subject jsonb;
begin
  if target_kind='memory' then
    select jsonb_build_object('roomId',room_id,'userId',sender_user_id) into subject from public.messages where id=target_id;
  elsif target_kind='planning' then
    select jsonb_build_object('roomId',room_id,'userId',requested_by_user_id) into subject from public.planning_requests where id=target_id;
  elsif target_kind='itinerary' then
    select jsonb_build_object('roomId',room_id,'userId',created_by_user_id) into subject from public.trip_plans where id=target_id;
  elsif target_kind='revision' then
    select jsonb_build_object('roomId',room_id,'userId',requested_by_user_id) into subject from public.plan_change_requests where id=target_id;
  else
    raise exception using errcode='P0001',message='provider_budget_unavailable';
  end if;
  if subject is null then raise exception using errcode='P0001',message='provider_budget_unavailable'; end if;
  return subject;
end; $$;

create function public.get_ai_usage_report(target_day date) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'day',target_day,
    'totalInvocations',count(*),
    'totalTokens',coalesce(sum(coalesce(actual_tokens,reserved_tokens)),0),
    'byModel',coalesce((select jsonb_agg(row_value order by model) from (
      select model,jsonb_build_object('model',model,'invocations',count(*),'tokens',coalesce(sum(coalesce(actual_tokens,reserved_tokens)),0)) row_value
      from private.ai_quota_reservations where usage_day=target_day and status<>'released' group by model
    ) model_rows),'[]'::jsonb),
    'byWorkflow',coalesce((select jsonb_agg(row_value order by workflow) from (
      select workflow,jsonb_build_object('workflow',workflow,'invocations',count(*),'tokens',coalesce(sum(coalesce(actual_tokens,reserved_tokens)),0)) row_value
      from private.ai_quota_reservations where usage_day=target_day and status<>'released' group by workflow
    ) workflow_rows),'[]'::jsonb)
  ) from private.ai_quota_reservations where usage_day=target_day and status<>'released';
$$;

create function public.set_ai_generation_enabled(enabled boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  update private.ai_quota_settings set generation_enabled=enabled,updated_at=now() where singleton;
  return enabled;
end; $$;

create function public.reconcile_ai_quota(reservation_id uuid,actual_tokens bigint,result_status text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare updated private.ai_quota_reservations%rowtype;
begin
  if $2<0 or $3 not in ('used','released') then raise exception using errcode='P0001',message='invalid_quota_reconciliation'; end if;
  update private.ai_quota_reservations set actual_tokens=case when $3='used' then $2 else 0 end,status=$3,reconciled_at=now()
  where id=$1 and status='reserved' returning * into updated;
  if not found then select * into updated from private.ai_quota_reservations where id=$1; end if;
  if not found then raise exception using errcode='P0001',message='quota_reservation_not_found'; end if;
  return jsonb_build_object('reservationId',updated.id,'status',updated.status,'actualTokens',coalesce(updated.actual_tokens,0));
end; $$;

revoke execute on function private.consume_captcha_receipt(uuid,text) from public,anon,authenticated,service_role;
revoke execute on function public.create_trip_unprotected(text,text,integer),public.join_trip_unprotected(text,text) from public,anon,authenticated,service_role;
revoke execute on function public.record_captcha_receipt(uuid,text,text,timestamptz),public.create_trip_protected(text,text,integer,uuid),public.join_trip_protected(text,text,uuid),public.delete_room(uuid,text),public.transfer_room_host(uuid,uuid),public.assess_account_deletion(),public.prepare_account_deletion(text),public.list_anonymous_cleanup_candidates(interval,integer,boolean),public.record_anonymous_cleanup_result(uuid,boolean),public.claim_lifecycle_execution(text,integer),public.get_ai_quota_subject(text,uuid),public.reserve_ai_quota(uuid,uuid,text,text,bigint,uuid),public.reconcile_ai_quota(uuid,bigint,text),public.get_ai_usage_report(date),public.set_ai_generation_enabled(boolean) from public,anon,authenticated,service_role;
grant execute on function public.create_trip_protected(text,text,integer,uuid),public.join_trip_protected(text,text,uuid),public.delete_room(uuid,text),public.transfer_room_host(uuid,uuid),public.assess_account_deletion(),public.prepare_account_deletion(text) to authenticated;
grant execute on function public.record_captcha_receipt(uuid,text,text,timestamptz),public.list_anonymous_cleanup_candidates(interval,integer,boolean),public.record_anonymous_cleanup_result(uuid,boolean),public.claim_lifecycle_execution(text,integer),public.get_ai_quota_subject(text,uuid),public.reserve_ai_quota(uuid,uuid,text,text,bigint,uuid),public.reconcile_ai_quota(uuid,bigint,text),public.get_ai_usage_report(date),public.set_ai_generation_enabled(boolean) to service_role;
