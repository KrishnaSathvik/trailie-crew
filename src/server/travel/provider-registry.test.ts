import { describe, expect, it } from "vitest";

import {
  createTravelProviderRegistry,
  withTravelProviderCache,
} from "./provider-registry";

describe("createTravelProviderRegistry", () => {
  it("creates only the four selected live providers", () => {
    const registry = createTravelProviderRegistry({
      mode: "live",
      environment: {
        enabled: true,
        mapboxAccessToken: "mapbox-test",
        mapboxGeocodingStorageMode: "temporary",
        npsApiKey: "nps-test",
        openWeatherApiKey: "weather-test",
        ridbApiKey: "ridb-test",
        disabledProviders: [],
        roomDailyLimit: 200,
        globalDailyLimit: 5000,
      },
    });

    expect(
      Object.values(registry).map((adapter) => adapter.providerId),
    ).toEqual(["mapbox", "openweather", "nps", "ridb"]);
  });

  it("preserves explicit unavailable evidence when globally disabled", async () => {
    const registry = createTravelProviderRegistry({
      mode: "live",
      environment: {
        enabled: false,
        mapboxAccessToken: null,
        mapboxGeocodingStorageMode: "disabled",
        npsApiKey: null,
        openWeatherApiKey: null,
        ridbApiKey: null,
        disabledProviders: [],
        roomDailyLimit: 200,
        globalDailyLimit: 5000,
      },
    });
    const result = await registry.parks.getPark({
      query: "Yosemite",
      locale: "en-US",
    });

    expect(result.evidence[0]).toMatchObject({
      provider: "nps",
      verificationState: "failed",
      errorState: { code: "provider_disabled" },
    });
  });

  it("wraps every selected provider with the same environment-isolated cache", () => {
    const registry = createTravelProviderRegistry({
      mode: "fake",
      environment: {
        enabled: true,
        mapboxAccessToken: null,
        mapboxGeocodingStorageMode: "disabled",
        npsApiKey: null,
        openWeatherApiKey: null,
        ridbApiKey: null,
        disabledProviders: [],
        roomDailyLimit: 200,
        globalDailyLimit: 5000,
      },
    });
    const cache = { get: async () => null, put: async () => undefined };
    const wrapped = withTravelProviderCache(registry, {
      cache,
      environment: "hosted-acceptance",
      bypass: true,
    });

    expect(Object.keys(wrapped)).toEqual([
      "geocoding",
      "weather",
      "parks",
      "recreation",
    ]);
    expect(wrapped.geocoding).not.toBe(registry.geocoding);
  });

  it("can disable one provider without disabling the others", async () => {
    const registry = createTravelProviderRegistry({
      mode: "live",
      environment: {
        enabled: true,
        mapboxAccessToken: "mapbox-test",
        mapboxGeocodingStorageMode: "temporary",
        npsApiKey: "nps-test",
        openWeatherApiKey: "weather-test",
        ridbApiKey: "ridb-test",
        disabledProviders: ["openweather"],
        roomDailyLimit: 200,
        globalDailyLimit: 5000,
      },
    });

    expect(registry.geocoding.providerId).toBe("mapbox");
    expect(registry.weather.providerId).toBe("openweather");
    await expect(
      registry.weather.getWeather({
        latitude: 37,
        longitude: -119,
        startDate: "2026-07-18",
        endDate: "2026-07-18",
        locale: "en-US",
      }),
    ).resolves.toMatchObject({
      state: "unavailable",
      evidence: [{ errorState: { code: "provider_disabled" } }],
    });
  });

  it("does not construct or require credentials for a disabled provider", async () => {
    const registry = createTravelProviderRegistry({
      mode: "live",
      environment: {
        enabled: true,
        mapboxAccessToken: null,
        mapboxGeocodingStorageMode: "temporary",
        npsApiKey: "nps-test",
        openWeatherApiKey: "weather-test",
        ridbApiKey: "ridb-test",
        disabledProviders: ["mapbox"],
        roomDailyLimit: 200,
        globalDailyLimit: 5000,
      },
    });

    expect(registry.parks.providerId).toBe("nps");
    expect(registry.weather.providerId).toBe("openweather");
    expect(registry.recreation.providerId).toBe("ridb");
    await expect(
      registry.geocoding.geocode({ query: "Yosemite", locale: "en-US" }),
    ).resolves.toMatchObject({
      state: "unavailable",
      evidence: [{ errorState: { code: "provider_disabled" } }],
    });
  });
});
