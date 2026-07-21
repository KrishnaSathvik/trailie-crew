import type {
  CanonicalDestinationResolutionV1,
  CompactItineraryCandidateV1,
  PlanningSummary,
  TravelEvidenceV1,
  ValidationReport,
} from "@trailie/schemas";
import type { NormalizedToolEvidence } from "./validation/validate-itinerary";

function bounded(value: unknown, max: number) {
  const text = JSON.stringify(value);
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function planningInput(summary: PlanningSummary) {
  const decisions = (items: PlanningSummary["confirmedDecisions"]) =>
    items.map(({ label, detail }) => ({ label, detail }));
  return {
    destination: summary.tripSnapshot.destinations,
    dates: summary.tripSnapshot.dateWindows,
    party: {
      count: summary.tripSnapshot.travelerCount,
      origins: summary.tripSnapshot.origins,
      budget: summary.tripSnapshot.budget,
    },
    confirmed: decisions(summary.confirmedDecisions),
    preferences: decisions(summary.travelerPreferences),
    constraints: decisions(summary.constraints),
    rejected: decisions(summary.rejectedOptions),
    openQuestions: decisions(summary.openQuestions),
    nonAssumptions: decisions(summary.nonAssumptions),
  };
}

const materialFactKeys = new Set([
  "active",
  "affectedArea",
  "availabilityStatus",
  "condition",
  "date",
  "hours",
  "officialName",
  "parkCode",
  "requirement",
  "reservationType",
  "severeWeather",
  "severity",
  "sunrise",
  "sunset",
  "title",
]);

function projectedFacts(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, fact]) =>
        materialFactKeys.has(key) &&
        (typeof fact === "string" ||
          typeof fact === "number" ||
          typeof fact === "boolean" ||
          fact === null),
    ),
  );
}

function officialEvidence(evidence: TravelEvidenceV1[]) {
  return evidence.slice(0, 60).map((entry) => ({
    id: entry.evidenceId,
    type: entry.evidenceType,
    provider: entry.provider,
    freshness: entry.freshnessState,
    verification: entry.verificationState,
    confidence: entry.confidence,
    availability: entry.availabilityState,
    sourceEntityId: entry.sourceEntityId,
    entity: entry.entityBinding
      ? {
          id: entry.entityBinding.canonicalId,
          name: entry.entityBinding.name,
          type: entry.entityBinding.entityType,
        }
      : null,
    facts: projectedFacts(entry.normalizedValue?.data ?? {}),
  }));
}

function destinationInput(
  value:
    | { resolutionId: string; resolution: CanonicalDestinationResolutionV1 }
    | undefined,
) {
  if (!value) return null;
  return {
    resolutionId: value.resolutionId,
    status: value.resolution.status,
    canonicalName: value.resolution.canonicalName,
    canonicalPlaceId: value.resolution.canonicalPlaceId,
    npsParkCode: value.resolution.npsParkCode,
    region: value.resolution.region,
    country: value.resolution.country,
  };
}

export function buildItineraryContext(input: {
  approvedSummary: PlanningSummary;
  travelers: Array<{
    id: string;
    displayName: string;
    role: "host" | "member";
  }>;
  evidence: NormalizedToolEvidence[];
  liveEvidence?: TravelEvidenceV1[];
  destinationResolution?: {
    resolutionId: string;
    resolution: CanonicalDestinationResolutionV1;
  };
}) {
  const allowedPlaces = (input.liveEvidence ?? [])
    .filter(
      (entry) =>
        (entry.provider === "nps" || entry.provider === "ridb") &&
        entry.entityBinding &&
        entry.locationBinding?.coordinates &&
        entry.verificationState === "verified" &&
        entry.confidence === "high" &&
        entry.locationBinding.privacy === "public",
    )
    .map((entry) => ({
      officialId: entry.entityBinding!.canonicalId,
      officialName: entry.entityBinding!.name,
      category: entry.entityBinding!.entityType,
      provider: entry.provider,
    }));
  return [
    `<PLANNING_INPUT>${bounded(planningInput(input.approvedSummary), 5_000)}</PLANNING_INPUT>`,
    `<PARTY>${bounded({ count: input.travelers.length, roles: input.travelers.map((traveler) => traveler.role) }, 500)}</PARTY>`,
    `<PRIOR_VERIFIED_FACTS>${bounded(
      input.evidence.slice(0, 40).map((entry) => ({
        id: entry.id,
        provider: entry.provider,
        tool: entry.toolName,
        status: entry.status,
        source: entry.sourceReference?.label ?? null,
      })),
      2_000,
    )}</PRIOR_VERIFIED_FACTS>`,
    `<OFFICIAL_EVIDENCE>${bounded(officialEvidence(input.liveEvidence ?? []), 5_000)}</OFFICIAL_EVIDENCE>`,
    `<DESTINATION>${bounded(destinationInput(input.destinationResolution), 1_000)}</DESTINATION>`,
    `<OFFICIAL_PLACES>${bounded(allowedPlaces, 2_000)}</OFFICIAL_PLACES>`,
    "<OUTPUT_RULES>Use only the requested dates. Official closures and permits override suggestions. sourceEntityHint may use an OFFICIAL_PLACES id only; otherwise use null. Preserve missing and conflicting evidence, require user confirmation, and keep unknown availability and booking unknown.</OUTPUT_RULES>",
  ]
    .join("\n")
    .slice(0, 14_000);
}

export function buildItineraryRepairContext(input: {
  approvedSummary: PlanningSummary;
  draft: CompactItineraryCandidateV1;
  validation: ValidationReport;
  evidence: NormalizedToolEvidence[];
  liveEvidence?: TravelEvidenceV1[];
  destinationResolution?: {
    resolutionId: string;
    resolution: CanonicalDestinationResolutionV1;
  };
}) {
  return [
    `<PLANNING_INPUT>${bounded(planningInput(input.approvedSummary), 5_000)}</PLANNING_INPUT>`,
    `<COMPACT_DRAFT>${bounded(input.draft, 10_000)}</COMPACT_DRAFT>`,
    `<VALIDATION_ISSUES>${bounded(input.validation.issues, 4_000)}</VALIDATION_ISSUES>`,
    `<PRIOR_VERIFIED_FACTS>${bounded(
      input.evidence.slice(0, 40).map((entry) => ({
        id: entry.id,
        provider: entry.provider,
        tool: entry.toolName,
        status: entry.status,
      })),
      1_500,
    )}</PRIOR_VERIFIED_FACTS>`,
    `<OFFICIAL_EVIDENCE>${bounded(officialEvidence(input.liveEvidence ?? []), 5_000)}</OFFICIAL_EVIDENCE>`,
    `<DESTINATION>${bounded(destinationInput(input.destinationResolution), 1_000)}</DESTINATION>`,
    "<REPAIR_RULES>Repair only listed issues. Preserve unchanged clientKey values, unknown evidence states, warnings, and booking requirements. Do not invent availability or confirmation.</REPAIR_RULES>",
  ]
    .join("\n")
    .slice(0, 24_000);
}
