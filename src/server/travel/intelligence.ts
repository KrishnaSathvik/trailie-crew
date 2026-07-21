import "server-only";

import { createHash } from "node:crypto";
import {
  canonicalDestinationResolutionV1Schema,
  type CanonicalDestinationResolutionV1,
  type TravelEvidenceV1,
} from "@trailie/schemas";
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

export type DestinationResolutionTraceStage =
  | "provider_resolution"
  | "planning_input"
  | "generation_input"
  | "generated_plan_normalization"
  | "repair_input"
  | "final_validation"
  | "snapshot_publication";

export function traceDestinationResolution(input: {
  stage: DestinationResolutionTraceStage;
  resolutionId: string;
  resolution: CanonicalDestinationResolutionV1;
  validationResult?: string | null;
}) {
  console.info("destination_resolution_trace", {
    stage: input.stage,
    resolutionId: input.resolutionId,
    status: input.resolution.status,
    semanticHashPrefix: input.resolution.semanticHash.slice(0, 12),
    canonicalEntityType: input.resolution.npsParkCode
      ? "nps_park"
      : input.resolution.canonicalPlaceId
        ? "provider_place"
        : "none",
    candidateCount: input.resolution.candidateCount,
    corroborationSourceCount: input.resolution.corroborationSources.length,
    validationResult: input.validationResult ?? null,
  });
}

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

function normalizedEntityName(value: unknown) {
  return typeof value === "string"
    ? value
        .normalize("NFKC")
        .toLocaleLowerCase("en-US")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
    : "";
}

function stringValue(value: unknown, maximumLength = 300): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maximumLength)
    : null;
}

function safeIdentifier(value: unknown): string | null {
  const candidate = stringValue(value, 200);
  return candidate && /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(candidate)
    ? candidate
    : null;
}

function semanticHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function resolvedByOfficialName(
  entry: TravelEvidenceV1,
  corroboratingProvider: string,
): TravelEvidenceV1 {
  return {
    ...entry,
    freshnessState: "fresh",
    verificationState: "verified",
    confidence: "high",
    availabilityState: "available",
    providerMetadata: {
      ...entry.providerMetadata,
      applicationResolution: "official_name_corroboration",
      corroboratingProvider,
    },
    errorState: null,
  };
}

function corroborateOfficialDestination(
  geocode: TravelProviderResponse,
  park: TravelProviderResponse,
) {
  if (geocode.state !== "ambiguous" && park.state !== "ambiguous")
    return { geocode, park };
  const geocodes = geocode.evidence.filter(
    (entry) => entry.evidenceType === "geocode",
  );
  const parks = park.evidence.filter((entry) => entry.evidenceType === "park");
  const matches = geocodes.flatMap((geocodeEntry, selectedCandidateIndex) => {
    const geocodeName = normalizedEntityName(
      geocodeEntry.normalizedValue.data.name,
    );
    if (!geocodeName) return [];
    return parks
      .filter(
        (parkEntry) =>
          normalizedEntityName(parkEntry.normalizedValue.data.officialName) ===
          geocodeName,
      )
      .map((parkEntry) => ({
        geocodeEntry,
        parkEntry,
        geocodeName,
        selectedCandidateIndex,
      }));
  });
  const entities = new Map<string, (typeof matches)[number]>();
  for (const match of matches) {
    const entityKey =
      safeIdentifier(match.parkEntry.sourceEntityId) ??
      [
        match.geocodeName,
        normalizedEntityName(match.parkEntry.normalizedValue.data.states),
      ].join(":");
    if (!entities.has(entityKey)) entities.set(entityKey, match);
  }
  if (entities.size !== 1) return { geocode, park };
  const [{ geocodeEntry, parkEntry }] = entities.values();
  const parkEvidence = park.evidence.filter(
    (entry) => entry.sourceEntityId === parkEntry.sourceEntityId,
  );
  return {
    geocode: {
      ...geocode,
      state: "available" as const,
      evidence: [resolvedByOfficialName(geocodeEntry, parkEntry.provider)],
      warnings: [
        ...geocode.warnings,
        "resolved_by_official_name_corroboration",
      ],
    },
    park: {
      ...park,
      state: "available" as const,
      evidence: parkEvidence.map((entry) =>
        resolvedByOfficialName(entry, geocodeEntry.provider),
      ),
      warnings: [...park.warnings, "resolved_by_official_name_corroboration"],
    },
  };
}

function buildDestinationResolution(input: {
  originalQuery: string;
  normalizedQuery: string;
  geocode: TravelProviderResponse;
  park: TravelProviderResponse;
}): CanonicalDestinationResolutionV1 {
  const geocodes = input.geocode.evidence.filter(
    (entry) => entry.evidenceType === "geocode",
  );
  const selectedGeocode =
    input.geocode.state === "available" && geocodes.length === 1
      ? geocodes[0]
      : null;
  const parkEvidence =
    input.park.state === "available"
      ? (input.park.evidence.find((entry) => entry.evidenceType === "park") ??
        null)
      : null;
  const status = destinationState(input.geocode);
  const npsParkCode = safeIdentifier(parkEvidence?.sourceEntityId);
  const providerPlaceId = safeIdentifier(selectedGeocode?.sourceEntityId);
  const canonicalPlaceId =
    npsParkCode !== null
      ? `nps:${npsParkCode}`
      : (safeIdentifier(selectedGeocode?.entityBinding?.canonicalId) ??
        providerPlaceId);
  const canonicalName =
    stringValue(parkEvidence?.normalizedValue.data.officialName) ??
    stringValue(selectedGeocode?.normalizedValue.data.name) ??
    selectedGeocode?.entityBinding?.name ??
    null;
  const officialLocation =
    parkEvidence?.locationBinding ?? selectedGeocode?.locationBinding ?? null;
  const corroborationSources =
    selectedGeocode && parkEvidence
      ? [...new Set([selectedGeocode.provider, parkEvidence.provider])].sort()
      : selectedGeocode
        ? [selectedGeocode.provider]
        : [];
  const selectedCandidateIndex = selectedGeocode
    ? Math.max(
        0,
        input.geocode.evidence.findIndex(
          (entry) => entry.evidenceId === selectedGeocode.evidenceId,
        ),
      )
    : null;
  const geocodeStorageProhibited =
    selectedGeocode?.restrictions.storage === "prohibited";
  const officialStates = parkEvidence?.normalizedValue.data.states;
  const officialRegion = Array.isArray(officialStates)
    ? officialStates
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
        .join(", ")
        .slice(0, 200) || null
    : null;
  const durableEvidence = [parkEvidence, selectedGeocode].filter(
    (entry): entry is TravelEvidenceV1 =>
      entry !== null && entry.restrictions.storage !== "prohibited",
  );
  const base = {
    schemaVersion: "1" as const,
    originalQuery: input.originalQuery,
    normalizedQuery: input.normalizedQuery,
    status,
    canonicalPlaceId: status === "resolved" ? canonicalPlaceId : null,
    canonicalName: status === "resolved" ? canonicalName : null,
    providerPlaceId:
      status === "resolved" &&
      selectedGeocode?.restrictions.storage !== "prohibited"
        ? providerPlaceId
        : null,
    npsParkCode: status === "resolved" ? npsParkCode : null,
    coordinates:
      status === "resolved" ? (officialLocation?.coordinates ?? null) : null,
    boundingBox:
      status === "resolved" ? (officialLocation?.boundingBox ?? null) : null,
    locality:
      status === "resolved" && !geocodeStorageProhibited
        ? stringValue(selectedGeocode?.normalizedValue.data.locality, 200)
        : null,
    region:
      status === "resolved"
        ? (officialRegion ??
          (!geocodeStorageProhibited
            ? stringValue(selectedGeocode?.normalizedValue.data.region, 200)
            : null))
        : null,
    country:
      status === "resolved" && !geocodeStorageProhibited
        ? stringValue(selectedGeocode?.normalizedValue.data.country, 200)
        : null,
    candidateCount: geocodes.length,
    selectedCandidateIndex:
      status === "resolved" ? selectedCandidateIndex : null,
    resolutionMethod:
      status === "resolved"
        ? selectedGeocode?.providerMetadata.applicationResolution ===
          "official_name_corroboration"
          ? ("exact_official_match" as const)
          : ("unique_high_confidence_match" as const)
        : ("unresolved" as const),
    corroborationSources,
    corroborationScore:
      status === "resolved" ? (corroborationSources.length > 1 ? 1 : 0.8) : 0,
    confidence:
      status === "resolved"
        ? ("high" as const)
        : status === "ambiguous"
          ? ("medium" as const)
          : ("low" as const),
    ambiguityReasons:
      status === "ambiguous" ? ["multiple_materially_distinct_candidates"] : [],
    evidenceIds: durableEvidence.map((entry) => entry.evidenceId).sort(),
  };
  return canonicalDestinationResolutionV1Schema.parse({
    ...base,
    semanticHash: semanticHash({
      schemaVersion: base.schemaVersion,
      normalizedQuery: base.normalizedQuery,
      status: base.status,
      canonicalPlaceId: base.canonicalPlaceId,
      canonicalName: base.canonicalName,
      npsParkCode: base.npsParkCode,
      coordinates: base.coordinates,
      region: base.region,
      country: base.country,
      resolutionMethod: base.resolutionMethod,
      corroborationSources: base.corroborationSources,
      ambiguityReasons: base.ambiguityReasons,
    }),
  });
}

function providerPlaceQuery(destination: string) {
  const withoutTrailingDates = destination
    .replace(/\s*\([^)]*\)\s*$/u, "")
    .trim();
  const officialEntity = withoutTrailingDates.match(
    /^(.+?\bnational\s+park(?:\s*(?:&|and)\s*preserve)?)\b/iu,
  )?.[1];
  return officialEntity?.trim() || withoutTrailingDates;
}

function officialParkSourceQuery(destinationQuery: string) {
  const distinctiveName = destinationQuery.match(
    /^(.+?)\s+national\s+park(?:\s*(?:&|and)\s*preserve)?$/iu,
  )?.[1];
  return distinctiveName?.trim() || destinationQuery;
}

export async function collectDestinationTravelEvidence(input: Input) {
  const evidence: TravelEvidenceV1[] = [];
  const callsByProvider: Record<string, number> = {};
  const callsByCapability: Record<string, number> = {};
  const durationMsByCapability: Record<string, number> = {};
  const requestCache = new Map<string, Promise<TravelProviderResponse>>();
  const destinationQuery = providerPlaceQuery(input.destination);
  const parkQuery = officialParkSourceQuery(destinationQuery);

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
    const request = (async () => {
      const startedAt = performance.now();
      try {
        return await execute();
      } finally {
        durationMsByCapability[capability] =
          (durationMsByCapability[capability] ?? 0) +
          Math.max(Math.round(performance.now() - startedAt), 0);
      }
    })();
    requestCache.set(key, request);
    return request;
  }

  const geocodePromise = call(
    input.providers.geocoding,
    "geocode",
    `${input.locale}:${destinationQuery}`,
    () =>
      input.providers.geocoding.geocode(
        { query: destinationQuery, locale: input.locale },
        input.signal,
      ),
  );
  const parkPromise = call(
    input.providers.parks,
    "park",
    `${input.locale}:${parkQuery}`,
    () =>
      input.providers.parks.getPark(
        { query: parkQuery, locale: input.locale },
        input.signal,
      ),
  );
  const recreationPromise = call(
    input.providers.recreation,
    "recreation",
    `${input.locale}:${destinationQuery}`,
    () =>
      input.providers.recreation.getPark(
        { query: destinationQuery, locale: input.locale },
        input.signal,
      ),
  );

  const [geocodeResult, parkResult, recreation] = await Promise.all([
    geocodePromise,
    parkPromise,
    recreationPromise,
  ]);
  const { geocode, park } = corroborateOfficialDestination(
    geocodeResult,
    parkResult,
  );
  const destinationResolution = buildDestinationResolution({
    originalQuery: input.destination,
    normalizedQuery: destinationQuery,
    geocode,
    park,
  });
  evidence.push(...geocode.evidence, ...park.evidence, ...recreation.evidence);

  const parkRecord =
    park.state === "available"
      ? park.evidence.find(
          (entry) =>
            entry.evidenceType === "park" && entry.sourceEntityId !== null,
        )
      : undefined;
  const followUps: Array<Promise<TravelProviderResponse>> = [];
  if (parkRecord?.sourceEntityId) {
    followUps.push(
      call(
        input.providers.parks,
        "park_alerts",
        `${input.locale}:${parkRecord.sourceEntityId}`,
        () =>
          input.providers.parks.getParkAlerts(
            { parkCode: parkRecord.sourceEntityId!, locale: input.locale },
            input.signal,
          ),
      ),
    );
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
    followUps.push(
      call(
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
      ),
    );
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
    followUps.push(
      call(
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
      ),
    );
    followUps.push(
      ...dates.map((date) =>
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
  }
  const followUpEvidence = await Promise.all(followUps);
  evidence.push(...followUpEvidence.flatMap((response) => response.evidence));

  return {
    destinationState: destinationResolution.status,
    destinationResolution,
    evidence: uniqueEvidence(evidence),
    callsByProvider,
    callsByCapability,
    durationMsByCapability,
  } as const;
}
