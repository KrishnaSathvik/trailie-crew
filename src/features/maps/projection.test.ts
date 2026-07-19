import { describe, expect, it } from "vitest";
import type {
  CanonicalDestinationResolutionV1,
  TravelEvidenceSnapshotV1,
  TravelEvidenceV1,
} from "@trailie/schemas";
import { revisionItinerary } from "@/features/revisions/test-fixtures";
import {
  buildItineraryMapProjection,
  buildSpatialCompareAnnotations,
} from "./projection";

const roomId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2";
const planVersionId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3";
const generatedAt = "2026-07-18T14:00:00.000Z";

function evidence(
  overrides: Partial<TravelEvidenceV1> & {
    evidenceId: string;
    evidenceType: TravelEvidenceV1["evidenceType"];
  },
): TravelEvidenceV1 {
  return {
    schemaVersion: "1",
    provider: "nps",
    sourceName: "National Park Service",
    sourceUrl: "https://www.nps.gov/yose/index.htm",
    sourceEntityId: "yose",
    retrievedAt: generatedAt,
    observedAt: generatedAt,
    validFrom: generatedAt,
    validUntil: "2026-07-19T14:00:00.000Z",
    freshnessState: "fresh",
    verificationState: "verified",
    confidence: "high",
    availabilityState: "available",
    locationBinding: {
      coordinates: { latitude: 37.7303, longitude: -119.5731 },
      boundingBox: null,
      timezone: "America/Los_Angeles",
      precision: "exact",
      privacy: "public",
    },
    entityBinding: {
      entityType: "activity",
      canonicalId: "item:sunset",
      name: "Glacier Point",
    },
    normalizedValue: { kind: overrides.evidenceType, data: {} },
    providerMetadata: {},
    attribution: {
      label: "National Park Service",
      url: "https://www.nps.gov",
      required: true,
    },
    restrictions: { storage: "permanent", display: "Official source" },
    cacheStatus: "miss",
    requestId: null,
    errorState: null,
    ...overrides,
  };
}

const destination: CanonicalDestinationResolutionV1 = {
  schemaVersion: "1",
  originalQuery: "Yosemite",
  normalizedQuery: "yosemite",
  status: "resolved",
  canonicalPlaceId: "nps:yose",
  canonicalName: "Yosemite National Park",
  providerPlaceId: "mapbox:yosemite",
  npsParkCode: "yose",
  coordinates: { latitude: 37.8651, longitude: -119.5383 },
  boundingBox: [-119.886, 37.494, -119.196, 38.186],
  locality: null,
  region: "California",
  country: "United States",
  candidateCount: 4,
  selectedCandidateIndex: 0,
  resolutionMethod: "exact_official_match",
  corroborationSources: ["mapbox", "nps"],
  corroborationScore: 1,
  confidence: "high",
  ambiguityReasons: [],
  evidenceIds: ["evidence:nps:park:yose"],
  semanticHash:
    "a23e211616c12a1289fd9c289440c26793955b5f43654b48d292cf7ae986322b",
};

function build(
  overrides: Partial<Parameters<typeof buildItineraryMapProjection>[0]> = {},
) {
  return buildItineraryMapProjection({
    roomId,
    planVersionId,
    planVersion: 1,
    itinerary: revisionItinerary(),
    evidence: [
      evidence({
        evidenceId: "evidence:nps:place:item-sunset",
        evidenceType: "place",
      }),
    ],
    destinationResolution: destination,
    privacyMode: "member",
    publishedAt: "2026-07-18T13:00:00.000Z",
    historical: true,
    generatedAt,
    ...overrides,
  });
}

describe("buildItineraryMapProjection", () => {
  it("uses official evidence before itinerary coordinates", () => {
    const projection = build();
    expect(
      projection.markers.find((marker) => marker.itemId === "item:sunset"),
    ).toMatchObject({
      coordinateSource: "official_nps",
      verificationState: "verified",
      coordinates: { latitude: 37.7303, longitude: -119.5731 },
    });
    expect(projection.destination.coordinateSource).toBe("official_nps");
  });

  it("projects durable official coordinates from an immutable snapshot subset", () => {
    const snapshot = {
      schemaVersion: "1",
      evidenceId: "evidence:ridb:place:item-sunset",
      evidenceType: "place",
      provider: "ridb",
      sourceName: "Recreation Information Database",
      sourceUrl: "https://www.recreation.gov/",
      sourceEntityId: "ridb-100",
      retrievedAt: generatedAt,
      observedAt: generatedAt,
      validFrom: generatedAt,
      validUntil: "2026-07-19T14:00:00.000Z",
      freshnessState: "fresh",
      verificationState: "verified",
      confidence: "high",
      availabilityState: "available",
      normalizedValue: {
        kind: "place",
        data: { latitude: 37.7303, longitude: -119.5731 },
      },
      attribution: {
        label: "Recreation.gov",
        url: "https://www.recreation.gov/",
        required: true,
      },
      restrictions: { storage: "permanent", display: "Official source" },
      errorState: null,
    } satisfies TravelEvidenceSnapshotV1;
    const projection = build({
      evidence: [snapshot],
      evidenceBindings: [
        {
          evidenceId: snapshot.evidenceId,
          targetItemId: "item:sunset",
        },
      ],
    });
    expect(
      projection.markers.find((marker) => marker.itemId === "item:sunset"),
    ).toMatchObject({
      coordinateSource: "official_ridb",
      coordinates: { latitude: 37.7303, longitude: -119.5731 },
    });
  });

  it("excludes prohibited temporary Mapbox data from every projection field", () => {
    const projection = build({
      evidence: [
        evidence({
          evidenceId: "evidence:mapbox:place:item-sunset",
          evidenceType: "place",
          provider: "mapbox",
          restrictions: {
            storage: "prohibited",
            display: "Temporary result",
          },
        }),
      ],
    });
    const marker = projection.markers.find(
      (candidate) => candidate.itemId === "item:sunset",
    );
    expect(marker).toMatchObject({
      coordinates: null,
      coordinateSource: "unavailable",
      verificationState: "unverified",
    });
    expect(JSON.stringify(projection)).not.toMatch(/mapbox|119\.5731/i);
  });

  it("omits lodging coordinates from public projections", () => {
    const itinerary = revisionItinerary();
    itinerary.lodging.push({
      id: "lodging:private-cabin",
      name: "Crew cabin",
      area: "West Yosemite",
      checkInDate: "2026-09-12",
      checkOutDate: "2026-09-13",
      location: {
        name: "Private cabin",
        address: "10 Private Lane",
        latitude: 37.7,
        longitude: -119.6,
        timezone: "America/Los_Angeles",
        verificationStatus: "verified",
      },
      reservation: { status: "required", details: null, evidenceRefs: [] },
      cost: {
        status: "unknown",
        currency: "USD",
        amount: null,
        minAmount: null,
        maxAmount: null,
        retrievedAt: null,
        evidenceRef: null,
      },
      evidenceRefs: [],
      notes: [],
    });
    itinerary.days[0]!.travelSegments[0]!.toItemId = "lodging:private-cabin";
    const privateRoute = evidence({
      evidenceId: "evidence:mapbox:route:private-cabin",
      evidenceType: "route",
      provider: "mapbox",
      normalizedValue: {
        kind: "route",
        data: {
          geometry: {
            type: "LineString",
            coordinates: [
              [-119.5936, 37.7459],
              [-119.6, 37.7],
            ],
          },
        },
      },
      restrictions: { storage: "bounded", display: "Mapbox attribution" },
    });
    const projection = build({
      itinerary,
      privacyMode: "public_share",
      evidence: [
        evidence({
          evidenceId: "evidence:ridb:lodging:private-cabin",
          evidenceType: "lodging",
          provider: "ridb",
          entityBinding: {
            entityType: "lodging",
            canonicalId: "lodging:private-cabin",
            name: "Crew cabin",
          },
          locationBinding: {
            coordinates: { latitude: 37.7, longitude: -119.6 },
            boundingBox: null,
            timezone: "America/Los_Angeles",
            precision: "exact",
            privacy: "private",
          },
        }),
        privateRoute,
      ],
      evidenceBindings: [
        {
          evidenceId: privateRoute.evidenceId,
          targetItemId: "segment:walk-sunset",
        },
      ],
    });
    expect(
      projection.markers.find((marker) => marker.category === "lodging"),
    ).toMatchObject({
      coordinates: null,
      privacyLevel: "omitted",
    });
    expect(JSON.stringify(projection)).not.toContain("10 Private Lane");
    expect(projection).toMatchObject({
      roomId: "public-share",
      planVersionId: "public-version-1",
    });
    expect(JSON.stringify(projection)).not.toContain(roomId);
    expect(JSON.stringify(projection)).not.toContain(planVersionId);
    expect(projection.routeSegments[0]).toMatchObject({
      geometry: null,
      geometryState: "prohibited",
    });
  });

  it("renders only verified stored route geometry", () => {
    const route = evidence({
      evidenceId: "evidence:mapbox:route:walk-sunset",
      evidenceType: "route",
      provider: "mapbox",
      entityBinding: {
        entityType: "route_segment",
        canonicalId: "route:drive",
        name: "Driving route",
      },
      normalizedValue: {
        kind: "route",
        data: {
          geometry: {
            type: "LineString",
            coordinates: [
              [-119.5936, 37.7459],
              [-119.5731, 37.7303],
            ],
          },
        },
      },
      restrictions: { storage: "bounded", display: "Mapbox attribution" },
    });
    const projection = build({
      evidence: [route],
      evidenceBindings: [
        {
          evidenceId: route.evidenceId,
          targetItemId: "segment:walk-sunset",
        },
      ],
    });
    expect(projection.routeSegments[0]).toMatchObject({
      geometryState: "verified_geometry",
      verificationState: "verified",
      geometry: { type: "LineString" },
    });

    const withoutGeometry = build({ evidence: [] });
    expect(withoutGeometry.routeSegments[0]).toMatchObject({
      geometry: null,
      geometryState: "endpoint_only",
    });
  });

  it("keeps the exact immutable plan version identity", () => {
    expect(build()).toMatchObject({
      roomId,
      planVersionId,
      planVersion: 1,
      evidenceState: "historical",
    });
  });
});

describe("buildSpatialCompareAnnotations", () => {
  it("reports added, removed, moved, and route-changed spatial elements", () => {
    const base = build();
    const next = structuredClone(base);
    next.planVersionId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4";
    next.planVersion = 2;
    next.markers[1]!.coordinates = {
      latitude: 37.8,
      longitude: -119.4,
    };
    next.markers.push({
      ...next.markers[1]!,
      markerId: "marker:item:new",
      itemId: "item:new",
      label: "New stop",
    });

    expect(buildSpatialCompareAnnotations(base, next)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "moved",
          markerId: next.markers[1]!.markerId,
        }),
        expect.objectContaining({
          kind: "added",
          markerId: "marker:item:new",
        }),
      ]),
    );
  });
});
