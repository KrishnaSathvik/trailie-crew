"use server";

import {
  getRoomMessagesInputSchema,
  sendMessageInputSchema,
  toggleReactionInputSchema,
  type GetRoomMessagesResult,
  type RoomMessage,
  type ToggleReactionResult,
} from "@trailie/schemas";

import {
  mapChatOperationError,
  type ChatErrorCode,
} from "@/features/chat/errors/chat-errors";
import {
  mapGetRoomMessagesResult,
  mapRoomMessage,
  mapToggleReactionResult,
} from "@/lib/supabase/mappers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  enqueueMemoryExtraction,
  scheduleMemoryExtraction,
} from "@/features/memory/scheduler";

export type ChatActionResult<T> =
  { ok: true; data: T } | { ok: false; error: ChatErrorCode };

async function authenticatedClient() {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.auth.getUser();
  return !error && data.user ? client : null;
}

export async function sendMessageAction(
  input: unknown,
): Promise<ChatActionResult<RoomMessage>> {
  if (typeof input === "object" && input !== null && "body" in input) {
    const body = (input as { body?: unknown }).body;
    if (typeof body === "string" && body.trim().length === 0)
      return { ok: false, error: "message_empty" };
    if (typeof body === "string" && body.trim().length > 4000)
      return { ok: false, error: "message_too_long" };
  }
  const parsed = sendMessageInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "message_send_failed" };

  try {
    const client = await authenticatedClient();
    if (!client) return { ok: false, error: "membership_required" };
    const { data, error } = await client.rpc("send_message", {
      target_room_id: parsed.data.roomId,
      participant_id: parsed.data.participantId,
      body: parsed.data.body,
      client_message_id: parsed.data.clientMessageId,
      reply_to_message_id: parsed.data.replyToMessageId,
    });
    if (error)
      return { ok: false, error: mapChatOperationError(error, "message") };
    try {
      const message = mapRoomMessage(data);
      if (enqueueMemoryExtraction) await enqueueMemoryExtraction(message.id);
      scheduleMemoryExtraction(message.id);
      return { ok: true, data: message };
    } catch {
      return { ok: false, error: "message_send_failed" };
    }
  } catch (error) {
    return { ok: false, error: mapChatOperationError(error, "message") };
  }
}

export async function toggleReactionAction(
  input: unknown,
): Promise<ChatActionResult<ToggleReactionResult>> {
  const parsed = toggleReactionInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "reaction_invalid" };
  try {
    const client = await authenticatedClient();
    if (!client) return { ok: false, error: "membership_required" };
    const { data, error } = await client.rpc("toggle_message_reaction", {
      target_message_id: parsed.data.messageId,
      participant_id: parsed.data.participantId,
      reaction: parsed.data.reaction,
    });
    if (error)
      return { ok: false, error: mapChatOperationError(error, "reaction") };
    try {
      return { ok: true, data: mapToggleReactionResult(data) };
    } catch {
      return { ok: false, error: "reaction_failed" };
    }
  } catch (error) {
    return { ok: false, error: mapChatOperationError(error, "reaction") };
  }
}

export async function getRoomMessagesAction(
  input: unknown,
): Promise<ChatActionResult<GetRoomMessagesResult>> {
  const parsed = getRoomMessagesInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "history_load_failed" };
  try {
    const client = await authenticatedClient();
    if (!client) return { ok: false, error: "membership_required" };
    const { data, error } = await client.rpc("get_room_messages", {
      target_room_id: parsed.data.roomId,
      before_created_at: parsed.data.beforeCreatedAt,
      before_id: parsed.data.beforeId,
      page_size: parsed.data.pageSize,
    });
    if (error)
      return { ok: false, error: mapChatOperationError(error, "history") };
    try {
      return { ok: true, data: mapGetRoomMessagesResult(data) };
    } catch {
      return { ok: false, error: "history_load_failed" };
    }
  } catch (error) {
    return { ok: false, error: mapChatOperationError(error, "history") };
  }
}
