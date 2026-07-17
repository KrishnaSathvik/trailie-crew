import { createHash } from "node:crypto";
import type { Itinerary } from "@trailie/schemas";

const volatileKeys = new Set([
  "retrievedAt",
  "validatedAt",
  "evidenceLastCheckedAt",
  "createdAt",
  "updatedAt",
]);

function normalizeString(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function canonicalizeRevisionValue(value: unknown): unknown {
  if (typeof value === "string") return normalizeString(value);
  if (Array.isArray(value)) return value.map(canonicalizeRevisionValue);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !volatileKeys.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalizeRevisionValue(entry)]),
  );
}

export function semanticHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalizeRevisionValue(value)))
    .digest("hex");
}

const topLevelFields = [
  "schemaVersion",
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
] as const satisfies readonly (keyof Itinerary)[];

export function semanticPlanIndex(plan: Itinerary) {
  const itemHashes: Record<string, string> = {};
  const dayHashes: Record<string, string> = {};
  const itemOrderByDay: Record<string, string[]> = {};
  for (const day of plan.days) {
    dayHashes[day.id] = semanticHash(day);
    itemOrderByDay[day.id] = day.items.map((item) => item.id);
    for (const item of day.items) itemHashes[item.id] = semanticHash(item);
  }
  const topLevelHashes = Object.fromEntries(
    topLevelFields.map((field) => [field, semanticHash(plan[field])]),
  ) as Record<(typeof topLevelFields)[number], string>;
  return { itemHashes, dayHashes, itemOrderByDay, topLevelHashes };
}

export function revisionValuesEqual(left: unknown, right: unknown) {
  return semanticHash(left) === semanticHash(right);
}
