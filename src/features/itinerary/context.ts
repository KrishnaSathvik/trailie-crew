import type {
  Itinerary,
  PlanningSummary,
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
}) {
  return [
    `<APPROVED_SUMMARY>${bounded(input.approvedSummary, 12_000)}</APPROVED_SUMMARY>`,
    `<ACTIVE_TRAVELERS>${bounded(input.travelers.slice(0, 50), 4_000)}</ACTIVE_TRAVELERS>`,
    `<VERIFIED_EVIDENCE>${bounded(input.evidence.slice(0, 100), 10_000)}</VERIFIED_EVIDENCE>`,
  ]
    .join("\n")
    .slice(0, 24_000);
}

export function buildItineraryRepairContext(input: {
  approvedSummary: PlanningSummary;
  draft: Itinerary;
  validation: ValidationReport;
  evidence: NormalizedToolEvidence[];
}) {
  return [
    `<APPROVED_SUMMARY>${bounded(input.approvedSummary, 12_000)}</APPROVED_SUMMARY>`,
    `<DRAFT>${bounded(input.draft, 24_000)}</DRAFT>`,
    `<VALIDATION_ISSUES>${bounded(input.validation.issues, 8_000)}</VALIDATION_ISSUES>`,
    `<VERIFIED_EVIDENCE>${bounded(input.evidence.slice(0, 100), 10_000)}</VERIFIED_EVIDENCE>`,
  ]
    .join("\n")
    .slice(0, 48_000);
}
