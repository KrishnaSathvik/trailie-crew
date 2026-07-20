import {
  trailieIntentSchema,
  type TrailieIntent,
  type TrailieResponseBlockV1,
} from "@trailie/schemas";

export type TrailieTool =
  | "trip_context"
  | "current_plan"
  | "version_history"
  | "place_search"
  | "geocode"
  | "route"
  | "weather"
  | "park"
  | "park_alerts"
  | "operating_hours"
  | "reservation_links"
  | "booking_search";

export type TrailieIntentPolicy = Readonly<{
  requiredContext: readonly string[];
  permittedTools: readonly TrailieTool[];
  outputBlocks: readonly TrailieResponseBlockV1["type"][];
  persistence:
    "none" | "capture_preference" | "capture_constraint" | "propose_revision";
  approvalRequired: boolean;
  externalEvidence: "required" | "optional" | "not_required";
  safeFallback: string;
}>;

const policies: Record<TrailieIntent, TrailieIntentPolicy> = {
  direct_question: {
    requiredContext: ["recent_messages"],
    permittedTools: ["trip_context"],
    outputBlocks: ["markdown", "warning", "evidence_summary"],
    persistence: "none",
    approvalRequired: false,
    externalEvidence: "optional",
    safeFallback:
      "Answer the narrow question and label what could not be verified.",
  },
  destination_discovery: {
    requiredContext: ["trip", "shared_trip_context", "crew_signals"],
    permittedTools: ["place_search", "park"],
    outputBlocks: ["destination_options", "warning"],
    persistence: "none",
    approvalRequired: false,
    externalEvidence: "optional",
    safeFallback: "Offer a small set of clearly labeled recommendations.",
  },
  destination_comparison: {
    requiredContext: ["trip", "shared_trip_context", "crew_signals"],
    permittedTools: ["place_search", "park", "weather"],
    outputBlocks: ["destination_comparison", "warning"],
    persistence: "none",
    approvalRequired: false,
    externalEvidence: "optional",
    safeFallback:
      "Compare only supported tradeoffs and mark unavailable facts.",
  },
  trip_context_question: {
    requiredContext: ["shared_trip_context", "crew_signals", "recent_messages"],
    permittedTools: ["trip_context"],
    outputBlocks: ["markdown", "understanding_summary"],
    persistence: "none",
    approvalRequired: false,
    externalEvidence: "not_required",
    safeFallback:
      "Summarize group signals without naming private memory sources.",
  },
  preference_capture: {
    requiredContext: ["requester_permissions"],
    permittedTools: [],
    outputBlocks: ["markdown"],
    persistence: "capture_preference",
    approvalRequired: false,
    externalEvidence: "not_required",
    safeFallback:
      "Confirm the preference without treating it as group consensus.",
  },
  constraint_capture: {
    requiredContext: ["requester_permissions", "current_plan"],
    permittedTools: ["current_plan"],
    outputBlocks: ["markdown", "warning"],
    persistence: "capture_constraint",
    approvalRequired: false,
    externalEvidence: "not_required",
    safeFallback: "Confirm the constraint and explain where it will apply.",
  },
  planning_readiness: {
    requiredContext: ["shared_trip_context", "crew_signals", "planning"],
    permittedTools: ["trip_context"],
    outputBlocks: ["understanding_summary", "approval_status"],
    persistence: "none",
    approvalRequired: false,
    externalEvidence: "not_required",
    safeFallback: "List only material missing decisions.",
  },
  create_itinerary: {
    requiredContext: ["shared_trip_context", "crew_signals", "planning"],
    permittedTools: ["trip_context"],
    outputBlocks: ["understanding_summary", "approval_status"],
    persistence: "none",
    approvalRequired: true,
    externalEvidence: "not_required",
    safeFallback:
      "Summarize understanding and open crew review before planning.",
  },
  itinerary_question: {
    requiredContext: ["current_plan", "recent_messages"],
    permittedTools: ["current_plan"],
    outputBlocks: ["markdown", "itinerary_preview", "warning"],
    persistence: "none",
    approvalRequired: false,
    externalEvidence: "optional",
    safeFallback: "Answer from the exact current plan and name the version.",
  },
  itinerary_revision: {
    requiredContext: ["current_plan", "revision", "approvals"],
    permittedTools: ["current_plan", "route", "weather", "reservation_links"],
    outputBlocks: ["itinerary_change_summary", "approval_status", "warning"],
    persistence: "propose_revision",
    approvalRequired: true,
    externalEvidence: "optional",
    safeFallback: "Propose a scoped change and require crew review.",
  },
  map_question: {
    requiredContext: ["current_plan"],
    permittedTools: ["current_plan", "geocode", "route"],
    outputBlocks: ["map_locations", "route_summary", "warning"],
    persistence: "none",
    approvalRequired: false,
    externalEvidence: "optional",
    safeFallback:
      "Leave ambiguous places unresolved and keep the Plan available.",
  },
  route_question: {
    requiredContext: ["current_plan"],
    permittedTools: ["current_plan", "route"],
    outputBlocks: ["route_summary", "warning"],
    persistence: "none",
    approvalRequired: false,
    externalEvidence: "required",
    safeFallback: "Say that the route could not be verified.",
  },
  lodging_recommendation: {
    requiredContext: ["trip", "shared_trip_context", "current_plan"],
    permittedTools: ["place_search", "route"],
    outputBlocks: ["hotel_options", "warning"],
    persistence: "none",
    approvalRequired: false,
    externalEvidence: "optional",
    safeFallback: "Recommend areas before unverified properties.",
  },
  lodging_search: {
    requiredContext: ["trip", "shared_trip_context", "current_plan"],
    permittedTools: ["place_search", "route", "booking_search"],
    outputBlocks: ["hotel_options", "booking_options", "warning"],
    persistence: "none",
    approvalRequired: false,
    externalEvidence: "required",
    safeFallback:
      "Provide an approved search handoff with unknown availability.",
  },
  flight_guidance: {
    requiredContext: ["trip", "shared_trip_context", "current_plan"],
    permittedTools: ["place_search", "route"],
    outputBlocks: ["flight_guidance", "warning"],
    persistence: "none",
    approvalRequired: false,
    externalEvidence: "optional",
    safeFallback:
      "Compare airports and travel windows without inventing flights.",
  },
  flight_search: {
    requiredContext: ["trip", "shared_trip_context"],
    permittedTools: ["booking_search"],
    outputBlocks: ["flight_guidance", "booking_options", "warning"],
    persistence: "none",
    approvalRequired: false,
    externalEvidence: "required",
    safeFallback:
      "Provide an approved flight-search handoff without fare claims.",
  },
  reservation_question: {
    requiredContext: ["current_plan"],
    permittedTools: ["reservation_links", "operating_hours"],
    outputBlocks: ["reservation_requirements", "warning"],
    persistence: "none",
    approvalRequired: false,
    externalEvidence: "required",
    safeFallback: "Mark the requirement unknown when it cannot be verified.",
  },
  booking_handoff: {
    requiredContext: ["current_plan"],
    permittedTools: ["reservation_links", "booking_search"],
    outputBlocks: ["booking_options", "warning"],
    persistence: "none",
    approvalRequired: false,
    externalEvidence: "required",
    safeFallback: "Provide a safe external handoff and never claim completion.",
  },
  evidence_question: {
    requiredContext: ["current_plan", "evidence"],
    permittedTools: [
      "park",
      "park_alerts",
      "operating_hours",
      "reservation_links",
    ],
    outputBlocks: ["evidence_summary", "warning"],
    persistence: "none",
    approvalRequired: false,
    externalEvidence: "required",
    safeFallback: "Say that the information could not be verified.",
  },
  weather_question: {
    requiredContext: ["trip", "current_plan"],
    permittedTools: ["weather"],
    outputBlocks: ["weather_summary", "warning"],
    persistence: "none",
    approvalRequired: false,
    externalEvidence: "required",
    safeFallback: "Separate historical guidance from a current forecast.",
  },
  permit_question: {
    requiredContext: ["current_plan"],
    permittedTools: ["park", "reservation_links"],
    outputBlocks: ["reservation_requirements", "evidence_summary", "warning"],
    persistence: "none",
    approvalRequired: false,
    externalEvidence: "required",
    safeFallback:
      "Mark the permit requirement unknown without an official source.",
  },
  group_conflict: {
    requiredContext: ["shared_trip_context", "crew_signals", "planning"],
    permittedTools: ["trip_context"],
    outputBlocks: ["understanding_summary", "clarification"],
    persistence: "none",
    approvalRequired: false,
    externalEvidence: "not_required",
    safeFallback: "Describe both sides neutrally and offer a tradeoff.",
  },
  approval_question: {
    requiredContext: ["planning", "revision", "approvals"],
    permittedTools: ["trip_context"],
    outputBlocks: ["approval_status", "markdown"],
    persistence: "none",
    approvalRequired: false,
    externalEvidence: "not_required",
    safeFallback: "Report only the current workflow approval state.",
  },
  version_question: {
    requiredContext: ["current_plan", "version_history"],
    permittedTools: ["current_plan", "version_history"],
    outputBlocks: ["itinerary_change_summary", "markdown"],
    persistence: "none",
    approvalRequired: false,
    externalEvidence: "not_required",
    safeFallback: "Name the exact versions and avoid guessing at changes.",
  },
  unsupported_action: {
    requiredContext: [],
    permittedTools: [],
    outputBlocks: ["error_state", "markdown"],
    persistence: "none",
    approvalRequired: false,
    externalEvidence: "not_required",
    safeFallback: "Explain the supported alternative in one sentence.",
  },
};

export function getTrailieIntentPolicy(intent: TrailieIntent) {
  return policies[intent];
}

export function classifyTrailieIntent(input: {
  request: string;
}): TrailieIntent {
  const request = input.request.trim();
  const matches = (pattern: RegExp) => pattern.test(request);

  let intent: TrailieIntent = "direct_question";
  if (
    matches(/\b(?:send|email|call|contact)\b.{0,40}\b(?:hotel|airline|host)\b/i)
  )
    intent = "unsupported_action";
  else if (
    matches(
      /\b(?:book|reserve|purchase|buy)\b.{0,40}\b(?:hotel|room|flight|ticket|permit|tour|activity)\b/i,
    )
  )
    intent = "booking_handoff";
  else if (
    matches(/\b(?:move|reschedule|remove|replace|shift|change|add)\b/i) &&
    matches(
      /\b(?:hike|activity|hotel|lodging|meal|route|day|monday|tuesday|wednesday|thursday|friday|saturday|sunday|itinerary|plan)\b/i,
    )
  )
    intent = "itinerary_revision";
  else if (
    matches(/\bplan around\b/i) ||
    matches(
      /\b(?:constraint|accessibility|allergy|pain|wheelchair|cannot|can't|avoid)\b/i,
    )
  )
    intent = "constraint_capture";
  else if (
    matches(/\b(?:ready to plan|ready for planning|what.*before.*plan)\b/i)
  )
    intent = "planning_readiness";
  else if (
    matches(/\b(?:build|create|make|plan)\b.{0,30}\b(?:trip|itinerary)\b/i)
  )
    intent = "create_itinerary";
  else if (
    matches(/\b(?:who|everyone|crew)\b.{0,40}\b(?:want|prefer|decide|agree)\b/i)
  )
    intent = "trip_context_question";
  else if (
    matches(/\b(?:half|some|one of us|disagree|conflict)\b/i) &&
    matches(/\b(?:want|prefer|versus|but)\b/i)
  )
    intent = "group_conflict";
  else if (
    matches(/\bwho\b.{0,30}\bapprove|still needs to approve|approval status/i)
  )
    intent = "approval_question";
  else if (matches(/\bversion\s*\d+|earlier plan|what changed\b/i))
    intent = "version_question";
  else if (
    matches(
      /\b(?:source|evidence|verify|verified|confirm).{0,40}\b(?:closure|claim|information|that)\b/i,
    )
  )
    intent = "evidence_question";
  else if (matches(/\b(?:weather|forecast|snow|rain|temperature)\b/i))
    intent = "weather_question";
  else if (matches(/\bpermit\b/i)) intent = "permit_question";
  else if (matches(/\b(?:reservation|timed entry|reserve in advance)\b/i))
    intent = "reservation_question";
  else if (matches(/\b(?:find|search|show)\b.{0,30}\bflights?\b/i))
    intent = "flight_search";
  else if (matches(/\b(?:airport|flight|fly|flying)\b/i))
    intent = "flight_guidance";
  else if (
    matches(
      /\b(?:find|search|show)\b.{0,30}\b(?:hotels?|lodging|places to stay)\b/i,
    )
  )
    intent = "lodging_search";
  else if (
    matches(
      /\bwhere should we stay\b|\brecommend\b.{0,20}\b(?:hotel|lodging|area)\b/i,
    )
  )
    intent = "lodging_recommendation";
  else if (matches(/\b(?:route|drive|walk|transit|travel time|how long)\b/i))
    intent = "route_question";
  else if (
    matches(
      /\bmap\b|\bwhere is\b.{0,50}\b(?:visitor center|trail|hotel|place)\b/i,
    )
  )
    intent = "map_question";
  else if (
    matches(/\b(?:compare|versus|\bvs\.?\b)\b/i) &&
    matches(/\b(?:yellowstone|yosemite|park|destination|city|place|teton)\b/i)
  )
    intent = "destination_comparison";
  else if (
    matches(
      /\b(?:suggest|recommend|ideas for|where should we go)\b.{0,40}\b(?:places?|destinations?|trip|go)\b/i,
    )
  )
    intent = "destination_discovery";
  else if (matches(/\b(?:i|we)\s+(?:prefer|like|love|want)\b/i))
    intent = "preference_capture";
  else if (
    matches(/\b(?:itinerary|current plan|the hike|activity)\b/i) &&
    matches(/\b(?:what|when|where|why|how)\b/i)
  )
    intent = "itinerary_question";

  return trailieIntentSchema.parse(intent);
}
