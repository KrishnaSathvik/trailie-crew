import { beforeEach, describe, expect, it, vi } from "vitest";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { verifyCaptchaForAction } from "@/features/security/captcha-server";

import { createTripAction, joinTripAction } from "./trip-actions";

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));
vi.mock("@/features/security/captcha-server", () => ({
  verifyCaptchaForAction: vi.fn(),
}));

const uuid = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2";

function mockClient(
  rpcResult: unknown,
  user: { id: string } | null = { id: uuid },
) {
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  vi.mocked(createServerSupabaseClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : new Error("missing session"),
      }),
    },
    rpc,
  } as never);
  return rpc;
}

describe("Trip Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyCaptchaForAction).mockResolvedValue(
      "0198a0b2-07f0-7c80-9d5f-7f9cf7a950b3",
    );
  });

  it("validates create input before opening a database client", async () => {
    await expect(
      createTripAction({ tripName: "", displayName: "" }),
    ).resolves.toMatchObject({
      ok: false,
      error: "invalid_input",
    });
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("requires an authenticated Supabase identity", async () => {
    mockClient({ data: null, error: null }, null);
    await expect(
      createTripAction({
        tripName: "Boundary Waters",
        displayName: "Maya",
        captchaToken: "valid",
      }),
    ).resolves.toEqual({ ok: false, error: "authentication_required" });
  });

  it("calls create_trip at the snake_case boundary and maps its result", async () => {
    const rpc = mockClient({
      data: [
        {
          room_id: uuid,
          room_name: "Boundary Waters",
          participant_id: uuid,
          room_code: "ABCD2345",
          invite_token: "a".repeat(43),
          created_at: "2026-07-13T18:00:00.000Z",
        },
      ],
      error: null,
    });

    const result = await createTripAction({
      tripName: "Boundary Waters",
      displayName: "Maya",
      expectedTravelers: 4,
      captchaToken: "valid",
    });

    expect(rpc).toHaveBeenCalledWith("create_trip_protected", {
      trip_name: "Boundary Waters",
      display_name: "Maya",
      expected_travelers: 4,
      target_receipt_id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950b3",
    });
    expect(result).toMatchObject({ ok: true, data: { roomId: uuid } });
  });

  it("maps a controlled join failure without returning database details", async () => {
    mockClient({
      data: null,
      error: {
        code: "P0001",
        message: "Invite has expired.",
        details: "private.room_invites",
      },
    });
    await expect(
      joinTripAction({
        inviteValue: "ABCD2345",
        displayName: "Leo",
        captchaToken: "valid",
      }),
    ).resolves.toEqual({ ok: false, error: "invite_expired" });
  });

  it("rejects malformed RPC output", async () => {
    mockClient({ data: [{ room_id: "not-a-uuid" }], error: null });
    await expect(
      joinTripAction({
        inviteValue: "ABCD2345",
        displayName: "Leo",
        captchaToken: "valid",
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_server_response" });
  });

  it("fails closed when CAPTCHA is missing", async () => {
    mockClient({ data: null, error: null });
    vi.mocked(verifyCaptchaForAction).mockRejectedValue(
      Object.assign(new Error("captcha_required"), {
        code: "captcha_required",
      }),
    );
    await expect(
      createTripAction({
        tripName: "Boundary Waters",
        displayName: "Maya",
        captchaToken: "",
      }),
    ).resolves.toEqual({ ok: false, error: "captcha_required" });
  });
});
