import { expect, it } from "vitest";

import { parseRoomMemory } from "./route";

it("normalizes the private memory RPC wrapper into bounded context input", () => {
  const roomId = "b1741efc-ae50-4015-9cff-fdfaa1deb94e";
  const result = parseRoomMemory(roomId, {
    facts: [],
    snapshot: {
      updated_at: "2026-07-20T14:38:47.840615+00:00",
      memory_version: 2,
      open_questions: [],
      shared_context: {
        dateWindows: [],
        budgetContext: [],
        lodgingContext: [],
        transportContext: [],
        destinationsUnderConsideration: [],
      },
      rejected_options: [],
      confirmed_decisions: [],
      participant_profiles: {
        "8fae8741-d804-4caa-97eb-16ed78622c49": {
          avoids: [],
          mustDos: [],
          constraints: [],
          displayName: "Maya",
          preferences: [],
        },
      },
    },
  });

  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.roomId).toBe(roomId);
    expect(result.data.memoryVersion).toBe(2);
  }
});
