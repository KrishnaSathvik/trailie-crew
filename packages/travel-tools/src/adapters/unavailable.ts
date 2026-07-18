import type { TravelEvidenceType, TravelEvidenceV1 } from "@trailie/schemas";

import type {
  TravelProviderAdapter,
  TravelProviderResponse,
} from "../contracts";
import { normalizeTravelProviderError } from "../errors";
import { makeTravelEvidence, makeTravelResponse } from "./shared";

type Configuration = Readonly<{
  providerId: string;
  reason: "provider_disabled" | "provider_unconfigured" | "emergency_disabled";
  now?: string;
}>;

export function createUnavailableTravelProviderAdapter(
  configuration: Configuration,
): TravelProviderAdapter {
  const attribution: TravelEvidenceV1["attribution"] = {
    label: "Live travel provider unavailable",
    url: null,
    required: false,
  };
  const unavailable = (
    evidenceType: TravelEvidenceType,
  ): TravelProviderResponse =>
    makeTravelResponse("unavailable", [
      makeTravelEvidence({
        provider: configuration.providerId,
        evidenceType,
        sourceName: "Live travel provider unavailable",
        sourceUrl: null,
        now: configuration.now ?? new Date().toISOString(),
        availabilityState: "unavailable",
        verificationState: "failed",
        confidence: "low",
        data: {},
        attribution,
        storage: "unknown",
        displayRestriction: "Do not present as verified live evidence",
        errorState: {
          code: configuration.reason,
          retryable: false,
          httpStatus: null,
        },
      }),
    ]);
  return {
    providerId: configuration.providerId,
    capabilities: new Set(),
    async searchPlaces() {
      return unavailable("place");
    },
    async geocode() {
      return unavailable("geocode");
    },
    async reverseGeocode() {
      return unavailable("geocode");
    },
    async getRoute() {
      return unavailable("route");
    },
    async getWeather() {
      return unavailable("weather_forecast");
    },
    async getDaylight() {
      return unavailable("sunrise");
    },
    async getPark() {
      return unavailable("park");
    },
    async getParkAlerts() {
      return unavailable("park_alert");
    },
    async getOperatingHours() {
      return unavailable("operating_hours");
    },
    async getReservationLinks() {
      return unavailable("reservation");
    },
    async healthCheck() {
      return unavailable("general_official_notice");
    },
    normalizeError: normalizeTravelProviderError,
    getAttribution: () => attribution,
  };
}
