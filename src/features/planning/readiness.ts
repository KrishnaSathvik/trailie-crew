import type { PlanningReadinessStatus } from "@trailie/schemas";

type Input = {
  destinations: string[];
  destinationUnresolved?: boolean;
  dateWindows: string[];
  flexibleDates: boolean;
  activeTravelerCount: number;
  hardConstraints: string[];
  conflicts: Array<{ detail: string; schedulingImpossible: boolean }>;
  optionalMissing?: string[];
};

export function computePlanningReadiness(input: Input): {
  status: PlanningReadinessStatus;
  blockers: string[];
  warnings: string[];
} {
  const blockers: string[] = [];
  const warnings = [...(input.optionalMissing ?? [])];
  if (!input.destinations.length && !input.destinationUnresolved)
    blockers.push(
      "Choose a destination or explicitly keep the destination flexible.",
    );
  if (!input.dateWindows.length && !input.flexibleDates)
    blockers.push(
      "Add a usable date range or explicitly mark dates as flexible.",
    );
  if (input.activeTravelerCount < 1)
    blockers.push("At least one active traveler is required.");
  const impossible = input.conflicts.filter(
    (item) => item.schedulingImpossible,
  );
  if (impossible.length)
    return {
      status: "blocked",
      blockers: impossible.map((item) => item.detail),
      warnings,
    };
  return {
    status: blockers.length ? "needs_information" : "ready_for_review",
    blockers,
    warnings,
  };
}
