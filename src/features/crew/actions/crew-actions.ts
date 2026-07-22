"use server";

import { z } from "zod";
import type { ParticipantSummary } from "@trailie/schemas";

import { mapParticipantSummary } from "@/lib/supabase/mappers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ParticipantRow } from "@/types/database";

type CrewActionResult =
  | { ok: true; data: ParticipantSummary[] }
  | { ok: false; error: "membership_required" | "crew_load_failed" };

export async function getActiveRoomParticipantsAction(
  roomId: unknown,
): Promise<CrewActionResult> {
  const parsed = z.uuid().safeParse(roomId);
  if (!parsed.success) return { ok: false, error: "crew_load_failed" };

  try {
    const client = await createServerSupabaseClient();
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData.user)
      return { ok: false, error: "membership_required" };

    const { data, error } = await client
      .from("participants")
      .select(
        "id,room_id,user_id,display_name,role,status,joined_at,last_seen_at",
      )
      .eq("room_id", parsed.data)
      .eq("status", "active")
      .order("joined_at", { ascending: true });
    if (error) return { ok: false, error: "crew_load_failed" };

    return {
      ok: true,
      data: (data as ParticipantRow[]).map(mapParticipantSummary),
    };
  } catch {
    return { ok: false, error: "crew_load_failed" };
  }
}
