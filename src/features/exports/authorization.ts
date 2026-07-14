import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ExportAuthorization =
  "allowed" | "rate_limited" | "export_not_allowed";

export async function authorizePlanExport(input: {
  roomId: string;
  version: number;
  type: "calendar" | "print";
}): Promise<ExportAuthorization> {
  const client = await createServerSupabaseClient();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return "export_not_allowed";
  const { data, error } = await client.rpc("authorize_plan_export", {
    target_room_id: input.roomId,
    target_version: input.version,
    target_export_type: input.type,
  });
  if (error)
    return /rate limited/i.test(error.message ?? "")
      ? "rate_limited"
      : "export_not_allowed";
  return data === true ? "allowed" : "export_not_allowed";
}
