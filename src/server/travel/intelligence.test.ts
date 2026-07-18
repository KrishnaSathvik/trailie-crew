import { describe, expect, it } from "vitest";
import {
  createFakeTravelProviderAdapter,
  createUnavailableTravelProviderAdapter,
} from "@trailie/travel-tools";

import { collectDestinationTravelEvidence } from "./intelligence";

describe("collectDestinationTravelEvidence", () => {
  it("collects bounded official constraints without duplicating provider calls", async () => {
    const baseline = createFakeTravelProviderAdapter({
      scenario: "baseline",
      now: "2026-07-17T20:00:00.000Z",
    });
    const result = await collectDestinationTravelEvidence({
      destination: "Yosemite National Park",
      dates: ["2026-07-18", "2026-07-19"],
      locale: "en-US",
      providers: {
        geocoding: baseline,
        weather: baseline,
        parks: createFakeTravelProviderAdapter({
          scenario: "active_closure",
          now: "2026-07-17T20:00:00.000Z",
        }),
        recreation: baseline,
      },
      maximumCallsPerProvider: 8,
    });

    expect(result.destinationState).toBe("resolved");
    expect(result.evidence.map((entry) => entry.evidenceType)).toEqual(
      expect.arrayContaining([
        "geocode",
        "park",
        "park_closure",
        "weather_forecast",
        "sunrise",
        "reservation",
      ]),
    );
    expect(result.callsByProvider["trailie-fake-v1"]).toBeLessThanOrEqual(8);
    expect(result.evidence.some((entry) => entry.errorState)).toBe(false);
  });

  it("does not call coordinate-bound providers for an unresolved destination", async () => {
    const unavailable = createUnavailableTravelProviderAdapter({
      providerId: "travel-providers-disabled",
      reason: "provider_disabled",
      now: "2026-07-17T20:00:00.000Z",
    });
    const result = await collectDestinationTravelEvidence({
      destination: "Unknown place",
      dates: ["2026-07-18"],
      locale: "en-US",
      providers: {
        geocoding: unavailable,
        weather: unavailable,
        parks: unavailable,
        recreation: unavailable,
      },
      maximumCallsPerProvider: 8,
    });

    expect(result.destinationState).toBe("unavailable");
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidenceType: "geocode",
          verificationState: "failed",
        }),
        expect.objectContaining({
          evidenceType: "park",
          verificationState: "failed",
        }),
      ]),
    );
    expect(result.callsByCapability.weather).toBeUndefined();
    expect(result.callsByCapability.daylight).toBeUndefined();
  });
});
