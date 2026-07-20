create type private.booking_handoff_category as enum ('park_entry','permit','campground','tour','activity','shuttle','ferry','lodging','restaurant','flight','hotel_search','general_reservation');
create type private.booking_availability_state as enum ('available','unavailable','limited','unknown','unsupported','stale');
create type private.booking_price_state as enum ('verified_current','observed','starting_from','stale','unavailable','unsupported');
create type private.booking_requirement as enum ('required','recommended','optional','unknown');

create table private.booking_handoffs (
  id uuid primary key default gen_random_uuid(),
  handoff_id text not null unique check (length(handoff_id) between 16 and 240),
  room_id uuid not null references public.rooms(id) on delete cascade,
  plan_version_id uuid not null references public.trip_plans(id) on delete restrict,
  itinerary_item_id text,
  category private.booking_handoff_category not null,
  provider text not null check (length(provider) between 1 and 80),
  provider_entity_id text,
  title text not null check (length(title) between 1 and 240),
  official_or_approved boolean not null default false,
  destination_url text not null check (destination_url ~* '^https://'),
  availability_state private.booking_availability_state not null default 'unknown',
  price_state private.booking_price_state not null default 'unsupported',
  observed_price numeric,
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  retrieved_at timestamptz,
  valid_until timestamptz,
  requirement private.booking_requirement not null default 'unknown',
  source_evidence_id uuid references private.travel_evidence(id) on delete set null,
  attribution text,
  warning text,
  privacy_level text not null default 'public' check (privacy_level in ('public','room')),
  created_at timestamptz not null default now()
);
alter table private.booking_handoffs add constraint booking_handoff_plan_room_fkey foreign key(plan_version_id,room_id) references public.trip_plans(id,room_id);
create index booking_handoffs_plan_idx on private.booking_handoffs(room_id,plan_version_id,category);

create table private.booking_handoff_clicks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  plan_version_id uuid not null references public.trip_plans(id) on delete restrict,
  handoff_id uuid not null references private.booking_handoffs(id) on delete cascade,
  provider text not null,
  category private.booking_handoff_category not null,
  itinerary_item_id text,
  clicked_at timestamptz not null default now(),
  success boolean not null default true
);
alter table private.booking_handoff_clicks add constraint booking_click_plan_room_fkey foreign key(plan_version_id,room_id) references public.trip_plans(id,room_id);

alter table private.booking_handoffs enable row level security;
alter table private.booking_handoffs force row level security;
alter table private.booking_handoff_clicks enable row level security;
alter table private.booking_handoff_clicks force row level security;
create policy booking_handoffs_deny_browser on private.booking_handoffs as restrictive for all to anon,authenticated using(false) with check(false);
create policy booking_clicks_deny_browser on private.booking_handoff_clicks as restrictive for all to anon,authenticated using(false) with check(false);
revoke all on private.booking_handoffs, private.booking_handoff_clicks from anon,authenticated;

create or replace function public.store_booking_handoff(target jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid; u text;
begin
  if jsonb_typeof(target) <> 'object' then raise exception 'invalid_booking_handoff'; end if;
  u := target->>'destinationUrl';
  if u is null or u !~* '^https://' then raise exception 'invalid_booking_url'; end if;
  if u ~* '^https://(javascript|data):' then raise exception 'invalid_booking_url'; end if;
  insert into private.booking_handoffs(handoff_id,room_id,plan_version_id,itinerary_item_id,category,provider,provider_entity_id,title,official_or_approved,destination_url,availability_state,price_state,observed_price,currency,retrieved_at,valid_until,requirement,source_evidence_id,attribution,warning,privacy_level)
  values (target->>'handoffId',(target->>'roomId')::uuid,(target->>'planVersionId')::uuid,target->>'itineraryItemId',(target->>'category')::private.booking_handoff_category,target->>'provider',target->>'providerEntityId',target->>'title',coalesce((target->>'officialOrApproved')::boolean,false),u,coalesce((target->>'availabilityState')::private.booking_availability_state,'unknown'),coalesce((target->>'priceState')::private.booking_price_state,'unsupported'),(target->>'observedPrice')::numeric,target->>'currency',(target->>'retrievedAt')::timestamptz,(target->>'validUntil')::timestamptz,coalesce((target->>'bookingRequirement')::private.booking_requirement,'unknown'),(target->>'sourceEvidenceId')::uuid,target->>'attribution',target->>'warning',coalesce(target->>'privacyLevel','public')) returning id into result;
  return result;
end $$;
revoke all on function public.store_booking_handoff(jsonb) from public, anon, authenticated;

