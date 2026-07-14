import { describe, expect, it } from "vitest";

import { classifyMemoryEligibility } from "./eligibility";

describe("memory extraction eligibility", () => {
  it.each(["hi", "hello!", "lol", "okay", "sounds good", "thanks!"])(
    "skips non-durable chatter: %s",
    (body) =>
      expect(classifyMemoryEligibility({ body })).toEqual({
        eligible: false,
        reason: "non_durable_chatter",
      }),
  );

  it.each([
    "I prefer hiking.",
    "I cannot travel before Friday.",
    "Maybe Yosemite?",
    "We all decided on September 12.",
    "Actually, I'd rather drive.",
    "Are we staying near the park?",
  ])("keeps potentially durable planning content: %s", (body) => {
    expect(classifyMemoryEligibility({ body })).toEqual({ eligible: true });
  });

  it("rejects non-user, deleted, inactive-room, and completed messages", () => {
    expect(
      classifyMemoryEligibility({
        body: "I prefer hiking",
        messageType: "trailie",
      }).eligible,
    ).toBe(false);
    expect(
      classifyMemoryEligibility({
        body: "I prefer hiking",
        deletedAt: "2026-07-13T00:00:00Z",
      }).eligible,
    ).toBe(false);
    expect(
      classifyMemoryEligibility({
        body: "I prefer hiking",
        roomStatus: "archived",
      }).eligible,
    ).toBe(false);
    expect(
      classifyMemoryEligibility({
        body: "I prefer hiking",
        extractionStatus: "completed",
      }).eligible,
    ).toBe(false);
  });
});
