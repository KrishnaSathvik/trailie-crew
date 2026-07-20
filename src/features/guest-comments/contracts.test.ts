import { describe, expect, it } from "vitest";

import { revisionItinerary } from "@/features/revisions/test-fixtures";
import { projectPublicItinerary } from "@/features/sharing/public-projection";
import {
  guestCommentSchema,
  guestInviteVerificationSchema,
  guestRoleSchema,
  guestSessionContextSchema,
  guestSuggestionSchema,
  guestSuggestionTypeSchema,
  plainTextCommentSchema,
} from "./contracts";

const ids = {
  invite: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a1",
  plan: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
  comment: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
};

function itinerary() {
  return projectPublicItinerary({
    itinerary: revisionItinerary(),
    version: 1,
    publishedAt: "2026-07-19T00:00:00.000Z",
    validationStatus: "pass",
  });
}

function comment() {
  return {
    id: ids.comment,
    planVersionId: ids.plan,
    planVersion: 1,
    dayKey: "2026-09-12",
    itemKey: "item:glacier",
    authorType: "guest",
    authorDisplayName: "Jordan",
    body: "Could we start earlier?",
    resolved: false,
    deleted: false,
    createdAt: "2026-07-19T00:10:00.000Z",
    updatedAt: "2026-07-19T00:10:00.000Z",
    isOwn: true,
  };
}

describe("guest comment contracts", () => {
  it("recognizes the suggestion-only guest role", () => {
    expect(guestRoleSchema.parse("guest_suggester")).toBe("guest_suggester");
  });

  it("parses safe, version-attributed suggestion state", () => {
    const parsed = guestSuggestionSchema.parse({
      id: ids.comment,
      originalPlanVersionId: ids.plan,
      originalPlanVersion: 1,
      rebasedToPlanVersionId: null,
      rebasedToPlanVersion: null,
      targetType: "item",
      targetKey: "item:glacier",
      targetLabel: "Glacier Point sunset",
      suggestionType: "remove_item",
      title: "Skip sunset",
      details: "Use the evening for an earlier dinner.",
      proposedDate: null,
      proposedStartTime: null,
      proposedEndTime: null,
      status: "open",
      guestDisplayName: "Jordan",
      dismissedAt: null,
      convertedAt: null,
      revisionRequestId: null,
      createdAt: "2026-07-19T00:10:00.000Z",
      updatedAt: "2026-07-19T00:10:00.000Z",
      isOwn: true,
    });

    expect(parsed.originalPlanVersion).toBe(1);
    expect(parsed).not.toHaveProperty("guestSessionId");
    expect(parsed).not.toHaveProperty("convertedBy");
  });

  it("supports only the eight structured suggestion types", () => {
    expect(guestSuggestionTypeSchema.options).toEqual([
      "add_item",
      "remove_item",
      "replace_item",
      "reschedule_item",
      "move_item",
      "update_note",
      "change_route",
      "general",
    ]);
  });

  it("parses a privacy-safe exact-version invite projection", () => {
    const parsed = guestInviteVerificationSchema.parse({
      inviteId: ids.invite,
      roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4",
      planVersionId: ids.plan,
      planVersion: 1,
      role: "guest_viewer",
      expiresAt: "2026-07-20T00:00:00.000Z",
      itinerary: itinerary(),
    });

    expect(parsed.planVersion).toBe(1);
    expect(parsed.role).toBe("guest_viewer");
    expect(JSON.stringify(parsed)).not.toMatch(
      /participants|memory|approval|revision/i,
    );
  });

  it("parses scoped guest context and comments without internal author IDs", () => {
    const parsed = guestSessionContextSchema.parse({
      role: "guest_commenter",
      displayName: "Jordan",
      planVersionId: ids.plan,
      planVersion: 1,
      expiresAt: "2026-07-20T00:00:00.000Z",
      itinerary: itinerary(),
      comments: [comment()],
    });

    expect(parsed.comments[0].authorDisplayName).toBe("Jordan");
    expect(parsed.comments[0].isOwn).toBe(true);
    expect(parsed.comments[0]).not.toHaveProperty("guestSessionId");
    expect(parsed.comments[0]).not.toHaveProperty("memberId");
  });

  it("keeps deleted content absent and safe moderation state visible", () => {
    const parsed = guestCommentSchema.parse({
      ...comment(),
      body: null,
      deleted: true,
      deletedAt: "2026-07-19T00:20:00.000Z",
    });

    expect(parsed.body).toBeNull();
    expect(parsed.deleted).toBe(true);
  });

  it("accepts plain text literally and rejects HTML/control payloads", () => {
    expect(plainTextCommentSchema.parse("**Meet at 8**")).toBe("**Meet at 8**");
    expect(plainTextCommentSchema.safeParse("<b>Meet at 8</b>").success).toBe(
      false,
    );
    expect(plainTextCommentSchema.safeParse("unsafe\u0000text").success).toBe(
      false,
    );
  });
});
