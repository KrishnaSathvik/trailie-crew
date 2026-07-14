import { expect, it } from "vitest";

import { buildMemoryContext } from "./context";

it("bounds context and excludes auth identifiers and unrelated transcript", () => {
  const context = buildMemoryContext({
    sourceMessage: { id: "m1", body: "I prefer hiking" },
    sourceParticipant: { id: "p1", displayName: "Maya", role: "member" },
    approvalMode: "all_active",
    replyTarget: null,
    recentMessages: Array.from({ length: 20 }, (_, index) => ({
      id: `m${index + 2}`,
      body: `context ${index} ${"x".repeat(1000)}`,
      participantId: "p2",
      displayName: "Alex",
      messageType: "user" as const,
    })),
    activeFacts: [],
  });
  expect(context.length).toBeLessThanOrEqual(8_000);
  expect(context).toContain("I prefer hiking");
  expect(context).not.toContain("userId");
  expect(context.match(/<RECENT_MESSAGE>/g) ?? []).toHaveLength(6);
});
