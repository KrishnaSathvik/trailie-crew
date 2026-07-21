import "server-only";
import {
  fingerprintTravelRequest,
  isTravelEvidenceFresh,
  type TravelProvider,
  type TravelToolResult,
} from "@trailie/travel-tools";
import {
  itinerarySchema,
  type CanonicalDestinationResolutionV1,
  type Itinerary,
  type TravelEvidenceV1,
} from "@trailie/schemas";
import { buildItineraryContext, buildItineraryRepairContext } from "./context";
import {
  ItineraryProviderError,
  type ItineraryProvider,
  type ItineraryProviderOutput,
} from "./provider";
import {
  AiQuotaError,
  runWithAiQuota,
  type AiQuotaSubject,
} from "@/server/ai/quota";
import type {
  ItineraryGenerationContext,
  ItineraryRepository,
} from "./repository";
import {
  validateItinerary,
  type NormalizedToolEvidence,
} from "./validation/validate-itinerary";
import {
  classifyProviderFailure,
  parseWorkflowReliabilityPolicy,
  performanceStageTimeout,
  remainingProviderTimeout,
  type WorkflowReliabilityPolicy,
} from "@/server/ai/reliability-policy";
import {
  type DurableProviderAttemptController,
  type ProviderAttemptExecutionResult,
} from "@/server/ai/provider-attempts";
import {
  collectDestinationTravelEvidence,
  traceDestinationResolution,
  type TravelProviderRegistry,
} from "@/server/travel/intelligence";
import type { TravelEvidenceRepository } from "@/server/travel/repository";
import type { TrailieRuntimeTrace } from "@/server/ai/runtime-telemetry";

export type TravelEvidenceDependencies = {
  repository: Pick<ItineraryRepository, "recordEvidence">;
  travelProvider: TravelProvider;
  now?: string;
};
type Dependencies = TravelEvidenceDependencies & {
  repository: ItineraryRepository;
  provider: ItineraryProvider;
  safetyIdentifier: string;
  model?: string;
  timeoutMs?: number;
  quotaSubject?: AiQuotaSubject;
  reliabilityPolicy?: WorkflowReliabilityPolicy;
  providerAttempts?: DurableProviderAttemptController<Itinerary>;
  travelIntelligence?: {
    providers: TravelProviderRegistry;
    evidenceRepository: TravelEvidenceRepository;
    maximumCallsPerProvider: number;
  };
  cancellationSignal?: AbortSignal;
  runtimeTrace?: TrailieRuntimeTrace;
};

const monthNumber = new Map(
  [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].map((month, index) => [month, index + 1]),
);
const monthPattern =
  "January|February|March|April|May|June|July|August|September|October|November|December";

function naturalDateRange(value: string) {
  const match = value.match(
    new RegExp(
      `\\b(${monthPattern})\\s+(\\d{1,2})(?:,\\s*(\\d{4}))?\\s*(?:through|to|[-–—])\\s*(?:(${monthPattern})\\s+)?(\\d{1,2})(?:,\\s*(\\d{4}))?\\b`,
      "iu",
    ),
  );
  if (!match) return null;
  const startMonth = monthNumber.get(match[1].toLocaleLowerCase("en-US"));
  const endMonth = match[4]
    ? monthNumber.get(match[4].toLocaleLowerCase("en-US"))
    : startMonth;
  const startYear = Number(match[3] ?? match[6]);
  const endYear = Number(match[6] ?? match[3]);
  const startDay = Number(match[2]);
  const endDay = Number(match[5]);
  if (!startMonth || !endMonth || !startYear || !endYear) return null;
  const build = (year: number, month: number, day: number) => {
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
      ? parsed
      : null;
  };
  const start = build(startYear, startMonth, startDay);
  const end = build(endYear, endMonth, endDay);
  return start && end ? ([start, end] as const) : null;
}

export function parseItineraryDates(dateWindows: readonly string[]) {
  const dates: string[] = [];
  for (const window of dateWindows) {
    const found = window.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
    const natural = found.length ? null : naturalDateRange(window);
    if (!found.length && !natural) continue;
    const start = natural?.[0] ?? new Date(`${found[0]}T00:00:00Z`);
    const end = natural?.[1] ?? new Date(`${found.at(-1)!}T00:00:00Z`);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()))
      continue;
    for (
      let current = start;
      current <= end && dates.length < 8;
      current = new Date(current.getTime() + 86_400_000)
    )
      dates.push(current.toISOString().slice(0, 10));
    if (dates.length >= 8) break;
  }
  return [...new Set(dates)];
}

const genericDestinationWords = new Set([
  "national",
  "park",
  "parks",
  "state",
  "city",
  "county",
  "region",
  "valley",
]);

function normalizeDestinationDisplay(
  itinerary: Itinerary,
  destinationResolution: {
    resolution: CanonicalDestinationResolutionV1;
  } | null,
) {
  const canonicalName = destinationResolution?.resolution.canonicalName;
  if (
    destinationResolution?.resolution.status !== "resolved" ||
    canonicalName === null ||
    canonicalName === undefined
  )
    return itinerary;
  const tokens = (value: string) =>
    new Set(
      value
        .normalize("NFKC")
        .toLocaleLowerCase("en-US")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
        .split(" ")
        .filter(
          (token) => token.length >= 4 && !genericDestinationWords.has(token),
        ),
    );
  const generated = tokens(itinerary.destinationSummary);
  const canonical = tokens(canonicalName);
  if (![...generated].some((token) => canonical.has(token))) return itinerary;
  return itinerarySchema.parse({
    ...itinerary,
    destinationSummary: canonicalName,
  });
}

async function prepareLiveTravelEvidence(
  context: ItineraryGenerationContext,
  dependencies: Dependencies,
) {
  if (!dependencies.travelIntelligence)
    return {
      evidence: [] as TravelEvidenceV1[],
      stored: [] as Array<{ evidence: TravelEvidenceV1; id: string }>,
      destinationResolution: null,
    };
  const destination = context.approvedSummary.tripSnapshot.destinations[0];
  if (!destination)
    return {
      evidence: [] as TravelEvidenceV1[],
      stored: [] as Array<{ evidence: TravelEvidenceV1; id: string }>,
      destinationResolution: null,
    };
  const collected = await collectDestinationTravelEvidence({
    destination,
    dates: parseItineraryDates(
      context.approvedSummary.tripSnapshot.dateWindows,
    ),
    locale: "en-US",
    providers: dependencies.travelIntelligence.providers,
    maximumCallsPerProvider:
      dependencies.travelIntelligence.maximumCallsPerProvider,
  });
  const resolutionId =
    await dependencies.travelIntelligence.evidenceRepository.storeDestinationResolution(
      {
        tripPlanId: context.tripPlanId,
        resolution: collected.destinationResolution,
      },
    );
  const authoritativeResolution =
    await dependencies.travelIntelligence.evidenceRepository.loadDestinationResolution(
      {
        resolutionId,
        semanticHash: collected.destinationResolution.semanticHash,
      },
    );
  traceDestinationResolution({
    stage: "provider_resolution",
    resolutionId,
    resolution: authoritativeResolution,
  });
  traceDestinationResolution({
    stage: "planning_input",
    resolutionId,
    resolution: authoritativeResolution,
  });
  const stored = await Promise.all(
    collected.evidence
      .filter((evidence) => evidence.restrictions.storage !== "prohibited")
      .map(async (evidence) => ({
        evidence,
        id: await dependencies.travelIntelligence!.evidenceRepository.store(
          evidence,
        ),
      })),
  );
  await Promise.all(
    stored.map((entry) =>
      dependencies.travelIntelligence!.evidenceRepository.bindDestinationResolutionEvidence(
        {
          resolutionId,
          storedEvidenceId: entry.id,
        },
      ),
    ),
  );
  return {
    evidence: collected.evidence,
    stored,
    destinationResolution: {
      resolutionId,
      semanticHash: authoritativeResolution.semanticHash,
      resolution: authoritativeResolution,
    },
  };
}

function callProvider<T extends { usage?: { totalTokens?: number | null } }>(
  dependencies: Dependencies,
  workflow: "itinerary_generation" | "itinerary_repair",
  operation: () => Promise<T>,
  reservationId?: string,
) {
  return dependencies.quotaSubject
    ? runWithAiQuota(
        {
          ...dependencies.quotaSubject,
          workflow,
          model: dependencies.model ?? "gpt-5.6-sol",
          estimatedTokens: workflow === "itinerary_repair" ? 4_000 : 8_000,
          ...(reservationId ? { reservationId } : {}),
        },
        operation,
      )
    : operation();
}

function evidenceFromResult<T>(
  itemId: string | null,
  result: TravelToolResult<T>,
): Omit<NormalizedToolEvidence, "id"> {
  return {
    itemId,
    requestFingerprint: result.requestFingerprint,
    provider: result.provider,
    toolName: result.toolName,
    status: result.status,
    retrievedAt: result.retrievedAt,
    expiresAt: result.expiresAt,
    normalizedResult: (result.data ?? {}) as Record<string, unknown>,
    sourceReference: result.sourceReference,
  };
}

function normalizedPlaceName(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const officialItemEvidenceTypes = new Set<TravelEvidenceV1["evidenceType"]>([
  "park",
  "visitor_center",
  "campground",
  "trail",
  "place",
]);

/** Bind only unique, durable official evidence to an exact generated item. */
export function bindOfficialItemEvidence(
  itinerary: Itinerary,
  liveEvidence: TravelEvidenceV1[],
  destinationResolution?: CanonicalDestinationResolutionV1 | null,
) {
  const candidates = liveEvidence.filter(
    (entry) =>
      officialItemEvidenceTypes.has(entry.evidenceType) &&
      (entry.provider === "nps" || entry.provider === "ridb") &&
      entry.verificationState === "verified" &&
      entry.confidence === "high" &&
      entry.restrictions.storage !== "prohibited" &&
      entry.locationBinding?.coordinates !== null &&
      entry.locationBinding?.privacy === "public" &&
      entry.entityBinding !== null,
  );
  for (const day of itinerary.days) {
    for (const item of day.items) {
      if (
        item.location?.latitude !== null &&
        item.location?.latitude !== undefined
      )
        continue;
      const byId = item.sourceEntityId
        ? candidates.filter(
            (entry) =>
              entry.sourceEntityId === item.sourceEntityId ||
              entry.entityBinding?.canonicalId === item.sourceEntityId,
          )
        : [];
      const byName = candidates.filter((entry) => {
        const itemName = normalizedPlaceName(item.location?.name ?? item.title);
        const officialName = normalizedPlaceName(entry.entityBinding!.name);
        return itemName === officialName;
      });
      const matches = byId.length ? byId : byName;
      if (matches.length !== 1) continue;
      const evidence = matches[0];
      const coordinates = evidence.locationBinding!.coordinates!;
      if (
        destinationResolution?.npsParkCode &&
        evidence.provider === "nps" &&
        evidence.sourceEntityId &&
        !evidence.sourceEntityId
          .toLocaleLowerCase("en-US")
          .includes(
            destinationResolution.npsParkCode.toLocaleLowerCase("en-US"),
          )
      )
        continue;
      item.location = {
        name: evidence.entityBinding!.name,
        address: null,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        timezone: itinerary.timezone,
        verificationStatus: "verified",
      };
      item.sourceEntityId = evidence.entityBinding!.canonicalId;
      item.evidenceRefs = [
        ...new Set([...item.evidenceRefs, evidence.evidenceId]),
      ];
    }
  }
  return itinerarySchema.parse(itinerary);
}

export async function enrichWithTravelEvidence(
  tripPlanId: string,
  source: Itinerary,
  existing: NormalizedToolEvidence[],
  dependencies: TravelEvidenceDependencies,
) {
  const required = await enrichRequiredTravelEvidence(
    tripPlanId,
    source,
    existing,
    dependencies,
  );
  return enrichOptionalTravelEvidence(
    tripPlanId,
    required.itinerary,
    required.evidence,
    dependencies,
  );
}

async function createEvidenceCollector(
  tripPlanId: string,
  existing: NormalizedToolEvidence[],
  dependencies: TravelEvidenceDependencies,
) {
  const collected = [...existing];
  const now = dependencies.now ?? new Date().toISOString();
  async function getEvidence<T>(
    itemId: string | null,
    toolName: string,
    request: unknown,
    execute: () => Promise<TravelToolResult<T>>,
  ) {
    const fingerprint = fingerprintTravelRequest(toolName, request);
    const cached = collected.find(
      (entry) =>
        entry.toolName === toolName &&
        entry.itemId === itemId &&
        entry.requestFingerprint === fingerprint &&
        isTravelEvidenceFresh(entry, now),
    );
    if (cached) return cached;
    const result = await execute();
    const value = evidenceFromResult(itemId, result);
    const id = await dependencies.repository.recordEvidence(tripPlanId, {
      ...value,
      normalizedResult: {
        ...value.normalizedResult,
        requestFingerprint: fingerprint,
      },
    });
    const saved = { id, ...value };
    collected.push(saved);
    return saved;
  }
  return { collected, getEvidence };
}

async function enrichRequiredTravelEvidence(
  tripPlanId: string,
  source: Itinerary,
  existing: NormalizedToolEvidence[],
  dependencies: TravelEvidenceDependencies,
) {
  const itinerary = structuredClone(source);
  const { collected, getEvidence } = await createEvidenceCollector(
    tripPlanId,
    existing,
    dependencies,
  );
  await Promise.all(
    itinerary.days.flatMap((day) =>
      day.items.map(async (item) => {
        if (
          item.location &&
          (item.location.latitude === null || item.location.longitude === null)
        ) {
          const geocode = await getEvidence(
            item.id,
            "geocode",
            { query: item.location.name },
            () =>
              dependencies.travelProvider.geocode({
                query: item.location!.name,
              }),
          );
          const latitude = Number(geocode.normalizedResult.latitude);
          const longitude = Number(geocode.normalizedResult.longitude);
          if (
            geocode.status === "verified" &&
            Number.isFinite(latitude) &&
            Number.isFinite(longitude)
          ) {
            item.location.latitude = latitude;
            item.location.longitude = longitude;
            item.location.verificationStatus = "verified";
          }
        }
      }),
    ),
  );
  await Promise.all(
    itinerary.days.flatMap((day) =>
      day.travelSegments.map(async (segment) => {
        const request = {
          origin: {
            latitude: segment.origin.latitude!,
            longitude: segment.origin.longitude!,
          },
          destination: {
            latitude: segment.destination.latitude!,
            longitude: segment.destination.longitude!,
          },
          mode:
            segment.mode === "drive" ||
            segment.mode === "walk" ||
            segment.mode === "transit" ||
            segment.mode === "bike" ||
            segment.mode === "shuttle"
              ? segment.mode
              : "drive",
        } as const;
        const route = await getEvidence(segment.id, "route", request, () =>
          dependencies.travelProvider.route(request),
        );
        const duration = Number(route.normalizedResult.durationMinutes);
        const distance = Number(route.normalizedResult.distanceMeters);
        if (
          route.status === "verified" &&
          Number.isFinite(duration) &&
          Number.isFinite(distance)
        ) {
          segment.durationMinutes = duration;
          segment.distanceMeters = distance;
          segment.verificationStatus = "verified";
        }
        segment.evidenceRefs = [
          ...new Set([...segment.evidenceRefs, route.id]),
        ];
      }),
    ),
  );
  return { itinerary: itinerarySchema.parse(itinerary), evidence: collected };
}

async function enrichOptionalTravelEvidence(
  tripPlanId: string,
  source: Itinerary,
  existing: NormalizedToolEvidence[],
  dependencies: TravelEvidenceDependencies,
) {
  const itinerary = structuredClone(source);
  const { collected, getEvidence } = await createEvidenceCollector(
    tripPlanId,
    existing,
    dependencies,
  );
  const referenceLocation = itinerary.days
    .flatMap((day) => day.items)
    .map((item) => item.location)
    .find(
      (location) =>
        location !== null &&
        location.latitude !== null &&
        location.longitude !== null,
    );
  await Promise.all([
    ...itinerary.days.flatMap((day) =>
      day.items.flatMap((item) => {
        if (item.location?.latitude == null || item.location.longitude == null)
          return [];
        const request = {
          name: item.location.name,
          coordinates: {
            latitude: item.location.latitude,
            longitude: item.location.longitude,
          },
        };
        return [
          getEvidence(item.id, "place_details", request, () =>
            dependencies.travelProvider.placeDetails(request),
          ).then((detail) => {
            item.evidenceRefs = [...new Set([...item.evidenceRefs, detail.id])];
          }),
        ];
      }),
    ),
    ...itinerary.days.map((day) =>
      getEvidence(
        null,
        "daylight",
        { date: day.date, timezone: itinerary.timezone },
        () =>
          dependencies.travelProvider.daylight({
            date: day.date,
            timezone: itinerary.timezone,
            latitude: referenceLocation?.latitude ?? 0,
            longitude: referenceLocation?.longitude ?? 0,
          }),
      ),
    ),
    getEvidence(
      null,
      "destination_facts",
      { destination: itinerary.destinationSummary },
      () =>
        dependencies.travelProvider.destinationFacts({
          destination: itinerary.destinationSummary,
        }),
    ),
  ]);
  return { itinerary: itinerarySchema.parse(itinerary), evidence: collected };
}

async function validateCoreAndRecord(
  id: string,
  context: ItineraryGenerationContext,
  draft: Itinerary,
  evidence: NormalizedToolEvidence[],
  liveEvidence: TravelEvidenceV1[],
  destinationResolution: {
    resolutionId: string;
    semanticHash: string;
    resolution: CanonicalDestinationResolutionV1;
  } | null,
  dependencies: Dependencies,
  terminalIfInvalid = false,
) {
  const validationStartedAt = Date.now();
  await dependencies.repository.recordProgress(
    id,
    "constraint_validation_started",
  );
  const normalizedDraft = normalizeDestinationDisplay(
    draft,
    destinationResolution,
  );
  const itinerary = bindOfficialItemEvidence(
    normalizedDraft,
    liveEvidence,
    destinationResolution?.resolution,
  );
  const validationReport = validateItinerary({
    itinerary,
    approvedSummary: context.approvedSummary,
    evidence,
    liveEvidence,
    ...(destinationResolution ? { destinationResolution } : {}),
    now: dependencies.now ?? new Date().toISOString(),
    minimumTravelBufferMinutes: 15,
    maximumDailyDriveMinutes: 360,
  });
  const report =
    terminalIfInvalid && validationReport.status === "needs_revision"
      ? ({ ...validationReport, status: "blocked" } as const)
      : validationReport;
  dependencies.runtimeTrace?.addDuration(
    "validation",
    Date.now() - validationStartedAt,
  );
  if (report.status !== "pass")
    await dependencies.repository.recordValidation(id, report, context.version);
  return {
    itinerary,
    report,
    evidence,
    normalizedRoutes: [] as Array<{
      evidence: TravelEvidenceV1;
      id: string;
      targetItemId: string;
    }>,
    liveEvidence,
  };
}

async function enrichValidateAndRecord(
  id: string,
  context: ItineraryGenerationContext,
  draft: Itinerary,
  evidence: NormalizedToolEvidence[],
  liveEvidence: TravelEvidenceV1[],
  destinationResolution: {
    resolutionId: string;
    semanticHash: string;
    resolution: CanonicalDestinationResolutionV1;
  } | null,
  dependencies: Dependencies,
  terminalIfInvalid = false,
) {
  if (destinationResolution)
    traceDestinationResolution({
      stage: "generated_plan_normalization",
      resolutionId: destinationResolution.resolutionId,
      resolution: destinationResolution.resolution,
    });
  await dependencies.repository.recordProgress(id, "route_validation_started");
  const mapBindingStartedAt = Date.now();
  const normalizedDraft = normalizeDestinationDisplay(
    draft,
    destinationResolution,
  );
  const boundDraft = bindOfficialItemEvidence(
    normalizedDraft,
    liveEvidence,
    destinationResolution?.resolution,
  );
  const required = await enrichRequiredTravelEvidence(
    id,
    boundDraft,
    evidence,
    dependencies,
  );
  const normalizedRoutes: Array<{
    evidence: TravelEvidenceV1;
    id: string;
    targetItemId: string;
  }> = [];
  if (dependencies.travelIntelligence) {
    const travelIntelligence = dependencies.travelIntelligence;
    await Promise.all(
      required.itinerary.days.flatMap((day) =>
        day.travelSegments.map(async (segment) => {
          if (
            segment.origin.latitude === null ||
            segment.origin.longitude === null ||
            segment.destination.latitude === null ||
            segment.destination.longitude === null
          )
            return;
          const response =
            await travelIntelligence.providers.geocoding.getRoute({
              origin: {
                latitude: segment.origin.latitude,
                longitude: segment.origin.longitude,
              },
              destination: {
                latitude: segment.destination.latitude,
                longitude: segment.destination.longitude,
              },
              mode:
                segment.mode === "drive" ||
                segment.mode === "walk" ||
                segment.mode === "bike" ||
                segment.mode === "transit" ||
                segment.mode === "shuttle"
                  ? segment.mode
                  : "unknown",
              locale: "en-US",
            });
          const storedEvidence = await Promise.all(
            response.evidence.map(async (evidence) => ({
              evidence,
              storedId:
                await travelIntelligence.evidenceRepository.store(evidence),
            })),
          );
          for (const { evidence, storedId } of storedEvidence) {
            normalizedRoutes.push({
              evidence,
              id: storedId,
              targetItemId: segment.id,
            });
            if (
              evidence.evidenceType === "route" &&
              evidence.verificationState === "verified"
            ) {
              const duration = Number(
                evidence.normalizedValue.data.durationMinutes,
              );
              const distance = Number(
                evidence.normalizedValue.data.distanceMeters,
              );
              if (Number.isFinite(duration) && Number.isFinite(distance)) {
                segment.durationMinutes = duration;
                segment.distanceMeters = distance;
                segment.verificationStatus = "verified";
              }
            }
            segment.evidenceRefs = [
              ...new Set([...segment.evidenceRefs, evidence.evidenceId]),
            ];
          }
        }),
      ),
    );
  }
  const normalizedItinerary = itinerarySchema.parse(required.itinerary);
  dependencies.runtimeTrace?.addDuration(
    "mapBinding",
    Date.now() - mapBindingStartedAt,
  );
  const combinedLiveEvidence = [
    ...liveEvidence,
    ...normalizedRoutes.map((entry) => entry.evidence),
  ];
  const validationStartedAt = Date.now();
  const validationReport = validateItinerary({
    itinerary: normalizedItinerary,
    approvedSummary: context.approvedSummary,
    evidence: required.evidence,
    liveEvidence: combinedLiveEvidence,
    ...(destinationResolution ? { destinationResolution } : {}),
    now: dependencies.now ?? new Date().toISOString(),
    minimumTravelBufferMinutes: 15,
    maximumDailyDriveMinutes: 360,
  });
  const report =
    terminalIfInvalid && validationReport.status === "needs_revision"
      ? ({ ...validationReport, status: "blocked" } as const)
      : validationReport;
  dependencies.runtimeTrace?.addDuration(
    "validation",
    Date.now() - validationStartedAt,
  );
  if (destinationResolution)
    traceDestinationResolution({
      stage: "final_validation",
      resolutionId: destinationResolution.resolutionId,
      resolution: destinationResolution.resolution,
      validationResult: report.status,
    });
  await dependencies.repository.recordValidation(id, report, context.version);
  const optionalEnrichmentStartedAt = Date.now();
  const enriched =
    report.status === "pass"
      ? await enrichOptionalTravelEvidence(
          id,
          normalizedItinerary,
          required.evidence,
          dependencies,
        )
      : required;
  if (report.status === "pass")
    dependencies.runtimeTrace?.addDuration(
      "evidenceBinding",
      Date.now() - optionalEnrichmentStartedAt,
    );
  return {
    ...enriched,
    itinerary: normalizedItinerary,
    report,
    normalizedRoutes,
    liveEvidence: combinedLiveEvidence,
  };
}

export async function processItineraryGeneration(
  id: string,
  dependencies: Dependencies,
) {
  const policy =
    dependencies.reliabilityPolicy ?? parseWorkflowReliabilityPolicy({});
  const workflowStartedAt = Date.now();
  async function executeProvider(input: {
    workflow: "itinerary_generation" | "itinerary_repair";
    operationKey: string;
    attempt: number;
    repairCount: number;
    execute(signal: AbortSignal): Promise<ItineraryProviderOutput>;
  }) {
    const execute = async (reservationId?: string) => {
      const providerStartedAt = Date.now();
      let output: ItineraryProviderOutput;
      try {
        output = await callProvider(
          dependencies,
          input.workflow,
          () =>
            input.execute(
              (() => {
                const timeoutSignal = AbortSignal.timeout(
                  Math.min(
                    dependencies.timeoutMs ?? Number.POSITIVE_INFINITY,
                    performanceStageTimeout(
                      input.workflow === "itinerary_repair"
                        ? "itineraryRepair"
                        : "itineraryGeneration",
                      remainingProviderTimeout(
                        policy,
                        input.workflow === "itinerary_repair"
                          ? "itineraryRepair"
                          : "itineraryGeneration",
                        workflowStartedAt,
                      ),
                    ),
                  ),
                );
                return dependencies.cancellationSignal
                  ? AbortSignal.any([
                      timeoutSignal,
                      dependencies.cancellationSignal,
                    ])
                  : timeoutSignal;
              })(),
            ),
          reservationId,
        );
      } catch (error) {
        const durationMs = Date.now() - providerStartedAt;
        dependencies.runtimeTrace?.recordModelCall(durationMs);
        if (input.workflow === "itinerary_repair")
          dependencies.runtimeTrace?.recordRepair(durationMs);
        throw error;
      }
      const providerDurationMs = Date.now() - providerStartedAt;
      dependencies.runtimeTrace?.recordModelCall(providerDurationMs, {
        inputTokens: output.usage.inputTokens,
        outputTokens: output.usage.outputTokens,
      });
      if (input.workflow === "itinerary_repair")
        dependencies.runtimeTrace?.recordRepair(providerDurationMs);
      return {
        value: output.itinerary,
        responseId: output.responseId,
        requestId: output.requestId,
        usage: output.usage,
        providerDurationMs,
        totalDurationMs: Date.now() - workflowStartedAt,
        retryCount: Math.max(input.attempt - 1, 0),
        repairCount: input.repairCount,
        structuralRepairCount: output.structuralRepairCount ?? 0,
      } satisfies ProviderAttemptExecutionResult<Itinerary>;
    };
    const apply = (
      itinerary: Itinerary,
      result: ProviderAttemptExecutionResult<Itinerary>,
    ) =>
      dependencies.repository.recordDraft(id, itinerary, {
        itinerary,
        ...result,
      });
    if (!dependencies.providerAttempts) {
      const result = await execute();
      await apply(result.value, result);
      return {
        ownedElsewhere: false,
        output: { itinerary: result.value, ...result },
      };
    }
    const outcome = await dependencies.providerAttempts.run({
      workflow: input.workflow,
      operationKey: input.operationKey,
      attempt: input.attempt,
      model: dependencies.model ?? "gpt-5.6-sol",
      leaseMs: policy.recoveryLeaseMs,
      execute: ({ attemptId }) => execute(attemptId),
      parse: (value) => itinerarySchema.parse(value),
      apply,
    });
    if (outcome.status === "owned_elsewhere")
      return { ownedElsewhere: true, output: null };
    if (outcome.status === "already_applied")
      return { ownedElsewhere: false, output: null };
    return {
      ownedElsewhere: false,
      output: { itinerary: outcome.result.value, ...outcome.result },
    };
  }
  try {
    const firstClaim = await dependencies.repository.claim(id);
    if (!firstClaim.claimed || !firstClaim.stage) return;
    const contextStartedAt = Date.now();
    let context = await dependencies.repository.loadContext(id);
    dependencies.runtimeTrace?.recordDuration(
      "contextAssembly",
      Date.now() - contextStartedAt,
    );
    const evidenceStartedAt = Date.now();
    const live = await prepareLiveTravelEvidence(context, dependencies);
    dependencies.runtimeTrace?.addDuration(
      "evidenceBinding",
      Date.now() - evidenceStartedAt,
    );
    let output;
    if (firstClaim.stage === "repair") {
      if (!context.draft || !context.latestValidation) return;
      const repairDraft = context.draft;
      const repairValidation = context.latestValidation;
      if (live.destinationResolution)
        traceDestinationResolution({
          stage: "repair_input",
          resolutionId: live.destinationResolution.resolutionId,
          resolution: live.destinationResolution.resolution,
        });
      const execution = await executeProvider({
        workflow: "itinerary_repair",
        operationKey: `${id}:repair`,
        attempt: firstClaim.attemptCount,
        repairCount: 1,
        execute: (signal) =>
          dependencies.provider.repair({
            operationKey: `${id}:repair`,
            model: dependencies.model ?? "gpt-5.6-sol",
            safetyIdentifier: dependencies.safetyIdentifier,
            context: buildItineraryRepairContext({
              approvedSummary: context.approvedSummary,
              draft: repairDraft,
              validation: repairValidation,
              evidence: context.evidence,
              liveEvidence: live.evidence,
              ...(live.destinationResolution
                ? { destinationResolution: live.destinationResolution }
                : {}),
            }),
            signal,
          }),
      });
      if (execution.ownedElsewhere) return;
      output = execution.output;
    } else if (firstClaim.stage === "validate" && context.draft) {
      output = null;
    } else {
      if (live.destinationResolution)
        traceDestinationResolution({
          stage: "generation_input",
          resolutionId: live.destinationResolution.resolutionId,
          resolution: live.destinationResolution.resolution,
        });
      const execution = await executeProvider({
        workflow: "itinerary_generation",
        operationKey: `${id}:generate`,
        attempt: firstClaim.attemptCount,
        repairCount: 0,
        execute: (signal) =>
          dependencies.provider.generate({
            operationKey: `${id}:generate`,
            model: dependencies.model ?? "gpt-5.6-sol",
            safetyIdentifier: dependencies.safetyIdentifier,
            context: buildItineraryContext({
              ...context,
              liveEvidence: live.evidence,
              ...(live.destinationResolution
                ? { destinationResolution: live.destinationResolution }
                : {}),
            }),
            signal,
          }),
      });
      if (execution.ownedElsewhere) return;
      output = execution.output;
    }
    if (!output && !context.draft) {
      context = await dependencies.repository.loadContext(id);
    }
    let draft = output?.itinerary ?? context.draft;
    if (!draft)
      throw new ItineraryProviderError("invalid_itinerary_response", false);
    let result = await validateCoreAndRecord(
      id,
      context,
      draft,
      context.evidence,
      live.evidence,
      live.destinationResolution,
      dependencies,
      firstClaim.stage === "repair",
    );
    if (result.report.status === "pass")
      result = await enrichValidateAndRecord(
        id,
        context,
        result.itinerary,
        result.evidence,
        live.evidence,
        live.destinationResolution,
        dependencies,
        firstClaim.stage === "repair",
      );
    if (result.report.status === "pass") {
      const bindingStartedAt = Date.now();
      if (dependencies.travelIntelligence) {
        if (live.destinationResolution)
          traceDestinationResolution({
            stage: "snapshot_publication",
            resolutionId: live.destinationResolution.resolutionId,
            resolution: live.destinationResolution.resolution,
            validationResult: "pass",
          });
        for (const stored of [
          ...live.stored.map((entry) => ({ ...entry, targetItemId: null })),
          ...result.normalizedRoutes,
        ])
          await dependencies.travelIntelligence.evidenceRepository.bindSnapshot(
            {
              tripPlanId: id,
              storedEvidenceId: stored.id,
              targetItemId: stored.targetItemId,
            },
          );
      }
      dependencies.runtimeTrace?.addDuration(
        "evidenceBinding",
        Date.now() - bindingStartedAt,
      );
      const persistenceStartedAt = Date.now();
      await dependencies.repository.publish(id, result.itinerary);
      dependencies.runtimeTrace?.addDuration(
        "persistence",
        Date.now() - persistenceStartedAt,
      );
      dependencies.runtimeTrace?.recordDuration(
        "finalRenderReady",
        Date.now() - workflowStartedAt,
      );
      return;
    }
    if (
      result.report.status !== "needs_revision" ||
      firstClaim.stage === "repair"
    )
      return;

    if ((output?.structuralRepairCount ?? 0) >= 1) {
      await dependencies.repository.recordValidation(
        id,
        { ...result.report, status: "blocked" },
        context.version,
      );
      return;
    }

    await dependencies.repository.markNeedsRevision(id);
    const repairClaim = await dependencies.repository.claim(id);
    if (!repairClaim.claimed) return;
    context = await dependencies.repository.loadContext(id);
    if (live.destinationResolution)
      traceDestinationResolution({
        stage: "repair_input",
        resolutionId: live.destinationResolution.resolutionId,
        resolution: live.destinationResolution.resolution,
      });
    const repairExecution = await executeProvider({
      workflow: "itinerary_repair",
      operationKey: `${id}:repair`,
      attempt: repairClaim.attemptCount,
      repairCount: 1,
      execute: (signal) =>
        dependencies.provider.repair({
          operationKey: `${id}:repair`,
          model: dependencies.model ?? "gpt-5.6-sol",
          safetyIdentifier: dependencies.safetyIdentifier,
          context: buildItineraryRepairContext({
            approvedSummary: context.approvedSummary,
            draft: result.itinerary,
            validation: result.report,
            evidence: result.evidence,
            liveEvidence: live.evidence,
            ...(live.destinationResolution
              ? { destinationResolution: live.destinationResolution }
              : {}),
          }),
          signal,
        }),
    });
    if (repairExecution.ownedElsewhere || !repairExecution.output) return;
    const repaired = repairExecution.output;
    draft = repaired.itinerary;
    result = await validateCoreAndRecord(
      id,
      context,
      draft,
      result.evidence,
      live.evidence,
      live.destinationResolution,
      dependencies,
      true,
    );
    if (result.report.status === "pass")
      result = await enrichValidateAndRecord(
        id,
        context,
        result.itinerary,
        result.evidence,
        live.evidence,
        live.destinationResolution,
        dependencies,
        true,
      );
    if (result.report.status === "pass") {
      const bindingStartedAt = Date.now();
      if (dependencies.travelIntelligence) {
        if (live.destinationResolution)
          traceDestinationResolution({
            stage: "snapshot_publication",
            resolutionId: live.destinationResolution.resolutionId,
            resolution: live.destinationResolution.resolution,
            validationResult: "pass",
          });
        for (const stored of [
          ...live.stored.map((entry) => ({ ...entry, targetItemId: null })),
          ...result.normalizedRoutes,
        ])
          await dependencies.travelIntelligence.evidenceRepository.bindSnapshot(
            {
              tripPlanId: id,
              storedEvidenceId: stored.id,
              targetItemId: stored.targetItemId,
            },
          );
      }
      dependencies.runtimeTrace?.addDuration(
        "evidenceBinding",
        Date.now() - bindingStartedAt,
      );
      const persistenceStartedAt = Date.now();
      await dependencies.repository.publish(id, result.itinerary);
      dependencies.runtimeTrace?.addDuration(
        "persistence",
        Date.now() - persistenceStartedAt,
      );
      dependencies.runtimeTrace?.recordDuration(
        "finalRenderReady",
        Date.now() - workflowStartedAt,
      );
    }
  } catch (error) {
    const safeErrorClass =
      error instanceof Error && /^[a-z][a-z0-9_]{2,80}$/.test(error.message)
        ? error.message
        : "unclassified_itinerary_failure";
    console.error("itinerary_generation_failure", {
      tripPlanId: id,
      errorClass: safeErrorClass,
    });
    const failure = dependencies.cancellationSignal?.aborted
      ? new ItineraryProviderError("workflow_cancelled", false)
      : error instanceof AiQuotaError
        ? new ItineraryProviderError(error.code as never, false)
        : error instanceof ItineraryProviderError
          ? error
          : (() => {
              const classified = classifyProviderFailure(error);
              return new ItineraryProviderError(
                classified.code,
                classified.retryable,
              );
            })();
    await dependencies.repository.fail(id, failure.code);
  }
}
