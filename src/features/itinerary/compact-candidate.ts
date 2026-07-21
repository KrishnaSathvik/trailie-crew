import {
  compactItineraryCandidateV1Schema,
  itinerarySchema,
  type CompactItineraryCandidateV1,
  type Itinerary,
  type PlanningSummary,
  type TravelEvidenceV1,
} from "@trailie/schemas";

import { ITINERARY_VALIDATOR_VERSION } from "./validation/validate-itinerary";

type Traveler = {
  id: string;
  displayName: string;
  role: "host" | "member";
};

const unknownCost = {
  status: "unknown" as const,
  currency: "USD",
  amount: null,
  minAmount: null,
  maxAmount: null,
  retrievedAt: null,
  evidenceRef: null,
};

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function unique(values: readonly string[]) {
  return [...new Set(values)];
}

function compactText(parts: Array<string | null | undefined>, maximum = 1_000) {
  return parts.filter(Boolean).join(" ").slice(0, maximum);
}

function shortText(value: string) {
  return value.trim().slice(0, 200);
}

function timezoneFromEvidence(evidence: readonly TravelEvidenceV1[]) {
  for (const entry of evidence) {
    const timezone = entry.locationBinding?.timezone;
    if (!timezone) continue;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
      return timezone;
    } catch {
      continue;
    }
  }
  return "UTC";
}

export function validateCompactItineraryCandidate(
  value: unknown,
  expectedDates: readonly string[],
  allowedSourceEntityIds?: ReadonlySet<string>,
) {
  const parsed = compactItineraryCandidateV1Schema.safeParse(value);
  if (!parsed.success) return parsed;
  const dates = parsed.data.days.map((day) => day.date);
  if (
    dates.length !== expectedDates.length ||
    dates.some((date, index) => date !== expectedDates[index])
  )
    return {
      success: false as const,
      error: new Error("compact_itinerary_date_coverage_invalid"),
    };
  if (
    allowedSourceEntityIds &&
    parsed.data.days.some((day) =>
      day.items.some(
        (item) =>
          item.sourceEntityHint !== null &&
          !allowedSourceEntityIds.has(item.sourceEntityHint),
      ),
    )
  )
    return {
      success: false as const,
      error: new Error("compact_itinerary_source_entity_invalid"),
    };
  return parsed;
}

export function compactItineraryOutputTokenLimit(input: {
  dayCount: number;
  itemCount?: number;
}) {
  const dayCount = Math.max(Math.min(Math.round(input.dayCount), 12), 1);
  const itemCount = Math.max(
    Math.round(input.itemCount ?? dayCount * 4),
    dayCount,
  );
  const base =
    dayCount <= 2
      ? 1_500
      : dayCount <= 4
        ? 2_200
        : dayCount === 5
          ? 2_800
          : 3_200;
  const denseAdjustment = itemCount > dayCount * 5 ? 400 : 0;
  return Math.min(base + denseAdjustment, 3_600);
}

export function planCompactItineraryGeneration(dates: readonly string[]) {
  if (dates.length < 1) throw new Error("compact_itinerary_dates_missing");
  if (dates.length > 12) throw new Error("compact_itinerary_trip_too_long");
  if (dates.length <= 7)
    return { mode: "single" as const, groups: [[...dates]] };
  const groups: string[][] = [];
  for (let index = 0; index < dates.length; index += 4)
    groups.push(dates.slice(index, index + 4));
  return { mode: "chunked" as const, groups };
}

export function combineCompactItineraryChunks(
  chunks: readonly CompactItineraryCandidateV1[],
  expectedDates: readonly string[],
) {
  if (chunks.length < 1 || chunks.length > 3)
    throw new Error("compact_itinerary_chunk_count_invalid");
  const parsed = chunks.map((chunk) =>
    compactItineraryCandidateV1Schema.parse(chunk),
  );
  const allDays = parsed.flatMap((chunk) => chunk.days);
  const allKeys = allDays.flatMap((day) =>
    day.items.map((item) => item.clientKey),
  );
  if (new Set(allKeys).size !== allKeys.length)
    throw new Error("compact_itinerary_duplicate_key");
  const byDate = new Map(allDays.map((day) => [day.date, day]));
  if (
    byDate.size !== expectedDates.length ||
    expectedDates.some((date) => !byDate.has(date))
  )
    throw new Error("compact_itinerary_date_coverage_invalid");
  return compactItineraryCandidateV1Schema.parse({
    schemaVersion: "1",
    title: parsed[0].title,
    summary: parsed[0].summary,
    assumptions: unique(parsed.flatMap((chunk) => chunk.assumptions)).slice(
      0,
      8,
    ),
    warnings: unique(parsed.flatMap((chunk) => chunk.warnings)).slice(0, 8),
    days: expectedDates.map((date) => byDate.get(date)!),
  });
}

export function scopeCompactItineraryChunkKeys(
  value: CompactItineraryCandidateV1,
  groupIndex: number,
) {
  const candidate = compactItineraryCandidateV1Schema.parse(value);
  const keys = new Map<string, string>();
  for (const [dayIndex, day] of candidate.days.entries())
    for (const [itemIndex, item] of day.items.entries())
      keys.set(
        item.clientKey,
        `g${groupIndex + 1}-d${dayIndex + 1}-i${itemIndex + 1}`,
      );
  return compactItineraryCandidateV1Schema.parse({
    ...candidate,
    days: candidate.days.map((day) => ({
      ...day,
      items: day.items.map((item) => ({
        ...item,
        clientKey: keys.get(item.clientKey)!,
      })),
      travelSegments: day.travelSegments.map((segment) => ({
        ...segment,
        fromItemKey: keys.get(segment.fromItemKey)!,
        toItemKey: keys.get(segment.toItemKey)!,
      })),
    })),
  });
}

function safeClientKey(id: string, used: Set<string>) {
  const raw = id
    .replace(/^[^:]+:/, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = (/^[a-z]/.test(raw) ? raw : `item-${raw || "unknown"}`).slice(
    0,
    30,
  );
  let key = base;
  let suffix = 2;
  while (used.has(key)) {
    const marker = `-${suffix}`;
    key = `${base.slice(0, 30 - marker.length)}${marker}`;
    suffix += 1;
  }
  used.add(key);
  return key;
}

export function compactItineraryCandidateFromItinerary(itinerary: Itinerary) {
  const keys = new Map<string, string>();
  const used = new Set<string>();
  for (const day of itinerary.days)
    for (const item of day.items)
      keys.set(item.id, safeClientKey(item.id, used));
  return compactItineraryCandidateV1Schema.parse({
    schemaVersion: "1",
    title: itinerary.title,
    summary: itinerary.destinationSummary,
    assumptions: itinerary.assumptions,
    warnings: unique([
      ...itinerary.unresolvedItems,
      ...itinerary.days.flatMap((day) => day.warnings),
    ]).slice(0, 16),
    days: itinerary.days.map((day) => ({
      date: day.date,
      theme: day.title,
      locationArea:
        day.items.find((item) => item.location)?.location?.name ??
        itinerary.destinationSummary,
      items: day.items.map((item) => ({
        clientKey: keys.get(item.id)!,
        type: item.type,
        title: item.title,
        startTime: item.startTime,
        endTime: item.endTime,
        locationText: item.location?.name ?? itinerary.destinationSummary,
        sourceEntityHint: item.sourceEntityId ?? null,
        shortDescription: item.description,
        rationale: item.notes[0] ?? item.description,
        bookingRequirement: item.reservation.status,
        importantWarning: item.reservation.details ?? item.notes[1] ?? null,
      })),
      travelSegments: day.travelSegments.flatMap((segment) => {
        const fromItemKey = segment.fromItemId
          ? keys.get(segment.fromItemId)
          : null;
        const toItemKey = segment.toItemId ? keys.get(segment.toItemId) : null;
        return fromItemKey && toItemKey
          ? [
              {
                mode: segment.mode,
                fromItemKey,
                toItemKey,
                estimatedMinutes: segment.durationMinutes,
              },
            ]
          : [];
      }),
    })),
  });
}

export function expandCompactItineraryCandidate(input: {
  candidate: CompactItineraryCandidateV1;
  approvedSummary: PlanningSummary;
  travelers: Traveler[];
  liveEvidence: TravelEvidenceV1[];
  now: string;
}): Itinerary {
  const candidate = compactItineraryCandidateV1Schema.parse(input.candidate);
  const timezone = timezoneFromEvidence(input.liveEvidence);
  const startDate = candidate.days[0].date;
  const endDate = candidate.days.at(-1)!.date;
  const locations = new Map<
    string,
    Itinerary["days"][number]["items"][number]["location"]
  >();
  const location = (name: string) => {
    const cached = locations.get(name);
    if (cached) return structuredClone(cached);
    const value = {
      name,
      address: null,
      latitude: null,
      longitude: null,
      timezone,
      verificationStatus: "unknown" as const,
    };
    locations.set(name, value);
    return structuredClone(value);
  };
  const reservation = (
    requirement: CompactItineraryCandidateV1["days"][number]["items"][number]["bookingRequirement"],
    warning: string | null,
  ) => ({
    status: requirement,
    details:
      warning ??
      (requirement === "required"
        ? "Reservation or permit required; no booking has been made."
        : requirement === "recommended"
          ? "Reservation recommended; no booking has been made."
          : null),
    evidenceRefs: [] as string[],
  });
  const days = candidate.days.map((day) => {
    const itemByKey = new Map(day.items.map((item) => [item.clientKey, item]));
    const items = day.items.map((item) => ({
      id: `item:${item.clientKey}`,
      type: item.type,
      ...(item.sourceEntityHint
        ? { sourceEntityId: item.sourceEntityHint }
        : {}),
      startTime: item.startTime,
      endTime: item.endTime,
      title: item.title,
      description: compactText([item.shortDescription, item.rationale]),
      location: location(item.locationText),
      reservation: reservation(item.bookingRequirement, item.importantWarning),
      cost: { ...unknownCost },
      evidenceRefs: [] as string[],
      notes: unique(
        [item.rationale, item.importantWarning]
          .filter((value): value is string => value !== null)
          .map(shortText),
      ),
    }));
    const travelSegments = day.travelSegments.map((segment) => {
      const origin = itemByKey.get(segment.fromItemKey)!;
      const destination = itemByKey.get(segment.toItemKey)!;
      return {
        id: `segment:${segment.fromItemKey}-${segment.toItemKey}`,
        fromItemId: `item:${segment.fromItemKey}`,
        toItemId: `item:${segment.toItemKey}`,
        mode: segment.mode,
        origin: location(origin.locationText),
        destination: location(destination.locationText),
        distanceMeters: null,
        durationMinutes: segment.estimatedMinutes,
        bufferMinutes: 15,
        verificationStatus:
          segment.estimatedMinutes === null
            ? ("unknown" as const)
            : ("estimated" as const),
        evidenceRefs: [] as string[],
      };
    });
    return {
      id: `day:${day.date}`,
      date: day.date,
      title: day.theme,
      summary: compactText([
        `Primary area: ${day.locationArea}.`,
        day.items.map((item) => item.rationale).join(" "),
      ]),
      items,
      travelSegments,
      estimatedDailyCost: { ...unknownCost },
      warnings: unique([
        ...(day === candidate.days[0] ? candidate.warnings : []),
        ...day.items.flatMap((item) =>
          item.importantWarning ? [item.importantWarning] : [],
        ),
      ])
        .map(shortText)
        .slice(0, 24),
    };
  });
  const transfers = candidate.days.flatMap((day) =>
    day.items.flatMap((item) =>
      item.type === "arrival" || item.type === "departure"
        ? [
            {
              kind: item.type,
              value: {
                id: `${item.type}:${item.clientKey}`,
                travelerIds: input.travelers.map((traveler) => traveler.id),
                date: day.date,
                localTime:
                  item.type === "arrival" ? item.startTime : item.endTime,
                location: location(item.locationText),
                mode: "unknown" as const,
                reference: null,
                notes: [shortText(item.rationale)],
              },
            },
          ]
        : [],
    ),
  );
  const lodging = candidate.days.flatMap((day) =>
    day.items.flatMap((item) =>
      item.type === "lodging"
        ? [
            {
              id: `lodging:${item.clientKey}`,
              name: item.title,
              area: item.locationText,
              checkInDate: day.date,
              checkOutDate:
                candidate.days.find((entry) => entry.date > day.date)?.date ??
                addDays(endDate, 1),
              location: location(item.locationText),
              reservation: reservation(
                item.bookingRequirement,
                item.importantWarning,
              ),
              cost: { ...unknownCost },
              evidenceRefs: [] as string[],
              notes: unique(
                [item.rationale, item.importantWarning]
                  .filter((value): value is string => value !== null)
                  .map(shortText),
              ),
            },
          ]
        : [],
    ),
  );
  const restaurants = candidate.days.flatMap((day) =>
    day.items.flatMap((item) => {
      if (item.type !== "meal") return [];
      const hour = Number(item.startTime?.slice(0, 2) ?? 18);
      return [
        {
          id: `restaurant:${item.clientKey}`,
          name: item.title,
          mealWindow:
            hour < 10
              ? ("breakfast" as const)
              : hour < 15
                ? ("lunch" as const)
                : hour < 18
                  ? ("snack" as const)
                  : ("dinner" as const),
          location: location(item.locationText),
          dietaryAlignment: [] as string[],
          reservation: reservation(
            item.bookingRequirement,
            item.importantWarning,
          ),
          cost: { ...unknownCost },
          evidenceRefs: [] as string[],
          notes: [shortText(item.rationale)],
        },
      ];
    }),
  );
  return itinerarySchema.parse({
    schemaVersion: "1",
    title: candidate.title,
    destinationSummary: compactText([
      input.approvedSummary.tripSnapshot.destinations.join(" / "),
      candidate.summary,
    ]),
    timezone,
    startDate,
    endDate,
    travelers: input.travelers.map((traveler, index) => ({
      id: traveler.id,
      displayName: traveler.displayName,
      origin: input.approvedSummary.tripSnapshot.origins[index] ?? null,
      accessibilityNotes: [],
      dietaryNotes: [],
    })),
    arrivals: transfers
      .filter((transfer) => transfer.kind === "arrival")
      .map((transfer) => transfer.value),
    departures: transfers
      .filter((transfer) => transfer.kind === "departure")
      .map((transfer) => transfer.value),
    lodging,
    days,
    restaurants,
    unresolvedItems: candidate.warnings,
    assumptions: unique([
      ...candidate.assumptions,
      ...input.approvedSummary.confirmedDecisions.map(
        (decision) => decision.detail,
      ),
    ]).slice(0, 32),
    validationMetadata: {
      validatorVersion: ITINERARY_VALIDATOR_VERSION,
      validatedAt: null,
    },
  });
}
