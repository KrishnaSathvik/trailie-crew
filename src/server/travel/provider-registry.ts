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
  const disabled = new Set(configuration.environment.disabledProviders);
  if (
    (!disabled.has("mapbox") && !mapboxAccessToken) ||
    (!disabled.has("nps") && !npsApiKey) ||
    (!disabled.has("openweather") && !openWeatherApiKey) ||
    (!disabled.has("ridb") && !ridbApiKey)
  )
    throw new Error("travel_provider_configuration_incomplete");
  const unavailable = (providerId: string) =>
    createUnavailableTravelProviderAdapter({
      providerId,
      reason: "provider_disabled",
    });
  return {
    geocoding: disabled.has("mapbox")
      ? unavailable("mapbox")
      : createMapboxAdapter({
          accessToken: mapboxAccessToken!,
          geocodingStorageMode:
            configuration.environment.mapboxGeocodingStorageMode,
        }),
    weather: disabled.has("openweather")
      ? unavailable("openweather")
      : createOpenWeatherAdapter({ apiKey: openWeatherApiKey! }),
    parks: disabled.has("nps")
      ? unavailable("nps")
      : createNpsAdapter({ apiKey: npsApiKey! }),
    recreation: disabled.has("ridb")
      ? unavailable("ridb")
      : createRidbAdapter({ apiKey: ridbApiKey! }),
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
