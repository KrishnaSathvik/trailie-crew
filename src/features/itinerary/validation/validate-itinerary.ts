import {
  itinerarySchema,
  type CanonicalDestinationResolutionV1,
  type Itinerary,
  type PlanningSummary,
  type TravelEvidenceV1,
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
  liveEvidence?: TravelEvidenceV1[];
  destinationResolution?: {
    resolutionId: string;
    semanticHash: string;
    resolution: CanonicalDestinationResolutionV1;
  };
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

function significantTokens(value: string) {
  return new Set(
    normalized(value)
      .split(" ")
      .filter((token) => token.length >= 4),
  );
}

function materiallyMatches(left: string, right: string) {
  const leftTokens = significantTokens(left);
  const rightTokens = significantTokens(right);
  let overlap = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) overlap += 1;
  return overlap >= 2;
}

const genericDestinationTokens = new Set([
  "national",
  "park",
  "parks",
  "state",
  "city",
  "county",
  "region",
  "valley",
]);

function destinationMateriallyMatches(left: string, right: string) {
  if (normalized(left) === normalized(right)) return true;
  const leftTokens = significantTokens(left);
  const rightTokens = significantTokens(right);
  for (const token of leftTokens)
    if (rightTokens.has(token) && !genericDestinationTokens.has(token))
      return true;
  return false;
}

function localMinutesFromInstant(value: unknown, timezone: unknown) {
  if (typeof value !== "string") return null;
  const direct = value.match(/T(\d{2}):(\d{2})/);
  if (direct && !value.endsWith("Z"))
    return Number(direct[1]) * 60 + Number(direct[2]);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || typeof timezone !== "string")
    return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return Number(values.hour) * 60 + Number(values.minute);
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
  const liveEvidence = input.liveEvidence ?? [];
  const liveEvidenceById = new Map(
    liveEvidence.map((entry) => [entry.evidenceId, entry]),
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
    if (day.items.length === 0) {
      issues.push(
        issue(
          "day_empty",
          "high",
          "Each itinerary day must include at least one planned item.",
          [day.id],
          true,
        ),
      );
    }
    if (
      day.items.length > 0 &&
      !day.items.some((item) => item.type !== "free_time")
    ) {
      issues.push(
        issue(
          "day_without_planned_activity",
          "high",
          "Each itinerary day must include a meaningful planned activity.",
          day.items.map((item) => item.id),
          true,
        ),
      );
    }
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
      const normalizedRouteEvidence = segment.evidenceRefs
        .map((id) => liveEvidenceById.get(id))
        .find((entry) => entry?.evidenceType === "route");
      const normalizedRouteVerified =
        normalizedRouteEvidence?.verificationState === "verified" &&
        normalizedRouteEvidence.availabilityState === "available";
      if (
        !normalizedRouteVerified &&
        (!routeEvidence ||
          routeEvidence.status === "unavailable" ||
          routeEvidence.status === "failed")
      ) {
        warnings.push(
          issue(
            "route_unavailable",
            "medium",
            "Route timing is unavailable and remains unverified.",
            [segment.id],
            false,
            segment.evidenceRefs,
          ),
        );
        continue;
      }
      if (
        normalizedRouteEvidence?.freshnessState === "stale" ||
        normalizedRouteEvidence?.freshnessState === "expired" ||
        (routeEvidence &&
          (routeEvidence.status === "stale" ||
            (routeEvidence.expiresAt !== null &&
              routeEvidence.expiresAt <= input.now)))
      ) {
        issues.push(
          issue(
            "evidence_stale",
            "high",
            "Route evidence is stale and must be checked again.",
            [segment.id],
            false,
            [
              normalizedRouteEvidence?.evidenceId ??
                routeEvidence?.id ??
                segment.id,
            ],
          ),
        );
      }
      const verifiedDuration = Number(
        normalizedRouteVerified
          ? normalizedRouteEvidence.normalizedValue.data.durationMinutes
          : routeEvidence?.normalizedResult.durationMinutes,
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
              [
                normalizedRouteEvidence?.evidenceId ??
                  routeEvidence?.id ??
                  segment.id,
              ],
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
              [
                normalizedRouteEvidence?.evidenceId ??
                  routeEvidence?.id ??
                  segment.id,
              ],
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
      warnings.push(
        issue(
          "missing_coordinates",
          "medium",
          `${item.title} has no verified coordinates and remains unverified.`,
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

  const unresolvedDestination = liveEvidence.find(
    (entry) =>
      entry.evidenceType === "geocode" &&
      (entry.availabilityState === "ambiguous" ||
        entry.availabilityState === "not_found"),
  );
  const canonicalResolution = input.destinationResolution;
  const staleCanonicalResolution =
    canonicalResolution !== undefined &&
    canonicalResolution.semanticHash !==
      canonicalResolution.resolution.semanticHash;
  if (staleCanonicalResolution) {
    issues.push(
      issue(
        "destination_resolution_stale",
        "critical",
        "The canonical destination binding is stale or mismatched.",
        [],
        false,
      ),
    );
  } else if (
    canonicalResolution?.resolution.status === "resolved" &&
    canonicalResolution.resolution.canonicalName !== null &&
    !destinationMateriallyMatches(
      plan.destinationSummary,
      canonicalResolution.resolution.canonicalName,
    )
  ) {
    issues.push(
      issue(
        "destination_drift",
        "critical",
        "The generated itinerary changed the canonical destination identity.",
        [],
        true,
        canonicalResolution.resolution.evidenceIds,
      ),
    );
  } else if (
    canonicalResolution &&
    canonicalResolution.resolution.status !== "resolved"
  ) {
    const ambiguous = canonicalResolution.resolution.status === "ambiguous";
    issues.push(
      issue(
        ambiguous ? "destination_ambiguous" : "destination_unresolved",
        "critical",
        ambiguous
          ? "More than one materially different destination matched the request."
          : "The destination identity could not be resolved.",
        [],
        false,
        canonicalResolution.resolution.evidenceIds,
      ),
    );
  } else if (!canonicalResolution && unresolvedDestination) {
    issues.push(
      issue(
        unresolvedDestination.availabilityState === "ambiguous"
          ? "destination_ambiguous"
          : "destination_unresolved",
        "critical",
        unresolvedDestination.availabilityState === "ambiguous"
          ? "More than one materially different destination matched the request."
          : "The destination identity could not be resolved.",
        [],
        false,
        [unresolvedDestination.evidenceId],
      ),
    );
  }

  for (const closure of liveEvidence.filter(
    (entry) =>
      entry.evidenceType === "park_closure" &&
      entry.verificationState === "verified" &&
      entry.availabilityState === "available",
  )) {
    const value = closure.normalizedValue.data;
    const active =
      value.active === true ||
      value.activeStatus === "active" ||
      value.status === "active";
    if (!active) continue;
    const closureText = [value.affectedArea, value.title, value.description]
      .filter((entry): entry is string => typeof entry === "string")
      .join(" ");
    if (!closureText) continue;
    const affected = allItems.filter((item) =>
      materiallyMatches(
        closureText,
        [item.title, item.description, item.location?.name ?? ""].join(" "),
      ),
    );
    if (affected.length)
      issues.push(
        issue(
          "official_closure_conflict",
          "critical",
          "An active official closure conflicts with a planned activity.",
          affected.map((item) => item.id),
          true,
          [closure.evidenceId],
        ),
      );
  }

  const unavailableWeather = liveEvidence.find(
    (entry) =>
      entry.evidenceType === "weather_forecast" &&
      (entry.availabilityState === "unavailable" ||
        entry.availabilityState === "unsupported" ||
        entry.verificationState === "failed"),
  );
  if (unavailableWeather)
    warnings.push(
      issue(
        unavailableWeather.errorState?.code === "forecast_horizon_unsupported"
          ? "forecast_horizon_unsupported"
          : "weather_forecast_unavailable",
        "medium",
        unavailableWeather.errorState?.code === "forecast_horizon_unsupported"
          ? "This date is outside the available forecast window."
          : "Live weather information is unavailable for this plan.",
        [],
        false,
        [unavailableWeather.evidenceId],
      ),
    );

  for (const weatherAlert of liveEvidence.filter(
    (entry) =>
      entry.evidenceType === "severe_weather" &&
      entry.verificationState === "verified" &&
      entry.availabilityState === "available",
  ))
    warnings.push(
      issue(
        "severe_weather_caution",
        "medium",
        "An official weather alert may affect outdoor activities; it is not a guarantee of safety.",
        [],
        false,
        [weatherAlert.evidenceId],
      ),
    );

  for (const day of plan.days) {
    const daylight = liveEvidence.filter(
      (entry) =>
        (entry.evidenceType === "sunrise" || entry.evidenceType === "sunset") &&
        entry.normalizedValue.data.date === day.date &&
        entry.verificationState === "verified",
    );
    const sunsetEvidence =
      daylight.find((entry) => entry.evidenceType === "sunset") ??
      daylight.find(
        (entry) => typeof entry.normalizedValue.data.sunset === "string",
      );
    if (!sunsetEvidence) continue;
    const sunsetMinutes = localMinutesFromInstant(
      sunsetEvidence.normalizedValue.data.instant ??
        sunsetEvidence.normalizedValue.data.sunset,
      sunsetEvidence.normalizedValue.data.timezone ??
        sunsetEvidence.locationBinding?.timezone,
    );
    if (sunsetMinutes === null) continue;
    const affected = day.items.filter(
      (item) =>
        item.type === "activity" &&
        minutes(item.endTime) !== null &&
        minutes(item.endTime)! > sunsetMinutes,
    );
    if (affected.length)
      issues.push(
        issue(
          "daylight_conflict",
          "high",
          "An outdoor activity is scheduled to end after sunset.",
          affected.map((item) => item.id),
          true,
          [sunsetEvidence.evidenceId],
        ),
      );
  }

  for (const reservationEvidence of liveEvidence.filter(
    (entry) => entry.evidenceType === "reservation",
  )) {
    const value = reservationEvidence.normalizedValue.data;
    if (value.requirement !== "required") continue;
    const entityName = reservationEvidence.entityBinding?.name ?? "";
    const affected = allItems.filter((item) =>
      materiallyMatches(
        entityName,
        `${item.title} ${item.location?.name ?? ""}`,
      ),
    );
    for (const item of affected)
      if (item.reservation.status !== "required")
        issues.push(
          issue(
            "reservation_required",
            "high",
            `${item.title} requires a visible reservation requirement.`,
            [item.id],
            true,
            [reservationEvidence.evidenceId],
          ),
        );
  }

  for (const critical of liveEvidence.filter(
    (entry) =>
      (entry.evidenceType === "park_closure" ||
        entry.evidenceType === "severe_weather") &&
      (entry.freshnessState === "stale" ||
        entry.freshnessState === "expired" ||
        entry.freshnessState === "conflicting"),
  ))
    issues.push(
      issue(
        critical.freshnessState === "conflicting"
          ? "official_evidence_conflicting"
          : "critical_evidence_stale",
        "high",
        critical.freshnessState === "conflicting"
          ? "Current official sources conflict and require review."
          : "Critical live evidence is stale and must be refreshed.",
        [],
        false,
        [critical.evidenceId],
      ),
    );

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
          true,
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
    if (item.type !== "activity") continue;
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
  const failedCodes = new Set(
    [...issues, ...warnings].map((entry) => entry.code),
  );
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
    "official_closures",
    "weather",
    "daylight",
    "destination_resolution",
  ];
  const checkFailures: Record<string, string[]> = {
    itinerary_schema: ["day_empty", "day_without_planned_activity"],
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
    official_closures: [
      "official_closure_conflict",
      "official_evidence_conflicting",
      "critical_evidence_stale",
    ],
    weather: [
      "weather_forecast_unavailable",
      "forecast_horizon_unsupported",
      "severe_weather_caution",
    ],
    daylight: ["daylight_conflict"],
    destination_resolution: ["destination_ambiguous", "destination_unresolved"],
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
