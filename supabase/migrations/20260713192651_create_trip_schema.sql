create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.approval_mode as enum ('all_active', 'host_only');
create type public.room_status as enum ('active', 'archived', 'deleted');
create type public.participant_role as enum ('host', 'member');
create type public.participant_status as enum ('active', 'left', 'removed');

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  room_code text not null unique,
  host_user_id uuid not null references auth.users(id),
  expected_travelers integer,
  approval_mode public.approval_mode not null default 'all_active',
  status public.room_status not null default 'active',
  current_plan_version integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rooms_name_length check (char_length(btrim(name)) between 1 and 100),
  constraint rooms_room_code_format check (room_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  constraint rooms_expected_travelers_range check (expected_travelers is null or expected_travelers between 1 and 50),
  constraint rooms_current_plan_version_positive check (current_plan_version is null or current_plan_version > 0)
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  role public.participant_role not null default 'member',
  status public.participant_status not null default 'active',
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz,
  constraint participants_display_name_length check (char_length(btrim(display_name)) between 1 and 50),
  constraint participants_room_user_unique unique (room_id, user_id)
);

create unique index participants_active_display_name_unique
  on public.participants (room_id, lower(display_name))
  where status = 'active';
create index participants_user_id_idx on public.participants (user_id);
create index participants_room_id_idx on public.participants (room_id);

create table public.room_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  token_hash text not null unique,
  short_code text not null unique,
  created_by uuid not null references auth.users(id),
  expires_at timestamptz,
  max_uses integer,
  use_count integer not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint room_invites_token_hash_format check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint room_invites_short_code_format check (short_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  constraint room_invites_max_uses_positive check (max_uses is null or max_uses > 0),
  constraint room_invites_use_count_valid check (use_count >= 0 and (max_uses is null or use_count <= max_uses))
);

create index room_invites_room_id_idx on public.room_invites (room_id);
create index rooms_host_user_id_idx on public.rooms (host_user_id);

create table private.room_memory (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  memory_version integer not null default 1,
  participant_profiles jsonb not null default '{}'::jsonb,
  shared_context jsonb not null default '{}'::jsonb,
  confirmed_decisions jsonb not null default '[]'::jsonb,
  rejected_options jsonb not null default '[]'::jsonb,
  open_questions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint room_memory_version_positive check (memory_version > 0),
  constraint room_memory_profiles_object check (jsonb_typeof(participant_profiles) = 'object'),
  constraint room_memory_context_object check (jsonb_typeof(shared_context) = 'object'),
  constraint room_memory_decisions_array check (jsonb_typeof(confirmed_decisions) = 'array'),
  constraint room_memory_rejected_array check (jsonb_typeof(rejected_options) = 'array'),
  constraint room_memory_questions_array check (jsonb_typeof(open_questions) = 'array')
);

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create trigger rooms_set_updated_at
before update on public.rooms
for each row execute function private.set_updated_at();

create trigger room_memory_set_updated_at
before update on private.room_memory
for each row execute function private.set_updated_at();

alter table public.rooms enable row level security;
alter table public.participants enable row level security;
alter table public.room_invites enable row level security;
alter table private.room_memory enable row level security;
alter table private.room_memory force row level security;

create policy room_memory_deny_browser_roles
on private.room_memory
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

revoke all on table public.rooms from public, anon, authenticated;
revoke all on table public.participants from public, anon, authenticated;
revoke all on table public.room_invites from public, anon, authenticated;
revoke all on table private.room_memory from public, anon, authenticated;
revoke execute on function private.set_updated_at() from public, anon, authenticated;
