import { describe, expect, it, vi } from "vitest";

import { createMapboxAdapter } from "./mapbox";

describe("Mapbox TravelProviderAdapter", () => {
  it("uses permanent geocoding and preserves ambiguous matches without selecting one", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          features: [
            {
              id: "place.one",
              geometry: { coordinates: [-119.5383, 37.8651] },
              properties: {
                mapbox_id: "mapbox.one",
                name: "Yosemite National Park",
                full_address: "Yosemite National Park, California",
                feature_type: "place",
                context: {
                  region: { name: "California", region_code: "CA" },
                  country: { name: "United States", country_code: "US" },
                },
              },
              bbox: [-119.9, 37.4, -118.9, 38.2],
            },
            {
              id: "place.two",
              geometry: { coordinates: [-88.1, 41.8] },
              properties: {
                mapbox_id: "mapbox.two",
                name: "Yosemite",
                feature_type: "place",
              },
            },
          ],
          attribution: "© Mapbox",
        }),
        { status: 200 },
      ),
    );
    const result = await createMapboxAdapter({
      accessToken: "test-token",
      fetcher,
      now: () => "2026-07-17T20:00:00.000Z",
    }).geocode({ query: "Yosemite", locale: "en-US" });

    const requested = new URL(String(fetcher.mock.calls[0][0]));
    expect(requested.searchParams.get("permanent")).toBe("true");
    expect(requested.searchParams.get("limit")).toBe("10");
    expect(result.state).toBe("ambiguous");
    expect(result.evidence).toHaveLength(2);
    expect(result.evidence[0]).toMatchObject({
      evidenceType: "geocode",
      provider: "mapbox",
      verificationState: "partially_verified",
      availabilityState: "ambiguous",
      normalizedValue: {
        data: {
          canonicalPlaceId: "mapbox.one",
          name: "Yosemite National Park",
          region: "California",
          country: "United States",
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("test-token");
  });

  it("resolves one exact canonical match while preserving unrelated alternatives", async () => {
    const result = await createMapboxAdapter({
      accessToken: "test-token",
      fetcher: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            features: [
              {
                id: "place.one",
                geometry: { coordinates: [-119.5383, 37.8651] },
                properties: {
                  mapbox_id: "mapbox.one",
                  name: "Yosemite National Park",
                  full_address: "Yosemite National Park, California",
                  feature_type: "place",
                  context: { region: { name: "California" } },
                },
              },
              {
                id: "place.two",
                geometry: { coordinates: [-88.1, 41.8] },
                properties: { name: "Yosemite", feature_type: "place" },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    }).geocode({
      query:
        "Yosemite National Park, California (July 22 through July 25, 2026)",
      locale: "en-US",
    });

    expect(result).toMatchObject({
      state: "available",
      evidence: [
        {
          sourceEntityId: "mapbox.one",
          availabilityState: "available",
          verificationState: "verified",
        },
      ],
    });
  });

  it("normalizes traffic-aware routing and an official no-route response", async () => {
    const successFetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "Ok",
          routes: [
            {
              distance: 104_123.4,
              duration: 7_245,
              geometry: "encoded-geometry",
              warnings: [],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const adapter = createMapboxAdapter({
      accessToken: "test-token",
      fetcher: successFetcher,
      now: () => "2026-07-17T20:00:00.000Z",
    });
    const result = await adapter.getRoute({
      origin: { latitude: 37.8651, longitude: -119.5383 },
      destination: { latitude: 37.7459, longitude: -119.5936 },
      mode: "drive",
      departAt: "2026-07-18T09:00:00-07:00",
      locale: "en-US",
    });
    expect(String(successFetcher.mock.calls[0][0])).toContain(
      "/mapbox/driving-traffic/",
    );
    expect(result.evidence[0]).toMatchObject({
      evidenceType: "route",
      verificationState: "verified",
      normalizedValue: {
        data: {
          distanceMeters: 104123,
          durationMinutes: 121,
          trafficBasis: "live_and_historical",
        },
      },
    });

    const unavailable = await createMapboxAdapter({
      accessToken: "test-token",
      fetcher: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: "NoRoute", routes: [] }), {
          status: 200,
        }),
      ),
    }).getRoute({
      origin: { latitude: 0, longitude: 0 },
      destination: { latitude: 1, longitude: 1 },
      mode: "drive",
      locale: "en-US",
    });
    expect(unavailable).toMatchObject({
      state: "unavailable",
      evidence: [
        {
          evidenceType: "route",
          availabilityState: "not_found",
          verificationState: "failed",
          normalizedValue: { data: {} },
        },
      ],
    });
  });

  it("does not guess unsupported transit routes", async () => {
    const fetcher = vi.fn();
    const result = await createMapboxAdapter({
      accessToken: "test-token",
      fetcher,
    }).getRoute({
      origin: { latitude: 1, longitude: 1 },
      destination: { latitude: 2, longitude: 2 },
      mode: "transit",
      locale: "en-US",
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.state).toBe("unsupported");
    expect(result.evidence[0].normalizedValue.data).toEqual({});
  });
});
