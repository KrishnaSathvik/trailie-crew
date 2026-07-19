import { beforeEach, describe, expect, it, vi } from "vitest";

import { revisionItinerary } from "@/features/revisions/test-fixtures";
import { projectPublicItinerary } from "@/features/sharing/public-projection";
import { createAdminSupabaseClient } from "@/server/supabase/admin";
import {
  createGuestComment,
  createScopedGuestSession,
  deleteGuestComment,
  loadGuestSessionContext,
  updateGuestComment,
  verifyGuestInvite,
} from "./repository";
import { hashGuestToken } from "./token";

vi.mock("@/server/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(),
}));

const rawInvite = "A".repeat(43);
const rawSession = "B".repeat(43);
const ids = {
  invite: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a1",
  room: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
  plan: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
  comment: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4",
};
const publicItinerary = projectPublicItinerary({
  itinerary: revisionItinerary(),
  version: 1,
  publishedAt: "2026-07-19T00:00:00.000Z",
  validationStatus: "pass",
});
const comment = {
  id: ids.comment,
  planVersionId: ids.plan,
  planVersion: 1,
  dayKey: "2026-09-12",
  itemKey: "item:one",
  authorType: "guest",
  authorDisplayName: "Jordan",
  body: "Could we leave earlier?",
  resolved: false,
  deleted: false,
  createdAt: "2026-07-19T00:10:00.000Z",
  updatedAt: "2026-07-19T00:10:00.000Z",
  isOwn: true,
};

describe("guest comment service repository", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createAdminSupabaseClient).mockReturnValue({ rpc } as never);
  });

  it("hashes the invite server-side and parses only the privacy-safe projection", async () => {
    rpc.mockResolvedValue({
      data: {
        inviteId: ids.invite,
        roomId: ids.room,
        planVersionId: ids.plan,
        planVersion: 1,
        role: "guest_viewer",
        expiresAt: "2026-07-20T00:00:00.000Z",
        itinerary: publicItinerary,
      },
      error: null,
    });

    await expect(verifyGuestInvite(rawInvite)).resolves.toMatchObject({
      role: "guest_viewer",
      planVersion: 1,
    });
    expect(rpc).toHaveBeenCalledWith("verify_guest_invite_token_hash", {
      target_token_hash: hashGuestToken(rawInvite),
    });
  });

  it("fails closed for malformed, revoked, expired, or invalid invite output", async () => {
    await expect(verifyGuestInvite("bad")).resolves.toBeNull();
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(verifyGuestInvite(rawInvite)).resolves.toBeNull();
    rpc.mockResolvedValueOnce({ data: { private: "shape" }, error: null });
    await expect(verifyGuestInvite(rawInvite)).resolves.toBeNull();
  });

  it("creates a scoped session using only credential hashes", async () => {
    rpc.mockResolvedValue({
      data: {
        role: "guest_commenter",
        displayName: "Jordan",
        planVersionId: ids.plan,
        planVersion: 1,
        expiresAt: "2026-07-20T00:00:00.000Z",
      },
      error: null,
    });

    await expect(
      createScopedGuestSession({
        inviteToken: rawInvite,
        sessionToken: rawSession,
        displayName: "Jordan",
      }),
    ).resolves.toMatchObject({ role: "guest_commenter", planVersion: 1 });
    expect(rpc).toHaveBeenCalledWith("create_guest_session", {
      target_token_hash: hashGuestToken(rawInvite),
      target_session_hash: hashGuestToken(rawSession),
      target_display_name: "Jordan",
    });
  });

  it("loads an exact-version guest context without private room systems", async () => {
    rpc.mockResolvedValue({
      data: {
        role: "guest_commenter",
        displayName: "Jordan",
        planVersionId: ids.plan,
        planVersion: 1,
        expiresAt: "2026-07-20T00:00:00.000Z",
        itinerary: publicItinerary,
        comments: [comment],
      },
      error: null,
    });

    const context = await loadGuestSessionContext(rawSession);
    expect(context?.comments).toHaveLength(1);
    expect(JSON.stringify(context)).not.toMatch(
      /participants|memory|approval|revision/i,
    );
    expect(rpc).toHaveBeenCalledWith("get_guest_session_context", {
      target_session_hash: hashGuestToken(rawSession),
    });
  });

  it("creates, updates, and deletes comments through ownership-checked RPCs", async () => {
    rpc
      .mockResolvedValueOnce({ data: comment, error: null })
      .mockResolvedValueOnce({
        data: { ...comment, body: "Updated" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ...comment,
          body: null,
          deleted: true,
          deletedAt: "2026-07-19T00:20:00.000Z",
        },
        error: null,
      });

    await expect(
      createGuestComment(rawSession, {
        dayKey: "2026-09-12",
        itemKey: "item:one",
        body: comment.body,
      }),
    ).resolves.toMatchObject({ body: comment.body });
    await expect(
      updateGuestComment(rawSession, ids.comment, "Updated"),
    ).resolves.toMatchObject({ body: "Updated" });
    await expect(
      deleteGuestComment(rawSession, ids.comment),
    ).resolves.toMatchObject({ body: null, deleted: true });

    expect(rpc.mock.calls).toEqual([
      [
        "create_guest_plan_comment",
        {
          target_session_hash: hashGuestToken(rawSession),
          target_day_key: "2026-09-12",
          target_item_key: "item:one",
          target_body: comment.body,
        },
      ],
      [
        "update_guest_plan_comment",
        {
          target_session_hash: hashGuestToken(rawSession),
          target_comment_id: ids.comment,
          target_body: "Updated",
        },
      ],
      [
        "delete_guest_plan_comment",
        {
          target_session_hash: hashGuestToken(rawSession),
          target_comment_id: ids.comment,
        },
      ],
    ]);
  });

  it("does not return unvalidated comment data after an RPC failure", async () => {
    rpc.mockResolvedValue({
      data: { ...comment, guestSessionId: "private" },
      error: null,
    });
    await expect(
      createGuestComment(rawSession, {
        dayKey: null,
        itemKey: null,
        body: "Plan comment",
      }),
    ).rejects.toThrow("guest_comment_unavailable");

    rpc.mockResolvedValue({ data: null, error: { message: "Rate limited." } });
    await expect(
      createGuestComment(rawSession, {
        dayKey: null,
        itemKey: null,
        body: "Plan comment",
      }),
    ).rejects.toThrow("guest_comment_rate_limited");
  });
});
