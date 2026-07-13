import type { SupabaseClient } from "@supabase/supabase-js";
import type { GetRoomMessagesResult } from "@trailie/schemas";

import { mapGetRoomMessagesResult } from "@/lib/supabase/mappers";
import type { Database } from "@/types/database";

export async function getInitialRoomMessages(
  client: SupabaseClient<Database>,
  roomId: string,
): Promise<GetRoomMessagesResult | null> {
  const { data, error } = await client.rpc("get_room_messages", {
    target_room_id: roomId,
    before_created_at: null,
    before_id: null,
    page_size: 30,
  });
  if (error || !data) return null;
  try {
    return mapGetRoomMessagesResult(data);
  } catch {
    return null;
  }
}
