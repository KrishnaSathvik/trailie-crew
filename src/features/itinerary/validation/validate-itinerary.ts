import {
  itinerarySchema,
  type Itinerary,
  type PlanningSummary,
  type ValidationIssue,
  type ValidationReport,
} from "@trailie/schemas";

export const ITINERARY_VALIDATOR_VERSION = "trailie-itinerary-validator-v1";

export type NormalizedToolEvidence = {
  id: string;
  requestFingerprint?: string;
  itemId: string | null;
  provider: string;
  toolName: string;
  status: "verified" | "unavailable" | "stale" | "failed";
  retrievedAt: string;
  expiresAt: string | null;
  normalizedResult: Record<string, unknown>;
  sourceReference: { label: string; url: string | null } | null;
};

type Input = {
  itinerary: unknown;
  approvedSummary: PlanningSummary;
  evidence: NormalizedToolEvidence[];
  now: string;
  minimumTravelBufferMinutes: number;
  maximumDailyDriveMinutes: number;
};

function minutes(value: string | null) {
  if (value === null) return null;
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
}

function instant(date: string, time: string | null) {
  return time === null ? null : `${date}T${time}`;
}

function normalized(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function numericBudget(summary: PlanningSummary) {
  for (const text of summary.tripSnapshot.budget) {
    const match = text
      .replaceAll(",", "")
      .match(/(?:usd|\$)\s*(\d+(?:\.\d+)?)/i);
    if (match) return Number(match[1]);
  }
  return null;
}

function issue(
  code: string,
  severity: ValidationIssue["severity"],
  message: string,
  affectedItemIds: string[] = [],
  repairable = true,
  evidenceRefs: string[] = [],
): ValidationIssue {
  return { code, severity, message, affectedItemIds, repairable, evidenceRefs };
}

export function validateItinerary(input: Input): ValidationReport {
  const parsed = itinerarySchema.safeParse(input.itinerary);
  if (!parsed.success) {
    return {
      validatorVersion: ITINERARY_VALIDATOR_VERSION,
      status: "blocked",
      issues: [
        issue(
          "itinerary_schema_invalid",
          "critical",
          "The itinerary did not match the public itinerary contract.",
          [],
          true,
        ),
      ],
      warnings: [],
      passedChecks: [],
      repairedIssues: [],
      evidenceLastCheckedAt: null,
    };
  }

  const plan: Itinerary = parsed.data;
  const issues: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const evidenceById = new Map(
    input.evidence.map((entry) => [entry.id, entry]),
  );
  const allItems = plan.days.flatMap((day) => day.items);
  const itemById = new Map(allItems.map((item) => [item.id, item]));
  const allIds = [
    ...plan.travelers.map((value) => value.id),
    ...plan.arrivals.map((value) => value.id),
    ...plan.departures.map((value) => value.id),
    ...plan.lodging.map((value) => value.id),
    ...plan.days.map((value) => value.id),
    ...allItems.map((value) => value.id),
    ...plan.days.flatMap((day) => day.travelSegments.map((value) => value.id)),
    ...plan.restaurants.map((value) => value.id),
  ];
  if (new Set(allIds).size !== allIds.length) {
    issues.push(
      issue(
        "duplicate_id",
        "high",
        "Stable itinerary IDs must be unique.",
        [],
        false,
      ),
    );
  }

  const unsafeText = JSON.stringify(plan);
  if (
    /<\/?[a-z][^>]*>|javascript:|data:text\/html|onerror\s*=/i.test(unsafeText)
  ) {
    issues.push(
      issue(
        "unsafe_render_content",
        "critical",
        "The itinerary contains content that is unsafe to render.",
        [],
        false,
      ),
    );
  }

  for (const day of plan.days) {
    const timed = day.items
      .filter((item) => item.startTime !== null && item.endTime !== null)
      .map((item) => ({
        item,
        start: minutes(item.startTime)!,
        end: minutes(item.endTime)!,
      }))
      .sort((left, right) => left.start - right.start);
    for (const entry of timed) {
      if (entry.end <= entry.start) {
        issues.push(
          issue(
            "item_time_invalid",
            "high",
            `${entry.item.title} must end after it starts.`,
            [entry.item.id],
          ),
        );
      }
    }
    for (let index = 1; index < timed.length; index += 1) {
      if (timed[index].start < timed[index - 1].end) {
        issues.push(
          issue("item_overlap", "high", "Two itinerary items overlap.", [
            timed[index - 1].item.id,
            timed[index].item.id,
          ]),
        );
      }
    }

    let dailyDrive = 0;
    for (const segment of day.travelSegments) {
      const from = segment.fromItemId ? itemById.get(segment.fromItemId) : null;
      const to = segment.toItemId ? itemById.get(segment.toItemId) : null;
      if ((segment.fromItemId && !from) || (segment.toItemId && !to)) {
        issues.push(
          issue(
            "invalid_item_reference",
            "high",
            "A travel segment references an unknown itinerary item.",
            [segment.id],
            false,
          ),
        );
        continue;
      }
      const routeEvidence = segment.evidenceRefs
        .map((id) => evidenceById.get(id))
        .find((entry) => entry?.toolName === "route");
      if (
        !routeEvidence ||
        routeEvidence.status === "unavailable" ||
        routeEvidence.status === "failed"
      ) {
        issues.push(
          issue(
            "route_unavailable",
            "high",
            "A required route could not be verified.",
            [segment.id],
            false,
            segment.evidenceRefs,
          ),
        );
        continue;
      }
      if (
        routeEvidence.status === "stale" ||
        (routeEvidence.expiresAt !== null &&
          routeEvidence.expiresAt <= input.now)
      ) {
        issues.push(
          issue(
            "evidence_stale",
            "high",
            "Route evidence is stale and must be checked again.",
            [segment.id],
            false,
            [routeEvidence.id],
          ),
        );
      }
      const verifiedDuration = Number(
        routeEvidence.normalizedResult.durationMinutes,
      );
      const duration = Number.isFinite(verifiedDuration)
        ? verifiedDuration
        : segment.durationMinutes;
      if (duration === null || duration < 0) {
        issues.push(
          issue(
            "route_unavailable",
            "high",
            "A route duration is unknown.",
            [segment.id],
            false,
          ),
        );
        continue;
      }
      if (segment.mode === "drive") dailyDrive += duration;
      const fromEnd = from ? minutes(from.endTime) : null;
      const toStart = to ? minutes(to.startTime) : null;
      if (fromEnd !== null && toStart !== null) {
        const gap = toStart - fromEnd;
        if (gap < duration) {
          issues.push(
            issue(
              "route_timing_impossible",
              "high",
              "Verified travel time does not fit between two scheduled stops.",
              [from!.id, to!.id, segment.id],
              true,
              [routeEvidence.id],
            ),
          );
        }
        if (
          segment.bufferMinutes < input.minimumTravelBufferMinutes ||
          gap < duration + input.minimumTravelBufferMinutes
        ) {
          issues.push(
            issue(
              "travel_buffer_insufficient",
              "high",
              "The schedule needs a larger travel buffer.",
              [from!.id, to!.id, segment.id],
              true,
              [routeEvidence.id],
            ),
          );
        }
      }
    }
    if (dailyDrive > input.maximumDailyDriveMinutes) {
      issues.push(
        issue(
          "daily_drive_overload",
          "high",
          "Daily verified driving exceeds the configured limit.",
          day.travelSegments.map((segment) => segment.id),
          true,
        ),
      );
    }
  }

  for (const item of allItems) {
    if (
      item.location &&
      (item.location.latitude === null || item.location.longitude === null)
    ) {
      issues.push(
        issue(
          "missing_coordinates",
          "high",
          `${item.title} does not have verified coordinates.`,
          [item.id],
          false,
        ),
      );
    }
    if (item.location && item.location.timezone !== plan.timezone) {
      issues.push(
        issue(
          "timezone_mismatch",
          "high",
          `${item.title} uses a different timezone from the itinerary.`,
          [item.id],
          true,
        ),
      );
    }
    for (const reference of item.evidenceRefs) {
      const fact = evidenceById.get(reference);
      if (
        !fact ||
        fact.toolName !== "place_details" ||
        fact.status !== "verified"
      )
        continue;
      if (fact.normalizedResult.openStatus === "closed") {
        issues.push(
          issue(
            "location_closed",
            "high",
            `${item.title} is closed at the proposed time.`,
            [item.id],
            false,
            [fact.id],
          ),
        );
      }
      if (
        fact.normalizedResult.reservationStatus === "required" &&
        item.reservation.status !== "required"
      ) {
        issues.push(
          issue(
            "reservation_required",
            "high",
            `${item.title} requires a reservation note.`,
            [item.id],
            true,
            [fact.id],
          ),
        );
      }
    }
  }

  const timedItems = plan.days.flatMap((day) =>
    day.items
      .filter((item) => item.startTime !== null && item.endTime !== null)
      .map((item) => ({ day: day.date, item })),
  );
  const earliest = timedItems
    .map(({ day, item }) => ({ item, value: instant(day, item.startTime)! }))
    .sort((a, b) => a.value.localeCompare(b.value))[0];
  const latest = timedItems
    .map(({ day, item }) => ({ item, value: instant(day, item.endTime)! }))
    .sort((a, b) => b.value.localeCompare(a.value))[0];
  for (const arrival of plan.arrivals) {
    const value = instant(arrival.date, arrival.localTime);
    if (value && earliest && value > earliest.value) {
      issues.push(
        issue(
          "arrival_infeasible",
          "high",
          "A traveler arrives after the first scheduled activity.",
          [arrival.id, earliest.item.id],
          false,
        ),
      );
    }
  }
  for (const departure of plan.departures) {
    const value = instant(departure.date, departure.localTime);
    if (value && latest && value < latest.value) {
      issues.push(
        issue(
          "departure_infeasible",
          "high",
          "A traveler departs before the final scheduled activity ends.",
          [departure.id, latest.item.id],
          false,
        ),
      );
    }
  }

  for (const constraint of input.approvedSummary.constraints) {
    const startRule = constraint.detail.match(
      /no activity before\s+(\d{1,2}):?(\d{2})?/i,
    );
    if (startRule) {
      const threshold = Number(startRule[1]) * 60 + Number(startRule[2] ?? 0);
      const violating = allItems.filter(
        (item) =>
          item.type === "activity" &&
          minutes(item.startTime) !== null &&
          minutes(item.startTime)! < threshold,
      );
      if (violating.length) {
        issues.push(
          issue(
            "hard_constraint_violation",
            "critical",
            "The itinerary violates an approved scheduling constraint.",
            violating.map((item) => item.id),
            false,
          ),
        );
      }
    }
  }

  const searchable = normalized(JSON.stringify(plan));
  for (const decision of input.approvedSummary.confirmedDecisions) {
    if (!searchable.includes(normalized(decision.detail))) {
      issues.push(
        issue(
          "confirmed_decision_missing",
          "critical",
          `The approved decision “${decision.label}” is missing.`,
          [],
          false,
        ),
      );
    }
  }
  for (const rejected of input.approvedSummary.rejectedOptions) {
    if (searchable.includes(normalized(rejected.detail))) {
      issues.push(
        issue(
          "rejected_option_reintroduced",
          "critical",
          `A rejected option was reintroduced: ${rejected.label}.`,
          [],
          false,
        ),
      );
    }
  }

  const titles = new Map<string, string>();
  for (const item of allItems) {
    const key = normalized(item.title);
    const prior = titles.get(key);
    if (prior) {
      issues.push(
        issue(
          "duplicate_item",
          "high",
          "The same activity appears more than once.",
          [prior, item.id],
          true,
        ),
      );
    } else titles.set(key, item.id);
  }

  const budget = numericBudget(input.approvedSummary);
  const knownDailyCosts = plan.days
    .map((day) => day.estimatedDailyCost.amount)
    .filter((amount): amount is number => amount !== null);
  const estimatedTotal = knownDailyCosts.reduce(
    (total, amount) => total + amount,
    0,
  );
  if (budget !== null && estimatedTotal > budget) {
    issues.push(
      issue(
        "budget_ceiling_exceeded",
        "high",
        "The itinerary estimate exceeds the approved budget ceiling.",
        [],
        true,
      ),
    );
  }

  const blocking = issues.filter(
    (entry) => entry.severity === "critical" || entry.severity === "high",
  );
  const status: ValidationReport["status"] =
    blocking.length === 0
      ? "pass"
      : blocking.every((entry) => entry.repairable)
        ? "needs_revision"
        : "blocked";
  const failedCodes = new Set(issues.map((entry) => entry.code));
  const checks = [
    "itinerary_schema",
    "referential_integrity",
    "date_range",
    "timezone",
    "item_ordering",
    "overlap",
    "travel_buffer",
    "arrival_departure",
    "route_duration",
    "daily_drive_load",
    "hard_constraints",
    "confirmed_decisions",
    "rejected_options",
    "opening_hours",
    "reservations",
    "coordinates",
    "evidence_freshness",
    "budget_ceiling",
    "duplicates",
    "public_safe_rendering",
  ];
  const checkFailures: Record<string, string[]> = {
    referential_integrity: ["duplicate_id", "invalid_item_reference"],
    timezone: ["timezone_mismatch"],
    overlap: ["item_overlap"],
    travel_buffer: ["travel_buffer_insufficient"],
    arrival_departure: ["arrival_infeasible", "departure_infeasible"],
    route_duration: ["route_timing_impossible", "route_unavailable"],
    daily_drive_load: ["daily_drive_overload"],
    hard_constraints: ["hard_constraint_violation"],
    confirmed_decisions: ["confirmed_decision_missing"],
    rejected_options: ["rejected_option_reintroduced"],
    opening_hours: ["location_closed"],
    reservations: ["reservation_required"],
    coordinates: ["missing_coordinates"],
    evidence_freshness: ["evidence_stale"],
    budget_ceiling: ["budget_ceiling_exceeded"],
    duplicates: ["duplicate_item"],
    public_safe_rendering: ["unsafe_render_content"],
  };
  return {
    validatorVersion: ITINERARY_VALIDATOR_VERSION,
    status,
    issues,
    warnings,
    passedChecks: checks.filter(
      (check) =>
        !(checkFailures[check] ?? []).some((code) => failedCodes.has(code)),
    ),
    repairedIssues: [],
    evidenceLastCheckedAt:
      input.evidence.length > 0
        ? (input.evidence
            .map((entry) => entry.retrievedAt)
            .sort()
            .at(-1) ?? null)
        : null,
  };
}
