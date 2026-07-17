import {
  itinerarySchema,
  revisionPatchV1Schema,
  type Itinerary,
  type PlanChangeAnalysis,
  type RevisionAllowedChangeManifestV1,
  type RevisionPatchV1,
} from "@trailie/schemas";
import { hashAllowedChangeManifest } from "./manifest";

export type RevisionPatchValidationReport = {
  status: "pass" | "blocked";
  issues: Array<{ code: string; operationIndex: number | null }>;
};

export function deriveDeterministicRevisionPatch(input: {
  basePlan: Itinerary;
  manifest: RevisionAllowedChangeManifestV1;
  analysis: PlanChangeAnalysis;
}): RevisionPatchV1 {
  const targetId = input.manifest.targetItemIds[0];
  const day = input.basePlan.days.find((entry) =>
    entry.items.some((item) => item.id === targetId),
  );
  if (!targetId || !day || input.manifest.requestType !== "remove_item")
    throw new Error("deterministic_revision_not_supported");
  const downstreamEffects = input.manifest.allowedDownstreamEffects
    .map((effect) => effect.effect)
    .filter((effect) => effect !== "same_day_timing_adjustment");
  return revisionPatchV1Schema.parse({
    schemaVersion: "1",
    status: "ready",
    blockers: [],
    baseVersion: input.manifest.baseVersion,
    manifestHash: hashAllowedChangeManifest(input.manifest),
    operations: [
      {
        operation: "remove",
        targetId,
        dayId: day.id,
        fieldChanges: {},
        reason: input.analysis.requestSummary,
        downstreamEffects,
      },
    ],
    preservedItemIds: input.manifest.protectedItemIds,
    evidenceRefreshTargets: input.manifest.evidenceRefreshTargets,
  });
}

export function validateRevisionPatch(
  patch: RevisionPatchV1,
  manifest: RevisionAllowedChangeManifestV1,
): RevisionPatchValidationReport {
  const issues: RevisionPatchValidationReport["issues"] = [];
  if (!revisionPatchV1Schema.safeParse(patch).success)
    issues.push({ code: "patch_schema_invalid", operationIndex: null });
  if (patch.baseVersion !== manifest.baseVersion)
    issues.push({ code: "patch_base_version_mismatch", operationIndex: null });
  if (patch.manifestHash !== hashAllowedChangeManifest(manifest))
    issues.push({ code: "patch_manifest_mismatch", operationIndex: null });
  if (patch.operations.length > manifest.maximumAffectedItems)
    issues.push({ code: "patch_item_limit_exceeded", operationIndex: null });
  const allowedEffects = new Set(
    manifest.allowedDownstreamEffects.map((effect) => effect.effect),
  );
  for (const [index, operation] of patch.operations.entries()) {
    if (!manifest.allowedOperations.includes(operation.operation))
      issues.push({
        code: "patch_operation_not_allowed",
        operationIndex: index,
      });
    if (
      !manifest.targetItemIds.includes(operation.targetId) &&
      !Object.hasOwn(manifest.allowedFieldsByItem, operation.targetId) &&
      !(manifest.requestType === "add_item" && operation.operation === "add")
    )
      issues.push({ code: "patch_target_not_allowed", operationIndex: index });
    if (!manifest.affectedDayIds.includes(operation.dayId))
      issues.push({ code: "patch_day_not_allowed", operationIndex: index });
    const allowedFields = new Set(
      manifest.allowedFieldsByItem[operation.targetId] ?? [],
    );
    for (const field of Object.keys(operation.fieldChanges))
      if (!allowedFields.has(field as never))
        issues.push({ code: "patch_field_not_allowed", operationIndex: index });
    for (const effect of operation.downstreamEffects)
      if (!allowedEffects.has(effect))
        issues.push({
          code: "patch_effect_not_allowed",
          operationIndex: index,
        });
  }
  for (const id of patch.preservedItemIds)
    if (!manifest.protectedItemIds.includes(id))
      issues.push({
        code: "patch_preservation_mismatch",
        operationIndex: null,
      });
  return { status: issues.length ? "blocked" : "pass", issues };
}

function subtractKnownCost(
  day: Itinerary["days"][number],
  item: Itinerary["days"][number]["items"][number],
) {
  if (
    day.estimatedDailyCost.amount === null ||
    item.cost.amount === null ||
    day.estimatedDailyCost.currency !== item.cost.currency
  )
    return;
  day.estimatedDailyCost.amount = Math.max(
    day.estimatedDailyCost.amount - item.cost.amount,
    0,
  );
  if (day.estimatedDailyCost.minAmount !== null && item.cost.minAmount !== null)
    day.estimatedDailyCost.minAmount = Math.max(
      day.estimatedDailyCost.minAmount - item.cost.minAmount,
      0,
    );
  if (day.estimatedDailyCost.maxAmount !== null && item.cost.maxAmount !== null)
    day.estimatedDailyCost.maxAmount = Math.max(
      day.estimatedDailyCost.maxAmount - item.cost.maxAmount,
      0,
    );
}

export function applyRevisionPatch(
  basePlan: Itinerary,
  patch: RevisionPatchV1,
  manifest: RevisionAllowedChangeManifestV1,
) {
  const report = validateRevisionPatch(patch, manifest);
  if (report.status !== "pass" || patch.status !== "ready")
    throw new Error("revision_patch_blocked");
  const candidate = structuredClone(basePlan);
  for (const operation of patch.operations) {
    let day = candidate.days.find((entry) => entry.id === operation.dayId);
    if (!day) throw new Error("revision_patch_day_missing");
    let itemIndex = day.items.findIndex(
      (item) => item.id === operation.targetId,
    );
    if (operation.operation === "remove") {
      if (itemIndex < 0) continue;
      const [removed] = day.items.splice(itemIndex, 1);
      day.travelSegments = day.travelSegments.filter(
        (segment) =>
          segment.fromItemId !== operation.targetId &&
          segment.toItemId !== operation.targetId,
      );
      subtractKnownCost(day, removed);
      continue;
    }
    if (itemIndex < 0) throw new Error("revision_patch_target_missing");
    if (
      operation.operation === "move" &&
      typeof operation.fieldChanges.dayId === "string" &&
      operation.fieldChanges.dayId !== day.id
    ) {
      const destinationDay = candidate.days.find(
        (entry) => entry.id === operation.fieldChanges.dayId,
      );
      if (!destinationDay) throw new Error("revision_patch_day_missing");
      const [moved] = day.items.splice(itemIndex, 1);
      destinationDay.items.push(moved);
      day = destinationDay;
      itemIndex = day.items.length - 1;
    }
    const item = day.items[itemIndex];
    for (const [field, value] of Object.entries(operation.fieldChanges)) {
      if (
        field === "startTime" ||
        field === "endTime" ||
        field === "title" ||
        field === "description"
      )
        Object.assign(item, { [field]: value });
      else if (field === "notes" && Array.isArray(value)) item.notes = value;
    }
  }
  return itinerarySchema.parse(candidate);
}
