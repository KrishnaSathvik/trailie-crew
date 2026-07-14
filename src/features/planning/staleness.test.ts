import { describe, expect, it } from "vitest";
import { evaluateSummaryStaleness } from "./staleness";

const basis = {
  memoryVersion: 3,
  latestPlanningMessageId: "m1",
  membershipFingerprint: "a,b",
  approvalMode: "all_active" as const,
};
describe("summary staleness", () => {
  it("detects memory, participant, planning-message, and approval-mode changes", () => {
    expect(
      evaluateSummaryStaleness(basis, { ...basis, memoryVersion: 4 }).isStale,
    ).toBe(true);
    expect(
      evaluateSummaryStaleness(basis, {
        ...basis,
        membershipFingerprint: "a,b,c",
      }).isStale,
    ).toBe(true);
    expect(
      evaluateSummaryStaleness(basis, {
        ...basis,
        latestPlanningMessageId: "m2",
      }).isStale,
    ).toBe(true);
    expect(
      evaluateSummaryStaleness(basis, { ...basis, approvalMode: "host_only" })
        .isStale,
    ).toBe(true);
  });
  it("ignores reaction and presence activity because they are absent from the basis", () => {
    expect(evaluateSummaryStaleness(basis, basis).isStale).toBe(false);
  });
});
