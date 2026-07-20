import { describe, expect, it } from "vitest";
import { routeChangeAnalysisModel, routeRevisionExecution } from "./routing";

describe("change analysis routing", () => {
  const models = {
    fast: "configured-fast-model",
    reasoning: "configured-reasoning-model",
  };
  it("uses Terra for a bounded one-day item revision", () => {
    expect(
      routeChangeAnalysisModel(
        {
          requestType: "reschedule_item",
          affectedItemCount: 1,
          affectedDayCount: 1,
          materiality: "material",
          touchesConfirmedDecision: false,
        },
        models,
      ),
    ).toBe("configured-fast-model");
  });
  it.each([
    "change_lodging",
    "update_traveler_logistics",
    "change_route",
  ] as const)("uses Sol for %s", (requestType) => {
    expect(
      routeChangeAnalysisModel(
        {
          requestType,
          affectedItemCount: 1,
          affectedDayCount: 1,
          materiality: "material",
          touchesConfirmedDecision: false,
        },
        models,
      ),
    ).toBe("configured-reasoning-model");
  });
  it("uses Sol for critical, multi-day, or confirmed-decision impact", () => {
    expect(
      routeChangeAnalysisModel(
        {
          requestType: "general_revision",
          affectedItemCount: 3,
          affectedDayCount: 2,
          materiality: "critical",
          touchesConfirmedDecision: true,
        },
        models,
      ),
    ).toBe("configured-reasoning-model");
  });
});

describe("revision execution routing", () => {
  it("uses deterministic patching for narrow remove_item", () => {
    expect(
      routeRevisionExecution({
        requestType: "remove_item",
        affectedItemCount: 1,
        affectedDayCount: 1,
      }),
    ).toBe("deterministic");
  });

  it.each([
    "move_item",
    "reschedule_item",
    "shorten_item",
    "extend_item",
    "update_note",
  ] as const)("uses a constrained Terra patch for narrow %s", (requestType) => {
    expect(
      routeRevisionExecution({
        requestType,
        affectedItemCount: 1,
        affectedDayCount: 1,
      }),
    ).toBe("constrained_terra");
  });

  it.each([
    "replace_item",
    "change_lodging",
    "update_traveler_logistics",
    "general_revision",
  ] as const)("uses constrained Sol for %s", (requestType) => {
    expect(
      routeRevisionExecution({
        requestType,
        affectedItemCount: 1,
        affectedDayCount: 1,
      }),
    ).toBe("constrained_sol");
  });

  it("does not route a broad request through deterministic patching", () => {
    expect(
      routeRevisionExecution({
        requestType: "remove_item",
        affectedItemCount: 3,
        affectedDayCount: 2,
      }),
    ).toBe("constrained_sol");
  });
});
