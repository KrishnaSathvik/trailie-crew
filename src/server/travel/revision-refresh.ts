import "server-only";

import type {
  Itinerary,
  PlanChangeType,
  TravelEvidenceV1,
} from "@trailie/schemas";
import type { TravelEvidenceRepository } from "./repository";
import {
  collectDestinationTravelEvidence,
  type TravelProviderRegistry,
} from "./intelligence";

type Input = Readonly<{
  requestType: PlanChangeType;
  evidenceRefreshTargets: readonly string[];
  baseTripPlanId: string;
  candidateTripPlanId: string;
  candidate: Itinerary;
  providers: TravelProviderRegistry;
  repository: TravelEvidenceRepository;
  locale: string;
  maximumCallsPerProvider: number;
}>;

const fullRefreshTypes = [
  "geocode",
  "place",
  "weather_forecast",
  "severe_weather",
  "sunrise",
  "sunset",
  "park",
  "park_alert",
  "park_closure",
  "reservation",
  "permit",
  "operating_hours",
] as const;

function refreshScope(requestType: PlanChangeType) {
  if (
    requestType === "change_route" ||
    requestType === "move_item" ||
    requestType === "reschedule_item" ||
    requestType === "shorten_item" ||
    requestType === "extend_item" ||
    requestType === "rebalance_day" ||
    requestType === "update_traveler_logistics"
  )
    return { routes: true, destination: false };
  if (
    requestType === "add_item" ||
    requestType === "remove_item" ||
    requestType === "replace_item" ||
    requestType === "change_lodging" ||
    requestType === "change_food" ||
    requestType === "general_revision"
  )
    return { routes: true, destination: true };
  return { routes: false, destination: false };
}

function affectedSegments(itinerary: Itinerary, targets: ReadonlySet<string>) {
  return itinerary.days.flatMap((day) =>
    day.travelSegments.filter(
      (segment) =>
        targets.has(segment.id) ||
        (segment.fromItemId !== null && targets.has(segment.fromItemId)) ||
        (segment.toItemId !== null && targets.has(segment.toItemId)),
    ),
  );
}

export async function refreshRevisionTravelEvidence(input: Input) {
  const scope = refreshScope(input.requestType);
  const targets = new Set(input.evidenceRefreshTargets);
  const segments = scope.routes
    ? affectedSegments(input.candidate, targets)
    : [];
  const excludedTargetItemIds = [
    ...new Set([
      ...input.evidenceRefreshTargets,
      ...segments.map((segment) => segment.id),
    ]),
  ];
  const evidence: Array<{
    evidence: TravelEvidenceV1;
    targetItemId: string | null;
  }> = [];
  let destinationResolution: {
    resolutionId: string;
    semanticHash: string;
  } | null = null;
  if (scope.destination) {
    const destination = await collectDestinationTravelEvidence({
      destination: input.candidate.destinationSummary,
      dates: input.candidate.days.map((day) => day.date),
      locale: input.locale,
      providers: input.providers,
      maximumCallsPerProvider: input.maximumCallsPerProvider,
    });
    const resolutionId = await input.repository.storeDestinationResolution({
      tripPlanId: input.candidateTripPlanId,
      resolution: destination.destinationResolution,
    });
    const authoritative = await input.repository.loadDestinationResolution({
      resolutionId,
      semanticHash: destination.destinationResolution.semanticHash,
    });
    destinationResolution = {
      resolutionId,
      semanticHash: authoritative.semanticHash,
    };
    evidence.push(
      ...destination.evidence.map((item) => ({
        evidence: item,
        targetItemId: null,
      })),
    );
  }
  await input.repository.copySnapshots({
    baseTripPlanId: input.baseTripPlanId,
    candidateTripPlanId: input.candidateTripPlanId,
    excludedTargetItemIds,
    excludedEvidenceTypes: scope.destination ? [...fullRefreshTypes] : [],
  });
  for (const segment of segments) {
    if (
      segment.origin.latitude === null ||
      segment.origin.longitude === null ||
      segment.destination.latitude === null ||
      segment.destination.longitude === null
    )
      continue;
    const route = await input.providers.geocoding.getRoute({
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
      locale: input.locale,
    });
    evidence.push(
      ...route.evidence.map((item) => ({
        evidence: item,
        targetItemId: segment.id,
      })),
    );
  }

  for (const item of evidence) {
    if (item.evidence.restrictions.storage === "prohibited") continue;
    const storedEvidenceId = await input.repository.store(item.evidence);
    if (destinationResolution)
      await input.repository.bindDestinationResolutionEvidence({
        resolutionId: destinationResolution.resolutionId,
        storedEvidenceId,
      });
    await input.repository.bindSnapshot({
      tripPlanId: input.candidateTripPlanId,
      storedEvidenceId,
      targetItemId: item.targetItemId,
    });
  }
  return { evidence: evidence.map((item) => item.evidence) };
}
