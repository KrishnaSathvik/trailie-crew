\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

begin;

create temporary table phase5c_load_metrics (
  metric text primary key,
  value numeric not null
) on commit drop;

insert into auth.users(id,instance_id,aud,role,created_at,updated_at,is_anonymous)
select
  ('5c11' || lpad(value::text,4,'0') || '-0000-4000-8000-' || lpad(value::text,12,'0'))::uuid,
  '00000000-0000-0000-0000-000000000000','authenticated','authenticated',now(),now(),true
from generate_series(1,10) value;

insert into public.rooms(id,name,room_code,host_user_id,status)
values(
  '5c220000-0000-4000-8000-000000000001','Phase 5C bounded chat load','FAST5C24',
  '5c110001-0000-4000-8000-000000000001','active'
);

insert into public.participants(id,room_id,user_id,display_name,role,status)
select
  ('5c33' || lpad(value::text,4,'0') || '-0000-4000-8000-' || lpad(value::text,12,'0'))::uuid,
  '5c220000-0000-4000-8000-000000000001',
  ('5c11' || lpad(value::text,4,'0') || '-0000-4000-8000-' || lpad(value::text,12,'0'))::uuid,
  'Load traveler '||value,
  case when value=1 then 'host'::public.participant_role else 'member'::public.participant_role end,
  'active'
from generate_series(1,10) value;

do $$
declare started timestamptz:=clock_timestamp(); elapsed numeric;
begin
  insert into public.messages(
    room_id,participant_id,sender_user_id,message_type,body,client_message_id,created_at
  )
  select
    '5c220000-0000-4000-8000-000000000001',
    ('5c33' || lpad((((value-1)%10)+1)::text,4,'0') || '-0000-4000-8000-' || lpad((((value-1)%10)+1)::text,12,'0'))::uuid,
    ('5c11' || lpad((((value-1)%10)+1)::text,4,'0') || '-0000-4000-8000-' || lpad((((value-1)%10)+1)::text,12,'0'))::uuid,
    'user','Bounded load message '||value,gen_random_uuid(),
    now()+make_interval(secs=>value/1000.0)
  from generate_series(1,1000) value;
  elapsed:=extract(epoch from clock_timestamp()-started)*1000;
  insert into phase5c_load_metrics values('message_insert_ms',elapsed);
end $$;

do $$
declare started timestamptz:=clock_timestamp(); elapsed numeric;
begin
  insert into public.message_reactions(message_id,participant_id,reaction)
  select message.id,participant.id,'celebrate'
  from (
    select id,row_number() over(order by created_at,id) row_number
    from public.messages
    where room_id='5c220000-0000-4000-8000-000000000001'
    order by created_at,id limit 100
  ) message
  cross join public.participants participant
  where participant.room_id='5c220000-0000-4000-8000-000000000001';
  elapsed:=extract(epoch from clock_timestamp()-started)*1000;
  insert into phase5c_load_metrics values('reaction_insert_ms',elapsed);
end $$;

do $$
declare started timestamptz:=clock_timestamp(); elapsed numeric; page integer;
begin
  for page in 0..49 loop
    perform id from public.messages
    where room_id='5c220000-0000-4000-8000-000000000001'
    order by created_at desc,id desc limit 20 offset page*20;
  end loop;
  elapsed:=extract(epoch from clock_timestamp()-started)*1000;
  insert into phase5c_load_metrics values('fifty_page_reads_ms',elapsed);
end $$;

select jsonb_build_object(
  'schemaVersion','1',
  'environment','isolated_local_postgres',
  'testedEnvelope',jsonb_build_object(
    'users',10,'messages',1000,'reactions',1000,'paginationPages',50
  ),
  'messageInsertMs',round((select value from phase5c_load_metrics where metric='message_insert_ms'),2),
  'messageThroughputPerSecond',round(1000000/(select value from phase5c_load_metrics where metric='message_insert_ms'),2),
  'reactionInsertMs',round((select value from phase5c_load_metrics where metric='reaction_insert_ms'),2),
  'fiftyPageReadsMs',round((select value from phase5c_load_metrics where metric='fifty_page_reads_ms'),2),
  'messageCount',(select count(*) from public.messages where room_id='5c220000-0000-4000-8000-000000000001'),
  'reactionCount',(select count(*) from public.message_reactions reaction join public.messages message on message.id=reaction.message_id where message.room_id='5c220000-0000-4000-8000-000000000001'),
  'limitations',jsonb_build_array(
    'Database-only chat envelope; it does not claim HTTP, browser, Realtime, CPU, memory, or provider scale.',
    'Planning, itinerary, revision, sharing, and lifecycle races remain covered by bounded integration/pgTAP tests rather than this throughput measurement.'
  )
);

rollback;
