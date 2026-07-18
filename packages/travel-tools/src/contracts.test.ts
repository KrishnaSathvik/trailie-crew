import { describe, expect, it } from "vitest";

import {
  travelCapabilitySchema,
  travelPlaceResolutionStateSchema,
  travelProviderResponseSchema,
} from "./contracts";

describe("travel provider adapter contract", () => {
  it("covers the Phase 6A capability surface without booking actions", () => {
    expect(travelCapabilitySchema.options).toEqual([
      "place_search",
      "geocode",
      "reverse_geocode",
      "route",
      "weather",
      "daylight",
      "park",
      "park_alerts",
      "operating_hours",
      "reservation_links",
      "health",
    ]);
    expect(travelCapabilitySchema.options).not.toContain("book");
    expect(travelPlaceResolutionStateSchema.options).toEqual([
      "resolved",
      "ambiguous",
      "not_found",
      "unavailable",
    ]);
  });

  it("requires normalized evidence and bounded safe warnings", () => {
    expect(
      travelProviderResponseSchema.safeParse({
        state: "available",
        evidence: [],
        warnings: ["route unavailable"],
      }).success,
    ).toBe(true);
    expect(
      travelProviderResponseSchema.safeParse({
        state: "available",
        evidence: [],
        warnings: ["x".repeat(501)],
        rawPayload: { token: "secret" },
      }).success,
    ).toBe(false);
  });
});
