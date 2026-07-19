import { z } from "zod";

import type {
  GeocodeInput,
  ReverseGeocodeInput,
  RouteInput,
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

const provider = "mapbox";
const sourceName = "Mapbox";
const geocodingSource = "https://docs.mapbox.com/api/search/geocoding/";
const directionsSource = "https://docs.mapbox.com/api/navigation/directions/";
const attribution = {
  label: "© Mapbox",
  url: "https://www.mapbox.com/about/maps/",
  required: true,
} as const;
const displayRestriction = "Mapbox attribution required";
const allowedHosts = new Set(["api.mapbox.com"]);

const geocodingPayloadSchema = z.object({
  features: z.array(
    z.object({
      id: z.string().optional(),
      geometry: z.object({
        coordinates: z.tuple([z.number(), z.number()]),
      }),
      bbox: z
        .tuple([z.number(), z.number(), z.number(), z.number()])
        .optional(),
      properties: z
        .object({
          mapbox_id: z.string().optional(),
          name: z.string().optional(),
          name_preferred: z.string().optional(),
          full_address: z.string().optional(),
          feature_type: z.string().optional(),
          context: z
            .object({
              place: z.object({ name: z.string().optional() }).optional(),
              region: z
                .object({
                  name: z.string().optional(),
                  region_code: z.string().optional(),
                })
                .optional(),
              country: z
                .object({
                  name: z.string().optional(),
                  country_code: z.string().optional(),
                })
                .optional(),
            })
            .optional(),
        })
        .passthrough(),
    }),
  ),
});

const directionsPayloadSchema = z.object({
  code: z.string(),
  routes: z
    .array(
      z.object({
        distance: z.number().nonnegative(),
        duration: z.number().nonnegative(),
        geometry: z
          .object({
            type: z.literal("LineString"),
            coordinates: z.array(
              z.tuple([
                z.number().finite().min(-180).max(180),
                z.number().finite().min(-90).max(90),
              ]),
            ),
          })
          .optional(),
        warnings: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});

type Configuration = {
  accessToken: string;
  geocodingStorageMode?: "disabled" | "temporary" | "permanent";
  onPermanentGeocodingRequest?: () => void;
  fetcher?: TravelFetcher;
  now?: () => string;
  timeoutMs?: number;
};

function now(configuration: Configuration) {
  return configuration.now?.() ?? new Date().toISOString();
}

function locationBinding(
  feature: z.infer<typeof geocodingPayloadSchema>["features"][number],
) {
  return {
    coordinates: {
      longitude: feature.geometry.coordinates[0],
      latitude: feature.geometry.coordinates[1],
    },
    boundingBox: feature.bbox ?? null,
    timezone: null,
    precision:
      feature.properties.feature_type === "country"
        ? ("country" as const)
        : feature.properties.feature_type === "region"
          ? ("region" as const)
          : ("place" as const),
    privacy: "public" as const,
  };
}

function geocodeEvidence(
  feature: z.infer<typeof geocodingPayloadSchema>["features"][number],
  ambiguous: boolean,
  retrievedAt: string,
  storageMode: "temporary" | "permanent",
) {
  const canonicalPlaceId =
    feature.properties.mapbox_id ?? feature.id ?? "mapbox:unknown";
  const name =
    feature.properties.name_preferred ??
    feature.properties.name ??
    feature.properties.full_address ??
    "Unknown place";
  return makeTravelEvidence({
    provider,
    evidenceType: "geocode",
    sourceName,
    sourceUrl: geocodingSource,
    sourceEntityId: canonicalPlaceId,
    now: retrievedAt,
    ttlSeconds: 2_592_000,
    verificationState: ambiguous ? "partially_verified" : "verified",
    confidence: ambiguous ? "medium" : "high",
    availabilityState: ambiguous ? "ambiguous" : "available",
    locationBinding: locationBinding(feature),
    entityBinding: {
      entityType: "destination",
      canonicalId: `mapbox:${canonicalPlaceId}`,
      name,
    },
    data: {
      canonicalPlaceId,
      name,
      formattedAddress: feature.properties.full_address ?? null,
      latitude: feature.geometry.coordinates[1],
      longitude: feature.geometry.coordinates[0],
      boundingBox: feature.bbox ?? null,
      locality: feature.properties.context?.place?.name ?? null,
      region: feature.properties.context?.region?.name ?? null,
      regionCode: feature.properties.context?.region?.region_code ?? null,
      country: feature.properties.context?.country?.name ?? null,
      countryCode: feature.properties.context?.country?.country_code ?? null,
      resolutionState: ambiguous ? "ambiguous" : "resolved",
    },
    providerMetadata: {},
    attribution,
    storage: storageMode === "permanent" ? "permanent" : "prohibited",
    displayRestriction:
      storageMode === "permanent"
        ? displayRestriction
        : "Temporary Mapbox geocoding result; do not persist or publish",
  });
}

function normalizePlaceLabel(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function selectExactGeocodeMatch(
  features: z.infer<typeof geocodingPayloadSchema>["features"],
  query: string,
) {
  const expected = normalizePlaceLabel(query);
  const exact = features.filter((feature) => {
    const name =
      feature.properties.name_preferred ?? feature.properties.name ?? "";
    const region = feature.properties.context?.region?.name ?? "";
    return [
      feature.properties.full_address ?? "",
      name && region ? `${name}, ${region}` : "",
    ].some((candidate) => normalizePlaceLabel(candidate) === expected);
  });
  if (exact.length === 1) return exact;
  const embeddedOfficialName = features.filter((feature) => {
    const name = normalizePlaceLabel(
      feature.properties.name_preferred ?? feature.properties.name ?? "",
    );
    return (
      name.split(/\s+/u).length >= 2 && ` ${expected} `.includes(` ${name} `)
    );
  });
  return embeddedOfficialName.length === 1 ? embeddedOfficialName : features;
}

async function performGeocode(
  configuration: Configuration,
  input: GeocodeInput | ReverseGeocodeInput,
  reverse: boolean,
  signal?: AbortSignal,
) {
  const storageMode = configuration.geocodingStorageMode ?? "disabled";
  if (storageMode === "disabled")
    return makeUnsupported({
      provider,
      evidenceType: "geocode",
      sourceName,
      sourceUrl: geocodingSource,
      now: now(configuration),
      attribution,
      displayRestriction: "Mapbox geocoding is disabled",
    });
  const url = new URL(
    reverse
      ? "https://api.mapbox.com/search/geocode/v6/reverse"
      : "https://api.mapbox.com/search/geocode/v6/forward",
  );
  if (reverse) {
    const coordinates = input as ReverseGeocodeInput;
    url.searchParams.set("longitude", String(coordinates.longitude));
    url.searchParams.set("latitude", String(coordinates.latitude));
  } else {
    const query = input as GeocodeInput;
    if (!query.query.trim() || query.query.length > 256)
      throw new TravelProviderHttpError(400);
    url.searchParams.set("q", query.query);
    if (query.countryCodes?.length)
      url.searchParams.set("country", query.countryCodes.join(","));
    url.searchParams.set("autocomplete", "false");
  }
  url.searchParams.set("limit", reverse ? "1" : "10");
  if (storageMode === "permanent") {
    url.searchParams.set("permanent", "true");
    configuration.onPermanentGeocodingRequest?.();
  }
  url.searchParams.set("language", input.locale.split("-")[0]);
  url.searchParams.set("access_token", configuration.accessToken);
  const payload = geocodingPayloadSchema.parse(
    await fetchTravelJson(url, {
      allowedHosts,
      fetcher: configuration.fetcher,
      signal,
      timeoutMs: configuration.timeoutMs,
    }),
  );
  if (payload.features.length === 0) throw new TravelProviderHttpError(404);
  const features = reverse
    ? payload.features
    : selectExactGeocodeMatch(payload.features, (input as GeocodeInput).query);
  const ambiguous = !reverse && features.length > 1;
  const retrievedAt = now(configuration);
  return makeTravelResponse(
    ambiguous ? "ambiguous" : "available",
    features.map((feature) =>
      geocodeEvidence(feature, ambiguous, retrievedAt, storageMode),
    ),
  );
}

export function createMapboxAdapter(
  configuration: Configuration,
): TravelProviderAdapter {
  const unsupported = (
    evidenceType:
      | "place"
      | "weather_forecast"
      | "sunrise"
      | "park"
      | "park_alert"
      | "operating_hours"
      | "reservation",
    sourceUrl: string,
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
    capabilities: new Set(["geocode", "reverse_geocode", "route", "health"]),
    async searchPlaces() {
      return unsupported("place", geocodingSource);
    },
    async geocode(input, signal) {
      try {
        return await performGeocode(configuration, input, false, signal);
      } catch (error) {
        return makeProviderFailure({
          provider,
          evidenceType: "geocode",
          sourceName,
          sourceUrl: geocodingSource,
          now: now(configuration),
          attribution,
          displayRestriction,
          error,
        });
      }
    },
    async reverseGeocode(input, signal) {
      try {
        return await performGeocode(configuration, input, true, signal);
      } catch (error) {
        return makeProviderFailure({
          provider,
          evidenceType: "geocode",
          sourceName,
          sourceUrl: geocodingSource,
          now: now(configuration),
          attribution,
          displayRestriction,
          error,
        });
      }
    },
    async getRoute(input: RouteInput, signal) {
      if (
        input.mode === "transit" ||
        input.mode === "shuttle" ||
        input.mode === "unknown"
      )
        return makeUnsupported({
          provider,
          evidenceType: "route",
          sourceName,
          sourceUrl: directionsSource,
          now: now(configuration),
          attribution,
          displayRestriction,
        });
      const profile =
        input.mode === "walk"
          ? "mapbox/walking"
          : input.mode === "bike"
            ? "mapbox/cycling"
            : input.departAt
              ? "mapbox/driving-traffic"
              : "mapbox/driving";
      const url = new URL(
        `https://api.mapbox.com/directions/v5/${profile}/${input.origin.longitude},${input.origin.latitude};${input.destination.longitude},${input.destination.latitude}`,
      );
      url.searchParams.set("overview", "simplified");
      url.searchParams.set("geometries", "geojson");
      url.searchParams.set("notifications", "all");
      if (input.departAt) url.searchParams.set("depart_at", input.departAt);
      url.searchParams.set("access_token", configuration.accessToken);
      try {
        const payload = directionsPayloadSchema.parse(
          await fetchTravelJson(url, {
            allowedHosts,
            fetcher: configuration.fetcher,
            signal,
            timeoutMs: configuration.timeoutMs,
          }),
        );
        const route = payload.routes?.[0];
        if (payload.code !== "Ok" || !route)
          throw new TravelProviderHttpError(404);
        const geometry =
          route.geometry &&
          route.geometry.coordinates.length >= 2 &&
          route.geometry.coordinates.length <= 1_000 &&
          JSON.stringify(route.geometry).length <= 24_000
            ? route.geometry
            : null;
        return makeTravelResponse("available", [
          makeTravelEvidence({
            provider,
            evidenceType: "route",
            sourceName,
            sourceUrl: directionsSource,
            now: now(configuration),
            ttlSeconds: 1_800,
            locationBinding: {
              coordinates: input.origin,
              boundingBox: null,
              timezone: null,
              precision: "exact",
              privacy: "public",
            },
            entityBinding: {
              entityType: "route_segment",
              canonicalId: `route:${input.mode}`,
              name: `${input.mode} route`,
            },
            data: {
              origin: input.origin,
              destination: input.destination,
              mode: input.mode,
              distanceMeters: Math.round(route.distance),
              durationMinutes: Math.ceil(route.duration / 60),
              trafficBasis: input.departAt
                ? "live_and_historical"
                : "not_requested",
              departureTime: input.departAt ?? null,
              geometry,
              warnings:
                route.geometry && geometry === null
                  ? [
                      ...(route.warnings ?? []),
                      "Route geometry omitted because it exceeded the map projection budget.",
                    ]
                  : (route.warnings ?? []),
            },
            providerMetadata: {},
            attribution,
            storage: "bounded",
            displayRestriction,
          }),
        ]);
      } catch (error) {
        return makeProviderFailure({
          provider,
          evidenceType: "route",
          sourceName,
          sourceUrl: directionsSource,
          now: now(configuration),
          attribution,
          displayRestriction,
          error,
        });
      }
    },
    async getWeather() {
      return unsupported("weather_forecast", directionsSource);
    },
    async getDaylight() {
      return unsupported("sunrise", directionsSource);
    },
    async getPark() {
      return unsupported("park", geocodingSource);
    },
    async getParkAlerts() {
      return unsupported("park_alert", geocodingSource);
    },
    async getOperatingHours() {
      return unsupported("operating_hours", geocodingSource);
    },
    async getReservationLinks() {
      return unsupported("reservation", geocodingSource);
    },
    async healthCheck(signal) {
      return this.geocode({ query: "United States", locale: "en-US" }, signal);
    },
    normalizeError: normalizeTravelProviderError,
    getAttribution() {
      return attribution;
    },
  };
}
