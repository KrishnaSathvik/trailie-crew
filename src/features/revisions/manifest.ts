import {
  revisionAllowedChangeManifestV1Schema,
  type Itinerary,
  type PlanChangeAnalysis,
  type PlanChangeType,
  type PlanningSummary,
  type RevisionAllowedChangeManifestV1,
  type RevisionAllowedOperation,
  type RevisionEditableField,
} from "@trailie/schemas";
import { semanticHash, semanticPlanIndex } from "./semantic-comparison";

type ManifestInput = {
  changeRequestId: string;
  basePlanId: string;
  baseVersion: number;
  basePlanHash?: string;
  analysisVersion: number;
  requestType: PlanChangeType;
  targetItemId: string | null;
  basePlan: Itinerary;
  analysis: PlanChangeAnalysis;
  approvedSummary: PlanningSummary;
};

const protectedTopLevelFields = [
  "title",
  "destinationSummary",
  "timezone",
  "startDate",
  "endDate",
  "travelers",
  "arrivals",
  "departures",
  "lodging",
  "restaurants",
  "unresolvedItems",
  "assumptions",
  "validationMetadata",
] as const;

function editableTopLevelFieldsFor(requestType: PlanChangeType) {
  const editable: Array<(typeof protectedTopLevelFields)[number]> = [];
  if (requestType === "change_lodging") editable.push("lodging");
  if (requestType === "change_food") editable.push("restaurants");
  if (requestType === "update_traveler_logistics") {
    editable.push("travelers", "arrivals", "departures");
  }
  return editable;
}

function protectedTopLevelFieldsFor(requestType: PlanChangeType) {
  const editable = new Set(editableTopLevelFieldsFor(requestType));
  return protectedTopLevelFields.filter((field) => !editable.has(field));
}

function locateItem(plan: Itinerary, id: string | null) {
  if (!id) return null;
  for (const day of plan.days) {
    const itemIndex = day.items.findIndex((item) => item.id === id);
    if (itemIndex >= 0) return { day, itemIndex, item: day.items[itemIndex] };
  }
  return null;
}

function narrowScope(input: ManifestInput) {
  const target = locateItem(input.basePlan, input.targetItemId);
  if (!target) return null;
  const editable = new Map<string, RevisionEditableField[]>();
  editable.set(target.item.id, []);
  const operations: RevisionAllowedOperation[] = [];
  const downstream: RevisionAllowedChangeManifestV1["allowedDownstreamEffects"] =
    [];
  switch (input.requestType) {
    case "remove_item": {
      operations.push(
        "remove",
        "route_adjustment",
        "reschedule",
        "cost_recalculation",
        "evidence_refresh",
      );
      const next = target.day.items[target.itemIndex + 1];
      if (next) {
        editable.set(next.id, ["startTime", "endTime"]);
        downstream.push({
          effect: "same_day_timing_adjustment",
          dayId: target.day.id,
          itemIds: [next.id],
          allowedFields: ["startTime", "endTime"],
        });
      }
      downstream.push(
        {
          effect: "route_cleanup",
          dayId: target.day.id,
          itemIds: [target.item.id],
          allowedFields: ["travelSegments"],
        },
        {
          effect: "day_cost_recalculation",
          dayId: target.day.id,
          itemIds: [target.item.id],
          allowedFields: ["estimatedDailyCost"],
        },
        {
          effect: "evidence_refresh",
          dayId: target.day.id,
          itemIds: [target.item.id],
          allowedFields: ["evidenceRefs"],
        },
      );
      break;
    }
    case "move_item":
      operations.push("move", "route_adjustment", "reschedule");
      editable.set(target.item.id, ["dayId", "startTime", "endTime"]);
      break;
    case "reschedule_item":
    case "shorten_item":
    case "extend_item":
      operations.push("reschedule", "route_adjustment");
      editable.set(target.item.id, ["startTime", "endTime"]);
      break;
    case "update_note":
      operations.push("update");
      editable.set(target.item.id, ["notes"]);
      break;
    default:
      return null;
  }
  return { dayId: target.day.id, editable, operations, downstream };
}

export function deriveAllowedChangeManifest(
  input: ManifestInput,
): RevisionAllowedChangeManifestV1 {
  const allItems = input.basePlan.days.flatMap((day) => day.items);
  const narrow = narrowScope(input);
  const analysisIds = input.analysis.affectedItems
    .map((entry) => entry.itemId)
    .filter((id) => allItems.some((item) => item.id === id));
  const targetIds = input.targetItemId ? [input.targetItemId] : [];
  const broadTypes = new Set<PlanChangeType>([
    "general_revision",
    "rebalance_day",
    "adjust_budget",
  ]);
  const applicationSelectedIds = targetIds.length
    ? targetIds
    : broadTypes.has(input.requestType)
      ? analysisIds.slice(0, input.requestType === "general_revision" ? 20 : 10)
      : [];
  const editable =
    narrow?.editable ??
    new Map(
      applicationSelectedIds.map((id) => [
        id,
        [
          "type",
          "startTime",
          "endTime",
          "title",
          "description",
          "location",
          "reservation",
          "cost",
          "evidenceRefs",
          "notes",
          "dayId",
        ] satisfies RevisionEditableField[],
      ]),
    );
  const affectedDayIds = narrow
    ? [narrow.dayId]
    : [
        ...new Set([
          ...input.basePlan.days
            .filter((day) => day.items.some((item) => editable.has(item.id)))
            .map((day) => day.id),
          ...input.basePlan.days
            .filter((day) => input.analysis.affectedDays.includes(day.date))
            .slice(0, input.requestType === "general_revision" ? 3 : 1)
            .map((day) => day.id),
        ]),
      ];
  const genericOperations: RevisionAllowedOperation[] = [
    input.requestType === "add_item"
      ? "add"
      : input.requestType === "replace_item"
        ? "replace"
        : "update",
  ];
  const editableIds = new Set(editable.keys());
  const editableTopLevelFields = editableTopLevelFieldsFor(input.requestType);
  const manifest = {
    schemaVersion: "1" as const,
    changeRequestId: input.changeRequestId,
    basePlanId: input.basePlanId,
    baseVersion: input.baseVersion,
    basePlanHash: input.basePlanHash ?? semanticHash(input.basePlan),
    analysisVersion: input.analysisVersion,
    requestType: input.requestType,
    targetItemIds: targetIds,
    affectedDayIds,
    allowedOperations: narrow?.operations ?? genericOperations,
    allowedFieldsByItem: Object.fromEntries(editable),
    allowedDownstreamEffects: narrow?.downstream ?? [],
    protectedItemIds: allItems
      .map((item) => item.id)
      .filter((id) => !editableIds.has(id))
      .sort(),
    protectedDayIds: input.basePlan.days
      .map((day) => day.id)
      .filter((id) => !affectedDayIds.includes(id))
      .sort(),
    protectedTopLevelFields: protectedTopLevelFieldsFor(input.requestType),
    editableTopLevelFields,
    maximumAffectedTopLevelEntries:
      editableTopLevelFields.length === 0 ? 0 : editableTopLevelFields.length,
    requiredPreservations: [
      "stable_ids" as const,
      "item_order" as const,
      "confirmed_decisions" as const,
      "hard_constraints" as const,
      "rejected_options_absent" as const,
    ],
    forbiddenChanges: [
      "destination" as const,
      "date_range" as const,
      "request_type" as const,
      "confirmed_decisions" as const,
      "hard_constraints" as const,
      "rejected_options" as const,
      "unapproved_lodging" as const,
      "unapproved_traveler_logistics" as const,
      "whole_plan_rewrite" as const,
    ].filter(
      (change) =>
        !(
          (change === "unapproved_lodging" &&
            input.requestType === "change_lodging") ||
          (change === "unapproved_traveler_logistics" &&
            input.requestType === "update_traveler_logistics")
        ),
    ),
    evidenceRefreshTargets: targetIds,
    maximumAffectedItems: Math.max(editable.size, 1),
    maximumAffectedDays: Math.max(affectedDayIds.length, 1),
  };
  return revisionAllowedChangeManifestV1Schema.parse(manifest);
}

export function hashAllowedChangeManifest(
  manifest: RevisionAllowedChangeManifestV1,
) {
  return semanticHash(revisionAllowedChangeManifestV1Schema.parse(manifest));
}

export function buildProtectedRevisionSnapshot(
  basePlan: Itinerary,
  manifest: RevisionAllowedChangeManifestV1,
) {
  const index = semanticPlanIndex(basePlan);
  const protectedItems = basePlan.days
    .filter((day) => !manifest.protectedDayIds.includes(day.id))
    .flatMap((day) => day.items)
    .filter((item) => manifest.protectedItemIds.includes(item.id));
  const editableItems = basePlan.days
    .flatMap((day) => day.items)
    .filter((item) => Object.hasOwn(manifest.allowedFieldsByItem, item.id));
  const protectedDays = basePlan.days.filter((day) =>
    manifest.protectedDayIds.includes(day.id),
  );
  const protectedTopLevelContent = Object.fromEntries(
    manifest.protectedTopLevelFields.map((field) => [field, basePlan[field]]),
  );
  return {
    protectedItems,
    editableItems,
    protectedDays,
    protectedTopLevelContent,
    protectedItemHashes: Object.fromEntries(
      manifest.protectedItemIds.map((id) => [id, index.itemHashes[id]]),
    ),
    protectedDayHashes: Object.fromEntries(
      manifest.protectedDayIds.map((id) => [id, index.dayHashes[id]]),
    ),
    protectedTopLevelHashes: Object.fromEntries(
      manifest.protectedTopLevelFields.map((field) => [
        field,
        index.topLevelHashes[field],
      ]),
    ),
    protectedItemOrderByDay: index.itemOrderByDay,
  };
}
