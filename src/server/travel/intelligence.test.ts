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

  it("resolves a generic park label only when Mapbox and NPS uniquely corroborate the official name", async () => {
    const baseline = createFakeTravelProviderAdapter({
      scenario: "baseline",
      now: "2026-07-17T20:00:00.000Z",
    });
    const geocode = (
      await baseline.geocode({ query: "Yosemite", locale: "en-US" })
    ).evidence[0];
    const park = (
      await baseline.getPark({ query: "Yosemite", locale: "en-US" })
    ).evidence[0];
    const geocoding = {
      ...baseline,
      providerId: "mapbox",
      async geocode() {
        return {
          state: "ambiguous" as const,
          warnings: [],
          evidence: [
            {
              ...geocode,
              provider: "mapbox",
              availabilityState: "ambiguous" as const,
              verificationState: "partially_verified" as const,
              normalizedValue: {
                ...geocode.normalizedValue,
                data: {
                  ...geocode.normalizedValue.data,
                  name: "Yosemite National Park",
                },
              },
            },
            {
              ...geocode,
              evidenceId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
              provider: "mapbox",
              availabilityState: "ambiguous" as const,
              verificationState: "partially_verified" as const,
              normalizedValue: {
                ...geocode.normalizedValue,
                data: {
                  ...geocode.normalizedValue.data,
                  name: "Yosemite Village",
                },
              },
            },
          ],
        };
      },
    };
    const parks = {
      ...baseline,
      providerId: "nps",
      async getPark() {
        return {
          state: "ambiguous" as const,
          warnings: [],
          evidence: [
            {
              ...park,
              provider: "nps",
              availabilityState: "ambiguous" as const,
              verificationState: "partially_verified" as const,
            },
            {
              ...park,
              evidenceId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4",
              provider: "nps",
              sourceEntityId: "other",
              availabilityState: "ambiguous" as const,
              verificationState: "partially_verified" as const,
              normalizedValue: {
                ...park.normalizedValue,
                data: {
                  ...park.normalizedValue.data,
                  officialName: "Another Yosemite Historic Site",
                },
              },
            },
          ],
        };
      },
    };

    const result = await collectDestinationTravelEvidence({
      destination: "Yosemite",
      dates: ["2026-07-18"],
      locale: "en-US",
      providers: {
        geocoding,
        weather: baseline,
        parks,
        recreation: createUnavailableTravelProviderAdapter({
          providerId: "ridb",
          reason: "provider_disabled",
          now: "2026-07-17T20:00:00.000Z",
        }),
      },
      maximumCallsPerProvider: 8,
    });

    expect(result.destinationState).toBe("resolved");
    expect(
      result.evidence.filter((entry) => entry.evidenceType === "geocode"),
    ).toEqual([
      expect.objectContaining({
        provider: "mapbox",
        availabilityState: "available",
        verificationState: "verified",
        normalizedValue: expect.objectContaining({
          data: expect.objectContaining({ name: "Yosemite National Park" }),
        }),
      }),
    ]);
    expect(
      result.evidence.some(
        (entry) => entry.evidenceType === "weather_forecast",
      ),
    ).toBe(true);
  });
});
