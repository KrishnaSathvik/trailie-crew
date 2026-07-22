import { beforeEach, describe, expect, it, vi } from "vitest";

import { createServerSupabaseClient } from "@/lib/supabase/server";

import { getActiveRoomParticipantsAction } from "./crew-actions";

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

const roomId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2";

describe("crew actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an invalid room before opening a database client", async () => {
    await expect(getActiveRoomParticipantsAction("bad-room")).resolves.toEqual({
      ok: false,
      error: "crew_load_failed",
    });
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("returns the active crew in join order for an authenticated member", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
          room_id: roomId,
          user_id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4",
          display_name: "Maya",
          role: "host",
          status: "active",
          joined_at: "2026-07-13T18:00:00.000Z",
          last_seen_at: null,
        },
      ],
      error: null,
    });
    const statusEq = vi.fn(() => ({ order }));
    const roomEq = vi.fn(() => ({ eq: statusEq }));
    const select = vi.fn(() => ({ eq: roomEq }));
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4" } },
          error: null,
        }),
      },
      from: vi.fn(() => ({ select })),
    } as never);

    await expect(getActiveRoomParticipantsAction(roomId)).resolves.toEqual({
      ok: true,
      data: [expect.objectContaining({ displayName: "Maya", role: "host" })],
    });
    expect(roomEq).toHaveBeenCalledWith("room_id", roomId);
    expect(statusEq).toHaveBeenCalledWith("status", "active");
    expect(order).toHaveBeenCalledWith("joined_at", { ascending: true });
  });
});
