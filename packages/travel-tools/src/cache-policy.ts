import { createHash } from "node:crypto";

import type { TravelCapability } from "./contracts";

type CacheCoordinates = Readonly<{
  latitude: number;
  longitude: number;
}>;

export type TravelCacheKeyInput = Readonly<{
  environment: string;
  provider: string;
  capability: TravelCapability;
  schemaVersion: string;
  normalizedQuery?: string;
  entityId?: string;
  coordinates?: readonly CacheCoordinates[];
  dateWindow?: Readonly<{ start: string; end: string }>;
  mode?: string;
  locale?: string;
}> &
  Readonly<Record<string, unknown>>;

const forbiddenKey =
  /(?:api.?key|access.?token|secret|authorization|credential)/i;

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !forbiddenKey.test(key))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, scrub(item)]),
    );
  return value;
}

export function buildTravelCacheKey(input: TravelCacheKeyInput) {
  const canonical = JSON.stringify(scrub(input));
  const digest = createHash("sha256").update(canonical).digest("hex");
  return [
    "travel",
    input.schemaVersion,
    input.environment,
    input.provider,
    input.capability,
    digest,
  ].join(":");
}

export type TravelCachePolicy = Readonly<{
  ttlSeconds: number;
  negativeTtlSeconds: number;
  staleWhileRevalidate: boolean;
}>;

const policies: Record<TravelCapability, TravelCachePolicy> = {
  place_search: {
    ttlSeconds: 86_400,
    negativeTtlSeconds: 120,
    staleWhileRevalidate: false,
  },
  geocode: {
    ttlSeconds: 2_592_000,
    negativeTtlSeconds: 120,
    staleWhileRevalidate: true,
  },
  reverse_geocode: {
    ttlSeconds: 2_592_000,
    negativeTtlSeconds: 120,
    staleWhileRevalidate: true,
  },
  route: {
    ttlSeconds: 1_800,
    negativeTtlSeconds: 120,
    staleWhileRevalidate: false,
  },
  weather: {
    ttlSeconds: 600,
    negativeTtlSeconds: 120,
    staleWhileRevalidate: false,
  },
  daylight: {
    ttlSeconds: 31_536_000,
    negativeTtlSeconds: 120,
    staleWhileRevalidate: true,
  },
  park: {
    ttlSeconds: 21_600,
    negativeTtlSeconds: 120,
    staleWhileRevalidate: true,
  },
  park_alerts: {
    ttlSeconds: 600,
    negativeTtlSeconds: 120,
    staleWhileRevalidate: false,
  },
  operating_hours: {
    ttlSeconds: 21_600,
    negativeTtlSeconds: 120,
    staleWhileRevalidate: true,
  },
  reservation_links: {
    ttlSeconds: 21_600,
    negativeTtlSeconds: 120,
    staleWhileRevalidate: true,
  },
  health: {
    ttlSeconds: 60,
    negativeTtlSeconds: 30,
    staleWhileRevalidate: false,
  },
};

export function travelCachePolicyFor(
  capability: TravelCapability,
): TravelCachePolicy {
  return policies[capability];
}
