import { describe, expect, it } from "vitest";

import { validateMemoryPatch } from "./validation";

const sourceMessageId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2";
const mayaId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3";
const alexId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4";
const factId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a5";

const context = {
  roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a6",
  sourceMessageId,
  sourceParticipantId: mayaId,
  approvalMode: "all_active" as const,
  participants: [mayaId, alexId],
  activeFacts: [
    {
      id: factId,
      roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a6",
      subjectType: "participant" as const,
      subjectParticipantId: mayaId,
      factType: "transport_preference" as const,
      canonicalKey: "participant:transport_preference",
      value: { text: "flying" },
      status: "active" as const,
    },
  ],
  sourceBody: "Actually, I'd rather drive.",
  sourceParticipantRole: "member" as const,
};

function fact(overrides: Record<string, unknown> = {}) {
  return {
    factType: "transport_preference",
    subjectType: "participant",
    subjectParticipantId: mayaId,
    canonicalKey: "MODEL VALUE IS IGNORED",
    value: { text: "driving" },
    status: "active",
    confidence: 1.4,
    evidenceStrength: "explicit",
    sourceMessageId,
    supersedesFactId: factId,
    ...overrides,
  };
}

describe("memory patch validation", () => {
  it("allows compatible self-correction, clamps confidence, and derives the key", () => {
    const result = validateMemoryPatch(
      { facts: [fact()], supersessions: [] },
      context,
    );
    expect(result.facts[0]).toMatchObject({
      canonicalKey: "participant:transport_preference",
      confidence: 1,
      supersedesFactId: factId,
    });
  });

  it("rejects source mismatch, invalid participants, and cross-participant overwrite", () => {
    expect(() =>
      validateMemoryPatch(
        { facts: [fact({ sourceMessageId: alexId })], supersessions: [] },
        context,
      ),
    ).toThrow("source_message_invalid");
    expect(() =>
      validateMemoryPatch(
        { facts: [fact({ subjectParticipantId: factId })], supersessions: [] },
        context,
      ),
    ).toThrow("participant_not_found");
    expect(() =>
      validateMemoryPatch(
        { facts: [fact({ subjectParticipantId: alexId })], supersessions: [] },
        context,
      ),
    ).toThrow("supersession_not_allowed");
  });

  it("does not promote a tentative proposal to a group decision", () => {
    expect(() =>
      validateMemoryPatch(
        {
          facts: [
            fact({
              factType: "group_decision",
              subjectType: "group",
              subjectParticipantId: null,
              supersedesFactId: null,
              evidenceStrength: "tentative",
              value: { text: "Yosemite" },
            }),
          ],
          supersessions: [],
        },
        context,
      ),
    ).toThrow("invalid_memory_patch");
  });

  it("rejects cross-participant attribution and non-consensus decision wording", () => {
    expect(() =>
      validateMemoryPatch(
        {
          facts: [
            fact({
              subjectParticipantId: alexId,
              supersedesFactId: null,
              value: { text: "flying" },
            }),
          ],
          supersessions: [],
        },
        context,
      ),
    ).toThrow("supersession_not_allowed");
    expect(() =>
      validateMemoryPatch(
        {
          facts: [
            fact({
              factType: "group_decision",
              subjectType: "group",
              subjectParticipantId: null,
              supersedesFactId: null,
              evidenceStrength: "explicit",
              value: { text: "Yosemite" },
            }),
          ],
          supersessions: [],
        },
        { ...context, sourceBody: "We should probably go to Yosemite" },
      ),
    ).toThrow("invalid_memory_patch");
  });

  it("discards exact duplicates without mutating history", () => {
    const result = validateMemoryPatch(
      {
        facts: [fact({ value: { text: "flying" }, supersedesFactId: null })],
        supersessions: [],
      },
      context,
    );
    expect(result.facts).toEqual([]);
  });
});
