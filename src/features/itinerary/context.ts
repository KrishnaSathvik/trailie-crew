import type {
  Itinerary,
  CanonicalDestinationResolutionV1,
  PlanningSummary,
  TravelEvidenceV1,
  ValidationReport,
} from "@trailie/schemas";
import type { NormalizedToolEvidence } from "./validation/validate-itinerary";

function bounded(value: unknown, max: number) {
  const text = JSON.stringify(value);
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
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
      coordinatesAvailable: true,
    }));
  return [
    `<APPROVED_SUMMARY>${bounded(input.approvedSummary, 12_000)}</APPROVED_SUMMARY>`,
    `<ACTIVE_TRAVELERS>${bounded(input.travelers.slice(0, 50), 4_000)}</ACTIVE_TRAVELERS>`,
    `<VERIFIED_EVIDENCE>${bounded(input.evidence.slice(0, 100), 10_000)}</VERIFIED_EVIDENCE>`,
    `<LIVE_TRAVEL_EVIDENCE>${bounded((input.liveEvidence ?? []).slice(0, 200), 20_000)}</LIVE_TRAVEL_EVIDENCE>`,
    `<CANONICAL_DESTINATION>${bounded(input.destinationResolution ?? null, 4_000)}</CANONICAL_DESTINATION>`,
    `<ALLOWED_OFFICIAL_PLACES>${bounded(allowedPlaces, 8_000)}</ALLOWED_OFFICIAL_PLACES>`,
    "<DESTINATION_IDENTITY_POLICY>The application-owned canonical destination is authoritative. Preserve its resolution ID, canonical identity, NPS park code, and semantic hash. A display label may vary only if it still identifies the same entity.</DESTINATION_IDENTITY_POLICY>",
    "<LIVE_EVIDENCE_POLICY>Distinguish verified, stale, missing, unavailable, inferred, and conflicting evidence. Official closures take precedence. Never claim live availability or booking completion without verified official evidence. Surface conflicts and required user confirmation.</LIVE_EVIDENCE_POLICY>",
    "<OFFICIAL_PLACE_POLICY>Use allowed official places when naming supported park features. Preserve officialId in sourceEntityId. Never invent or guess an official ID; leave unsupported or vague items unresolved.</OFFICIAL_PLACE_POLICY>",
  ]
    .join("\n")
    .slice(0, 28_000);
}

export function buildItineraryRepairContext(input: {
  approvedSummary: PlanningSummary;
  draft: Itinerary;
  validation: ValidationReport;
  evidence: NormalizedToolEvidence[];
  liveEvidence?: TravelEvidenceV1[];
  destinationResolution?: {
    resolutionId: string;
    resolution: CanonicalDestinationResolutionV1;
  };
}) {
  return [
    `<APPROVED_SUMMARY>${bounded(input.approvedSummary, 12_000)}</APPROVED_SUMMARY>`,
    `<DRAFT>${bounded(input.draft, 24_000)}</DRAFT>`,
    `<VALIDATION_ISSUES>${bounded(input.validation.issues, 8_000)}</VALIDATION_ISSUES>`,
    `<VERIFIED_EVIDENCE>${bounded(input.evidence.slice(0, 100), 10_000)}</VERIFIED_EVIDENCE>`,
    `<LIVE_TRAVEL_EVIDENCE>${bounded((input.liveEvidence ?? []).slice(0, 200), 20_000)}</LIVE_TRAVEL_EVIDENCE>`,
    `<CANONICAL_DESTINATION>${bounded(input.destinationResolution ?? null, 4_000)}</CANONICAL_DESTINATION>`,
    "<DESTINATION_IDENTITY_POLICY>Repair content only. Preserve the application-owned canonical destination resolution ID, identity, NPS park code, coordinates binding, and semantic hash.</DESTINATION_IDENTITY_POLICY>",
    "<LIVE_EVIDENCE_POLICY>Official closures take precedence. Preserve unavailable, stale, inferred, and conflicting states. Never invent availability, confirmation, or booking.</LIVE_EVIDENCE_POLICY>",
  ]
    .join("\n")
    .slice(0, 44_000);
}
