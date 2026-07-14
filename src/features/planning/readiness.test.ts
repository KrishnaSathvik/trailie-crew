import { describe, expect, it } from "vitest";
import { computePlanningReadiness } from "./readiness";

const base = {
  destinations: ["Yosemite"],
  dateWindows: ["Sep 12–16"],
  flexibleDates: false,
  activeTravelerCount: 2,
  hardConstraints: [],
  conflicts: [],
};

describe("planning readiness", () => {
  it("requires a destination or explicit unresolved destination choice", () => {
    expect(computePlanningReadiness({ ...base, destinations: [] }).status).toBe(
      "needs_information",
    );
    expect(
      computePlanningReadiness({
        ...base,
        destinations: [],
        destinationUnresolved: true,
      }).status,
    ).toBe("ready_for_review");
  });
  it("accepts explicit flexible dates but blocks hard contradictions", () => {
    expect(
      computePlanningReadiness({
        ...base,
        dateWindows: [],
        flexibleDates: true,
      }).status,
    ).toBe("ready_for_review");
    expect(
      computePlanningReadiness({
        ...base,
        conflicts: [
          { detail: "Travel dates do not overlap", schedulingImpossible: true },
        ],
      }).status,
    ).toBe("blocked");
  });
  it("does not block for optional restaurant details", () => {
    expect(
      computePlanningReadiness({
        ...base,
        optionalMissing: ["restaurant choices"],
      }).status,
    ).toBe("ready_for_review");
  });
});
