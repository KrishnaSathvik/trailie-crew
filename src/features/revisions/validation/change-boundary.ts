import type {
  Itinerary,
  PlanChangeAnalysis,
  PlanVersionDiff,
  RevisionAllowedChangeManifestV1,
} from "@trailie/schemas";
import { buildPlanVersionDiff } from "../diff";
import {
  validateCandidatePreservation,
  type CandidatePreservationReport,
} from "./preservation-contract";

export type ChangeBoundaryReport = {
  validatorVersion: "trailie-change-boundary-v2";
  status: "pass" | "blocked";
  issues: Array<{ code: string; message: string; itemId: string | null }>;
  diff: PlanVersionDiff;
  preservation: CandidatePreservationReport;
};

export function validateChangeBoundary(input: {
  base: Itinerary;
  candidate: Itinerary;
  analysis: PlanChangeAnalysis;
  manifest: RevisionAllowedChangeManifestV1;
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
    expectedOperations:
      input.analysis.requestedChange.type === "replace_item"
        ? Object.fromEntries(
            input.analysis.requestedChange.targetItemIds.map((id) => [
              id,
              "replaced" as const,
            ]),
          )
        : undefined,
  });
  const issues: ChangeBoundaryReport["issues"] = [];
  const preservation = validateCandidatePreservation({
    base: input.base,
    candidate: input.candidate,
    manifest: input.manifest,
  });
  for (const issue of preservation.issues)
    issues.push({
      code: issue.code,
      message: `Candidate changed protected revision content at ${issue.path}.`,
      itemId: issue.itemId,
    });
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
    ...input.manifest.targetItemIds,
    ...Object.keys(input.manifest.allowedFieldsByItem),
  ]);
  for (const change of diff.items) {
    const allowedAddition =
      input.manifest.requestType === "add_item" && change.operation === "added";
    if (!allowed.has(change.itemId) && !allowedAddition)
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
  const allowedTargetOperations: Partial<
    Record<
      PlanChangeAnalysis["requestedChange"]["type"],
      Set<PlanVersionDiff["items"][number]["operation"]>
    >
  > = {
    remove_item: new Set(["removed"]),
    replace_item: new Set(["replaced"]),
    move_item: new Set(["moved", "rescheduled"]),
    reschedule_item: new Set(["rescheduled"]),
    shorten_item: new Set(["rescheduled"]),
    extend_item: new Set(["rescheduled"]),
    update_note: new Set(["updated"]),
  };
  const targetOperations =
    allowedTargetOperations[input.analysis.requestedChange.type];
  if (targetOperations) {
    for (const targetId of input.analysis.requestedChange.targetItemIds) {
      const targetChange = diff.items.find(
        (change) => change.itemId === targetId,
      );
      if (targetChange && !targetOperations.has(targetChange.operation))
        issues.push({
          code: "approved_operation_not_applied",
          message:
            "The candidate changed the approved target using a different operation.",
          itemId: targetId,
        });
    }
  }
  return {
    validatorVersion: "trailie-change-boundary-v2",
    status: issues.length ? "blocked" : "pass",
    issues,
    diff,
    preservation,
  };
}
