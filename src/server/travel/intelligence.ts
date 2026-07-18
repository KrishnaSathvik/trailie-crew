import "server-only";

import type { TravelEvidenceV1 } from "@trailie/schemas";
import type {
  TravelProviderAdapter,
  TravelProviderResponse,
} from "@trailie/travel-tools";

export type TravelProviderRegistry = Readonly<{
  geocoding: TravelProviderAdapter;
  weather: TravelProviderAdapter;
  parks: TravelProviderAdapter;
  recreation: TravelProviderAdapter;
}>;

type Input = Readonly<{
  destination: string;
  dates: readonly string[];
  locale: string;
  providers: TravelProviderRegistry;
  maximumCallsPerProvider: number;
  signal?: AbortSignal;
}>;

type DestinationState = "resolved" | "ambiguous" | "not_found" | "unavailable";

function destinationState(response: TravelProviderResponse): DestinationState {
  if (response.state === "available" || response.state === "partial")
    return "resolved";
  if (response.state === "ambiguous") return "ambiguous";
  if (response.state === "not_found") return "not_found";
  return "unavailable";
}

function uniqueEvidence(evidence: TravelEvidenceV1[]) {
  return [
    ...new Map(evidence.map((entry) => [entry.evidenceId, entry])).values(),
  ];
}

export async function collectDestinationTravelEvidence(input: Input) {
  const evidence: TravelEvidenceV1[] = [];
  const callsByProvider: Record<string, number> = {};
  const callsByCapability: Record<string, number> = {};
  const requestCache = new Map<string, Promise<TravelProviderResponse>>();

  function call(
    provider: TravelProviderAdapter,
    capability: string,
    identity: string,
    execute: () => Promise<TravelProviderResponse>,
  ) {
    const key = `${provider.providerId}:${capability}:${identity}`;
    const existing = requestCache.get(key);
    if (existing) return existing;
    const count = callsByProvider[provider.providerId] ?? 0;
    if (count >= input.maximumCallsPerProvider)
      return Promise.resolve<TravelProviderResponse>({
        state: "unavailable",
        evidence: [],
        warnings: ["provider_request_limit_reached"],
      });
    callsByProvider[provider.providerId] = count + 1;
    callsByCapability[capability] = (callsByCapability[capability] ?? 0) + 1;
    const request = execute();
    requestCache.set(key, request);
    return request;
  }

  const geocodePromise = call(
    input.providers.geocoding,
    "geocode",
    `${input.locale}:${input.destination}`,
    () =>
      input.providers.geocoding.geocode(
        { query: input.destination, locale: input.locale },
        input.signal,
      ),
  );
  const parkPromise = call(
    input.providers.parks,
    "park",
    `${input.locale}:${input.destination}`,
    () =>
      input.providers.parks.getPark(
        { query: input.destination, locale: input.locale },
        input.signal,
      ),
  );
  const recreationPromise = call(
    input.providers.recreation,
    "recreation",
    `${input.locale}:${input.destination}`,
    () =>
      input.providers.recreation.getPark(
        { query: input.destination, locale: input.locale },
        input.signal,
      ),
  );

  const [geocode, park, recreation] = await Promise.all([
    geocodePromise,
    parkPromise,
    recreationPromise,
  ]);
  evidence.push(...geocode.evidence, ...park.evidence, ...recreation.evidence);

  const parkRecord =
    park.state === "available"
      ? park.evidence.find(
          (entry) =>
            entry.evidenceType === "park" && entry.sourceEntityId !== null,
        )
      : undefined;
  if (parkRecord?.sourceEntityId) {
    const alerts = await call(
      input.providers.parks,
      "park_alerts",
      `${input.locale}:${parkRecord.sourceEntityId}`,
      () =>
        input.providers.parks.getParkAlerts(
          { parkCode: parkRecord.sourceEntityId!, locale: input.locale },
          input.signal,
        ),
    );
    evidence.push(...alerts.evidence);
  }

  const recreationRecord =
    recreation.state === "available"
      ? recreation.evidence.find(
          (entry) =>
            (entry.evidenceType === "park" || entry.evidenceType === "place") &&
            entry.sourceEntityId !== null,
        )
      : undefined;
  if (recreationRecord?.sourceEntityId) {
    const reservationLinks = await call(
      input.providers.recreation,
      "reservation_links",
      `${input.locale}:${recreationRecord.sourceEntityId}`,
      () =>
        input.providers.recreation.getReservationLinks(
          {
            providerEntityId: recreationRecord.sourceEntityId!,
            entityType: "park",
            locale: input.locale,
          },
          input.signal,
        ),
    );
    evidence.push(...reservationLinks.evidence);
  }

  const geocodeRecord =
    geocode.state === "available" && geocode.evidence.length === 1
      ? geocode.evidence[0]
      : undefined;
  const coordinates = geocodeRecord?.locationBinding?.coordinates;
  const dates = [
    ...new Set(
      input.dates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort(),
    ),
  ].slice(0, 8);
  if (coordinates && dates.length) {
    const weather = await call(
      input.providers.weather,
      "weather",
      `${coordinates.latitude}:${coordinates.longitude}:${dates[0]}:${dates.at(-1)}`,
      () =>
        input.providers.weather.getWeather(
          {
            ...coordinates,
            startDate: dates[0],
            endDate: dates.at(-1)!,
            locale: input.locale,
          },
          input.signal,
        ),
    );
    evidence.push(...weather.evidence);
    const daylight = await Promise.all(
      dates.map((date) =>
        call(
          input.providers.weather,
          "daylight",
          `${coordinates.latitude}:${coordinates.longitude}:${date}`,
          () =>
            input.providers.weather.getDaylight(
              { ...coordinates, date, locale: input.locale },
              input.signal,
            ),
        ),
      ),
    );
    evidence.push(...daylight.flatMap((response) => response.evidence));
  }

  return {
    destinationState: destinationState(geocode),
    evidence: uniqueEvidence(evidence),
    callsByProvider,
    callsByCapability,
  } as const;
}
