import "server-only";

import {
  createFakeTravelProviderAdapter,
  createCachedTravelProviderAdapter,
  createMapboxAdapter,
  createNpsAdapter,
  createOpenWeatherAdapter,
  createRidbAdapter,
  createUnavailableTravelProviderAdapter,
  type FakeTravelAdapterScenario,
  type TravelProviderCache,
  type TravelProviderOperationEvent,
} from "@trailie/travel-tools";

import type { parseTravelProviderEnv } from "@/server/env";
import type { TravelProviderRegistry } from "./intelligence";

type Environment = ReturnType<typeof parseTravelProviderEnv>;

type Configuration =
  | Readonly<{
      mode: "live";
      environment: Environment;
    }>
  | Readonly<{
      mode: "fake";
      environment: Environment;
      scenario?: FakeTravelAdapterScenario;
      now?: string;
    }>;

export function createTravelProviderRegistry(
  configuration: Configuration,
): TravelProviderRegistry {
  if (configuration.mode === "fake") {
    const fixture = createFakeTravelProviderAdapter({
      scenario: configuration.scenario ?? "baseline",
      ...(configuration.now ? { now: configuration.now } : {}),
    });
    return {
      geocoding: fixture,
      weather: fixture,
      parks: fixture,
      recreation: fixture,
    };
  }
  if (!configuration.environment.enabled) {
    const unavailable = (providerId: string) =>
      createUnavailableTravelProviderAdapter({
        providerId,
        reason: "provider_disabled",
      });
    return {
      geocoding: unavailable("mapbox"),
      weather: unavailable("openweather"),
      parks: unavailable("nps"),
      recreation: unavailable("ridb"),
    };
  }
  const { mapboxAccessToken, npsApiKey, openWeatherApiKey, ridbApiKey } =
    configuration.environment;
  if (!mapboxAccessToken || !npsApiKey || !openWeatherApiKey || !ridbApiKey)
    throw new Error("travel_provider_configuration_incomplete");
  const registry: TravelProviderRegistry = {
    geocoding: createMapboxAdapter({
      accessToken: mapboxAccessToken,
      geocodingStorageMode:
        configuration.environment.mapboxGeocodingStorageMode,
    }),
    weather: createOpenWeatherAdapter({ apiKey: openWeatherApiKey }),
    parks: createNpsAdapter({ apiKey: npsApiKey }),
    recreation: createRidbAdapter({ apiKey: ridbApiKey }),
  };
  const disabled = new Set(configuration.environment.disabledProviders);
  return {
    geocoding: disabled.has("mapbox")
      ? createUnavailableTravelProviderAdapter({
          providerId: "mapbox",
          reason: "provider_disabled",
        })
      : registry.geocoding,
    weather: disabled.has("openweather")
      ? createUnavailableTravelProviderAdapter({
          providerId: "openweather",
          reason: "provider_disabled",
        })
      : registry.weather,
    parks: disabled.has("nps")
      ? createUnavailableTravelProviderAdapter({
          providerId: "nps",
          reason: "provider_disabled",
        })
      : registry.parks,
    recreation: disabled.has("ridb")
      ? createUnavailableTravelProviderAdapter({
          providerId: "ridb",
          reason: "provider_disabled",
        })
      : registry.recreation,
  };
}

export function withTravelProviderCache(
  registry: TravelProviderRegistry,
  configuration: {
    cache: TravelProviderCache;
    environment: string;
    bypass?: boolean;
    authorizeRequest?: (
      event: TravelProviderOperationEvent,
    ) => Promise<boolean>;
    recordRequest?: (event: TravelProviderOperationEvent) => Promise<void>;
  },
): TravelProviderRegistry {
  const wrap = (adapter: TravelProviderRegistry["geocoding"]) =>
    createCachedTravelProviderAdapter({
      adapter,
      cache: configuration.cache,
      environment: configuration.environment,
      bypass: configuration.bypass,
      authorizeRequest: configuration.authorizeRequest,
      recordRequest: configuration.recordRequest,
    });
  return {
    geocoding: wrap(registry.geocoding),
    weather: wrap(registry.weather),
    parks: wrap(registry.parks),
    recreation: wrap(registry.recreation),
  };
}
