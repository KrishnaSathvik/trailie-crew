import "server-only";

import { z } from "zod";

import { createAdminSupabaseClient } from "@/server/supabase/admin";
import {
  guestCommentSchema,
  guestInviteVerificationSchema,
  guestSessionContextSchema,
  guestSessionMetadataSchema,
  guestSuggestionSchema,
} from "./contracts";
import { hashGuestToken } from "./token";

type RpcResult = { data: unknown; error: { message?: string } | null };

async function serviceRpc(
  name: string,
  args: Record<string, unknown>,
): Promise<RpcResult> {
  const client = createAdminSupabaseClient();
  return client.rpc(name as never, args as never) as unknown as RpcResult;
}

function safeHash(token: string) {
  try {
    return hashGuestToken(token);
  } catch {
    return null;
  }
}

export async function verifyGuestInvite(token: string) {
  const tokenHash = safeHash(token);
  if (!tokenHash) return null;
  const { data, error } = await serviceRpc("verify_guest_invite_token_hash", {
    target_token_hash: tokenHash,
  });
  if (error || data === null) return null;
  const parsed = guestInviteVerificationSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function createScopedGuestSession(input: {
  inviteToken: string;
  sessionToken: string;
  displayName: string;
}) {
  const inviteHash = safeHash(input.inviteToken);
  const sessionHash = safeHash(input.sessionToken);
  if (!inviteHash || !sessionHash) return null;
  const { data, error } = await serviceRpc("create_guest_session", {
    target_token_hash: inviteHash,
    target_session_hash: sessionHash,
    target_display_name: input.displayName,
  });
  if (error || data === null) return null;
  const parsed = guestSessionMetadataSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function loadGuestSessionContext(sessionToken: string) {
  const sessionHash = safeHash(sessionToken);
  if (!sessionHash) return null;
  const { data, error } = await serviceRpc("get_guest_session_context", {
    target_session_hash: sessionHash,
  });
  if (error || data === null) return null;
  const parsed = guestSessionContextSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

async function executeComment(name: string, args: Record<string, unknown>) {
  const { data, error } = await serviceRpc(name, args);
  if (error) {
    if (/rate limited/i.test(error.message ?? ""))
      throw new Error("guest_comment_rate_limited");
    throw new Error("guest_comment_unavailable");
  }
  const parsed = guestCommentSchema.safeParse(data);
  if (!parsed.success) throw new Error("guest_comment_unavailable");
  return parsed.data;
}

export async function createGuestComment(
  sessionToken: string,
  input: {
    dayKey: string | null;
    itemKey: string | null;
    body: string;
  },
) {
  const sessionHash = safeHash(sessionToken);
  if (!sessionHash) throw new Error("guest_comment_unavailable");
  return executeComment("create_guest_plan_comment", {
    target_session_hash: sessionHash,
    target_day_key: input.dayKey,
    target_item_key: input.itemKey,
    target_body: input.body,
  });
}

export async function updateGuestComment(
  sessionToken: string,
  commentId: string,
  body: string,
) {
  const sessionHash = safeHash(sessionToken);
  if (!sessionHash || !z.uuid().safeParse(commentId).success)
    throw new Error("guest_comment_unavailable");
  return executeComment("update_guest_plan_comment", {
    target_session_hash: sessionHash,
    target_comment_id: commentId,
    target_body: body,
  });
}

export async function deleteGuestComment(
  sessionToken: string,
  commentId: string,
) {
  const sessionHash = safeHash(sessionToken);
  if (!sessionHash || !z.uuid().safeParse(commentId).success)
    throw new Error("guest_comment_unavailable");
  return executeComment("delete_guest_plan_comment", {
    target_session_hash: sessionHash,
    target_comment_id: commentId,
  });
}

async function executeSuggestion(name: string, args: Record<string, unknown>) {
  const { data, error } = await serviceRpc(name, args);
  if (error) {
    if (/rate limited/i.test(error.message ?? ""))
      throw new Error("guest_suggestion_rate_limited");
    if (/immutable/i.test(error.message ?? ""))
      throw new Error("guest_suggestion_immutable");
    if (/ownership/i.test(error.message ?? ""))
      throw new Error("guest_suggestion_ownership");
    throw new Error("guest_suggestion_unavailable");
  }
  const parsed = guestSuggestionSchema.safeParse(data);
  if (!parsed.success) throw new Error("guest_suggestion_unavailable");
  return parsed.data;
}

export async function createGuestSuggestion(
  sessionToken: string,
  input: {
    targetType: string;
    targetKey: string | null;
    suggestionType: string;
    title: string;
    details: string;
    proposedDate: string | null;
    proposedStartTime: string | null;
    proposedEndTime: string | null;
  },
) {
  const sessionHash = safeHash(sessionToken);
  if (!sessionHash) throw new Error("guest_suggestion_unavailable");
  return executeSuggestion("create_guest_suggestion", {
    target_session_hash: sessionHash,
    target_type: input.targetType,
    target_key: input.targetKey,
    target_suggestion_type: input.suggestionType,
    target_title: input.title,
    target_details: input.details,
    target_proposed_date: input.proposedDate,
    target_proposed_start_time: input.proposedStartTime,
    target_proposed_end_time: input.proposedEndTime,
  });
}

export async function updateGuestSuggestion(
  sessionToken: string,
  input: {
    suggestionId: string;
    title: string;
    details: string;
    proposedDate: string | null;
    proposedStartTime: string | null;
    proposedEndTime: string | null;
  },
) {
  const sessionHash = safeHash(sessionToken);
  if (!sessionHash || !z.uuid().safeParse(input.suggestionId).success)
    throw new Error("guest_suggestion_unavailable");
  return executeSuggestion("update_guest_suggestion", {
    target_session_hash: sessionHash,
    target_suggestion_id: input.suggestionId,
    target_title: input.title,
    target_details: input.details,
    target_proposed_date: input.proposedDate,
    target_proposed_start_time: input.proposedStartTime,
    target_proposed_end_time: input.proposedEndTime,
  });
}

export async function deleteGuestSuggestion(
  sessionToken: string,
  suggestionId: string,
) {
  const sessionHash = safeHash(sessionToken);
  if (!sessionHash || !z.uuid().safeParse(suggestionId).success)
    throw new Error("guest_suggestion_unavailable");
  const { data, error } = await serviceRpc("delete_guest_suggestion", {
    target_session_hash: sessionHash,
    target_suggestion_id: suggestionId,
  });
  if (error) {
    if (/immutable/i.test(error.message ?? ""))
      throw new Error("guest_suggestion_immutable");
    if (/ownership/i.test(error.message ?? ""))
      throw new Error("guest_suggestion_ownership");
    throw new Error("guest_suggestion_unavailable");
  }
  const parsed = z
    .object({ id: z.uuid(), deleted: z.literal(true) })
    .passthrough()
    .safeParse(data);
  if (!parsed.success) throw new Error("guest_suggestion_unavailable");
  return { id: parsed.data.id, deleted: true as const };
}
