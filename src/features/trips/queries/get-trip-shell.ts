import { mapParticipantSummary, mapRoomSummary } from "@/lib/supabase/mappers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ParticipantRow, RoomRow } from "@/types/database";
import type { TripShellData } from "@/features/crew/queries/trip-crew";

export async function getTripShell(
  roomId: string,
): Promise<TripShellData | null> {
  const client = await createServerSupabaseClient();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return null;

  const [roomResult, participantsResult, inviteResult] = await Promise.all([
    client
      .from("rooms")
      .select(
        "id,name,room_code,expected_travelers,approval_mode,status,current_plan_version,created_at,updated_at",
      )
      .eq("id", roomId)
      .maybeSingle(),
    client
      .from("participants")
      .select(
        "id,room_id,user_id,display_name,role,status,joined_at,last_seen_at",
      )
      .eq("room_id", roomId)
      .eq("status", "active")
      .order("joined_at", { ascending: true }),
    client
      .from("room_invite_metadata")
      .select("short_code")
      .eq("room_id", roomId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (roomResult.error || participantsResult.error || !roomResult.data) {
    return null;
  }

  try {
    const participants = (participantsResult.data as ParticipantRow[]).map(
      mapParticipantSummary,
    );
    const currentParticipant = participants.find(
      (participant) => participant.userId === authData.user.id,
    );
    if (!currentParticipant) return null;

    return {
      room: mapRoomSummary(roomResult.data as Omit<RoomRow, "host_user_id">),
      currentParticipant,
      participants,
      inviteMetadata:
        !inviteResult.error && inviteResult.data
          ? { shortCode: inviteResult.data.short_code }
          : null,
    };
  } catch {
    return null;
  }
}
