import { z } from "zod";

import type {
  DaylightInput,
  TravelProviderAdapter,
  WeatherInput,
} from "../contracts";
import { normalizeTravelProviderError } from "../errors";
import { fetchTravelJson, type TravelFetcher } from "../http";
import {
  makeProviderFailure,
  makeTravelEvidence,
  makeTravelResponse,
  makeUnsupported,
} from "./shared";

const provider = "openweather";
const sourceName = "OpenWeather One Call 3.0";
const sourceUrl = "https://openweathermap.org/api/one-call-3";
const attribution = {
  label: "OpenWeather",
  url: "https://openweathermap.org/",
  required: true,
} as const;
const displayRestriction = "OpenWeather attribution required";
const allowedHosts = new Set(["api.openweathermap.org"]);

const dailySchema = z.object({
  dt: z.number().int(),
  sunrise: z.number().int().optional(),
  sunset: z.number().int().optional(),
  temp: z.object({
    min: z.number(),
    max: z.number(),
  }),
  pop: z.number().min(0).max(1).optional().default(0),
  wind_speed: z.number().nonnegative(),
  weather: z
    .array(
      z.object({
        main: z.string(),
        description: z.string(),
      }),
    )
    .default([]),
});

const oneCallSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  timezone: z.string(),
  timezone_offset: z.number().int(),
  daily: z.array(dailySchema).optional().default([]),
  alerts: z
    .array(
      z.object({
        sender_name: z.string(),
        event: z.string(),
        start: z.number().int(),
        end: z.number().int(),
        description: z.string(),
        tags: z.array(z.string()).optional().default([]),
      }),
    )
    .optional()
    .default([]),
});

type Configuration = {
  apiKey: string;
  fetcher?: TravelFetcher;
  now?: () => string;
  timeoutMs?: number;
};

function now(configuration: Configuration) {
  return configuration.now?.() ?? new Date().toISOString();
}

function dateInTimezone(timestamp: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp * 1_000));
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

async function loadOneCall(
  configuration: Configuration,
  coordinates: { latitude: number; longitude: number },
  signal?: AbortSignal,
) {
  const url = new URL("https://api.openweathermap.org/data/3.0/onecall");
  url.searchParams.set("lat", String(coordinates.latitude));
  url.searchParams.set("lon", String(coordinates.longitude));
  url.searchParams.set("exclude", "minutely,hourly");
  url.searchParams.set("units", "imperial");
  url.searchParams.set("appid", configuration.apiKey);
  return oneCallSchema.parse(
    await fetchTravelJson(url, {
      allowedHosts,
      fetcher: configuration.fetcher,
      signal,
      timeoutMs: configuration.timeoutMs,
    }),
  );
}

function binding(
  input: { latitude: number; longitude: number },
  timezone: string,
) {
  return {
    coordinates: {
      latitude: input.latitude,
      longitude: input.longitude,
    },
    boundingBox: null,
    timezone,
    precision: "exact" as const,
    privacy: "public" as const,
  };
}

function unsupportedForecast(
  configuration: Configuration,
  input: WeatherInput,
) {
  return makeTravelResponse("unsupported", [
    makeTravelEvidence({
      provider,
      evidenceType: "weather_forecast",
      sourceName,
      sourceUrl,
      sourceEntityId: null,
      now: now(configuration),
      availabilityState: "unsupported",
      verificationState: "unverified",
      confidence: "low",
      locationBinding: {
        coordinates: {
          latitude: input.latitude,
          longitude: input.longitude,
        },
        boundingBox: null,
        timezone: null,
        precision: "exact",
        privacy: "public",
      },
      data: {},
      attribution,
      displayRestriction,
      errorState: {
        code: "forecast_horizon_unsupported",
        retryable: false,
        httpStatus: null,
      },
    }),
  ]);
}

export function createOpenWeatherAdapter(
  configuration: Configuration,
): TravelProviderAdapter {
  const payloadCache = new Map<
    string,
    { expiresAt: number; payload: ReturnType<typeof loadOneCall> }
  >();
  const oneCall = (
    input: { latitude: number; longitude: number },
    signal?: AbortSignal,
  ) => {
    const key = `${input.latitude.toFixed(5)}:${input.longitude.toFixed(5)}`;
    const cached = payloadCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.payload;
    const payload = loadOneCall(configuration, input, signal);
    payloadCache.set(key, { expiresAt: Date.now() + 300_000, payload });
    payload.catch(() => payloadCache.delete(key));
    return payload;
  };
  const unsupported = (
    evidenceType:
      | "place"
      | "geocode"
      | "route"
      | "park"
      | "park_alert"
      | "operating_hours"
      | "reservation",
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
    capabilities: new Set(["weather", "daylight", "health"]),
    async searchPlaces() {
      return unsupported("place");
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
    async getWeather(input: WeatherInput, signal) {
      try {
        const payload = await oneCall(input, signal);
        const days = payload.daily.filter((daily) => {
          const date = dateInTimezone(daily.dt, payload.timezone);
          return date >= input.startDate && date <= input.endDate;
        });
        if (days.length === 0) return unsupportedForecast(configuration, input);
        const retrievedAt = now(configuration);
        const forecasts = days.map((daily) => {
          const date = dateInTimezone(daily.dt, payload.timezone);
          return makeTravelEvidence({
            provider,
            evidenceType: "weather_forecast",
            sourceName,
            sourceUrl,
            sourceEntityId: null,
            now: retrievedAt,
            ttlSeconds: 600,
            validFrom: `${date}T00:00:00.000Z`,
            validUntil: `${date}T23:59:59.999Z`,
            locationBinding: binding(input, payload.timezone),
            entityBinding: {
              entityType: "itinerary_day",
              canonicalId: `weather:${date}`,
              name: `Forecast for ${date}`,
            },
            data: {
              date,
              timezone: payload.timezone,
              timezoneOffsetSeconds: payload.timezone_offset,
              low: daily.temp.min,
              high: daily.temp.max,
              condition: daily.weather[0]?.main ?? "Unknown",
              description: daily.weather[0]?.description ?? "Unavailable",
              precipitationProbability: daily.pop,
              windSpeed: daily.wind_speed,
              forecastHorizon: "daily_8_days",
            },
            attribution,
            displayRestriction,
          });
        });
        const alerts = payload.alerts.map((alert, index) =>
          makeTravelEvidence({
            provider,
            evidenceType: "severe_weather",
            sourceName: alert.sender_name,
            sourceUrl,
            sourceEntityId: `weather-alert:${index}`,
            now: retrievedAt,
            ttlSeconds: 600,
            observedAt: retrievedAt,
            validFrom: new Date(alert.start * 1_000).toISOString(),
            validUntil: new Date(alert.end * 1_000).toISOString(),
            locationBinding: binding(input, payload.timezone),
            entityBinding: null,
            data: {
              event: alert.event,
              description: alert.description.slice(0, 2_000),
              tags: alert.tags.slice(0, 20),
              start: new Date(alert.start * 1_000).toISOString(),
              end: new Date(alert.end * 1_000).toISOString(),
              safetyGuarantee: false,
            },
            attribution,
            displayRestriction,
          }),
        );
        return makeTravelResponse("available", [...forecasts, ...alerts]);
      } catch (error) {
        return makeProviderFailure({
          provider,
          evidenceType: "weather_forecast",
          sourceName,
          sourceUrl,
          now: now(configuration),
          attribution,
          displayRestriction,
          error,
        });
      }
    },
    async getDaylight(input: DaylightInput, signal) {
      try {
        const payload = await oneCall(input, signal);
        const daily = payload.daily.find(
          (entry) => dateInTimezone(entry.dt, payload.timezone) === input.date,
        );
        if (!daily)
          return makeTravelResponse("unsupported", [
            makeTravelEvidence({
              provider,
              evidenceType: "sunrise",
              sourceName,
              sourceUrl,
              now: now(configuration),
              availabilityState: "unsupported",
              verificationState: "unverified",
              confidence: "low",
              locationBinding: binding(input, payload.timezone),
              data: {},
              attribution,
              displayRestriction,
              errorState: {
                code: "daylight_horizon_unsupported",
                retryable: false,
                httpStatus: null,
              },
            }),
          ]);
        const retrievedAt = now(configuration);
        return makeTravelResponse(
          daily.sunrise === undefined || daily.sunset === undefined
            ? "unavailable"
            : "available",
          (
            [
              ["sunrise", daily.sunrise],
              ["sunset", daily.sunset],
            ] as const
          ).map(([evidenceType, timestamp]) =>
            makeTravelEvidence({
              provider,
              evidenceType,
              sourceName,
              sourceUrl,
              sourceEntityId: null,
              now: retrievedAt,
              ttlSeconds: 31_536_000,
              availabilityState:
                timestamp === undefined ? "unavailable" : "available",
              verificationState:
                timestamp === undefined ? "unverified" : "verified",
              confidence: timestamp === undefined ? "low" : "high",
              locationBinding: binding(input, payload.timezone),
              entityBinding: {
                entityType: "itinerary_day",
                canonicalId: `daylight:${input.date}`,
                name: `Daylight for ${input.date}`,
              },
              data:
                timestamp === undefined
                  ? {}
                  : {
                      date: input.date,
                      timezone: payload.timezone,
                      instant: new Date(timestamp * 1_000).toISOString(),
                      civilTwilight: null,
                      officialClosureTime: false,
                    },
              attribution,
              displayRestriction,
              errorState:
                timestamp === undefined
                  ? {
                      code: "polar_daylight_unavailable",
                      retryable: false,
                      httpStatus: null,
                    }
                  : null,
            }),
          ),
        );
      } catch (error) {
        return makeProviderFailure({
          provider,
          evidenceType: "sunrise",
          sourceName,
          sourceUrl,
          now: now(configuration),
          attribution,
          displayRestriction,
          error,
        });
      }
    },
    async getPark() {
      return unsupported("park");
    },
    async getParkAlerts() {
      return unsupported("park_alert");
    },
    async getOperatingHours() {
      return unsupported("operating_hours");
    },
    async getReservationLinks() {
      return unsupported("reservation");
    },
    async healthCheck(signal) {
      return this.getWeather(
        {
          latitude: 38.889,
          longitude: -77.05,
          startDate: new Date().toISOString().slice(0, 10),
          endDate: new Date().toISOString().slice(0, 10),
          locale: "en-US",
        },
        signal,
      );
    },
    normalizeError: normalizeTravelProviderError,
    getAttribution() {
      return attribution;
    },
  };
}
