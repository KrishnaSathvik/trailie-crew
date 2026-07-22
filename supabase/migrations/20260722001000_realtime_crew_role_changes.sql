drop trigger if exists participants_notify_room on public.participants;

create trigger participants_notify_room
after insert or update of status, display_name, role on public.participants
for each row execute function private.notify_room_chat_change();
