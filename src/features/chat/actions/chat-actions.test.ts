import { beforeEach, describe, expect, it, vi } from "vitest";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { scheduleMemoryExtraction } from "@/features/memory/scheduler";

import {
  getRoomMessagesAction,
  sendMessageAction,
  toggleReactionAction,
} from "./chat-actions";

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));
vi.mock("@/features/memory/scheduler", () => ({
  enqueueMemoryExtraction: vi.fn(),
  scheduleMemoryExtraction: vi.fn(),
}));

const roomId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2";
const participantId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3";
const clientMessageId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4";
const createdAt = "2026-07-13T18:00:00.000Z";

const rawMessage = {
  id: clientMessageId,
  room_id: roomId,
  participant_id: participantId,
  message_type: "user",
  body: "Hello crew",
  client_message_id: clientMessageId,
  reply_to_message_id: null,
  sender: { participant_id: participantId, display_name: "Maya", role: "host" },
  reply: null,
  reactions: [],
  created_at: createdAt,
  edited_at: null,
  deleted_at: null,
};

function mockClient(
  result: unknown,
  user: { id: string } | null = { id: participantId },
) {
  const rpc = vi.fn().mockResolvedValue(result);
  vi.mocked(createServerSupabaseClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : new Error("missing"),
      }),
    },
    rpc,
  } as never);
  return rpc;
}

describe("chat Server Actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps empty and oversized input before opening a client", async () => {
    await expect(
      sendMessageAction({ roomId, participantId, body: " ", clientMessageId }),
    ).resolves.toEqual({ ok: false, error: "message_empty" });
    await expect(
      sendMessageAction({
        roomId,
        participantId,
        body: "x".repeat(4001),
        clientMessageId,
      }),
    ).resolves.toEqual({ ok: false, error: "message_too_long" });
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("sends snake_case RPC arguments and maps the safe result", async () => {
    const rpc = mockClient({ data: rawMessage, error: null });
    const result = await sendMessageAction({
      roomId,
      participantId,
      body: "  Hello crew  ",
      clientMessageId,
    });
    expect(rpc).toHaveBeenCalledWith("send_message", {
      target_room_id: roomId,
      participant_id: participantId,
      body: "Hello crew",
      client_message_id: clientMessageId,
      reply_to_message_id: null,
    });
    expect(result).toMatchObject({ ok: true, data: { body: "Hello crew" } });
    expect(scheduleMemoryExtraction).toHaveBeenCalledWith(clientMessageId);
  });

  it("maps safe failures for reactions and missing membership", async () => {
    mockClient({ data: null, error: null }, null);
    await expect(
      toggleReactionAction({
        messageId: clientMessageId,
        participantId,
        reaction: "like",
      }),
    ).resolves.toEqual({ ok: false, error: "membership_required" });

    mockClient({
      data: null,
      error: { code: "P0001", message: "Reaction is invalid." },
    });
    await expect(
      toggleReactionAction({
        messageId: clientMessageId,
        participantId,
        reaction: "like",
      }),
    ).resolves.toEqual({ ok: false, error: "reaction_invalid" });
  });

  it("loads one cursor page without refetching the transcript", async () => {
    const rpc = mockClient({
      data: { messages: [rawMessage], has_more: false, next_cursor: null },
      error: null,
    });
    const result = await getRoomMessagesAction({ roomId, pageSize: 30 });
    expect(rpc).toHaveBeenCalledWith("get_room_messages", {
      target_room_id: roomId,
      before_created_at: null,
      before_id: null,
      page_size: 30,
    });
    expect(result).toMatchObject({ ok: true, data: { hasMore: false } });
  });
});
