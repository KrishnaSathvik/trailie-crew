import { describe, expect, it } from "vitest";

import {
  canonicalDestinationResolutionV1Schema,
  classifyTravelFreshness,
  semanticTravelEvidenceHashInput,
  travelEvidenceTypeSchema,
  travelEvidenceV1Schema,
  travelFreshnessStateSchema,
  travelVerificationStateSchema,
} from "./travel-evidence";

const evidence = {
  schemaVersion: "1",
  evidenceId: "evidence:mapbox:yosemite",
  evidenceType: "geocode",
  provider: "mapbox",
  sourceName: "Mapbox Geocoding API",
  sourceUrl: "https://docs.mapbox.com/api/search/geocoding/",
  sourceEntityId: "mapbox:yosemite",
  retrievedAt: "2026-07-17T20:00:00.000Z",
  observedAt: null,
  validFrom: "2026-07-17T20:00:00.000Z",
  validUntil: "2026-08-16T20:00:00.000Z",
  freshnessState: "fresh",
  verificationState: "verified",
  confidence: "high",
  availabilityState: "available",
  locationBinding: {
    coordinates: { latitude: 37.8651, longitude: -119.5383 },
    boundingBox: null,
    timezone: "America/Los_Angeles",
    precision: "park",
    privacy: "public",
  },
  entityBinding: {
    entityType: "park",
    canonicalId: "nps:yose",
    name: "Yosemite National Park",
  },
  normalizedValue: {
    kind: "geocode",
    data: {
      name: "Yosemite National Park",
      latitude: 37.8651,
      longitude: -119.5383,
    },
  },
  providerMetadata: { resultIndex: 0 },
  attribution: {
    label: "© Mapbox",
    url: "https://www.mapbox.com/about/maps/",
    required: true,
  },
  restrictions: {
    storage: "permanent",
    display: "mapbox_attribution_required",
  },
  cacheStatus: "miss",
  requestId: null,
  errorState: null,
} as const;

describe("TravelEvidenceV1", () => {
  it("accepts strict, independently classified evidence", () => {
    expect(travelEvidenceV1Schema.parse(evidence)).toEqual(evidence);
  });

  it("rejects a single verification boolean and mismatched normalized kind", () => {
    expect(
      travelEvidenceV1Schema.safeParse({ ...evidence, isVerified: true })
        .success,
    ).toBe(false);
    expect(
      travelEvidenceV1Schema.safeParse({
        ...evidence,
        normalizedValue: { kind: "route", data: {} },
      }).success,
    ).toBe(false);
  });

  it("enumerates every Phase 6A evidence and trust state", () => {
    expect(travelEvidenceTypeSchema.options).toEqual([
      "geocode",
      "place",
      "route",
      "travel_duration",
      "distance",
      "weather_forecast",
      "temperature",
      "precipitation",
      "severe_weather",
      "sunrise",
      "sunset",
      "park",
      "park_alert",
      "park_closure",
      "permit",
      "reservation",
      "operating_hours",
      "accessibility",
      "fee",
      "campground",
      "visitor_center",
      "trail",
      "food",
      "lodging",
      "general_official_notice",
    ]);
    expect(travelFreshnessStateSchema.options).toEqual([
      "fresh",
      "cached_fresh",
      "stale",
      "expired",
      "unavailable",
      "conflicting",
    ]);
    expect(travelVerificationStateSchema.options).toEqual([
      "verified",
      "partially_verified",
      "unverified",
      "inferred",
      "failed",
    ]);
  });

  it("calculates cached, expired, unavailable, stale, and conflicting states", () => {
    expect(
      classifyTravelFreshness(
        { ...evidence, cacheStatus: "hit" },
        "2026-07-18T20:00:00.000Z",
      ),
    ).toBe("cached_fresh");
    expect(classifyTravelFreshness(evidence, "2026-09-01T00:00:00.000Z")).toBe(
      "expired",
    );
    expect(
      classifyTravelFreshness(
        { ...evidence, availabilityState: "unavailable" },
        "2026-07-18T20:00:00.000Z",
      ),
    ).toBe("unavailable");
    expect(
      classifyTravelFreshness(
        { ...evidence, freshnessState: "stale" },
        "2026-07-18T20:00:00.000Z",
      ),
    ).toBe("stale");
    expect(
      classifyTravelFreshness(
        { ...evidence, freshnessState: "conflicting" },
        "2026-07-18T20:00:00.000Z",
      ),
    ).toBe("conflicting");
  });

  it("excludes volatile retrieval metadata from semantic snapshot input", () => {
    expect(
      semanticTravelEvidenceHashInput({
        ...evidence,
        retrievedAt: "2026-07-18T20:00:00.000Z",
        cacheStatus: "hit",
        requestId: "safe-request-2",
        providerMetadata: { requestId: "safe-request-2" },
      }),
    ).toEqual(semanticTravelEvidenceHashInput(evidence));
  });

  it("requires a resolved canonical destination to carry application-owned identity", () => {
    const resolution = {
      schemaVersion: "1",
      originalQuery: "Yosemite National Park",
      normalizedQuery: "Yosemite",
      status: "resolved",
      canonicalPlaceId: "nps:yose",
      canonicalName: "Yosemite National Park",
      providerPlaceId: null,
      npsParkCode: "yose",
      coordinates: { latitude: 37.8651, longitude: -119.5383 },
      boundingBox: null,
      locality: null,
      region: "California",
      country: "United States",
      candidateCount: 3,
      selectedCandidateIndex: 0,
      resolutionMethod: "exact_official_match",
      corroborationSources: ["mapbox", "nps"],
      corroborationScore: 1,
      confidence: "high",
      ambiguityReasons: [],
      evidenceIds: ["evidence:nps:yose"],
      semanticHash: "a".repeat(64),
    } as const;

    expect(canonicalDestinationResolutionV1Schema.parse(resolution)).toEqual(
      resolution,
    );
    expect(
      canonicalDestinationResolutionV1Schema.safeParse({
        ...resolution,
        canonicalPlaceId: null,
      }).success,
    ).toBe(false);
  });
});
