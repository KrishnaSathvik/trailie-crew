import type { ChangeMateriality, PlanChangeType } from "@trailie/schemas";

const rank: Record<ChangeMateriality, number> = {
  minor: 0,
  material: 1,
  critical: 2,
};
const materialTypes = new Set<PlanChangeType>([
  "add_item",
  "remove_item",
  "replace_item",
  "move_item",
  "reschedule_item",
  "shorten_item",
  "extend_item",
  "change_route",
  "change_lodging",
  "change_food",
  "rebalance_day",
  "update_traveler_logistics",
  "adjust_budget",
]);
const criticalLanguage =
  /\b(date|dates|destination|confirmed\s+(?:must[- ]?do|decision)|must[- ]?do|accessib(?:ility|le)|wheelchair|dietary|hard constraint)\b/i;

export function classifyChangeMateriality(input: {
  requestType: PlanChangeType;
  requestText: string;
  modelSuggestion?: ChangeMateriality;
}): ChangeMateriality {
  let deterministic: ChangeMateriality = materialTypes.has(input.requestType)
    ? "material"
    : "minor";
  if (criticalLanguage.test(input.requestText)) deterministic = "critical";
  const suggested = input.modelSuggestion ?? "minor";
  return rank[suggested] > rank[deterministic] ? suggested : deterministic;
}
