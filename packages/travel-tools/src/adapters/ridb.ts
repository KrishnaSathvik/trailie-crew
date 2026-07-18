import { z } from "zod";

import type {
  ReservationLinksInput,
  TravelProviderAdapter,
} from "../contracts";
import {
  normalizeTravelProviderError,
  TravelProviderHttpError,
} from "../errors";
import { fetchTravelJson, type TravelFetcher } from "../http";
import {
  makeProviderFailure,
  makeTravelEvidence,
  makeTravelResponse,
  makeUnsupported,
} from "./shared";

const provider = "ridb";
const sourceName = "Recreation Information Database";
const sourceUrl = "https://ridb.recreation.gov/docs";
const attribution = {
  label: "Data source: ridb.recreation.gov",
  url: "https://ridb.recreation.gov/",
  required: false,
} as const;
const displayRestriction =
  "Identify RIDB/Recreation.gov as the data source; no endorsement implied";
const allowedHosts = new Set(["ridb.recreation.gov"]);

const recAreaSchema = z
  .object({
    RecAreaID: z.union([z.string(), z.number()]),
    RecAreaName: z.string(),
    RecAreaDescription: z.string().optional().default(""),
    RecAreaLatitude: z.number().nullable().optional(),
    RecAreaLongitude: z.number().nullable().optional(),
    RecAreaReservationURL: z.string().optional().default(""),
    RecAreaMapURL: z.string().optional().default(""),
  })
  .passthrough();

const linkSchema = z
  .object({
    LinkID: z.union([z.string(), z.number()]),
    EntityID: z.union([z.string(), z.number()]),
    LinkType: z.string().optional().default(""),
    Title: z.string().optional().default("Official link"),
    URL: z.string(),
  })
  .passthrough();

const recAreaResponseSchema = z.object({ RECDATA: z.array(recAreaSchema) });
const linkResponseSchema = z.object({ RECDATA: z.array(linkSchema) });

type Configuration = {
  apiKey: string;
  fetcher?: TravelFetcher;
  now?: () => string;
  timeoutMs?: number;
};

function now(configuration: Configuration) {
  return configuration.now?.() ?? new Date().toISOString();
}

function trustedOfficialUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      (parsed.hostname === "recreation.gov" ||
        parsed.hostname.endsWith(".recreation.gov") ||
        parsed.hostname.endsWith(".gov"))
    )
      return parsed.toString();
  } catch {
    // Invalid or untrusted outbound URLs are omitted.
  }
  return null;
}

async function getRidbJson(
  configuration: Configuration,
  path: string,
  parameters: Record<string, string>,
  signal?: AbortSignal,
) {
  const url = new URL(`https://ridb.recreation.gov/api/v1/${path}`);
  for (const [key, value] of Object.entries(parameters))
    url.searchParams.set(key, value);
  return fetchTravelJson(url, {
    allowedHosts,
    fetcher: configuration.fetcher,
    headers: { apikey: configuration.apiKey },
    signal,
    timeoutMs: configuration.timeoutMs,
  });
}

export function createRidbAdapter(
  configuration: Configuration,
): TravelProviderAdapter {
  const unsupported = (
    evidenceType:
      | "geocode"
      | "route"
      | "weather_forecast"
      | "sunrise"
      | "park_alert"
      | "operating_hours",
  ) =>
    makeUnsupported({
      provider,
      evidenceType,
      sourceName,
      sourceUrl,
      now: now(configuration),
      attribution,
      displayRestriction,
    });
  return {
    providerId: provider,
    capabilities: new Set([
      "place_search",
      "park",
      "reservation_links",
      "health",
    ]),
    async searchPlaces(input, signal) {
      try {
        if (!input.query.trim() || input.query.length > 256)
          throw new TravelProviderHttpError(400);
        const payload = recAreaResponseSchema.parse(
          await getRidbJson(
            configuration,
            "recareas",
            { query: input.query, limit: "10" },
            signal,
          ),
        );
        if (!payload.RECDATA.length) throw new TravelProviderHttpError(404);
        const retrievedAt = now(configuration);
        return makeTravelResponse(
          payload.RECDATA.length > 1 ? "ambiguous" : "available",
          payload.RECDATA.map((area) => {
            const id = String(area.RecAreaID);
            const reservationLink = trustedOfficialUrl(
              area.RecAreaReservationURL,
            );
            const hasCoordinates =
              typeof area.RecAreaLatitude === "number" &&
              typeof area.RecAreaLongitude === "number";
            return makeTravelEvidence({
              provider,
              evidenceType: "place",
              sourceName,
              sourceUrl: reservationLink ?? sourceUrl,
              sourceEntityId: id,
              now: retrievedAt,
              ttlSeconds: 21_600,
              verificationState:
                payload.RECDATA.length > 1 ? "partially_verified" : "verified",
              confidence: payload.RECDATA.length > 1 ? "medium" : "high",
              availabilityState:
                payload.RECDATA.length > 1 ? "ambiguous" : "available",
              locationBinding: hasCoordinates
                ? {
                    coordinates: {
                      latitude: area.RecAreaLatitude!,
                      longitude: area.RecAreaLongitude!,
                    },
                    boundingBox: null,
                    timezone: null,
                    precision: "park",
                    privacy: "public",
                  }
                : null,
              entityBinding: {
                entityType: "park",
                canonicalId: `ridb:recarea:${id}`,
                name: area.RecAreaName,
              },
              data: {
                canonicalPlaceId: `ridb:recarea:${id}`,
                name: area.RecAreaName,
                description: area.RecAreaDescription.slice(0, 4_000),
                latitude: area.RecAreaLatitude ?? null,
                longitude: area.RecAreaLongitude ?? null,
                reservationLink,
                availabilityStatus: "unverified",
                resolutionState:
                  payload.RECDATA.length > 1 ? "ambiguous" : "resolved",
              },
              attribution,
              storage: "permanent",
              displayRestriction,
            });
          }),
        );
      } catch (error) {
        return makeProviderFailure({
          provider,
          evidenceType: "place",
          sourceName,
          sourceUrl,
          now: now(configuration),
          attribution,
          displayRestriction,
          error,
        });
      }
    },
    async geocode() {
      return unsupported("geocode");
    },
    async reverseGeocode() {
      return unsupported("geocode");
    },
    async getRoute() {
      return unsupported("route");
    },
    async getWeather() {
      return unsupported("weather_forecast");
    },
    async getDaylight() {
      return unsupported("sunrise");
    },
    async getPark(input, signal) {
      return this.searchPlaces(
        {
          query: input.query ?? input.parkCode ?? "",
          kinds: ["park"],
          locale: input.locale,
        },
        signal,
      );
    },
    async getParkAlerts() {
      return unsupported("park_alert");
    },
    async getOperatingHours() {
      return unsupported("operating_hours");
    },
    async getReservationLinks(
      input: ReservationLinksInput,
      signal?: AbortSignal,
    ) {
      try {
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(input.providerEntityId))
          throw new TravelProviderHttpError(400);
        const parent = input.entityType === "park" ? "recareas" : "facilities";
        const payload = linkResponseSchema.parse(
          await getRidbJson(
            configuration,
            `${parent}/${input.providerEntityId}/links`,
            { limit: "50" },
            signal,
          ),
        );
        const retrievedAt = now(configuration);
        const evidence = payload.RECDATA.flatMap((link) => {
          const url = trustedOfficialUrl(link.URL);
          if (!url) return [];
          return [
            makeTravelEvidence({
              provider,
              evidenceType: "reservation",
              sourceName,
              sourceUrl: url,
              sourceEntityId: String(link.LinkID),
              now: retrievedAt,
              ttlSeconds: 21_600,
              entityBinding: {
                entityType:
                  input.entityType === "campground"
                    ? "campground"
                    : input.entityType === "permit"
                      ? "permit"
                      : input.entityType === "tour"
                        ? "tour"
                        : input.entityType === "park"
                          ? "park"
                          : "activity",
                canonicalId: `ridb:${input.entityType}:${input.providerEntityId}`,
                name: link.Title || "Official reservation link",
              },
              data: {
                linkType: link.LinkType,
                title: link.Title,
                url,
                requirement: "unknown",
                dateApplicability: input.date ?? null,
                availabilityStatus: "unverified",
                bookingCompleted: false,
              },
              attribution,
              storage: "permanent",
              displayRestriction,
            }),
          ];
        });
        return makeTravelResponse(
          evidence.length ? "available" : "unavailable",
          evidence,
        );
      } catch (error) {
        return makeProviderFailure({
          provider,
          evidenceType: "reservation",
          sourceName,
          sourceUrl,
          now: now(configuration),
          attribution,
          displayRestriction,
          error,
        });
      }
    },
    async healthCheck(signal) {
      return this.searchPlaces(
        { query: "Yosemite", kinds: ["park"], locale: "en-US" },
        signal,
      );
    },
    normalizeError: normalizeTravelProviderError,
    getAttribution() {
      return attribution;
    },
  };
}
