import type {
  Itinerary,
  ItineraryItem,
  RevisionAllowedChangeManifestV1,
} from "@trailie/schemas";
import {
  revisionValuesEqual,
  semanticHash,
  semanticPlanIndex,
} from "../semantic-comparison";

type PreservationIssue = {
  code: string;
  path: string;
  itemId: string | null;
};

export type CandidatePreservationReport = {
  validatorVersion: "trailie-revision-preservation-v1";
  status: "pass" | "blocked";
  issues: PreservationIssue[];
  unauthorizedDifferences: string[];
};

function itemLocations(plan: Itinerary) {
  const result = new Map<
    string,
    { item: ItineraryItem; dayId: string; index: number }
  >();
  for (const day of plan.days)
    day.items.forEach((item, index) =>
      result.set(item.id, { item, dayId: day.id, index }),
    );
  return result;
}

function addIssue(
  issues: PreservationIssue[],
  unauthorizedDifferences: string[],
  code: string,
  path: string,
  itemId: string | null = null,
) {
  if (!issues.some((issue) => issue.code === code && issue.path === path))
    issues.push({ code, path, itemId });
  if (!unauthorizedDifferences.includes(path))
    unauthorizedDifferences.push(path);
}

function changedCollectionEntries(left: unknown, right: unknown) {
  if (!Array.isArray(left) || !Array.isArray(right))
    return revisionValuesEqual(left, right) ? 0 : 1;
  const keyed = (values: unknown[]) =>
    new Map(
      values.map((value, index) => [
        typeof value === "object" &&
        value !== null &&
        "id" in value &&
        typeof value.id === "string"
          ? value.id
          : `index:${index}`,
        semanticHash(value),
      ]),
    );
  const before = keyed(left);
  const after = keyed(right);
  return [...new Set([...before.keys(), ...after.keys()])].reduce(
    (count, key) => count + (before.get(key) === after.get(key) ? 0 : 1),
    0,
  );
}

export function validateCandidatePreservation(input: {
  base: Itinerary;
  candidate: Itinerary;
  manifest: RevisionAllowedChangeManifestV1;
}): CandidatePreservationReport {
  const issues: PreservationIssue[] = [];
  const unauthorizedDifferences: string[] = [];
  const baseIndex = semanticPlanIndex(input.base);
  const candidateIndex = semanticPlanIndex(input.candidate);
  const before = itemLocations(input.base);
  const after = itemLocations(input.candidate);

  for (const id of input.manifest.protectedItemIds) {
    const left = before.get(id);
    const right = after.get(id);
    if (!left || !right) {
      addIssue(
        issues,
        unauthorizedDifferences,
        "protected_item_id_changed",
        `items.${id}`,
        id,
      );
      continue;
    }
    if (left.dayId !== right.dayId)
      addIssue(
        issues,
        unauthorizedDifferences,
        "protected_item_moved",
        `items.${id}.dayId`,
        id,
      );
    if (baseIndex.itemHashes[id] !== candidateIndex.itemHashes[id])
      addIssue(
        issues,
        unauthorizedDifferences,
        "protected_item_changed",
        `items.${id}`,
        id,
      );
  }

  for (const day of input.base.days) {
    const baseOrder = day.items
      .map((item) => item.id)
      .filter((id) => input.manifest.protectedItemIds.includes(id));
    const candidateDay = input.candidate.days.find(
      (entry) => entry.id === day.id,
    );
    const candidateOrder = (candidateDay?.items ?? [])
      .map((item) => item.id)
      .filter((id) => input.manifest.protectedItemIds.includes(id));
    if (!revisionValuesEqual(baseOrder, candidateOrder))
      addIssue(
        issues,
        unauthorizedDifferences,
        "protected_item_reordered",
        `days.${day.id}.itemOrder`,
      );
  }

  for (const id of input.manifest.protectedDayIds)
    if (baseIndex.dayHashes[id] !== candidateIndex.dayHashes[id])
      addIssue(
        issues,
        unauthorizedDifferences,
        "protected_day_changed",
        `days.${id}`,
      );

  for (const field of input.manifest.protectedTopLevelFields)
    if (
      baseIndex.topLevelHashes[field] !== candidateIndex.topLevelHashes[field]
    )
      addIssue(
        issues,
        unauthorizedDifferences,
        "protected_top_level_changed",
        `plan.${field}`,
      );
  let changedTopLevelEntries = 0;
  for (const field of input.manifest.editableTopLevelFields)
    changedTopLevelEntries += changedCollectionEntries(
      input.base[field],
      input.candidate[field],
    );
  if (changedTopLevelEntries > input.manifest.maximumAffectedTopLevelEntries)
    addIssue(
      issues,
      unauthorizedDifferences,
      "maximum_affected_top_level_entries_exceeded",
      "plan.topLevelCollections",
    );

  const allIds = new Set([...before.keys(), ...after.keys()]);
  const changedItemIds = new Set<string>();
  const changedDayIds = new Set<string>();
  for (const id of allIds) {
    const left = before.get(id);
    const right = after.get(id);
    if (
      left &&
      right &&
      left.dayId === right.dayId &&
      semanticHash(left.item) === semanticHash(right.item)
    )
      continue;
    changedItemIds.add(id);
    if (left) changedDayIds.add(left.dayId);
    if (right) changedDayIds.add(right.dayId);
    const allowedFields = input.manifest.allowedFieldsByItem[id];
    const isTarget = input.manifest.targetItemIds.includes(id);
    const isAllowedAddition =
      !left &&
      !!right &&
      input.manifest.requestType === "add_item" &&
      input.manifest.affectedDayIds.includes(right.dayId);
    if ((!left || !right) && !isTarget && !isAllowedAddition) {
      addIssue(
        issues,
        unauthorizedDifferences,
        "item_identity_not_allowed",
        `items.${id}`,
        id,
      );
      continue;
    }
    if (!left || !right) continue;
    if (!allowedFields) {
      addIssue(
        issues,
        unauthorizedDifferences,
        "item_change_not_allowed",
        `items.${id}`,
        id,
      );
      continue;
    }
    if (left.dayId !== right.dayId && !allowedFields.includes("dayId"))
      addIssue(
        issues,
        unauthorizedDifferences,
        "item_field_not_allowed",
        `items.${id}.dayId`,
        id,
      );
    for (const key of Object.keys(left.item) as Array<keyof ItineraryItem>) {
      if (
        !revisionValuesEqual(left.item[key], right.item[key]) &&
        !allowedFields.includes(key as never)
      )
        addIssue(
          issues,
          unauthorizedDifferences,
          "item_field_not_allowed",
          `items.${id}.${key}`,
          id,
        );
    }
  }

  if (changedItemIds.size > input.manifest.maximumAffectedItems)
    addIssue(
      issues,
      unauthorizedDifferences,
      "maximum_affected_items_exceeded",
      "plan.items",
    );
  if (changedDayIds.size > input.manifest.maximumAffectedDays)
    addIssue(
      issues,
      unauthorizedDifferences,
      "maximum_affected_days_exceeded",
      "plan.days",
    );

  const effectsByDay = new Map<
    string,
    Array<RevisionAllowedChangeManifestV1["allowedDownstreamEffects"][number]>
  >();
  for (const effect of input.manifest.allowedDownstreamEffects) {
    const effects = effectsByDay.get(effect.dayId) ?? [];
    effects.push(effect);
    effectsByDay.set(effect.dayId, effects);
  }
  for (const baseDay of input.base.days) {
    const candidateDay = input.candidate.days.find(
      (day) => day.id === baseDay.id,
    );
    if (!candidateDay) continue;
    const effects = effectsByDay.get(baseDay.id) ?? [];
    const routeCleanupTargets = new Set(
      effects
        .filter((effect) => effect.effect === "route_cleanup")
        .flatMap((effect) => effect.itemIds),
    );
    if (
      !revisionValuesEqual(
        baseDay.travelSegments,
        candidateDay.travelSegments,
      ) &&
      routeCleanupTargets.size === 0
    )
      addIssue(
        issues,
        unauthorizedDifferences,
        "route_change_not_allowed",
        `days.${baseDay.id}.travelSegments`,
      );
    if (routeCleanupTargets.size > 0) {
      const unrelated = (segments: typeof baseDay.travelSegments) =>
        segments.filter(
          (segment) =>
            !(
              (segment.fromItemId &&
                routeCleanupTargets.has(segment.fromItemId)) ||
              (segment.toItemId && routeCleanupTargets.has(segment.toItemId))
            ),
        );
      if (
        !revisionValuesEqual(
          unrelated(baseDay.travelSegments),
          unrelated(candidateDay.travelSegments),
        )
      )
        addIssue(
          issues,
          unauthorizedDifferences,
          "unrelated_route_change",
          `days.${baseDay.id}.travelSegments`,
        );
    }
    if (
      !revisionValuesEqual(
        baseDay.estimatedDailyCost,
        candidateDay.estimatedDailyCost,
      ) &&
      !effects.some((effect) => effect.effect === "day_cost_recalculation")
    )
      addIssue(
        issues,
        unauthorizedDifferences,
        "cost_change_not_allowed",
        `days.${baseDay.id}.estimatedDailyCost`,
      );
    for (const field of ["title", "summary", "warnings"] as const)
      if (!revisionValuesEqual(baseDay[field], candidateDay[field]))
        addIssue(
          issues,
          unauthorizedDifferences,
          "day_field_not_allowed",
          `days.${baseDay.id}.${field}`,
        );
  }

  return {
    validatorVersion: "trailie-revision-preservation-v1",
    status: issues.length ? "blocked" : "pass",
    issues,
    unauthorizedDifferences,
  };
}
