import type {
  Itinerary,
  PlanChangeAnalysis,
  PlanChangeType,
  PlanningSummary,
} from "@trailie/schemas";
import type { NormalizedToolEvidence } from "@/features/itinerary/validation/validate-itinerary";

function bounded(value: unknown, max: number) {
  const text = JSON.stringify(value);
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
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
  basePlan: Itinerary;
  approvedSummary: PlanningSummary;
  analysis: PlanChangeAnalysis;
  evidence: NormalizedToolEvidence[];
}) {
  return [
    `<BASE_PUBLISHED_ITINERARY>${bounded(input.basePlan, 30_000)}</BASE_PUBLISHED_ITINERARY>`,
    `<APPROVED_PLANNING_SUMMARY>${bounded(input.approvedSummary, 12_000)}</APPROVED_PLANNING_SUMMARY>`,
    `<APPROVED_CHANGE_ANALYSIS>${bounded(input.analysis, 10_000)}</APPROVED_CHANGE_ANALYSIS>`,
    `<VERIFIED_EVIDENCE>${bounded(input.evidence.slice(0, 100), 10_000)}</VERIFIED_EVIDENCE>`,
  ]
    .join("\n")
    .slice(0, 64_000);
}
export function buildRevisionRepairContext(
  input: Parameters<typeof buildRevisionCandidateContext>[0] & {
    candidate: Itinerary;
    validation: unknown;
    boundary: unknown;
  },
) {
  return [
    buildRevisionCandidateContext(input),
    `<CANDIDATE>${bounded(input.candidate, 24_000)}</CANDIDATE>`,
    `<VALIDATION>${bounded(input.validation, 8_000)}</VALIDATION>`,
    `<CHANGE_BOUNDARY>${bounded(input.boundary, 8_000)}</CHANGE_BOUNDARY>`,
  ]
    .join("\n")
    .slice(0, 96_000);
}
