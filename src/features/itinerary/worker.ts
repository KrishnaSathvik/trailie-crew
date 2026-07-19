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
          estimatedTokens: workflow === "itinerary_repair" ? 8_000 : 12_000,
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

export async function enrichWithTravelEvidence(
  tripPlanId: string,
  source: Itinerary,
  existing: NormalizedToolEvidence[],
  dependencies: TravelEvidenceDependencies,
) {
  const itinerary = structuredClone(source);
  const collected = [...existing];
  const now = dependencies.now ?? new Date().toISOString();
  const referenceLocation = itinerary.days
    .flatMap((day) => day.items)
    .map((item) => item.location)
    .find(
      (location) =>
        location !== null &&
        location.latitude !== null &&
        location.longitude !== null,
    );

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

  for (const day of itinerary.days) {
    for (const item of day.items) {
      if (
        item.location &&
        (item.location.latitude === null || item.location.longitude === null)
      ) {
        const geocode = await getEvidence(
          item.id,
          "geocode",
          { query: item.location.name },
          () =>
            dependencies.travelProvider.geocode({ query: item.location!.name }),
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
      if (item.location?.latitude != null && item.location.longitude != null) {
        const request = {
          name: item.location.name,
          coordinates: {
            latitude: item.location.latitude,
            longitude: item.location.longitude,
          },
        };
        const detail = await getEvidence(
          item.id,
          "place_details",
          request,
          () => dependencies.travelProvider.placeDetails(request),
        );
        item.evidenceRefs = [...new Set([...item.evidenceRefs, detail.id])];
      }
    }
    for (const segment of day.travelSegments) {
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
      segment.evidenceRefs = [...new Set([...segment.evidenceRefs, route.id])];
    }
    await getEvidence(
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
    );
  }
  await getEvidence(
    null,
    "destination_facts",
    { destination: itinerary.destinationSummary },
    () =>
      dependencies.travelProvider.destinationFacts({
        destination: itinerary.destinationSummary,
      }),
  );
  return { itinerary: itinerarySchema.parse(itinerary), evidence: collected };
}

async function validateAndRecord(
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
) {
  if (destinationResolution)
    traceDestinationResolution({
      stage: "generated_plan_normalization",
      resolutionId: destinationResolution.resolutionId,
      resolution: destinationResolution.resolution,
    });
  await dependencies.repository.recordProgress(id, "route_validation_started");
  const normalizedDraft = normalizeDestinationDisplay(
    draft,
    destinationResolution,
  );
  const enriched = await enrichWithTravelEvidence(
    id,
    normalizedDraft,
    evidence,
    dependencies,
  );
  const normalizedRoutes: Array<{
    evidence: TravelEvidenceV1;
    id: string;
    targetItemId: string;
  }> = [];
  if (dependencies.travelIntelligence) {
    for (const day of enriched.itinerary.days) {
      for (const segment of day.travelSegments) {
        if (
          segment.origin.latitude === null ||
          segment.origin.longitude === null ||
          segment.destination.latitude === null ||
          segment.destination.longitude === null
        )
          continue;
        const response =
          await dependencies.travelIntelligence.providers.geocoding.getRoute({
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
        for (const evidence of response.evidence) {
          const storedId =
            await dependencies.travelIntelligence.evidenceRepository.store(
              evidence,
            );
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
      }
    }
  }
  const normalizedItinerary = itinerarySchema.parse(enriched.itinerary);
  const combinedLiveEvidence = [
    ...liveEvidence,
    ...normalizedRoutes.map((entry) => entry.evidence),
  ];
  await dependencies.repository.recordProgress(
    id,
    "constraint_validation_started",
  );
  const report = validateItinerary({
    itinerary: normalizedItinerary,
    approvedSummary: context.approvedSummary,
    evidence: enriched.evidence,
    liveEvidence: combinedLiveEvidence,
    ...(destinationResolution ? { destinationResolution } : {}),
    now: dependencies.now ?? new Date().toISOString(),
    minimumTravelBufferMinutes: 15,
    maximumDailyDriveMinutes: 360,
  });
  if (destinationResolution)
    traceDestinationResolution({
      stage: "final_validation",
      resolutionId: destinationResolution.resolutionId,
      resolution: destinationResolution.resolution,
      validationResult: report.status,
    });
  await dependencies.repository.recordValidation(id, report, context.version);
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
      const output = await callProvider(
        dependencies,
        input.workflow,
        () =>
          input.execute(
            AbortSignal.timeout(
              Math.min(
                dependencies.timeoutMs ?? Number.POSITIVE_INFINITY,
                remainingProviderTimeout(
                  policy,
                  input.workflow === "itinerary_repair"
                    ? "itineraryRepair"
                    : "itineraryGeneration",
                  workflowStartedAt,
                ),
              ),
            ),
          ),
        reservationId,
      );
      return {
        value: output.itinerary,
        responseId: output.responseId,
        requestId: output.requestId,
        usage: output.usage,
        providerDurationMs: Date.now() - providerStartedAt,
        totalDurationMs: Date.now() - workflowStartedAt,
        retryCount: Math.max(input.attempt - 1, 0),
        repairCount: input.repairCount,
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
    let context = await dependencies.repository.loadContext(id);
    const live = await prepareLiveTravelEvidence(context, dependencies);
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
    let result = await validateAndRecord(
      id,
      context,
      draft,
      context.evidence,
      live.evidence,
      live.destinationResolution,
      dependencies,
    );
    if (result.report.status === "pass") {
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
      await dependencies.repository.publish(id, result.itinerary);
      return;
    }
    if (
      result.report.status !== "needs_revision" ||
      firstClaim.stage === "repair"
    )
      return;

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
    result = await validateAndRecord(
      id,
      context,
      draft,
      result.evidence,
      live.evidence,
      live.destinationResolution,
      dependencies,
    );
    if (result.report.status === "pass") {
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
      await dependencies.repository.publish(id, result.itinerary);
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
    const failure =
      error instanceof AiQuotaError
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
