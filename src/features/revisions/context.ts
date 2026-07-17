import type {
  Itinerary,
  PlanChangeAnalysis,
  PlanChangeType,
  PlanningSummary,
  RevisionAllowedChangeManifestV1,
} from "@trailie/schemas";
import type { NormalizedToolEvidence } from "@/features/itinerary/validation/validate-itinerary";
import type { buildProtectedRevisionSnapshot } from "./manifest";
import { semanticHash } from "./semantic-comparison";

function bounded(value: unknown, max: number) {
  const text = JSON.stringify(value);
  if (text.length <= max) return text;
  return JSON.stringify({
    truncated: true,
    semanticHash: semanticHash(value),
    originalCharacters: text.length,
  });
}
export function buildChangeAnalysisContext(input: {
  requestType: PlanChangeType;
  targetItemId: string | null;
  requestText: string;
  basePlan: Itinerary;
}) {
  return [
    `<EXPLICIT_CHANGE_REQUEST>${bounded({ type: input.requestType, targetItemId: input.targetItemId, instruction: input.requestText }, 4_000)}</EXPLICIT_CHANGE_REQUEST>`,
    `<BASE_PUBLISHED_ITINERARY>${bounded(input.basePlan, 31_000)}</BASE_PUBLISHED_ITINERARY>`,
  ]
    .join("\n")
    .slice(0, 36_000);
}
export function buildRevisionCandidateContext(input: {
  basePlan?: Itinerary;
  approvedSummary: PlanningSummary;
  analysis: PlanChangeAnalysis;
  evidence: NormalizedToolEvidence[];
  manifest: RevisionAllowedChangeManifestV1;
  manifestHash: string;
  protectedSnapshot: ReturnType<typeof buildProtectedRevisionSnapshot>;
  patch?: unknown;
}) {
  return [
    `<ALLOWED_CHANGE_MANIFEST>${bounded({ ...input.manifest, manifestHash: input.manifestHash }, 14_000)}</ALLOWED_CHANGE_MANIFEST>`,
    ...(input.patch
      ? [
          `<VALIDATED_REVISION_PATCH>${bounded(input.patch, 8_000)}</VALIDATED_REVISION_PATCH>`,
        ]
      : []),
    `<PROTECTED_CONTENT_CONTRACT>${bounded({ protectedItemIds: input.manifest.protectedItemIds, protectedDayIds: input.manifest.protectedDayIds, protectedTopLevelFields: input.manifest.protectedTopLevelFields, editableTopLevelFields: input.manifest.editableTopLevelFields, protectedItemHashes: input.protectedSnapshot.protectedItemHashes, protectedDayHashes: input.protectedSnapshot.protectedDayHashes, protectedTopLevelHashes: input.protectedSnapshot.protectedTopLevelHashes }, 10_000)}</PROTECTED_CONTENT_CONTRACT>`,
    `<APPROVED_CHANGE_ANALYSIS>${bounded(input.analysis, 6_000)}</APPROVED_CHANGE_ANALYSIS>`,
    `<EDITABLE_ITEM_FRAGMENTS>${bounded(input.protectedSnapshot.editableItems, 5_000)}</EDITABLE_ITEM_FRAGMENTS>`,
    `<PROTECTED_TOP_LEVEL_CONTENT>${bounded(input.protectedSnapshot.protectedTopLevelContent, 4_000)}</PROTECTED_TOP_LEVEL_CONTENT>`,
    `<APPROVED_PLANNING_SUMMARY>${bounded(input.approvedSummary, 3_000)}</APPROVED_PLANNING_SUMMARY>`,
    `<PROTECTED_ITEM_FRAGMENTS>${bounded(input.protectedSnapshot.protectedItems, 2_000)}</PROTECTED_ITEM_FRAGMENTS>`,
    `<PROTECTED_DAY_FRAGMENTS>${bounded(input.protectedSnapshot.protectedDays, 2_000)}</PROTECTED_DAY_FRAGMENTS>`,
    `<VERIFIED_EVIDENCE>${bounded(input.evidence.slice(0, 100), 1_000)}</VERIFIED_EVIDENCE>`,
  ].join("\n");
}
export function buildRevisionRepairContext(
  input: Parameters<typeof buildRevisionCandidateContext>[0] & {
    candidate: Itinerary;
    validation: unknown;
    boundary: unknown;
  },
) {
  return [
    `<VALIDATION>${bounded(input.validation, 8_000)}</VALIDATION>`,
    `<CHANGE_BOUNDARY>${bounded(input.boundary, 8_000)}</CHANGE_BOUNDARY>`,
    `<CANDIDATE>${bounded(input.candidate, 24_000)}</CANDIDATE>`,
    buildRevisionCandidateContext(input),
  ].join("\n");
}

export function buildRevisionScopeRepairContext(
  input: Parameters<typeof buildRevisionCandidateContext>[0] & {
    basePlan: Itinerary;
    candidate: Itinerary;
    unauthorizedDifferences: string[];
  },
) {
  return [
    `<UNAUTHORIZED_DIFFERENCES>${bounded(input.unauthorizedDifferences, 8_000)}</UNAUTHORIZED_DIFFERENCES>`,
    buildRevisionCandidateContext(input),
    `<BASE_PUBLISHED_ITINERARY>${bounded(input.basePlan, 16_000)}</BASE_PUBLISHED_ITINERARY>`,
    `<INVALID_CANDIDATE>${bounded(input.candidate, 16_000)}</INVALID_CANDIDATE>`,
  ].join("\n");
}
