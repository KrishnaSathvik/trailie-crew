import type { ChangeMateriality, PlanChangeType } from "@trailie/schemas";
import { createTrailieRuntimeRouter } from "@/server/ai/model-router";

export function routeChangeAnalysisModel(
  input: {
    requestType: PlanChangeType;
    affectedItemCount: number;
    affectedDayCount: number;
    materiality: ChangeMateriality;
    touchesConfirmedDecision: boolean;
  },
  models: { fast: string; reasoning: string },
) {
  const complexType = [
    "change_route",
    "change_lodging",
    "update_traveler_logistics",
  ].includes(input.requestType);
  const complexity =
    complexType ||
    input.affectedItemCount > 2 ||
    input.affectedDayCount > 1 ||
    input.materiality === "critical" ||
    input.touchesConfirmedDecision
      ? "large_revision"
      : "small_revision";
  return createTrailieRuntimeRouter({
    ...models,
    planning: models.reasoning,
    itinerary: models.reasoning,
  }).route({
    intent: "itinerary_revision",
    request: input.requestType,
    complexity,
  }).model!;
}

export function routeRevisionExecution(input: {
  requestType: PlanChangeType;
  affectedItemCount: number;
  affectedDayCount: number;
}): "deterministic" | "constrained_terra" | "constrained_sol" {
  if (
    input.requestType === "remove_item" &&
    input.affectedItemCount <= 2 &&
    input.affectedDayCount === 1
  )
    return "deterministic";
  const terraPatchTypes: PlanChangeType[] = [
    "move_item",
    "reschedule_item",
    "shorten_item",
    "extend_item",
    "update_note",
  ];
  return terraPatchTypes.includes(input.requestType) &&
    input.affectedItemCount <= 2 &&
    input.affectedDayCount === 1
    ? "constrained_terra"
    : "constrained_sol";
}
