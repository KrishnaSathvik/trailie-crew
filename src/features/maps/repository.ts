import "server-only";

import { createAdminSupabaseClient } from "@/server/supabase/admin";
import { hashShareToken } from "@/features/sharing/token";
import { mapProjectionSourceSchema, projectMapSource } from "./source";

type RpcClient = Readonly<{
  rpc(
    name: string,
    parameters: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}>;

export async function loadMemberMapProjection(
  client: RpcClient,
  input: { roomId: string; version: number; generatedAt?: string },
) {
  const { data, error } = await client.rpc("get_plan_map_projection_source", {
    target_room_id: input.roomId,
    target_plan_version: input.version,
  });
  if (error) throw new Error("map_projection_unavailable");
  const source = mapProjectionSourceSchema.parse(data);
  if (source.roomId !== input.roomId || source.planVersion !== input.version)
    throw new Error("map_projection_version_mismatch");
  return projectMapSource(
    source,
    "member",
    input.generatedAt ?? new Date().toISOString(),
  );
}

export async function loadPublicMapProjection(
  token: string,
  input: {
    client?: RpcClient;
    generatedAt?: string;
  } = {},
) {
  let tokenHash: string;
  try {
    tokenHash = hashShareToken(token);
  } catch {
    return null;
  }
  const client =
    input.client ?? (createAdminSupabaseClient() as unknown as RpcClient);
  const { data, error } = await client.rpc(
    "get_public_plan_map_projection_source",
    { target_token_hash: tokenHash },
  );
  if (error || data === null) return null;
  const parsed = mapProjectionSourceSchema.safeParse(data);
  if (!parsed.success) {
    console.warn("public_map_projection_invalid", {
      issues: parsed.error.issues.map((issue) => ({
        code: issue.code,
        path: issue.path.join("."),
      })),
    });
    return null;
  }
  return projectMapSource(
    parsed.data,
    "public_share",
    input.generatedAt ?? new Date().toISOString(),
  );
}
