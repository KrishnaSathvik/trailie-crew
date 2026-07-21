import { beforeEach, describe, expect, it, vi } from "vitest";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { verifyCaptchaForGuestInvite } from "@/features/security/captcha-server";
import { cookies } from "next/headers";
import {
  createGuestComment,
  createScopedGuestSession,
  deleteGuestComment,
  updateGuestComment,
} from "./repository";
import {
  beginGuestSessionAction,
  createGuestCommentAction,
  createGuestInviteAction,
  createMemberCommentAction,
  deleteGuestCommentAction,
  listGuestInvitesAction,
  listMemberCommentsAction,
  resolvePlanCommentAction,
  revokeGuestInviteAction,
  rotateGuestInviteAction,
  updateGuestCommentAction,
} from "./actions";

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));
vi.mock("@/features/security/captcha-server", () => ({
  verifyCaptchaForGuestInvite: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("./repository", () => ({
  createScopedGuestSession: vi.fn(),
  createGuestComment: vi.fn(),
  updateGuestComment: vi.fn(),
  deleteGuestComment: vi.fn(),
}));

const ids = {
  room: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a1",
  plan: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
  participant: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
  invite: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4",
  comment: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a5",
};
const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const inviteMetadata = {
  id: ids.invite,
  planVersionId: ids.plan,
  planVersion: 1,
  role: "guest_commenter",
  tokenPrefix: "abcdefgh",
  expiresAt,
  maxUses: 25,
  useCount: 0,
  createdAt: "2026-07-19T00:00:00.000Z",
};
const comment = {
  id: ids.comment,
  planVersionId: ids.plan,
  planVersion: 1,
  dayKey: "2026-09-12",
  itemKey: "item:one",
  authorType: "guest" as const,
  authorDisplayName: "Jordan",
  body: "Could we start earlier?",
  resolved: false,
  deleted: false,
  createdAt: "2026-07-19T00:10:00.000Z",
  updatedAt: "2026-07-19T00:10:00.000Z",
  isOwn: true,
};

describe("guest comment server actions", () => {
  const rpc = vi.fn();
  const cookieSet = vi.fn();
  const cookieGet = vi.fn();

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
    vi.mocked(cookies).mockResolvedValue({
      get: cookieGet,
      set: cookieSet,
    } as never);
    vi.mocked(verifyCaptchaForGuestInvite).mockResolvedValue(undefined);
  });

  it("creates Viewer or Commenter links while sending only SHA-256 to SQL", async () => {
    rpc.mockResolvedValue({ data: inviteMetadata, error: null });
    const result = await createGuestInviteAction({
      planVersionId: ids.plan,
      participantId: ids.participant,
      role: "guest_commenter",
      expiresAt,
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        role: "guest_commenter",
        guestUrl: expect.stringMatching(/^\/guest\/[A-Za-z0-9_-]{43}$/),
      },
    });
    const raw = (result as { data: { guestUrl: string } }).data.guestUrl
      .split("/")
      .at(-1)!;
    const args = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(args.target_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(args)).not.toContain(raw);
    expect(args.target_token_prefix).toBe(raw.slice(0, 8));
    expect(args.target_max_uses).toBe(25);
  });

  it("rotates atomically and returns the new raw URL only once", async () => {
    rpc.mockResolvedValue({ data: inviteMetadata, error: null });
    const result = await rotateGuestInviteAction({
      inviteId: ids.invite,
      participantId: ids.participant,
    });

    expect(rpc).toHaveBeenCalledWith(
      "rotate_guest_invite",
      expect.objectContaining({
        invite_id: ids.invite,
        participant_id: ids.participant,
        target_token_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      data: { guestUrl: expect.stringMatching(/^\/guest\//) },
    });
  });

  it("lists safe active metadata and revokes without exposing token hashes", async () => {
    rpc
      .mockResolvedValueOnce({ data: [inviteMetadata], error: null })
      .mockResolvedValueOnce({
        data: {
          id: ids.invite,
          planVersionId: ids.plan,
          planVersion: 1,
          status: "revoked",
        },
        error: null,
      });

    await expect(listGuestInvitesAction(ids.room, 1)).resolves.toEqual({
      ok: true,
      data: [inviteMetadata],
    });
    await expect(
      revokeGuestInviteAction({
        inviteId: ids.invite,
        participantId: ids.participant,
      }),
    ).resolves.toMatchObject({ ok: true, data: { status: "revoked" } });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("token_hash");
  });

  it("creates an HttpOnly scoped cookie after display-name entry", async () => {
    vi.mocked(createScopedGuestSession).mockResolvedValue({
      role: "guest_commenter",
      displayName: "Jordan",
      planVersionId: ids.plan,
      planVersion: 1,
      expiresAt,
    });

    const result = await beginGuestSessionAction({
      inviteToken: "A".repeat(43),
      displayName: "Jordan",
      captchaToken: "captcha-token",
    });

    expect(result).toEqual({ ok: true, data: { redirectTo: "/guest/plan" } });
    expect(cookieSet).toHaveBeenCalledWith(
      "trailie_guest_session",
      expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/guest",
      }),
    );
    expect(JSON.stringify(cookieSet.mock.calls)).not.toContain("A".repeat(43));
    expect(verifyCaptchaForGuestInvite).toHaveBeenCalledWith({
      token: "captcha-token",
      inviteFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("validates plain text and uses only the scoped cookie for guest mutations", async () => {
    cookieGet.mockReturnValue({ value: "B".repeat(43) });
    vi.mocked(createGuestComment).mockResolvedValue(comment);
    vi.mocked(updateGuestComment).mockResolvedValue({
      ...comment,
      body: "Updated",
    });
    vi.mocked(deleteGuestComment).mockResolvedValue({
      ...comment,
      body: null,
      deleted: true,
      deletedAt: "2026-07-19T00:20:00.000Z",
    });

    await expect(
      createGuestCommentAction({
        dayKey: "2026-09-12",
        itemKey: "item:one",
        body: comment.body,
      }),
    ).resolves.toMatchObject({ ok: true, data: { body: comment.body } });
    await expect(
      updateGuestCommentAction({ commentId: ids.comment, body: "Updated" }),
    ).resolves.toMatchObject({ ok: true, data: { body: "Updated" } });
    await expect(
      deleteGuestCommentAction({ commentId: ids.comment }),
    ).resolves.toMatchObject({ ok: true, data: { deleted: true } });

    expect(createGuestComment).toHaveBeenCalledWith(
      "B".repeat(43),
      expect.objectContaining({ body: comment.body }),
    );
    await expect(
      createGuestCommentAction({
        dayKey: null,
        itemKey: null,
        body: "<script>unsafe</script>",
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_comment" });
  });

  it("lets active members add and resolve exact-version comments through member RPCs", async () => {
    rpc
      .mockResolvedValueOnce({ data: [comment], error: null })
      .mockResolvedValueOnce({
        data: { ...comment, authorType: "member", authorDisplayName: "Maya" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ...comment,
          resolved: true,
          resolvedAt: "2026-07-19T00:30:00.000Z",
        },
        error: null,
      });

    await expect(listMemberCommentsAction(ids.room, 1)).resolves.toMatchObject({
      ok: true,
      data: [comment],
    });
    await expect(
      createMemberCommentAction({
        roomId: ids.room,
        planVersion: 1,
        participantId: ids.participant,
        dayKey: null,
        itemKey: null,
        body: "Plan-level note",
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      resolvePlanCommentAction({
        commentId: ids.comment,
        participantId: ids.participant,
      }),
    ).resolves.toMatchObject({ ok: true, data: { resolved: true } });
  });
});
