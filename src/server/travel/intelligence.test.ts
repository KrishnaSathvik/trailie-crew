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
    expect(result.durationMsByCapability).toEqual(
      expect.objectContaining({
        geocode: expect.any(Number),
        park: expect.any(Number),
        recreation: expect.any(Number),
        weather: expect.any(Number),
      }),
    );
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
      async geocode(input: { query: string }) {
        expect(input.query).toBe("Yosemite National Park");
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
              evidenceId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
              sourceEntityId: "mapbox.yosemite.duplicate-representation",
              provider: "mapbox",
              availabilityState: "ambiguous" as const,
              verificationState: "partially_verified" as const,
              normalizedValue: {
                ...geocode.normalizedValue,
                data: {
                  ...geocode.normalizedValue.data,
                  canonicalPlaceId: "mapbox.yosemite.duplicate-representation",
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
      async getPark(input: { query?: string }) {
        expect(input.query).toBe("Yosemite");
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
      destination:
        "Yosemite National Park, California (July 22 through July 25, 2026)",
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
    expect(result.destinationResolution).toMatchObject({
      schemaVersion: "1",
      status: "resolved",
      canonicalPlaceId: expect.stringMatching(/^nps:/),
      canonicalName: "Yosemite National Park",
      providerPlaceId: null,
      resolutionMethod: "exact_official_match",
      corroborationSources: ["mapbox", "nps"],
    });
    expect(result.destinationResolution.semanticHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(result.destinationResolution)).not.toContain(
      "duplicate-representation",
    );
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

  it("keeps genuinely different official destinations ambiguous", async () => {
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
    const ambiguousGeocode = (name: string, id: string) => ({
      ...geocode,
      evidenceId: `evidence:mapbox:${id}`,
      provider: "mapbox",
      sourceEntityId: id,
      availabilityState: "ambiguous" as const,
      verificationState: "partially_verified" as const,
      normalizedValue: {
        ...geocode.normalizedValue,
        data: { ...geocode.normalizedValue.data, name },
      },
    });
    const ambiguousPark = (name: string, parkCode: string) => ({
      ...park,
      evidenceId: `evidence:nps:${parkCode}`,
      provider: "nps",
      sourceEntityId: parkCode,
      availabilityState: "ambiguous" as const,
      verificationState: "partially_verified" as const,
      normalizedValue: {
        ...park.normalizedValue,
        data: {
          ...park.normalizedValue.data,
          parkCode,
          officialName: name,
        },
      },
    });
    const result = await collectDestinationTravelEvidence({
      destination: "Twin official park result",
      dates: ["2026-07-18"],
      locale: "en-US",
      providers: {
        geocoding: {
          ...baseline,
          providerId: "mapbox",
          async geocode() {
            return {
              state: "ambiguous" as const,
              warnings: [],
              evidence: [
                ambiguousGeocode("Alpha National Park", "alpha"),
                ambiguousGeocode("Beta National Park", "beta"),
              ],
            };
          },
        },
        parks: {
          ...baseline,
          providerId: "nps",
          async getPark() {
            return {
              state: "ambiguous" as const,
              warnings: [],
              evidence: [
                ambiguousPark("Alpha National Park", "alph"),
                ambiguousPark("Beta National Park", "beta"),
              ],
            };
          },
        },
        weather: baseline,
        recreation: baseline,
      },
      maximumCallsPerProvider: 8,
    });

    expect(result.destinationState).toBe("ambiguous");
    expect(result.destinationResolution).toMatchObject({
      status: "ambiguous",
      resolutionMethod: "unresolved",
      canonicalPlaceId: null,
      ambiguityReasons: ["multiple_materially_distinct_candidates"],
    });
    expect(result.callsByCapability.weather).toBeUndefined();
  });
});
