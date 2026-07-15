"use server";

import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/server/supabase/admin";
import { createCorrelationId, logOperation } from "@/server/operations/logger";

const uuidSchema = z.string().uuid();
const deleteRoomSchema = z.object({
  roomId: uuidSchema,
  confirmation: z.string().trim().min(1).max(160),
});
const transferHostSchema = z.object({
  roomId: uuidSchema,
  participantId: uuidSchema,
});
const deleteAccountSchema = z.object({
  confirmation: z.literal("DELETE MY ACCOUNT"),
});

export type LifecycleErrorCode =
  | "authentication_required"
  | "invalid_input"
  | "confirmation_required"
  | "host_required"
  | "active_member_required"
  | "host_transfer_or_room_deletion_required"
  | "session_unavailable"
  | "lifecycle_unavailable";

type LifecycleResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: LifecycleErrorCode };

export type AccountDeletionAssessment = {
  soleHostRooms: Array<{ id: string; name: string }>;
  hostRooms: Array<{ id: string; name: string }>;
  ordinaryMemberships: number;
};

function safeLifecycleError(error: unknown): LifecycleErrorCode {
  const message =
    error instanceof Error
      ? error.message
      : String((error as { message?: unknown })?.message ?? "");
  const codes: LifecycleErrorCode[] = [
    "authentication_required",
    "confirmation_required",
    "host_required",
    "active_member_required",
    "host_transfer_or_room_deletion_required",
  ];
  return (
    codes.find((code) => message.includes(code)) ?? "lifecycle_unavailable"
  );
}

async function authenticatedClient() {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.auth.getUser();
  return { client, user: error ? null : data.user };
}

export async function deleteRoomAction(
  input: unknown,
): Promise<LifecycleResult> {
  const correlationId = createCorrelationId();
  const parsed = deleteRoomSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { client, user } = await authenticatedClient();
  if (!user) return { ok: false, error: "authentication_required" };
  const { error } = await client.rpc("delete_room", {
    target_room_id: parsed.data.roomId,
    confirmation: parsed.data.confirmation,
  });
  const code = error ? safeLifecycleError(error) : null;
  logOperation(error ? "deletion.room_failed" : "deletion.room_completed", {
    correlationId,
    workflow: "room_deletion",
    status: error ? "error" : "ok",
    errorCode: code,
  });
  return error ? { ok: false, error: code! } : { ok: true };
}

export async function transferRoomHostAction(
  input: unknown,
): Promise<LifecycleResult> {
  const parsed = transferHostSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { client, user } = await authenticatedClient();
  if (!user) return { ok: false, error: "authentication_required" };
  const { error } = await client.rpc("transfer_room_host", {
    target_room_id: parsed.data.roomId,
    target_participant_id: parsed.data.participantId,
  });
  return error ? { ok: false, error: safeLifecycleError(error) } : { ok: true };
}

export async function assessAccountDeletionAction(): Promise<
  LifecycleResult<AccountDeletionAssessment>
> {
  const { client, user } = await authenticatedClient();
  if (!user) return { ok: false, error: "authentication_required" };
  const { data, error } = await client.rpc("assess_account_deletion");
  if (error || !data || typeof data !== "object")
    return { ok: false, error: safeLifecycleError(error) };
  return { ok: true, data: data as AccountDeletionAssessment };
}

export async function deleteAccountAction(
  input: unknown,
): Promise<LifecycleResult> {
  const correlationId = createCorrelationId();
  const parsed = deleteAccountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "confirmation_required" };
  const { client, user } = await authenticatedClient();
  if (!user) return { ok: false, error: "authentication_required" };

  const { data: sessionData } = await client.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return { ok: false, error: "session_unavailable" };

  const { error: prepareError } = await client.rpc("prepare_account_deletion", {
    confirmation: parsed.data.confirmation,
  });
  if (prepareError) {
    const error = safeLifecycleError(prepareError);
    logOperation("deletion.account_failed", {
      correlationId,
      workflow: "account_deletion",
      status: "error",
      errorCode: error,
    });
    return { ok: false, error };
  }

  const admin = createAdminSupabaseClient();
  const { error: revokeError } = await admin.auth.admin.signOut(
    accessToken,
    "global",
  );
  if (revokeError) return { ok: false, error: "lifecycle_unavailable" };
  const { error: deleteError } = await admin.auth.admin.deleteUser(
    user.id,
    true,
  );
  if (deleteError) return { ok: false, error: "lifecycle_unavailable" };
  await client.auth.signOut({ scope: "local" });
  logOperation("deletion.account_completed", {
    correlationId,
    workflow: "account_deletion",
    status: "ok",
    errorCode: null,
  });
  return { ok: true };
}
