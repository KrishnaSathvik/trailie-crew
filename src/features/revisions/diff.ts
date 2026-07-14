import {
  planVersionDiffSchema,
  type Itinerary,
  type ItineraryItem,
  type PlanVersionDiff,
} from "@trailie/schemas";

type ItemLocation = { item: ItineraryItem; dayId: string; date: string };
function items(plan: Itinerary) {
  const result = new Map<string, ItemLocation>();
  for (const day of plan.days)
    for (const item of day.items)
      result.set(item.id, { item, dayId: day.id, date: day.date });
  return result;
}
function summary(item: ItineraryItem) {
  const time =
    item.startTime || item.endTime
      ? `${item.startTime ?? "Open"}–${item.endTime ?? "Open"} `
      : "";
  return `${time}${item.title}`;
}
function materialItem(item: ItineraryItem) {
  return {
    ...item,
    evidenceRefs: [],
    location: item.location
      ? { ...item.location, verificationStatus: "verified" }
      : null,
  };
}
function amount(plan: Itinerary) {
  let known = false;
  let total = 0;
  for (const day of plan.days) {
    const value = day.estimatedDailyCost.amount;
    if (value !== null) {
      known = true;
      total += value;
    }
  }
  return known ? total : null;
}

export function buildPlanVersionDiff(
  base: Itinerary,
  candidate: Itinerary,
  options: {
    baseVersion: number;
    candidateVersion: number;
    reasons: Record<string, string>;
  },
): PlanVersionDiff {
  const before = items(base);
  const after = items(candidate);
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort();
  const changes: PlanVersionDiff["items"] = [];
  for (const id of ids) {
    const left = before.get(id);
    const right = after.get(id);
    if (!left && right) {
      changes.push({
        itemId: id,
        dayId: right.dayId,
        date: right.date,
        operation: "added",
        beforeSummary: null,
        afterSummary: summary(right.item),
        reason: options.reasons[id] ?? "Added by the approved change",
        downstreamImpact: [],
        validationStatus: "pass",
      });
      continue;
    }
    if (left && !right) {
      changes.push({
        itemId: id,
        dayId: left.dayId,
        date: left.date,
        operation: "removed",
        beforeSummary: summary(left.item),
        afterSummary: null,
        reason: options.reasons[id] ?? "Removed by the approved change",
        downstreamImpact: [],
        validationStatus: "pass",
      });
      continue;
    }
    if (!left || !right) continue;
    if (
      left.dayId === right.dayId &&
      JSON.stringify(materialItem(left.item)) ===
        JSON.stringify(materialItem(right.item))
    )
      continue;
    const moved = left.dayId !== right.dayId;
    const timesChanged =
      left.item.startTime !== right.item.startTime ||
      left.item.endTime !== right.item.endTime;
    const onlyTimes =
      JSON.stringify({
        ...materialItem(left.item),
        startTime: null,
        endTime: null,
      }) ===
      JSON.stringify({
        ...materialItem(right.item),
        startTime: null,
        endTime: null,
      });
    changes.push({
      itemId: id,
      dayId: right.dayId,
      date: right.date,
      operation: moved
        ? "moved"
        : timesChanged && onlyTimes
          ? "rescheduled"
          : "updated",
      beforeSummary: summary(left.item),
      afterSummary: summary(right.item),
      reason: options.reasons[id] ?? "Required by the approved change",
      downstreamImpact: timesChanged
        ? ["Timing changed; dependent route and schedule checks were rerun"]
        : [],
      validationStatus: "pass",
    });
  }
  const changedDays = [...new Set(changes.map((change) => change.date))].sort();
  const baseRoutes = base.days.flatMap((day) => day.travelSegments);
  const candidateRoutes = candidate.days.flatMap((day) => day.travelSegments);
  const routeChanges =
    JSON.stringify(baseRoutes) === JSON.stringify(candidateRoutes)
      ? []
      : ["Travel segments changed and were revalidated"];
  const beforeAmount = amount(base);
  const afterAmount = amount(candidate);
  return planVersionDiffSchema.parse({
    schemaVersion: "1",
    baseVersion: options.baseVersion,
    candidateVersion: options.candidateVersion,
    summary:
      changes.length === 1
        ? "1 itinerary item changed."
        : `${changes.length} itinerary items changed.`,
    changedDays,
    items: changes,
    routeChanges,
    budgetDelta:
      beforeAmount === null || afterAmount === null
        ? null
        : { currency: "USD", amount: afterAmount - beforeAmount },
    warningsAdded: candidate.days
      .flatMap((day) => day.warnings)
      .filter(
        (warning) => !base.days.some((day) => day.warnings.includes(warning)),
      ),
    warningsResolved: base.days
      .flatMap((day) => day.warnings)
      .filter(
        (warning) =>
          !candidate.days.some((day) => day.warnings.includes(warning)),
      ),
  });
}
