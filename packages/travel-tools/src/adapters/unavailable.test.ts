import { describe, expect, it } from "vitest";

import { createUnavailableTravelProviderAdapter } from "./unavailable";

describe("unavailable TravelProviderAdapter", () => {
  it("returns explicit unavailable evidence for every capability", async () => {
    const adapter = createUnavailableTravelProviderAdapter({
      providerId: "travel-providers-disabled",
      reason: "provider_disabled",
      now: "2026-07-17T20:00:00.000Z",
    });
    const response = await adapter.geocode({
      query: "Yosemite",
      locale: "en-US",
    });

    expect(response).toMatchObject({
      state: "unavailable",
      evidence: [
        {
          provider: "travel-providers-disabled",
          evidenceType: "geocode",
          freshnessState: "unavailable",
          verificationState: "failed",
          errorState: { code: "provider_disabled", retryable: false },
        },
      ],
    });
  });
});
