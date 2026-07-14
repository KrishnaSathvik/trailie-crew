import { createAdminSupabaseClient } from "@/server/supabase/admin";
import { drainMemoryExtraction } from "@/features/memory/worker";

function unavailable() {
  return Response.json({ code: "not_found" }, { status: 404 });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  if (process.env.NODE_ENV === "production") return unavailable();
  const secret = process.env.TRAILIE_TEST_MEMORY_SECRET;
  if (!secret || request.headers.get("x-trailie-test-secret") !== secret)
    return unavailable();
  const { roomId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(roomId)) return unavailable();
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("get_private_room_memory", {
    target_room_id: roomId,
  });
  if (error || !data) return unavailable();
  return Response.json(data, {
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  if (process.env.NODE_ENV === "production") return unavailable();
  const secret = process.env.TRAILIE_TEST_MEMORY_SECRET;
  if (!secret || request.headers.get("x-trailie-test-secret") !== secret)
    return unavailable();
  const { roomId } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    messageId?: unknown;
  } | null;
  if (!body || typeof body.messageId !== "string") return unavailable();
  const admin = createAdminSupabaseClient();
  const { data } = await admin
    .from("messages")
    .select("id,room_id")
    .eq("id", body.messageId)
    .eq("room_id", roomId)
    .maybeSingle();
  if (!data) return unavailable();
  await drainMemoryExtraction(body.messageId);
  return Response.json({ ok: true });
}
