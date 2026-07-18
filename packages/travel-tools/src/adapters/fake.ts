import type {
  TravelProviderAdapter,
  TravelProviderResponse,
} from "../contracts";
import { normalizeTravelProviderError } from "../errors";
import {
  makeTravelEvidence,
  makeTravelResponse,
  makeUnsupported,
} from "./shared";

export type FakeTravelAdapterScenario =
  "baseline" | "active_closure" | "providers_disabled";

type Configuration = Readonly<{
  scenario: FakeTravelAdapterScenario;
  now?: string;
}>;

const provider = "trailie-fake-v1";
const sourceName = "Deterministic Trailie fixture";
const sourceUrl = null;
const attribution = {
  label: "Deterministic Trailie fixture",
  url: null,
  required: false,
} as const;
const displayRestriction = "Test fixture; never present as live provider data";

function evidence(
  configuration: Configuration,
  evidenceType: Parameters<typeof makeTravelEvidence>[0]["evidenceType"],
  data: Record<string, unknown>,
  options: Partial<Parameters<typeof makeTravelEvidence>[0]> = {},
) {
  const retrievedAt = configuration.now ?? "2026-01-01T00:00:00.000Z";
  if (configuration.scenario === "providers_disabled") {
    return makeTravelEvidence({
      provider,
      evidenceType,
      sourceName,
      sourceUrl,
      now: retrievedAt,
      attribution,
      displayRestriction,
      availabilityState: "unavailable",
      verificationState: "failed",
      confidence: "low",
      data: {},
      errorState: {
        code: "provider_disabled",
        retryable: false,
        httpStatus: null,
      },
    });
  }
  return makeTravelEvidence({
    provider,
    evidenceType,
    sourceName,
    sourceUrl,
    now: retrievedAt,
    ttlSeconds: 3_600,
    attribution,
    displayRestriction,
    data,
    ...options,
  });
}

function response(
  configuration: Configuration,
  item: ReturnType<typeof evidence>,
): TravelProviderResponse {
  return makeTravelResponse(
    configuration.scenario === "providers_disabled"
      ? "unavailable"
      : item.availabilityState,
    [item],
  );
}

export function createFakeTravelProviderAdapter(
  configuration: Configuration,
): TravelProviderAdapter {
  const unsupported = (
    evidenceType: Parameters<typeof makeTravelEvidence>[0]["evidenceType"],
  ) =>
    makeUnsupported({
      provider,
      evidenceType,
      sourceName,
      sourceUrl,
      now: configuration.now ?? "2026-01-01T00:00:00.000Z",
      attribution,
      displayRestriction,
    });
  return {
    providerId: provider,
    capabilities: new Set([
      "place_search",
      "geocode",
      "reverse_geocode",
      "route",
      "weather",
      "daylight",
      "park",
      "park_alerts",
      "operating_hours",
      "reservation_links",
      "health",
    ]),
    async searchPlaces(input) {
      return response(
        configuration,
        evidence(
          configuration,
          "place",
          {
            canonicalPlaceId: "trailie-fake:yose",
            name: input.query,
            resolutionState: "resolved",
            latitude: 37.8651,
            longitude: -119.5383,
          },
          {
            entityBinding: {
              entityType: input.kinds[0] ?? "unknown",
              canonicalId: "trailie-fake:yose",
              name: input.query,
            },
          },
        ),
      );
    },
    async geocode(input) {
      return response(
        configuration,
        evidence(
          configuration,
          "geocode",
          {
            canonicalPlaceId: "trailie-fake:yose",
            name: input.query,
            resolutionState: "resolved",
            latitude: 37.8651,
            longitude: -119.5383,
            timezone: "America/Los_Angeles",
          },
          {
            locationBinding: {
              coordinates: {
                latitude: 37.8651,
                longitude: -119.5383,
              },
              boundingBox: null,
              timezone: "America/Los_Angeles",
              precision: "park",
              privacy: "public",
            },
          },
        ),
      );
    },
    async reverseGeocode() {
      return response(
        configuration,
        evidence(configuration, "geocode", {
          canonicalPlaceId: "trailie-fake:yose",
          name: "Yosemite National Park",
          resolutionState: "resolved",
        }),
      );
    },
    async getRoute(input) {
      if (input.mode === "transit") return unsupported("route");
      return response(
        configuration,
        evidence(configuration, "route", {
          mode: input.mode,
          distanceMeters: 104_000,
          durationMinutes: 120,
          trafficBasis: "fixture",
          warnings: [],
        }),
      );
    },
    async getWeather(input) {
      return response(
        configuration,
        evidence(
          configuration,
          "weather_forecast",
          {
            date: input.startDate,
            timezone: "America/Los_Angeles",
            dailyHighCelsius: 27,
            dailyLowCelsius: 12,
            precipitationProbability: 0.35,
            condition: "Partly cloudy",
            windMetersPerSecond: 3.5,
            severeWeather: false,
          },
          {
            validFrom: `${input.startDate}T00:00:00Z`,
            validUntil: `${input.endDate}T23:59:59Z`,
          },
        ),
      );
    },
    async getDaylight(input) {
      return response(
        configuration,
        evidence(
          configuration,
          "sunrise",
          {
            date: input.date,
            sunrise: `${input.date}T05:55:00-07:00`,
            sunset: `${input.date}T20:18:00-07:00`,
            civilTwilightBegin: null,
            civilTwilightEnd: null,
            timezone: "America/Los_Angeles",
          },
          {
            validFrom: `${input.date}T00:00:00Z`,
            validUntil: `${input.date}T23:59:59Z`,
          },
        ),
      );
    },
    async getPark(input) {
      return response(
        configuration,
        evidence(
          configuration,
          "park",
          {
            parkCode: input.parkCode ?? "yose",
            officialName: "Yosemite National Park",
            officialUrl: "https://www.nps.gov/yose/index.htm",
          },
          {
            sourceEntityId: input.parkCode ?? "yose",
            entityBinding: {
              entityType: "park",
              canonicalId: `nps:${input.parkCode ?? "yose"}`,
              name: "Yosemite National Park",
            },
          },
        ),
      );
    },
    async getParkAlerts(input) {
      const active = configuration.scenario === "active_closure";
      return response(
        configuration,
        evidence(
          configuration,
          active ? "park_closure" : "park_alert",
          {
            parkCode: input.parkCode,
            active,
            severity: active ? "closure" : "info",
            title: active ? "Fixture road closure" : "No fixture closures",
            affectedArea: active ? "Glacier Point Road" : null,
          },
          {
            entityBinding: {
              entityType: "park",
              canonicalId: `nps:${input.parkCode}`,
              name: input.parkCode,
            },
          },
        ),
      );
    },
    async getOperatingHours(input) {
      return response(
        configuration,
        evidence(configuration, "operating_hours", {
          providerEntityId: input.providerEntityId,
          date: input.date ?? null,
          hours: "Open 24 hours",
        }),
      );
    },
    async getReservationLinks(input) {
      return response(
        configuration,
        evidence(configuration, "reservation", {
          providerEntityId: input.providerEntityId,
          reservationType: input.entityType,
          requirement: "unknown",
          availabilityStatus: "unverified",
          officialUrl:
            "https://www.recreation.gov/search?q=Yosemite%20National%20Park",
          bookingCompleted: false,
        }),
      );
    },
    async healthCheck() {
      return response(
        configuration,
        evidence(configuration, "general_official_notice", {
          status: "ok",
        }),
      );
    },
    normalizeError: normalizeTravelProviderError,
    getAttribution: () => attribution,
  };
}
