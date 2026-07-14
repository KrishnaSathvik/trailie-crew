create table private.message_extractions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  message_id uuid not null unique references public.messages(id) on delete cascade,
  participant_id uuid not null,
  user_id uuid not null references auth.users(id),
  model text not null,
  prompt_version text not null,
  schema_version text not null,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  provider_response_id text,
  provider_request_id text,
  input_tokens bigint,
  output_tokens bigint,
  reasoning_tokens bigint,
  cached_input_tokens bigint,
  total_tokens bigint,
  latency_ms integer,
  error_code text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint message_extractions_participant_fkey
    foreign key (participant_id, room_id, user_id)
    references public.participants(id, room_id, user_id),
  constraint message_extractions_message_room_fkey
    foreign key (message_id, room_id) references public.messages(id, room_id),
  constraint message_extractions_status_valid check (status in ('queued','running','completed','failed','skipped')),
  constraint message_extractions_attempts_valid check (attempt_count between 0 and 2),
  constraint message_extractions_names_valid check (
    model = btrim(model) and char_length(model) between 1 and 100
    and prompt_version = btrim(prompt_version) and char_length(prompt_version) between 1 and 100
    and schema_version = btrim(schema_version) and char_length(schema_version) between 1 and 100
  ),
  constraint message_extractions_usage_valid check (
    coalesce(input_tokens,0) >= 0 and coalesce(output_tokens,0) >= 0
    and coalesce(reasoning_tokens,0) >= 0 and coalesce(cached_input_tokens,0) >= 0
    and coalesce(total_tokens,0) >= 0 and coalesce(latency_ms,0) >= 0
  )
);

create index message_extractions_pending_idx
  on private.message_extractions(status, created_at)
  where status in ('queued','running');
create index message_extractions_room_created_idx
  on private.message_extractions(room_id, created_at desc);

create table private.memory_facts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  subject_type text not null,
  subject_participant_id uuid,
  fact_type text not null,
  canonical_key text not null,
  value jsonb not null,
  status text not null,
  confidence numeric(4,3) not null,
  evidence_strength text not null,
  source_message_id uuid not null,
  source_participant_id uuid not null,
  supersedes_fact_id uuid references private.memory_facts(id),
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  constraint memory_facts_subject_participant_fkey
    foreign key (subject_participant_id) references public.participants(id),
  constraint memory_facts_source_participant_fkey
    foreign key (source_participant_id) references public.participants(id),
  constraint memory_facts_source_message_fkey
    foreign key (source_message_id, room_id)
    references public.messages(id, room_id),
  constraint memory_facts_subject_valid check (
    (subject_type = 'participant' and subject_participant_id is not null)
    or (subject_type in ('group','trip') and subject_participant_id is null)
  ),
  constraint memory_facts_type_valid check (fact_type in (
    'destination_preference','destination_proposal','destination_constraint',
    'date_preference','date_constraint','budget_preference','budget_constraint',
    'transport_preference','lodging_preference','food_preference','accessibility_need',
    'activity_preference','must_do','avoid','availability','traveler_origin',
    'group_decision','rejected_option','open_question','general_constraint'
  )),
  constraint memory_facts_status_valid check (status in ('active','superseded','rejected','unresolved')),
  constraint memory_facts_evidence_valid check (evidence_strength in ('explicit','strong','tentative')),
  constraint memory_facts_confidence_valid check (confidence between 0 and 1),
  constraint memory_facts_key_valid check (
    canonical_key = subject_type || ':' || fact_type
    and char_length(canonical_key) between 3 and 160
  ),
  constraint memory_facts_value_valid check (
    jsonb_typeof(value) = 'object' and value <> '{}'::jsonb
    and (value - array['text','question','startDate','endDate','amount','currency']::text[]) = '{}'::jsonb
    and coalesce(char_length(value->>'text'),0) <= 500
    and coalesce(char_length(value->>'question'),0) <= 500
  ),
  constraint memory_facts_superseded_timestamp_valid check (
    (status = 'superseded') = (superseded_at is not null)
  )
);

create index memory_facts_room_active_idx
  on private.memory_facts(room_id, fact_type, canonical_key, created_at, id)
  where status <> 'superseded';
create index memory_facts_subject_active_idx
  on private.memory_facts(room_id, subject_participant_id, fact_type)
  where status <> 'superseded';
create unique index memory_facts_source_key_unique
  on private.memory_facts(source_message_id, subject_type, coalesce(subject_participant_id, '00000000-0000-0000-0000-000000000000'::uuid), fact_type, canonical_key);

alter table private.message_extractions enable row level security;
alter table private.message_extractions force row level security;
alter table private.memory_facts enable row level security;
alter table private.memory_facts force row level security;

create policy message_extractions_deny_browser_roles on private.message_extractions
as restrictive for all to anon, authenticated using (false) with check (false);
create policy memory_facts_deny_browser_roles on private.memory_facts
as restrictive for all to anon, authenticated using (false) with check (false);

revoke all on table private.message_extractions from public, anon, authenticated, service_role;
revoke all on table private.memory_facts from public, anon, authenticated, service_role;
revoke all on table private.room_memory from service_role;

create function private.rebuild_room_memory(target_room_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'participant_profiles', coalesce((
      select pg_catalog.jsonb_object_agg(
        participant.id::text,
        pg_catalog.jsonb_build_object(
          'displayName', participant.display_name,
          'preferences', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'id', fact.id, 'key', fact.canonical_key, 'value', fact.value,
            'sourceMessageIds', pg_catalog.jsonb_build_array(fact.source_message_id)
          ) order by fact.created_at, fact.id) from private.memory_facts fact
            where fact.room_id = target_room_id and fact.subject_participant_id = participant.id
              and fact.status = 'active' and fact.fact_type like '%_preference'), '[]'::jsonb),
          'constraints', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'id', fact.id, 'key', fact.canonical_key, 'value', fact.value,
            'sourceMessageIds', pg_catalog.jsonb_build_array(fact.source_message_id)
          ) order by fact.created_at, fact.id) from private.memory_facts fact
            where fact.room_id = target_room_id and fact.subject_participant_id = participant.id
              and fact.status = 'active' and (fact.fact_type like '%_constraint' or fact.fact_type in ('accessibility_need','availability','general_constraint'))), '[]'::jsonb),
          'mustDos', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'id', fact.id, 'key', fact.canonical_key, 'value', fact.value,
            'sourceMessageIds', pg_catalog.jsonb_build_array(fact.source_message_id)
          ) order by fact.created_at, fact.id) from private.memory_facts fact
            where fact.room_id = target_room_id and fact.subject_participant_id = participant.id
              and fact.status = 'active' and fact.fact_type = 'must_do'), '[]'::jsonb),
          'avoids', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'id', fact.id, 'key', fact.canonical_key, 'value', fact.value,
            'sourceMessageIds', pg_catalog.jsonb_build_array(fact.source_message_id)
          ) order by fact.created_at, fact.id) from private.memory_facts fact
            where fact.room_id = target_room_id and fact.subject_participant_id = participant.id
              and fact.status = 'active' and fact.fact_type = 'avoid'), '[]'::jsonb)
        )
      ) from public.participants participant
      where participant.room_id = target_room_id and participant.status = 'active'
    ), '{}'::jsonb),
    'shared_context', pg_catalog.jsonb_build_object(
      'destinationsUnderConsideration', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'key',canonical_key,'value',value,'sourceMessageIds',pg_catalog.jsonb_build_array(source_message_id)) order by created_at,id) from private.memory_facts where room_id=target_room_id and status='active' and fact_type in ('destination_preference','destination_proposal')), '[]'::jsonb),
      'dateWindows', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'key',canonical_key,'value',value,'sourceMessageIds',pg_catalog.jsonb_build_array(source_message_id)) order by created_at,id) from private.memory_facts where room_id=target_room_id and status='active' and fact_type in ('date_preference','date_constraint','availability')), '[]'::jsonb),
      'budgetContext', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'key',canonical_key,'value',value,'sourceMessageIds',pg_catalog.jsonb_build_array(source_message_id)) order by created_at,id) from private.memory_facts where room_id=target_room_id and status='active' and fact_type in ('budget_preference','budget_constraint')), '[]'::jsonb),
      'transportContext', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'key',canonical_key,'value',value,'sourceMessageIds',pg_catalog.jsonb_build_array(source_message_id)) order by created_at,id) from private.memory_facts where room_id=target_room_id and status='active' and fact_type='transport_preference'), '[]'::jsonb),
      'lodgingContext', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'key',canonical_key,'value',value,'sourceMessageIds',pg_catalog.jsonb_build_array(source_message_id)) order by created_at,id) from private.memory_facts where room_id=target_room_id and status='active' and fact_type='lodging_preference'), '[]'::jsonb)
    ),
    'confirmed_decisions', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'key',canonical_key,'value',value,'sourceMessageIds',pg_catalog.jsonb_build_array(source_message_id),'confirmedAt',created_at) order by created_at,id) from private.memory_facts where room_id=target_room_id and status='active' and fact_type='group_decision'), '[]'::jsonb),
    'rejected_options', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'key',canonical_key,'value',value,'sourceMessageIds',pg_catalog.jsonb_build_array(source_message_id)) order by created_at,id) from private.memory_facts where room_id=target_room_id and status='rejected' and fact_type='rejected_option'), '[]'::jsonb),
    'open_questions', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'key',canonical_key,'question',value->>'question','value',value,'sourceMessageIds',pg_catalog.jsonb_build_array(source_message_id)) order by created_at,id) from private.memory_facts where room_id=target_room_id and status='unresolved' and fact_type='open_question'), '[]'::jsonb)
  );
$$;

create function private.apply_memory_patch(
  target_room_id uuid,
  target_message_id uuid,
  target_participant_id uuid,
  proposed_patch jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  prior private.memory_facts%rowtype;
  subject_id uuid;
  supersedes_id uuid;
  changed boolean := false;
  snapshot jsonb;
  source_body text;
  source_role public.participant_role;
  room_approval public.approval_mode;
begin
  if jsonb_typeof(proposed_patch) <> 'object'
    or jsonb_typeof(proposed_patch->'facts') <> 'array'
    or jsonb_array_length(proposed_patch->'facts') > 12 then
    raise exception using errcode='P0001', message='Invalid memory patch.';
  end if;
  select message.body, participant.role, room.approval_mode
    into source_body, source_role, room_approval
  from public.messages message
  join public.participants participant on participant.id=target_participant_id and participant.room_id=target_room_id and participant.status='active'
  join public.rooms room on room.id=target_room_id and room.status='active'
  where message.id=target_message_id and message.room_id=target_room_id and message.participant_id=target_participant_id
    and message.message_type='user' and message.deleted_at is null;
  if not found then raise exception using errcode='P0001', message='Source message is invalid.'; end if;

  for item in select value from jsonb_array_elements(proposed_patch->'facts') loop
    if (item->>'sourceMessageId')::uuid <> target_message_id then
      raise exception using errcode='P0001', message='Source message is invalid.';
    end if;
    subject_id := nullif(item->>'subjectParticipantId','')::uuid;
    if item->>'subjectType' = 'participant' and not exists (
      select 1 from public.participants where id=subject_id and room_id=target_room_id and status='active'
    ) then raise exception using errcode='P0001', message='Participant not found.'; end if;
    if item->>'subjectType' = 'participant' and subject_id <> target_participant_id then
      raise exception using errcode='P0001', message='Supersession is not allowed.'; end if;
    if item->>'canonicalKey' <> (item->>'subjectType') || ':' || (item->>'factType') then
      raise exception using errcode='P0001', message='Invalid memory patch.';
    end if;
    if item->>'factType' = 'group_decision' and (
      item->>'evidenceStrength' <> 'explicit'
      or not (
        source_body ~* '(^|[[:space:][:punct:]])(we|everyone|everybody|the crew|the group)[[:space:]]+(.{0,24})?(all[[:space:]]+)?(decided|agreed|confirmed|approved)'
        or (room_approval='host_only' and source_role='host' and source_body ~* '(^|[[:space:][:punct:]])i[[:space:]]+(.{0,16})?(decided|confirm(ed)?|approve(d)?)')
      )
    ) then
      raise exception using errcode='P0001', message='Invalid memory patch.';
    end if;
    supersedes_id := nullif(item->>'supersedesFactId','')::uuid;
    if supersedes_id is not null then
      select * into prior from private.memory_facts where id=supersedes_id for update;
      if not found or prior.room_id <> target_room_id or prior.status = 'superseded'
        or prior.subject_type <> 'participant' or item->>'subjectType' <> 'participant'
        or prior.subject_participant_id <> target_participant_id or subject_id <> target_participant_id
        or prior.fact_type <> item->>'factType' or prior.canonical_key <> item->>'canonicalKey'
        or prior.fact_type = 'group_decision' then
        raise exception using errcode='P0001', message='Supersession is not allowed.';
      end if;
      update private.memory_facts set status='superseded', superseded_at=now() where id=prior.id;
      changed := true;
    end if;

    if not exists (
      select 1 from private.memory_facts fact
      where fact.room_id=target_room_id and fact.subject_type=item->>'subjectType'
        and fact.subject_participant_id is not distinct from subject_id
        and fact.fact_type=item->>'factType' and fact.canonical_key=item->>'canonicalKey'
        and fact.value=item->'value' and fact.status=item->>'status'
    ) then
      insert into private.memory_facts (
        room_id,subject_type,subject_participant_id,fact_type,canonical_key,value,status,
        confidence,evidence_strength,source_message_id,source_participant_id,supersedes_fact_id,superseded_at
      ) values (
        target_room_id,item->>'subjectType',subject_id,item->>'factType',item->>'canonicalKey',item->'value',item->>'status',
        (item->>'confidence')::numeric,item->>'evidenceStrength',target_message_id,target_participant_id,supersedes_id,
        case when item->>'status'='superseded' then now() else null end
      ) on conflict do nothing;
      if found then changed := true; end if;
    end if;
  end loop;

  if changed then
    snapshot := private.rebuild_room_memory(target_room_id);
    update private.room_memory set
      participant_profiles=snapshot->'participant_profiles', shared_context=snapshot->'shared_context',
      confirmed_decisions=snapshot->'confirmed_decisions', rejected_options=snapshot->'rejected_options',
      open_questions=snapshot->'open_questions', memory_version=memory_version+1
    where room_id=target_room_id;
  end if;
  return changed;
end;
$$;

create function public.claim_message_extraction(target_message_id uuid, target_model text, target_prompt_version text, target_schema_version text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare source public.messages%rowtype; extraction private.message_extractions%rowtype;
begin
  select message.* into source from public.messages message join public.rooms room on room.id=message.room_id
  where message.id=target_message_id and message.message_type='user' and message.deleted_at is null and room.status='active';
  if not found then raise exception using errcode='P0001', message='Source message is invalid.'; end if;
  if not exists (select 1 from public.participants where id=source.participant_id and room_id=source.room_id and user_id=source.sender_user_id and status='active') then
    raise exception using errcode='P0001', message='Participant not found.'; end if;
  insert into private.message_extractions(room_id,message_id,participant_id,user_id,model,prompt_version,schema_version)
    values(source.room_id,source.id,source.participant_id,source.sender_user_id,target_model,target_prompt_version,target_schema_version)
    on conflict(message_id) do nothing;
  select * into extraction from private.message_extractions where message_id=target_message_id for update;
  if extraction.status in ('completed','skipped','running') then
    return jsonb_build_object('id',extraction.id,'status',extraction.status,'claimed',false,'attemptCount',extraction.attempt_count);
  end if;
  if extraction.status='failed' and extraction.attempt_count >= 2 then
    return jsonb_build_object('id',extraction.id,'status','failed','claimed',false,'attemptCount',extraction.attempt_count,'errorCode','retry_exhausted');
  end if;
  update private.message_extractions set status='running',attempt_count=attempt_count+1,
    started_at=coalesce(started_at,now()),completed_at=null,error_code=null where id=extraction.id returning * into extraction;
  return jsonb_build_object('id',extraction.id,'status',extraction.status,'claimed',true,'attemptCount',extraction.attempt_count,
    'roomId',extraction.room_id,'participantId',extraction.participant_id,'userId',extraction.user_id);
end; $$;

create function public.get_message_extraction_context(target_message_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare source public.messages%rowtype; participant public.participants%rowtype; room public.rooms%rowtype;
begin
  perform 1 from private.message_extractions where message_id=target_message_id and status='running';
  if not found then raise exception using errcode='P0001', message='Extraction is not running.'; end if;
  select * into source from public.messages where id=target_message_id;
  select * into participant from public.participants where id=source.participant_id and room_id=source.room_id and status='active';
  select * into room from public.rooms where id=source.room_id and status='active';
  if source.id is null or participant.id is null or room.id is null or source.deleted_at is not null or source.message_type <> 'user' then
    raise exception using errcode='P0001', message='Source message is invalid.'; end if;
  return jsonb_build_object(
    'roomId',room.id,
    'sourceMessage',jsonb_build_object('id',source.id,'body',source.body),
    'sourceParticipant',jsonb_build_object('id',participant.id,'displayName',participant.display_name,'role',participant.role),
    'approvalMode',room.approval_mode,
    'replyTarget',(select case when reply.id is null then null else jsonb_build_object('id',reply.id,'body',reply.body,'participantId',reply.participant_id,'displayName',coalesce(reply_participant.display_name,'Trailie'),'messageType',reply.message_type) end
      from (select 1) seed left join public.messages reply on reply.id=source.reply_to_message_id and reply.room_id=room.id and reply.deleted_at is null
      left join public.participants reply_participant on reply_participant.id=reply.participant_id),
    'recentMessages',coalesce((select jsonb_agg(item.payload order by item.created_at,item.id) from (
      select message.created_at,message.id,jsonb_build_object('id',message.id,'body',message.body,'participantId',message.participant_id,
        'displayName',case when message.message_type='trailie' then 'Trailie' else coalesce(sender.display_name,'Crew member') end,'messageType',message.message_type) payload
      from public.messages message left join public.participants sender on sender.id=message.participant_id
      where message.room_id=room.id and message.deleted_at is null and message.id<>source.id
      order by message.created_at desc,message.id desc limit 6
    ) item),'[]'::jsonb),
    'activeFacts',coalesce((select jsonb_agg(jsonb_build_object('id',fact.id,'roomId',fact.room_id,'subjectType',fact.subject_type,
      'subjectParticipantId',fact.subject_participant_id,'factType',fact.fact_type,'canonicalKey',fact.canonical_key,'value',fact.value,'status',fact.status)
      order by fact.created_at,fact.id) from private.memory_facts fact where fact.room_id=room.id and fact.status<>'superseded' limit 12),'[]'::jsonb),
    'participantIds',coalesce((select jsonb_agg(member.id order by member.joined_at,member.id) from public.participants member where member.room_id=room.id and member.status='active'),'[]'::jsonb)
  );
end; $$;

create function public.skip_message_extraction(target_message_id uuid, skip_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare extraction private.message_extractions%rowtype;
begin
  select * into extraction from private.message_extractions where message_id=target_message_id for update;
  if not found then raise exception using errcode='P0001', message='Extraction not found.'; end if;
  if extraction.status='skipped' then return jsonb_build_object('status','skipped'); end if;
  if extraction.status <> 'running' then raise exception using errcode='P0001', message='Invalid extraction transition.'; end if;
  update private.message_extractions set status='skipped',error_code=left(skip_reason,80),completed_at=now() where id=extraction.id;
  return jsonb_build_object('status','skipped');
end; $$;

create function public.complete_message_extraction(
  target_message_id uuid, proposed_patch jsonb, target_provider_response_id text, target_provider_request_id text,
  used_input_tokens bigint, used_output_tokens bigint, used_reasoning_tokens bigint,
  used_cached_input_tokens bigint, used_total_tokens bigint, measured_latency_ms integer
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare extraction private.message_extractions%rowtype; changed boolean;
begin
  select * into extraction from private.message_extractions where message_id=target_message_id for update;
  if not found then raise exception using errcode='P0001', message='Extraction not found.'; end if;
  if extraction.status='completed' then return jsonb_build_object('status','completed','memoryChanged',false); end if;
  if extraction.status <> 'running' then raise exception using errcode='P0001', message='Invalid extraction transition.'; end if;
  changed := private.apply_memory_patch(extraction.room_id,extraction.message_id,extraction.participant_id,proposed_patch);
  update private.message_extractions set status='completed',provider_response_id=left(target_provider_response_id,255),
    provider_request_id=left(target_provider_request_id,255),input_tokens=used_input_tokens,output_tokens=used_output_tokens,
    reasoning_tokens=used_reasoning_tokens,cached_input_tokens=used_cached_input_tokens,total_tokens=used_total_tokens,
    latency_ms=measured_latency_ms,completed_at=now(),error_code=null where id=extraction.id;
  return jsonb_build_object('status','completed','memoryChanged',changed);
end; $$;

create function public.fail_message_extraction(target_message_id uuid, safe_error_code text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare extraction private.message_extractions%rowtype;
begin
  if safe_error_code not in ('extraction_failed','invalid_extraction_response','invalid_memory_patch','supersession_not_allowed','participant_not_found','source_message_invalid','model_unavailable','model_timeout','model_rate_limited','retry_exhausted','unknown_error') then
    safe_error_code := 'unknown_error';
  end if;
  select * into extraction from private.message_extractions where message_id=target_message_id for update;
  if not found then raise exception using errcode='P0001', message='Extraction not found.'; end if;
  if extraction.status in ('completed','skipped') then return jsonb_build_object('status',extraction.status); end if;
  if extraction.status <> 'running' then raise exception using errcode='P0001', message='Invalid extraction transition.'; end if;
  update private.message_extractions set status='failed',error_code=safe_error_code,completed_at=now() where id=extraction.id;
  return jsonb_build_object('status','failed','attemptCount',extraction.attempt_count);
end; $$;

create function public.get_private_room_memory(target_room_id uuid)
returns jsonb language sql security definer set search_path=''
as $$
  select jsonb_build_object(
    'snapshot', (select to_jsonb(memory) - 'room_id' from private.room_memory memory where memory.room_id=target_room_id),
    'facts', coalesce((select jsonb_agg(to_jsonb(fact) order by fact.created_at,fact.id) from private.memory_facts fact where fact.room_id=target_room_id),'[]'::jsonb),
    'extractions', coalesce((select jsonb_agg(jsonb_build_object('messageId',item.message_id,'status',item.status,'attemptCount',item.attempt_count,'errorCode',item.error_code) order by item.created_at,item.id) from private.message_extractions item where item.room_id=target_room_id),'[]'::jsonb)
  ) where exists (select 1 from public.rooms where id=target_room_id);
$$;

revoke all on function private.rebuild_room_memory(uuid) from public, anon, authenticated, service_role;
revoke all on function private.apply_memory_patch(uuid,uuid,uuid,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.claim_message_extraction(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.get_message_extraction_context(uuid) from public, anon, authenticated;
revoke all on function public.skip_message_extraction(uuid,text) from public, anon, authenticated;
revoke all on function public.complete_message_extraction(uuid,jsonb,text,text,bigint,bigint,bigint,bigint,bigint,integer) from public, anon, authenticated;
revoke all on function public.fail_message_extraction(uuid,text) from public, anon, authenticated;
revoke all on function public.get_private_room_memory(uuid) from public, anon, authenticated;
grant execute on function public.claim_message_extraction(uuid,text,text,text) to service_role;
grant execute on function public.get_message_extraction_context(uuid) to service_role;
grant execute on function public.skip_message_extraction(uuid,text) to service_role;
grant execute on function public.complete_message_extraction(uuid,jsonb,text,text,bigint,bigint,bigint,bigint,bigint,integer) to service_role;
grant execute on function public.fail_message_extraction(uuid,text) to service_role;
grant execute on function public.get_private_room_memory(uuid) to service_role;
