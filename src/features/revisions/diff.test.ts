import { describe, expect, it } from "vitest";
import { buildPlanVersionDiff } from "./diff";
import { revisionItinerary } from "./test-fixtures";

describe("plan version diff", () => {
  it("reports a requested reschedule and disclosed route impact", () => {
    const base = revisionItinerary();
    const candidate = structuredClone(base);
    candidate.days[0].items[1].startTime = "18:00";
    candidate.days[0].items[1].endTime = "19:30";
    const diff = buildPlanVersionDiff(base, candidate, {
      baseVersion: 1,
      candidateVersion: 2,
      reasons: { "item:sunset": "Requested by the crew" },
    });
    expect(diff.items).toContainEqual(
      expect.objectContaining({
        itemId: "item:sunset",
        operation: "rescheduled",
      }),
    );
    expect(diff.changedDays).toEqual(["2026-09-12"]);
  });
  it("uses stable IDs to report removal and addition", () => {
    const base = revisionItinerary();
    const candidate = structuredClone(base);
    candidate.days[1].items = [];
    candidate.days[1].items.push({
      ...base.days[1].items[0],
      id: "item:new-falls",
      title: "Lower Falls",
    });
    const diff = buildPlanVersionDiff(base, candidate, {
      baseVersion: 1,
      candidateVersion: 2,
      reasons: {},
    });
    expect(diff.items.map((item) => item.operation)).toEqual(
      expect.arrayContaining(["removed", "added"]),
    );
  });
});
