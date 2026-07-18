import { describe, expect, it } from "vitest";

import { buildTravelCacheKey, travelCachePolicyFor } from "./cache-policy";

describe("travel cache policy", () => {
  it("builds deterministic environment-isolated keys without private query or credentials", () => {
    const input = {
      environment: "preview",
      provider: "mapbox",
      capability: "geocode",
      schemaVersion: "1",
      normalizedQuery: "Private lodging address",
      locale: "en-US",
      accessToken: "credential-must-never-be-hashed",
    } as const;
    const key = buildTravelCacheKey(input);
    expect(key).toBe(buildTravelCacheKey({ ...input }));
    expect(key).not.toContain("Private lodging address");
    expect(key).not.toContain("credential-must-never-be-hashed");
    expect(key).not.toBe(
      buildTravelCacheKey({ ...input, environment: "production" }),
    );
  });

  it("varies by route mode, coordinates, and date window", () => {
    const base = {
      environment: "preview",
      provider: "mapbox",
      capability: "route",
      schemaVersion: "1",
      coordinates: [
        { latitude: 37.8, longitude: -119.5 },
        { latitude: 37.7, longitude: -119.6 },
      ],
      mode: "drive",
      dateWindow: {
        start: "2026-07-20T12:00:00.000Z",
        end: "2026-07-20T13:00:00.000Z",
      },
    } as const;
    expect(buildTravelCacheKey(base)).not.toBe(
      buildTravelCacheKey({ ...base, mode: "walk" }),
    );
    expect(buildTravelCacheKey(base)).not.toBe(
      buildTravelCacheKey({
        ...base,
        coordinates: [
          base.coordinates[0],
          { latitude: 37.71, longitude: -119.6 },
        ],
      }),
    );
  });

  it("defines documented positive and shorter negative TTLs", () => {
    expect(travelCachePolicyFor("geocode")).toMatchObject({
      ttlSeconds: 2_592_000,
      negativeTtlSeconds: 120,
      staleWhileRevalidate: true,
    });
    expect(travelCachePolicyFor("park_alerts")).toMatchObject({
      ttlSeconds: 600,
      staleWhileRevalidate: false,
    });
    expect(travelCachePolicyFor("weather")).toMatchObject({
      ttlSeconds: 600,
      staleWhileRevalidate: false,
    });
    expect(travelCachePolicyFor("daylight")).toMatchObject({
      ttlSeconds: 31_536_000,
    });
  });
});
