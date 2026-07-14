import { describe, expect, it } from "vitest";
import { routeChangeAnalysisModel } from "./routing";

describe("change analysis routing", () => {
  it("uses Terra for a bounded one-day item revision", () => {
    expect(
      routeChangeAnalysisModel({
        requestType: "reschedule_item",
        affectedItemCount: 1,
        affectedDayCount: 1,
        materiality: "material",
        touchesConfirmedDecision: false,
      }),
    ).toBe("gpt-5.6-terra");
  });
  it.each([
    "change_lodging",
    "update_traveler_logistics",
    "change_route",
  ] as const)("uses Sol for %s", (requestType) => {
    expect(
      routeChangeAnalysisModel({
        requestType,
        affectedItemCount: 1,
        affectedDayCount: 1,
        materiality: "material",
        touchesConfirmedDecision: false,
      }),
    ).toBe("gpt-5.6-sol");
  });
  it("uses Sol for critical, multi-day, or confirmed-decision impact", () => {
    expect(
      routeChangeAnalysisModel({
        requestType: "general_revision",
        affectedItemCount: 3,
        affectedDayCount: 2,
        materiality: "critical",
        touchesConfirmedDecision: true,
      }),
    ).toBe("gpt-5.6-sol");
  });
});
