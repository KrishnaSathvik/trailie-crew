import { describe, expect, it } from "vitest";
import { itineraryMapProjectionV1Schema } from "./map-projection";

const projection = {
  schemaVersion: "1",
  roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
  planVersionId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
  planVersion: 1,
  destination: {
    label: "Yosemite National Park",
    coordinates: { latitude: 37.8651, longitude: -119.5383 },
    bounds: [-119.886, 37.494, -119.196, 38.186],
    coordinateSource: "official_nps",
  },
  viewport: {
    bounds: [-119.886, 37.494, -119.196, 38.186],
    source: "destination_bounds",
  },
  days: [
    {
      dayId: "day:2026-09-12",
      date: "2026-09-12",
      label: "Day 1",
      markerIds: ["marker:item:sunset"],
      routeSegmentIds: [],
    },
  ],
  markers: [
    {
      markerId: "marker:item:sunset",
      itemId: "item:sunset",
      dayId: "day:2026-09-12",
      sequence: 1,
      category: "activity",
      label: "Glacier Point sunset",
      shortLabel: "1",
      coordinates: { latitude: 37.7303, longitude: -119.5731 },
      coordinateSource: "official_nps",
      verificationState: "verified",
      freshnessState: "fresh",
      privacyLevel: "public",
      warningTypes: [],
      timeLabel: "5:30 PM",
      clusterGroup: "day:2026-09-12",
    },
  ],
  routeSegments: [],
  warnings: [],
  privacyMode: "member",
  evidenceState: "fresh",
  generatedAt: "2026-07-18T14:00:00.000Z",
} as const;

describe("ItineraryMapProjectionV1", () => {
  it("accepts a bounded exact-version projection", () => {
    expect(itineraryMapProjectionV1Schema.parse(projection)).toEqual(
      projection,
    );
  });

  it("rejects prohibited temporary provider coordinates", () => {
    expect(() =>
      itineraryMapProjectionV1Schema.parse({
        ...projection,
        markers: [
          {
            ...projection.markers[0],
            coordinateSource: "temporary_mapbox",
          },
        ],
      }),
    ).toThrow(/invalid option|temporary Mapbox/i);
  });

  it("requires verified route geometry to contain a bounded line", () => {
    expect(() =>
      itineraryMapProjectionV1Schema.parse({
        ...projection,
        routeSegments: [
          {
            segmentId: "segment:one",
            dayId: "day:2026-09-12",
            fromMarkerId: "marker:item:sunset",
            toMarkerId: "marker:item:sunset",
            mode: "walking",
            distanceMeters: 100,
            durationMinutes: 10,
            geometry: null,
            geometryState: "verified_geometry",
            verificationState: "verified",
            freshnessState: "fresh",
            warningTypes: [],
          },
        ],
      }),
    ).toThrow(/geometry/i);
  });

  it("does not allow exact private markers in a public projection", () => {
    expect(() =>
      itineraryMapProjectionV1Schema.parse({
        ...projection,
        privacyMode: "public_share",
        markers: [
          {
            ...projection.markers[0],
            privacyLevel: "exact_private",
          },
        ],
      }),
    ).toThrow(/public map/i);
  });
});
