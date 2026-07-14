import type { ChangeMateriality, PlanChangeType } from "@trailie/schemas";

export function routeChangeAnalysisModel(input: {
  requestType: PlanChangeType;
  affectedItemCount: number;
  affectedDayCount: number;
  materiality: ChangeMateriality;
  touchesConfirmedDecision: boolean;
}) {
  const complexType = [
    "change_route",
    "change_lodging",
    "update_traveler_logistics",
  ].includes(input.requestType);
  return complexType ||
    input.affectedItemCount > 2 ||
    input.affectedDayCount > 1 ||
    input.materiality === "critical" ||
    input.touchesConfirmedDecision
    ? "gpt-5.6-sol"
    : "gpt-5.6-terra";
}
