import {
  travelProviderResponseSchema,
  type TravelCapability,
  type TravelProviderAdapter,
  type TravelProviderResponse,
} from "./contracts";
import { buildTravelCacheKey, travelCachePolicyFor } from "./cache-policy";

export type TravelProviderCacheEntry = Readonly<{
  response: TravelProviderResponse;
  expiresAt: string;
  staleUntil: string | null;
  negative: boolean;
}>;

export interface TravelProviderCache {
  get(key: string): Promise<TravelProviderCacheEntry | null>;
  put(key: string, entry: TravelProviderCacheEntry): Promise<void>;
}

type Configuration = Readonly<{
  adapter: TravelProviderAdapter;
  cache: TravelProviderCache;
  environment: string;
  bypass?: boolean;
  now?: () => string;
  authorizeRequest?: (event: TravelProviderOperationEvent) => Promise<boolean>;
  recordRequest?: (event: TravelProviderOperationEvent) => Promise<void>;
}>;

export type TravelProviderOperationEvent = Readonly<{
  provider: string;
  capability: TravelCapability;
  requestKey: string;
  cacheStatus: "miss" | "hit" | "stale_hit" | "negative_hit" | "bypass";
  status: "running" | "succeeded" | "failed" | "unavailable";
  durationMs: number;
  errorClass: string | null;
}>;

function addSeconds(value: string, seconds: number) {
  return new Date(new Date(value).getTime() + seconds * 1_000).toISOString();
}

function withCacheState(
  response: TravelProviderResponse,
  state: "hit" | "stale_hit",
) {
  return travelProviderResponseSchema.parse({
    ...response,
    evidence: response.evidence.map((entry) => ({
      ...entry,
      cacheStatus: state,
      freshnessState:
        state === "stale_hit"
          ? "stale"
          : entry.freshnessState === "fresh"
            ? "cached_fresh"
            : entry.freshnessState,
    })),
  });
}

const capabilityEvidenceType = {
  place_search: "place",
  geocode: "geocode",
  reverse_geocode: "geocode",
  route: "route",
  weather: "weather_forecast",
  daylight: "sunrise",
  park: "park",
  park_alerts: "park_alert",
  operating_hours: "operating_hours",
  reservation_links: "reservation",
  health: "general_official_notice",
} as const;

function providerLimitResponse(
  provider: string,
  capability: TravelCapability,
  now: string,
) {
  const evidenceType = capabilityEvidenceType[capability];
  return travelProviderResponseSchema.parse({
    state: "unavailable",
    warnings: ["provider_limit_reached"],
    evidence: [
      {
        schemaVersion: "1",
        evidenceId: `evidence:${provider}:${evidenceType}:provider_limit_reached`,
        evidenceType,
        provider,
        sourceName: "Live travel provider unavailable",
        sourceUrl: null,
        sourceEntityId: null,
        retrievedAt: now,
        observedAt: null,
        validFrom: null,
        validUntil: null,
        freshnessState: "unavailable",
        verificationState: "failed",
        confidence: "low",
        availabilityState: "unavailable",
        locationBinding: null,
        entityBinding: null,
        normalizedValue: { kind: evidenceType, data: {} },
        providerMetadata: {},
        attribution: {
          label: "Live travel provider unavailable",
          url: null,
          required: false,
        },
        restrictions: {
          storage: "unknown",
          display: "Do not present as verified live evidence",
        },
        cacheStatus: "bypass",
        requestId: null,
        errorState: {
          code: "provider_limit_reached",
          retryable: true,
          httpStatus: null,
        },
      },
    ],
  });
}

export function createCachedTravelProviderAdapter(
  configuration: Configuration,
): TravelProviderAdapter {
  async function run(
    capability: TravelCapability,
    input: Record<string, unknown>,
    execute: () => Promise<TravelProviderResponse>,
  ) {
    const startedAt = Date.now();
    const record = async (event: TravelProviderOperationEvent) => {
      try {
        await configuration.recordRequest?.(event);
      } catch {
        // Operational evidence failure must not turn a provider result into a user failure.
      }
    };
    if (configuration.bypass) {
      const response = await execute();
      await record({
        provider: configuration.adapter.providerId,
        capability,
        requestKey: "cache_bypass_request",
        cacheStatus: "bypass",
        status:
          response.state === "available" || response.state === "partial"
            ? "succeeded"
            : "unavailable",
        durationMs: Date.now() - startedAt,
        errorClass: response.evidence[0]?.errorState?.code ?? null,
      });
      return travelProviderResponseSchema.parse({
        ...response,
        evidence: response.evidence.map((entry) => ({
          ...entry,
          cacheStatus: "bypass",
        })),
      });
    }
    const key = buildTravelCacheKey({
      environment: configuration.environment,
      provider: configuration.adapter.providerId,
      capability,
      schemaVersion: "2",
      ...input,
    });
    const policy = travelCachePolicyFor(capability);
    const now = configuration.now?.() ?? new Date().toISOString();
    const cached = await configuration.cache.get(key);
    if (cached && cached.expiresAt > now) {
      await record({
        provider: configuration.adapter.providerId,
        capability,
        requestKey: key,
        cacheStatus: cached.negative ? "negative_hit" : "hit",
        status: cached.negative ? "unavailable" : "succeeded",
        durationMs: Date.now() - startedAt,
        errorClass: cached.response.evidence[0]?.errorState?.code ?? null,
      });
      return withCacheState(cached.response, "hit");
    }
    if (
      cached &&
      policy.staleWhileRevalidate &&
      cached.staleUntil !== null &&
      cached.staleUntil > now
    ) {
      await record({
        provider: configuration.adapter.providerId,
        capability,
        requestKey: key,
        cacheStatus: "stale_hit",
        status: "succeeded",
        durationMs: Date.now() - startedAt,
        errorClass: null,
      });
      return withCacheState(cached.response, "stale_hit");
    }
    if (
      configuration.authorizeRequest &&
      !(await configuration.authorizeRequest({
        provider: configuration.adapter.providerId,
        capability,
        requestKey: key,
        cacheStatus: "miss",
        status: "running",
        durationMs: 0,
        errorClass: null,
      }))
    ) {
      const limited = providerLimitResponse(
        configuration.adapter.providerId,
        capability,
        now,
      );
      await record({
        provider: configuration.adapter.providerId,
        capability,
        requestKey: key,
        cacheStatus: "miss",
        status: "unavailable",
        durationMs: Date.now() - startedAt,
        errorClass: "provider_limit_reached",
      });
      return limited;
    }
    const response = await execute();
    const negative =
      response.state !== "available" && response.state !== "partial";
    const ttl = negative ? policy.negativeTtlSeconds : policy.ttlSeconds;
    const expiresAt = addSeconds(now, ttl);
    const storageProhibited = response.evidence.some(
      (entry) => entry.restrictions.storage === "prohibited",
    );
    if (!storageProhibited)
      await configuration.cache.put(key, {
        response,
        expiresAt,
        staleUntil: policy.staleWhileRevalidate
          ? addSeconds(expiresAt, Math.min(policy.ttlSeconds, 86_400))
          : null,
        negative,
      });
    await record({
      provider: configuration.adapter.providerId,
      capability,
      requestKey: key,
      cacheStatus: "miss",
      status: negative ? "unavailable" : "succeeded",
      durationMs: Date.now() - startedAt,
      errorClass: response.evidence[0]?.errorState?.code ?? null,
    });
    return response;
  }

  const adapter = configuration.adapter;
  return {
    providerId: adapter.providerId,
    capabilities: adapter.capabilities,
    searchPlaces: (input, signal) =>
      run("place_search", { input }, () => adapter.searchPlaces(input, signal)),
    geocode: (input, signal) =>
      run("geocode", { input }, () => adapter.geocode(input, signal)),
    reverseGeocode: (input, signal) =>
      run("reverse_geocode", { input }, () =>
        adapter.reverseGeocode(input, signal),
      ),
    getRoute: (input, signal) =>
      run("route", { input }, () => adapter.getRoute(input, signal)),
    getWeather: (input, signal) =>
      run("weather", { input }, () => adapter.getWeather(input, signal)),
    getDaylight: (input, signal) =>
      run("daylight", { input }, () => adapter.getDaylight(input, signal)),
    getPark: (input, signal) =>
      run("park", { input }, () => adapter.getPark(input, signal)),
    getParkAlerts: (input, signal) =>
      run("park_alerts", { input }, () => adapter.getParkAlerts(input, signal)),
    getOperatingHours: (input, signal) =>
      run("operating_hours", { input }, () =>
        adapter.getOperatingHours(input, signal),
      ),
    getReservationLinks: (input, signal) =>
      run("reservation_links", { input }, () =>
        adapter.getReservationLinks(input, signal),
      ),
    healthCheck: (signal) =>
      run("health", {}, () => adapter.healthCheck(signal)),
    normalizeError: (error) => adapter.normalizeError(error),
    getAttribution: () => adapter.getAttribution(),
  };
}
