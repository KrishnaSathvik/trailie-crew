import { describe, expect, it, vi } from "vitest";

import { getInitialRoomMessages } from "./get-room-messages";

const roomId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2";

describe("initial room messages query", () => {
  it("loads only the newest 30 through the safe history RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { messages: [], has_more: false, next_cursor: null },
      error: null,
    });
    await expect(
      getInitialRoomMessages({ rpc } as never, roomId),
    ).resolves.toEqual({
      messages: [],
      hasMore: false,
      nextCursor: null,
    });
    expect(rpc).toHaveBeenCalledWith("get_room_messages", {
      target_room_id: roomId,
      before_created_at: null,
      before_id: null,
      page_size: 30,
    });
  });

  it("returns null for database errors or malformed payloads", async () => {
    await expect(
      getInitialRoomMessages(
        {
          rpc: vi
            .fn()
            .mockResolvedValue({ data: null, error: new Error("hidden") }),
        } as never,
        roomId,
      ),
    ).resolves.toBeNull();
  });
});
