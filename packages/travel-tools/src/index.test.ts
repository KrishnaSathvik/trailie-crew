import { describe, expect, it, vi } from "vitest";
import {
  createFakeTravelProvider,
  createMapboxTravelProvider,
  fingerprintTravelRequest,
  isTravelEvidenceFresh,
} from "./index";

describe("travel tool contracts", () => {
  it("returns normalized source-attributed geocoding and routing evidence", async () => {
    const provider = createFakeTravelProvider({ scenario: "valid" });
    const place = await provider.geocode({ query: "Yosemite Valley" });
    expect(place).toMatchObject({
      status: "verified",
      provider: "trailie-fake",
      toolName: "geocode",
      data: { latitude: 37.7459, longitude: -119.5936 },
    });
    const route = await provider.route({
      origin: { latitude: 37.7459, longitude: -119.5936 },
      destination: { latitude: 37.8651, longitude: -119.5383 },
      mode: "drive",
    });
    expect(route).toMatchObject({
      status: "verified",
      data: { durationMinutes: 120, distanceMeters: 104000 },
    });
  });

  it.each([
    ["impossible_route", "route", "verified"],
    ["closed_location", "placeDetails", "verified"],
    ["missing_coordinates", "geocode", "unavailable"],
    ["reservation_required", "placeDetails", "verified"],
    ["stale_evidence", "route", "stale"],
    ["provider_failure", "route", "failed"],
    ["multi_day", "destinationFacts", "verified"],
  ] as const)(
    "supports deterministic %s fixtures",
    async (scenario, tool, status) => {
      const provider = createFakeTravelProvider({ scenario });
      const result =
        tool === "route"
          ? await provider.route({
              origin: { latitude: 1, longitude: 1 },
              destination: { latitude: 2, longitude: 2 },
              mode: "drive",
            })
          : tool === "geocode"
            ? await provider.geocode({ query: "fixture" })
            : tool === "placeDetails"
              ? await provider.placeDetails({
                  name: "fixture",
                  coordinates: { latitude: 1, longitude: 1 },
                })
              : await provider.destinationFacts({ destination: "fixture" });
      expect(result.status).toBe(status);
    },
  );

  it("keeps unknown cost unknown and exposes reservation and closure facts honestly", async () => {
    const reservation = await createFakeTravelProvider({
      scenario: "reservation_required",
    }).placeDetails({
      name: "Dinner",
      coordinates: { latitude: 1, longitude: 1 },
    });
    expect(reservation.data).toMatchObject({
      reservationStatus: "required",
      costStatus: "unknown",
    });
    const closed = await createFakeTravelProvider({
      scenario: "closed_location",
    }).placeDetails({
      name: "Museum",
      coordinates: { latitude: 1, longitude: 1 },
    });
    expect(closed.data?.openStatus).toBe("closed");
  });

  it("uses canonical fingerprints and freshness without leaking credentials", async () => {
    expect(
      fingerprintTravelRequest("route", { b: 2, apiKey: "secret", a: 1 }),
    ).toBe(fingerprintTravelRequest("route", { a: 1, b: 2 }));
    const evidence = await createFakeTravelProvider({
      scenario: "valid",
      now: "2026-07-13T18:00:00.000Z",
    }).route({
      origin: { latitude: 1, longitude: 1 },
      destination: { latitude: 2, longitude: 2 },
      mode: "drive",
    });
    expect(isTravelEvidenceFresh(evidence, "2026-07-13T19:00:00.000Z")).toBe(
      true,
    );
    expect(JSON.stringify(evidence)).not.toContain("secret");
  });
});

describe("Mapbox travel provider", () => {
  it("normalizes geocoding and never exposes its access token", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          features: [
            {
              geometry: { coordinates: [-119.59, 37.74] },
              properties: { full_address: "Yosemite Valley, California" },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const provider = createMapboxTravelProvider({
      accessToken: "secret-mapbox-token",
      fetcher,
      now: () => "2026-07-13T18:00:00.000Z",
    });
    const result = await provider.geocode({ query: "Yosemite Valley" });
    expect(result.status).toBe("verified");
    expect(result.data?.latitude).toBe(37.74);
    expect(JSON.stringify(result)).not.toContain("secret-mapbox-token");
  });

  it("normalizes route failures and unsupported provider gaps", async () => {
    const provider = createMapboxTravelProvider({
      accessToken: "token",
      fetcher: vi.fn().mockResolvedValue(new Response("{}", { status: 503 })),
    });
    const route = await provider.route({
      origin: { latitude: 37, longitude: -119 },
      destination: { latitude: 38, longitude: -120 },
      mode: "drive",
    });
    expect(route.status).toBe("failed");
    expect(
      (
        await provider.placeDetails({
          name: "Place",
          coordinates: { latitude: 37, longitude: -119 },
        })
      ).status,
    ).toBe("unavailable");
  });
});
