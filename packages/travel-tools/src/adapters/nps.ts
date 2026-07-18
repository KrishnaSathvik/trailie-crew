import { z } from "zod";

import type {
  ParkAlertsInput,
  ParkInput,
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

const provider = "nps";
const sourceName = "National Park Service";
const apiSource =
  "https://www.nps.gov/subjects/developer/api-documentation.htm";
const attribution = {
  label: "National Park Service",
  url: "https://www.nps.gov/",
  required: true,
} as const;
const displayRestriction = "Official NPS source attribution required";
const allowedHosts = new Set(["developer.nps.gov"]);

const parkSchema = z
  .object({
    id: z.string(),
    parkCode: z.string(),
    fullName: z.string(),
    description: z.string().optional().default(""),
    url: z.string().optional().default(""),
    latitude: z.string().optional().default(""),
    longitude: z.string().optional().default(""),
    states: z.string().optional().default(""),
    contacts: z.unknown().optional(),
    operatingHours: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .default([]),
    entranceFees: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .default([]),
    accessibility: z.record(z.string(), z.unknown()).optional().default({}),
    directionsInfo: z.string().optional().default(""),
    weatherInfo: z.string().optional().default(""),
  })
  .passthrough();

const alertSchema = z
  .object({
    id: z.string(),
    parkCode: z.string(),
    title: z.string(),
    description: z.string().optional().default(""),
    category: z.string().optional().default("Information"),
    url: z.string().optional().default(""),
    lastIndexedDate: z.string().optional(),
  })
  .passthrough();

const responseSchema = <T extends z.ZodType>(item: T) =>
  z.object({ data: z.array(item) });

type Configuration = {
  apiKey: string;
  fetcher?: TravelFetcher;
  now?: () => string;
  timeoutMs?: number;
};

function now(configuration: Configuration) {
  return configuration.now?.() ?? new Date().toISOString();
}

function safeNpsUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol === "https:" &&
      (parsed.hostname === "nps.gov" || parsed.hostname.endsWith(".nps.gov"))
    )
      return parsed.toString();
  } catch {
    // Fall through to the documented API source.
  }
  return apiSource;
}

async function getNpsJson(
  configuration: Configuration,
  path: string,
  parameters: Record<string, string>,
  signal?: AbortSignal,
) {
  const url = new URL(`https://developer.nps.gov/api/v1/${path}`);
  for (const [key, value] of Object.entries(parameters))
    url.searchParams.set(key, value);
  return fetchTravelJson(url, {
    allowedHosts,
    fetcher: configuration.fetcher,
    headers: { "X-Api-Key": configuration.apiKey },
    signal,
    timeoutMs: configuration.timeoutMs,
  });
}

function locationForPark(park: z.infer<typeof parkSchema>) {
  const latitude = Number(park.latitude);
  const longitude = Number(park.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? {
        coordinates: { latitude, longitude },
        boundingBox: null,
        timezone: null,
        precision: "park" as const,
        privacy: "public" as const,
      }
    : null;
}

function normalizeParkName(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function selectExactParkMatch(
  parks: Array<z.infer<typeof parkSchema>>,
  query?: string,
) {
  if (!query) return parks;
  const officialName = normalizeParkName(query.split(",")[0]);
  const exact = parks.filter(
    (park) => normalizeParkName(park.fullName) === officialName,
  );
  if (exact.length === 1) return exact;
  const normalizedQuery = normalizeParkName(query);
  const embeddedOfficialName = parks.filter((park) => {
    const name = normalizeParkName(park.fullName);
    return (
      name.split(/\s+/u).length >= 2 &&
      ` ${normalizedQuery} `.includes(` ${name} `)
    );
  });
  return embeddedOfficialName.length === 1 ? embeddedOfficialName : parks;
}

function parkEvidence(
  park: z.infer<typeof parkSchema>,
  configuration: Configuration,
) {
  const retrievedAt = now(configuration);
  const officialUrl = safeNpsUrl(park.url);
  const entityBinding = {
    entityType: "park" as const,
    canonicalId: `nps:${park.parkCode}`,
    name: park.fullName,
  };
  const common = {
    provider,
    sourceName,
    sourceUrl: officialUrl,
    sourceEntityId: park.parkCode,
    now: retrievedAt,
    ttlSeconds: 21_600,
    locationBinding: locationForPark(park),
    entityBinding,
    attribution,
    storage: "permanent" as const,
    displayRestriction,
  };
  const evidence = [
    makeTravelEvidence({
      ...common,
      evidenceType: "park",
      data: {
        parkCode: park.parkCode,
        officialName: park.fullName,
        description: park.description.slice(0, 4_000),
        officialUrl,
        states: park.states
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        contacts: park.contacts ?? {},
        directions: park.directionsInfo.slice(0, 2_000),
        weatherSummary: park.weatherInfo.slice(0, 2_000),
      },
    }),
  ];
  if (park.operatingHours.length)
    evidence.push(
      makeTravelEvidence({
        ...common,
        evidenceType: "operating_hours",
        data: {
          scopes: park.operatingHours.slice(0, 50),
          appliesToWholePark: false,
          dateBound: false,
        },
      }),
    );
  if (park.entranceFees.length)
    evidence.push(
      makeTravelEvidence({
        ...common,
        evidenceType: "fee",
        data: {
          fees: park.entranceFees.slice(0, 50),
          currency: "USD",
        },
      }),
    );
  if (Object.keys(park.accessibility).length)
    evidence.push(
      makeTravelEvidence({
        ...common,
        evidenceType: "accessibility",
        data: { accessibility: park.accessibility },
      }),
    );
  return evidence;
}

export function createNpsAdapter(
  configuration: Configuration,
): TravelProviderAdapter {
  const unsupported = (
    evidenceType:
      "geocode" | "route" | "weather_forecast" | "sunrise" | "reservation",
  ) =>
    makeUnsupported({
      provider,
      evidenceType,
      sourceName,
      sourceUrl: apiSource,
      now: now(configuration),
      attribution,
      displayRestriction,
    });
  async function loadParks(input: ParkInput, signal?: AbortSignal) {
    if (!input.parkCode && !input.query) throw new TravelProviderHttpError(400);
    const payload = responseSchema(parkSchema).parse(
      await getNpsJson(
        configuration,
        "parks",
        {
          ...(input.parkCode ? { parkCode: input.parkCode } : {}),
          ...(input.query ? { q: input.query } : {}),
          limit: input.parkCode ? "1" : "10",
        },
        signal,
      ),
    );
    if (!payload.data.length) throw new TravelProviderHttpError(404);
    return selectExactParkMatch(payload.data, input.query);
  }
  return {
    providerId: provider,
    capabilities: new Set([
      "place_search",
      "park",
      "park_alerts",
      "operating_hours",
      "health",
    ]),
    async searchPlaces(input, signal) {
      try {
        const parks = await loadParks(
          { query: input.query, locale: input.locale },
          signal,
        );
        return makeTravelResponse(
          parks.length > 1 ? "ambiguous" : "available",
          parks.flatMap((park) => parkEvidence(park, configuration)),
        );
      } catch (error) {
        return makeProviderFailure({
          provider,
          evidenceType: "park",
          sourceName,
          sourceUrl: apiSource,
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
    async getPark(input: ParkInput, signal) {
      try {
        const parks = await loadParks(input, signal);
        return makeTravelResponse(
          parks.length > 1 ? "ambiguous" : "available",
          parks.flatMap((park) => parkEvidence(park, configuration)),
        );
      } catch (error) {
        return makeProviderFailure({
          provider,
          evidenceType: "park",
          sourceName,
          sourceUrl: apiSource,
          now: now(configuration),
          attribution,
          displayRestriction,
          error,
        });
      }
    },
    async getParkAlerts(input: ParkAlertsInput, signal) {
      try {
        if (!/^[a-z0-9]{2,10}$/i.test(input.parkCode))
          throw new TravelProviderHttpError(400);
        const payload = responseSchema(alertSchema).parse(
          await getNpsJson(
            configuration,
            "alerts",
            { parkCode: input.parkCode, limit: "50" },
            signal,
          ),
        );
        const retrievedAt = now(configuration);
        return makeTravelResponse(
          payload.data.length ? "available" : "partial",
          payload.data.map((alert) => {
            const closure = /closure/i.test(alert.category);
            return makeTravelEvidence({
              provider,
              evidenceType: closure ? "park_closure" : "park_alert",
              sourceName,
              sourceUrl: safeNpsUrl(alert.url),
              sourceEntityId: alert.id,
              now: retrievedAt,
              ttlSeconds: 600,
              observedAt: retrievedAt,
              entityBinding: {
                entityType: "park",
                canonicalId: `nps:${alert.parkCode || input.parkCode}`,
                name: `NPS park ${alert.parkCode || input.parkCode}`,
              },
              data: {
                alertId: alert.id,
                parkCode: alert.parkCode || input.parkCode,
                title: alert.title,
                description: alert.description.slice(0, 4_000),
                category: alert.category,
                severity: closure ? "closure" : "information",
                activeStatus: "active",
                affectedArea: null,
                effectiveFrom: null,
                effectiveUntil: null,
              },
              attribution,
              storage: "bounded",
              displayRestriction,
            });
          }),
        );
      } catch (error) {
        return makeProviderFailure({
          provider,
          evidenceType: "park_alert",
          sourceName,
          sourceUrl: apiSource,
          now: now(configuration),
          attribution,
          displayRestriction,
          error,
        });
      }
    },
    async getOperatingHours(input, signal) {
      const result = await this.getPark(
        { parkCode: input.providerEntityId, locale: input.locale },
        signal,
      );
      return makeTravelResponse(
        result.state,
        result.evidence.filter(
          (evidence) => evidence.evidenceType === "operating_hours",
        ),
        result.warnings,
      );
    },
    async getReservationLinks() {
      return unsupported("reservation");
    },
    async healthCheck(signal) {
      return this.getPark({ parkCode: "yose", locale: "en-US" }, signal);
    },
    normalizeError: normalizeTravelProviderError,
    getAttribution() {
      return attribution;
    },
  };
}
