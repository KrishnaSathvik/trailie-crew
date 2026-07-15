import "server-only";
import {
  fingerprintTravelRequest,
  isTravelEvidenceFresh,
  type TravelProvider,
  type TravelToolResult,
} from "@trailie/travel-tools";
import { itinerarySchema, type Itinerary } from "@trailie/schemas";
import { buildItineraryContext, buildItineraryRepairContext } from "./context";
import { ItineraryProviderError, type ItineraryProvider } from "./provider";
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
};

function callProvider<T extends { usage?: { totalTokens?: number | null } }>(
  dependencies: Dependencies,
  workflow: "itinerary_generation" | "itinerary_repair",
  operation: () => Promise<T>,
) {
  return dependencies.quotaSubject
    ? runWithAiQuota(
        {
          ...dependencies.quotaSubject,
          workflow,
          model: dependencies.model ?? "gpt-5.6-sol",
          estimatedTokens: workflow === "itinerary_repair" ? 8_000 : 12_000,
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
  dependencies: Dependencies,
) {
  await dependencies.repository.recordProgress(id, "route_validation_started");
  const enriched = await enrichWithTravelEvidence(
    id,
    draft,
    evidence,
    dependencies,
  );
  await dependencies.repository.recordProgress(
    id,
    "constraint_validation_started",
  );
  const report = validateItinerary({
    itinerary: enriched.itinerary,
    approvedSummary: context.approvedSummary,
    evidence: enriched.evidence,
    now: dependencies.now ?? new Date().toISOString(),
    minimumTravelBufferMinutes: 15,
    maximumDailyDriveMinutes: 360,
  });
  await dependencies.repository.recordValidation(id, report, context.version);
  return { ...enriched, report };
}

export async function processItineraryGeneration(
  id: string,
  dependencies: Dependencies,
) {
  const policy =
    dependencies.reliabilityPolicy ?? parseWorkflowReliabilityPolicy({});
  const workflowStartedAt = Date.now();
  try {
    const firstClaim = await dependencies.repository.claim(id);
    if (!firstClaim.claimed || !firstClaim.stage) return;
    let context = await dependencies.repository.loadContext(id);
    let output;
    if (firstClaim.stage === "repair") {
      if (!context.draft || !context.latestValidation) return;
      const repairDraft = context.draft;
      const repairValidation = context.latestValidation;
      output = await callProvider(dependencies, "itinerary_repair", () =>
        dependencies.provider.repair({
          operationKey: `${id}:repair`,
          model: dependencies.model ?? "gpt-5.6-sol",
          safetyIdentifier: dependencies.safetyIdentifier,
          context: buildItineraryRepairContext({
            approvedSummary: context.approvedSummary,
            draft: repairDraft,
            validation: repairValidation,
            evidence: context.evidence,
          }),
          signal: AbortSignal.timeout(
            Math.min(
              dependencies.timeoutMs ?? Number.POSITIVE_INFINITY,
              remainingProviderTimeout(
                policy,
                "itineraryRepair",
                workflowStartedAt,
              ),
            ),
          ),
        }),
      );
    } else if (firstClaim.stage === "validate" && context.draft) {
      output = null;
    } else {
      output = await callProvider(dependencies, "itinerary_generation", () =>
        dependencies.provider.generate({
          operationKey: `${id}:generate`,
          model: dependencies.model ?? "gpt-5.6-sol",
          safetyIdentifier: dependencies.safetyIdentifier,
          context: buildItineraryContext(context),
          signal: AbortSignal.timeout(
            Math.min(
              dependencies.timeoutMs ?? Number.POSITIVE_INFINITY,
              remainingProviderTimeout(
                policy,
                "itineraryGeneration",
                workflowStartedAt,
              ),
            ),
          ),
        }),
      );
    }
    let draft = output?.itinerary ?? context.draft;
    if (!draft)
      throw new ItineraryProviderError("invalid_itinerary_response", false);
    if (output) await dependencies.repository.recordDraft(id, draft, output);
    let result = await validateAndRecord(
      id,
      context,
      draft,
      context.evidence,
      dependencies,
    );
    if (result.report.status === "pass") {
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
    const repaired = await callProvider(dependencies, "itinerary_repair", () =>
      dependencies.provider.repair({
        operationKey: `${id}:repair`,
        model: dependencies.model ?? "gpt-5.6-sol",
        safetyIdentifier: dependencies.safetyIdentifier,
        context: buildItineraryRepairContext({
          approvedSummary: context.approvedSummary,
          draft: result.itinerary,
          validation: result.report,
          evidence: result.evidence,
        }),
        signal: AbortSignal.timeout(
          Math.min(
            dependencies.timeoutMs ?? Number.POSITIVE_INFINITY,
            remainingProviderTimeout(
              policy,
              "itineraryRepair",
              workflowStartedAt,
            ),
          ),
        ),
      }),
    );
    draft = repaired.itinerary;
    await dependencies.repository.recordDraft(id, draft, repaired);
    result = await validateAndRecord(
      id,
      context,
      draft,
      result.evidence,
      dependencies,
    );
    if (result.report.status === "pass")
      await dependencies.repository.publish(id, result.itinerary);
  } catch (error) {
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
