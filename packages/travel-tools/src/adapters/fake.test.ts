import { describe, expect, it } from "vitest";

import { createFakeTravelProviderAdapter } from "./fake";

describe("deterministic TravelProviderAdapter", () => {
  it("returns stable normalized evidence without network access", async () => {
    const adapter = createFakeTravelProviderAdapter({
      scenario: "active_closure",
      now: "2026-07-17T20:00:00.000Z",
    });

    const place = await adapter.geocode({
      query: "Yosemite National Park",
      locale: "en-US",
    });
    const alerts = await adapter.getParkAlerts({
      parkCode: "yose",
      locale: "en-US",
    });
    const route = await adapter.getRoute({
      origin: { latitude: 37.8651, longitude: -119.5383 },
      destination: { latitude: 37.7459, longitude: -119.5936 },
      mode: "drive",
      locale: "en-US",
    });

    expect(place.evidence[0]).toMatchObject({
      provider: "trailie-fake-v1",
      evidenceType: "geocode",
      verificationState: "verified",
    });
    expect(alerts.evidence[0]).toMatchObject({
      evidenceType: "park_closure",
      normalizedValue: { data: { active: true, parkCode: "yose" } },
    });
    expect(route.evidence[0]).toMatchObject({
      evidenceType: "route",
      normalizedValue: {
        data: { distanceMeters: 104000, durationMinutes: 120 },
      },
    });
  });

  it("models disabled providers as unavailable rather than verified", async () => {
    const adapter = createFakeTravelProviderAdapter({
      scenario: "providers_disabled",
      now: "2026-07-17T20:00:00.000Z",
    });
    const weather = await adapter.getWeather({
      latitude: 37.8651,
      longitude: -119.5383,
      startDate: "2026-07-18",
      endDate: "2026-07-18",
      locale: "en-US",
    });

    expect(weather).toMatchObject({
      state: "unavailable",
      evidence: [
        {
          freshnessState: "unavailable",
          verificationState: "failed",
          availabilityState: "unavailable",
        },
      ],
    });
  });

  it("keeps unsupported transit explicit", async () => {
    const adapter = createFakeTravelProviderAdapter({
      scenario: "baseline",
    });
    const response = await adapter.getRoute({
      origin: { latitude: 1, longitude: 1 },
      destination: { latitude: 2, longitude: 2 },
      mode: "transit",
      locale: "en-US",
    });

    expect(response.state).toBe("unsupported");
    expect(response.evidence[0].verificationState).toBe("unverified");
  });
});
