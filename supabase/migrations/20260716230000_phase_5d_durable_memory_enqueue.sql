create or replace function public.enqueue_message_extraction(
  target_message_id uuid,
  target_model text,
  target_prompt_version text,
  target_schema_version text
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare source public.messages%rowtype;
begin
  select message.* into source
  from public.messages message
  join public.rooms room on room.id=message.room_id
  where message.id=target_message_id and message.message_type='user'
    and message.deleted_at is null and room.status='active';
  if not found then raise exception using errcode='P0001', message='Source message is invalid.'; end if;
  insert into private.message_extractions(room_id,message_id,participant_id,user_id,model,prompt_version,schema_version)
    values(source.room_id,source.id,source.participant_id,source.sender_user_id,target_model,target_prompt_version,target_schema_version)
    on conflict(message_id) do nothing;
  return jsonb_build_object('queued',true);
end;
$$;
revoke all on function public.enqueue_message_extraction(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.enqueue_message_extraction(uuid,text,text,text) to service_role;
