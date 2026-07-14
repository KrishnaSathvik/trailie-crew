import { beforeEach, describe, expect, it, vi } from "vitest";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  createPlanShareLinkAction,
  getPlanShareStatusAction,
  revokePlanShareLinkAction,
} from "./actions";

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

const ids = {
  plan: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a1",
  participant: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
  link: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
};

describe("share management actions", () => {
  const rpc = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: "user" } }, error: null }),
      },
      rpc,
    } as never);
  });

  it("returns a token-bearing URL once while sending only its hash to SQL", async () => {
    rpc.mockResolvedValue({
      data: {
        id: ids.link,
        tripPlanId: ids.plan,
        planVersion: 1,
        mode: "public_link",
        status: "active",
        tokenPrefix: "abcdefgh",
        snapshotHash: "a".repeat(64),
        expiresAt: null,
        createdAt: "2026-07-14T00:00:00.000Z",
      },
      error: null,
    });

    const result = await createPlanShareLinkAction({
      tripPlanId: ids.plan,
      participantId: ids.participant,
      mode: "public_link",
      expiresAt: null,
    });

    expect(result).toMatchObject({
      ok: true,
      data: { id: ids.link, shareUrl: expect.stringMatching(/^\/share\//) },
    });
    const args = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    const rawToken = (result as { data: { shareUrl: string } }).data.shareUrl
      .split("/")
      .at(-1)!;
    expect(args.target_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(args.target_token_hash).not.toBe(rawToken);
    expect(JSON.stringify(args)).not.toContain(rawToken);
    expect(args.target_token_prefix).toBe(rawToken.slice(0, 8));
  });

  it("validates expiring mode and maps host errors without database detail", async () => {
    await expect(
      createPlanShareLinkAction({
        tripPlanId: ids.plan,
        participantId: ids.participant,
        mode: "expiring_link",
        expiresAt: null,
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_expiration" });
    expect(rpc).not.toHaveBeenCalled();

    rpc.mockResolvedValue({
      data: null,
      error: { message: "Host required. private SQL detail" },
    });
    await expect(
      createPlanShareLinkAction({
        tripPlanId: ids.plan,
        participantId: ids.participant,
        mode: "public_link",
        expiresAt: null,
      }),
    ).resolves.toEqual({ ok: false, error: "host_required" });
  });

  it("reads safe status and revokes idempotently through RPCs", async () => {
    rpc
      .mockResolvedValueOnce({
        data: {
          id: ids.link,
          tripPlanId: ids.plan,
          planVersion: 1,
          mode: "public_link",
          status: "active",
          tokenPrefix: "abcdefgh",
          snapshotHash: "a".repeat(64),
          expiresAt: null,
          createdAt: "2026-07-14T00:00:00.000Z",
          revokedAt: null,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: ids.link,
          tripPlanId: ids.plan,
          planVersion: 1,
          status: "revoked",
        },
        error: null,
      });

    await expect(getPlanShareStatusAction(ids.plan, 1)).resolves.toMatchObject({
      ok: true,
      data: { status: "active" },
    });
    await expect(
      revokePlanShareLinkAction({
        shareLinkId: ids.link,
        participantId: ids.participant,
      }),
    ).resolves.toEqual({
      ok: true,
      data: {
        id: ids.link,
        tripPlanId: ids.plan,
        planVersion: 1,
        status: "revoked",
      },
    });
  });
});
