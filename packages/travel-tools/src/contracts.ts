import {
  travelAvailabilityStateSchema,
  travelEvidenceV1Schema,
  type TravelEvidenceV1,
} from "@trailie/schemas";
import { z } from "zod";

import type { NormalizedTravelProviderError } from "./errors";

export const travelCapabilitySchema = z.enum([
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
]);

export const travelPlaceResolutionStateSchema = z.enum([
  "resolved",
  "ambiguous",
  "not_found",
  "unavailable",
]);

export const travelProviderResponseSchema = z
  .object({
    state: travelAvailabilityStateSchema,
    evidence: z.array(travelEvidenceV1Schema).max(200),
    warnings: z.array(z.string().trim().min(1).max(500)).max(20),
  })
  .strict();

export type TravelCapability = z.infer<typeof travelCapabilitySchema>;
export type TravelProviderResponse = z.infer<
  typeof travelProviderResponseSchema
>;
export type ProviderCoordinates = Readonly<{
  latitude: number;
  longitude: number;
}>;
export type PlaceSearchInput = Readonly<{
  query: string;
  kinds: readonly (
    | "destination"
    | "park"
    | "trailhead"
    | "lodging"
    | "restaurant"
    | "activity"
    | "airport"
    | "station"
    | "visitor_center"
    | "campground"
  )[];
  locale: string;
}>;
export type GeocodeInput = Readonly<{
  query: string;
  locale: string;
  countryCodes?: readonly string[];
}>;
export type ReverseGeocodeInput = Readonly<
  ProviderCoordinates & { locale: string }
>;
export type RouteInput = Readonly<{
  origin: ProviderCoordinates;
  destination: ProviderCoordinates;
  mode: "drive" | "walk" | "bike" | "transit" | "shuttle" | "unknown";
  departAt?: string;
  locale: string;
}>;
export type WeatherInput = Readonly<
  ProviderCoordinates & { startDate: string; endDate: string; locale: string }
>;
export type DaylightInput = Readonly<
  ProviderCoordinates & { date: string; locale: string }
>;
export type ParkInput = Readonly<{
  parkCode?: string;
  query?: string;
  locale: string;
}>;
export type ParkAlertsInput = Readonly<{
  parkCode: string;
  locale: string;
}>;
export type OperatingHoursInput = Readonly<{
  providerEntityId: string;
  date?: string;
  locale: string;
}>;
export type ReservationLinksInput = Readonly<{
  providerEntityId: string;
  entityType: "park" | "campground" | "permit" | "tour" | "facility";
  date?: string;
  locale: string;
}>;

export interface TravelProviderAdapter {
  readonly providerId: string;
  readonly capabilities: ReadonlySet<TravelCapability>;
  searchPlaces(
    input: PlaceSearchInput,
    signal?: AbortSignal,
  ): Promise<TravelProviderResponse>;
  geocode(
    input: GeocodeInput,
    signal?: AbortSignal,
  ): Promise<TravelProviderResponse>;
  reverseGeocode(
    input: ReverseGeocodeInput,
    signal?: AbortSignal,
  ): Promise<TravelProviderResponse>;
  getRoute(
    input: RouteInput,
    signal?: AbortSignal,
  ): Promise<TravelProviderResponse>;
  getWeather(
    input: WeatherInput,
    signal?: AbortSignal,
  ): Promise<TravelProviderResponse>;
  getDaylight(
    input: DaylightInput,
    signal?: AbortSignal,
  ): Promise<TravelProviderResponse>;
  getPark(
    input: ParkInput,
    signal?: AbortSignal,
  ): Promise<TravelProviderResponse>;
  getParkAlerts(
    input: ParkAlertsInput,
    signal?: AbortSignal,
  ): Promise<TravelProviderResponse>;
  getOperatingHours(
    input: OperatingHoursInput,
    signal?: AbortSignal,
  ): Promise<TravelProviderResponse>;
  getReservationLinks(
    input: ReservationLinksInput,
    signal?: AbortSignal,
  ): Promise<TravelProviderResponse>;
  healthCheck(signal?: AbortSignal): Promise<TravelProviderResponse>;
  normalizeError(error: unknown): NormalizedTravelProviderError;
  getAttribution(): TravelEvidenceV1["attribution"];
}
