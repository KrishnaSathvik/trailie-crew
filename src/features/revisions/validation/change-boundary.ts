import type {
  Itinerary,
  PlanChangeAnalysis,
  PlanVersionDiff,
} from "@trailie/schemas";
import { buildPlanVersionDiff } from "../diff";

export type ChangeBoundaryReport = {
  validatorVersion: "trailie-change-boundary-v1";
  status: "pass" | "blocked";
  issues: Array<{ code: string; message: string; itemId: string | null }>;
  diff: PlanVersionDiff;
};

export function validateChangeBoundary(input: {
  base: Itinerary;
  candidate: Itinerary;
  analysis: PlanChangeAnalysis;
  baseVersion: number;
  candidateVersion: number;
}): ChangeBoundaryReport {
  const reasons = Object.fromEntries(
    input.analysis.requestedChange.targetItemIds.map((id) => [
      id,
      input.analysis.requestSummary,
    ]),
  );
  const diff = buildPlanVersionDiff(input.base, input.candidate, {
    baseVersion: input.baseVersion,
    candidateVersion: input.candidateVersion,
    reasons,
  });
  const issues: ChangeBoundaryReport["issues"] = [];
  if (input.candidateVersion !== input.baseVersion + 1)
    issues.push({
      code: "candidate_version_mismatch",
      message: "Candidate version is not the next room version.",
      itemId: null,
    });
  if (input.base.destinationSummary !== input.candidate.destinationSummary)
    issues.push({
      code: "destination_drift",
      message: "Destination changed outside the approved request.",
      itemId: null,
    });
  if (
    input.base.startDate !== input.candidate.startDate ||
    input.base.endDate !== input.candidate.endDate
  )
    issues.push({
      code: "date_drift",
      message: "Trip dates changed outside the approved request.",
      itemId: null,
    });
  const allowed = new Set([
    ...input.analysis.requestedChange.targetItemIds,
    ...input.analysis.affectedItems.map((entry) => entry.itemId),
  ]);
  for (const change of diff.items) {
    if (!allowed.has(change.itemId))
      issues.push({
        code: "unapproved_item_change",
        message: "An item outside the approved scope changed.",
        itemId: change.itemId,
      });
  }
  const targetedTypes = new Set([
    "remove_item",
    "replace_item",
    "move_item",
    "reschedule_item",
    "shorten_item",
    "extend_item",
  ]);
  if (
    targetedTypes.has(input.analysis.requestedChange.type) &&
    !input.analysis.requestedChange.targetItemIds.every((id) =>
      diff.items.some((change) => change.itemId === id),
    )
  ) {
    issues.push({
      code: "approved_change_not_applied",
      message: "The approved target did not change in the candidate.",
      itemId: input.analysis.requestedChange.targetItemIds[0] ?? null,
    });
  }
  return {
    validatorVersion: "trailie-change-boundary-v1",
    status: issues.length ? "blocked" : "pass",
    issues,
    diff,
  };
}
