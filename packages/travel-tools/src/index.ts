export type TravelEvidenceStatus =
  "verified" | "unavailable" | "stale" | "failed";
export type Coordinates = Readonly<{
  latitude: number;
  longitude: number;
}>;
export type TravelSourceReference = Readonly<{
  label: string;
  url: string | null;
}>;
export type TravelToolResult<T> = Readonly<{
  status: TravelEvidenceStatus;
  provider: string;
  toolName: string;
  requestFingerprint: string;
  retrievedAt: string;
  expiresAt: string | null;
  data: T | null;
  sourceReference: TravelSourceReference | null;
  errorCode: "tool_unavailable" | "provider_failed" | null;
}>;

export type GeocodingRequest = Readonly<{ query: string }>;
export type GeocodingResult = Readonly<
  Coordinates & {
    formattedAddress: string | null;
    timezone: string | null;
    ambiguity: "none" | "multiple";
  }
>;
export type RoutingRequest = Readonly<{
  origin: Coordinates;
  destination: Coordinates;
  mode: "walk" | "drive" | "transit" | "bike" | "shuttle";
}>;
export type RoutingResult = Readonly<{
  distanceMeters: number;
  durationMinutes: number;
  mode: RoutingRequest["mode"];
}>;
export type PlaceDetailsRequest = Readonly<{
  name: string;
  coordinates: Coordinates;
}>;
export type PlaceDetailsResult = Readonly<{
  providerPlaceId: string;
  openStatus: "open" | "closed" | "unknown";
  reservationStatus: "required" | "recommended" | "not_required" | "unknown";
  costStatus: "verified" | "estimated" | "unknown";
}>;
export type DestinationFactsRequest = Readonly<{ destination: string }>;
export type DestinationFactsResult = Readonly<{
  notices: readonly string[];
  alerts: readonly string[];
}>;
export type DaylightRequest = Readonly<
  Coordinates & { date: string; timezone: string }
>;
export type DaylightResult = Readonly<{
  sunrise: string;
  sunset: string;
  timezone: string;
}>;

export interface TravelProvider {
  readonly name: string;
  geocode(
    input: GeocodingRequest,
    signal?: AbortSignal,
  ): Promise<TravelToolResult<GeocodingResult>>;
  route(
    input: RoutingRequest,
    signal?: AbortSignal,
  ): Promise<TravelToolResult<RoutingResult>>;
  placeDetails(
    input: PlaceDetailsRequest,
    signal?: AbortSignal,
  ): Promise<TravelToolResult<PlaceDetailsResult>>;
  destinationFacts(
    input: DestinationFactsRequest,
    signal?: AbortSignal,
  ): Promise<TravelToolResult<DestinationFactsResult>>;
  daylight(
    input: DaylightRequest,
    signal?: AbortSignal,
  ): Promise<TravelToolResult<DaylightResult>>;
}

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(
          ([key]) =>
            !/(?:api.?key|token|secret|authorization|credential)/i.test(key),
        )
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, scrub(item)]),
    );
  }
  return value;
}

export function fingerprintTravelRequest(toolName: string, input: unknown) {
  const canonical = `${toolName}:${JSON.stringify(scrub(input))}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function isTravelEvidenceFresh(
  evidence: Pick<TravelToolResult<unknown>, "status" | "expiresAt">,
  now = new Date().toISOString(),
) {
  return (
    evidence.status === "verified" &&
    (evidence.expiresAt === null || evidence.expiresAt > now)
  );
}

export type FakeTravelScenario =
  | "valid"
  | "impossible_route"
  | "closed_location"
  | "missing_coordinates"
  | "reservation_required"
  | "unknown_cost"
  | "stale_evidence"
  | "provider_failure"
  | "multi_day";

function plusHours(iso: string, hours: number) {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();
}

export function createFakeTravelProvider(configuration: {
  scenario: FakeTravelScenario;
  now?: string;
}): TravelProvider {
  const now = configuration.now ?? "2026-07-13T18:00:00.000Z";
  const provider = "trailie-fake";
  function result<T>(
    toolName: string,
    input: unknown,
    data: T,
  ): TravelToolResult<T> {
    if (configuration.scenario === "provider_failure") {
      return {
        status: "failed",
        provider,
        toolName,
        requestFingerprint: fingerprintTravelRequest(toolName, input),
        retrievedAt: now,
        expiresAt: null,
        data: null,
        sourceReference: null,
        errorCode: "provider_failed",
      };
    }
    const stale = configuration.scenario === "stale_evidence";
    return {
      status: stale ? "stale" : "verified",
      provider,
      toolName,
      requestFingerprint: fingerprintTravelRequest(toolName, input),
      retrievedAt: stale ? plusHours(now, -48) : now,
      expiresAt: stale ? plusHours(now, -24) : plusHours(now, 24),
      data,
      sourceReference: { label: "Deterministic Trailie fixture", url: null },
      errorCode: null,
    };
  }
  function unavailable<T>(
    toolName: string,
    input: unknown,
  ): TravelToolResult<T> {
    return {
      status: "unavailable",
      provider,
      toolName,
      requestFingerprint: fingerprintTravelRequest(toolName, input),
      retrievedAt: now,
      expiresAt: null,
      data: null,
      sourceReference: null,
      errorCode: "tool_unavailable",
    };
  }
  return {
    name: provider,
    async geocode(input) {
      if (configuration.scenario === "missing_coordinates")
        return unavailable("geocode", input);
      return result("geocode", input, {
        latitude: 37.7459,
        longitude: -119.5936,
        formattedAddress: "Yosemite Valley, CA",
        timezone: "America/Los_Angeles",
        ambiguity: "none",
      });
    },
    async route(input) {
      return result("route", input, {
        distanceMeters:
          configuration.scenario === "impossible_route" ? 160000 : 104000,
        durationMinutes:
          configuration.scenario === "impossible_route" ? 240 : 120,
        mode: input.mode,
      });
    },
    async placeDetails(input) {
      return result("place_details", input, {
        providerPlaceId: "fake:yosemite-place",
        openStatus:
          configuration.scenario === "closed_location" ? "closed" : "open",
        reservationStatus:
          configuration.scenario === "reservation_required"
            ? "required"
            : "unknown",
        costStatus: "unknown",
      });
    },
    async destinationFacts(input) {
      return result("destination_facts", input, {
        notices:
          configuration.scenario === "multi_day"
            ? ["Shuttle service varies by day."]
            : [],
        alerts: [],
      });
    },
    async daylight(input) {
      return result("daylight", input, {
        sunrise: "06:41",
        sunset: "19:10",
        timezone: input.timezone,
      });
    },
  };
}

export function createUnavailableTravelProvider(
  provider = "unconfigured",
): TravelProvider {
  function unavailable<T>(
    toolName: string,
    input: unknown,
  ): TravelToolResult<T> {
    return {
      status: "unavailable",
      provider,
      toolName,
      requestFingerprint: fingerprintTravelRequest(toolName, input),
      retrievedAt: new Date().toISOString(),
      expiresAt: null,
      data: null,
      sourceReference: null,
      errorCode: "tool_unavailable",
    };
  }
  return {
    name: provider,
    async geocode(input) {
      return unavailable("geocode", input);
    },
    async route(input) {
      return unavailable("route", input);
    },
    async placeDetails(input) {
      return unavailable("place_details", input);
    },
    async destinationFacts(input) {
      return unavailable("destination_facts", input);
    },
    async daylight(input) {
      return unavailable("daylight", input);
    },
  };
}

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export function createMapboxTravelProvider(configuration: {
  accessToken: string;
  fetcher?: Fetcher;
  now?: () => string;
}): TravelProvider {
  const provider = "mapbox";
  const fetcher = configuration.fetcher ?? fetch;
  const now = configuration.now ?? (() => new Date().toISOString());
  function unavailable<T>(
    toolName: string,
    input: unknown,
  ): TravelToolResult<T> {
    return {
      status: "unavailable",
      provider,
      toolName,
      requestFingerprint: fingerprintTravelRequest(toolName, input),
      retrievedAt: now(),
      expiresAt: null,
      data: null,
      sourceReference: null,
      errorCode: "tool_unavailable",
    };
  }
  function failed<T>(toolName: string, input: unknown): TravelToolResult<T> {
    return {
      ...unavailable<T>(toolName, input),
      status: "failed",
      errorCode: "provider_failed",
    };
  }
  function verified<T>(
    toolName: string,
    input: unknown,
    data: T,
    sourceUrl: string,
  ): TravelToolResult<T> {
    const retrievedAt = now();
    return {
      status: "verified",
      provider,
      toolName,
      requestFingerprint: fingerprintTravelRequest(toolName, input),
      retrievedAt,
      expiresAt: plusHours(retrievedAt, 24),
      data,
      sourceReference: { label: "Mapbox", url: sourceUrl },
      errorCode: null,
    };
  }
  return {
    name: provider,
    async geocode(input, signal) {
      const endpoint = "https://api.mapbox.com/search/geocode/v6/forward";
      const url = new URL(endpoint);
      url.searchParams.set("q", input.query);
      url.searchParams.set("limit", "2");
      url.searchParams.set("access_token", configuration.accessToken);
      try {
        const response = await fetcher(url, { signal });
        if (!response.ok) return failed("geocode", input);
        const payload = (await response.json()) as {
          features?: Array<{
            geometry?: { coordinates?: [number, number] };
            properties?: { full_address?: string; name_preferred?: string };
          }>;
        };
        const first = payload.features?.[0];
        const coordinates = first?.geometry?.coordinates;
        if (!coordinates) return unavailable("geocode", input);
        return verified(
          "geocode",
          input,
          {
            longitude: coordinates[0],
            latitude: coordinates[1],
            formattedAddress:
              first.properties?.full_address ??
              first.properties?.name_preferred ??
              null,
            timezone: null,
            ambiguity:
              (payload.features?.length ?? 0) > 1 ? "multiple" : "none",
          },
          endpoint,
        );
      } catch {
        return failed("geocode", input);
      }
    },
    async route(input, signal) {
      if (input.mode === "transit" || input.mode === "shuttle")
        return unavailable("route", input);
      const profile =
        input.mode === "walk"
          ? "mapbox/walking"
          : input.mode === "bike"
            ? "mapbox/cycling"
            : "mapbox/driving";
      const endpoint = `https://api.mapbox.com/directions/v5/${profile}/${input.origin.longitude},${input.origin.latitude};${input.destination.longitude},${input.destination.latitude}`;
      const url = new URL(endpoint);
      url.searchParams.set("overview", "false");
      url.searchParams.set("access_token", configuration.accessToken);
      try {
        const response = await fetcher(url, { signal });
        if (!response.ok) return failed("route", input);
        const payload = (await response.json()) as {
          routes?: Array<{ distance?: number; duration?: number }>;
        };
        const route = payload.routes?.[0];
        if (route?.distance === undefined || route.duration === undefined)
          return unavailable("route", input);
        return verified(
          "route",
          input,
          {
            distanceMeters: Math.round(route.distance),
            durationMinutes: Math.ceil(route.duration / 60),
            mode: input.mode,
          },
          "https://api.mapbox.com/directions/v5",
        );
      } catch {
        return failed("route", input);
      }
    },
    async placeDetails(input) {
      return unavailable("place_details", input);
    },
    async destinationFacts(input) {
      return unavailable("destination_facts", input);
    },
    async daylight(input) {
      return unavailable("daylight", input);
    },
  };
}
