type ContextMessage = Readonly<{
  id: string;
  author: string;
  body: string;
  createdAt: string;
}>;

export type TrailieContextInput = Readonly<{
  trip: {
    id: string;
    name: string;
    approvalMode: "all_active" | "host_only";
  };
  requester: {
    participantId: string;
    role: "host" | "member";
  };
  recentMessages: readonly ContextMessage[];
  sharedMemory: {
    destinations: readonly string[];
    dates: readonly string[];
    decisions: readonly string[];
    openQuestions: readonly string[];
  };
  crewSignals: {
    preferences: readonly string[];
    constraints: readonly string[];
  };
  currentPlan: {
    id: string;
    version: number;
    status: string;
    summary: string;
  } | null;
  versionHistory: readonly {
    id: string;
    version: number;
    publishedAt: string;
    changeSummary: string | null;
    isCurrent: boolean;
  }[];
  planning: Record<string, unknown> | null;
  revision: Record<string, unknown> | null;
  selectedLodging: readonly Record<string, unknown>[];
  selectedFlights: readonly Record<string, unknown>[];
  evidence: readonly Record<string, unknown>[];
  privateMemory?: unknown;
  maxCharacters?: number;
  requestedSections?: readonly TrailieContextSection[];
}>;

export type TrailieContextSection =
  | "trip"
  | "requester_permissions"
  | "shared_trip_context"
  | "crew_signals"
  | "recent_messages"
  | "current_plan"
  | "version_history"
  | "planning"
  | "revision"
  | "selected_lodging"
  | "selected_flights"
  | "evidence";

function cleanText(value: string, maximum: number) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length <= maximum
    ? normalized
    : `${normalized.slice(0, maximum - 1)}…`;
}

function boundedList(values: readonly string[], maximumItems: number) {
  return values
    .slice(0, maximumItems)
    .map((value) => cleanText(value, 300))
    .filter(Boolean);
}

function block(name: string, value: unknown) {
  return `<${name}>${JSON.stringify(value)}</${name}>`;
}

export function buildTrailieContext(input: TrailieContextInput) {
  const maxCharacters = Math.max(1_000, input.maxCharacters ?? 24_000);
  const recentMessages = input.recentMessages.slice(-12).map((message) => ({
    id: message.id,
    author: cleanText(message.author, 50),
    body: cleanText(message.body, 700),
    createdAt: message.createdAt,
  }));
  const contract = {
    schemaVersion: "1" as const,
    trip: input.trip,
    requesterPermissions: {
      participantId: input.requester.participantId,
      role: input.requester.role,
      canProposeChanges: true,
      canPublishWithoutApproval: false,
    },
    sharedTripContext: {
      destinations: boundedList(input.sharedMemory.destinations, 12),
      dates: boundedList(input.sharedMemory.dates, 12),
      decisions: boundedList(input.sharedMemory.decisions, 24),
      openQuestions: boundedList(input.sharedMemory.openQuestions, 24),
    },
    crewSignals: {
      preferences: boundedList(input.crewSignals.preferences, 30),
      constraints: boundedList(input.crewSignals.constraints, 30),
      attribution: "aggregated" as const,
    },
    recentMessages,
    currentPlan: input.currentPlan,
    versionHistory: input.versionHistory.slice(0, 20),
    planning: input.planning,
    revision: input.revision,
    selectedLodging: input.selectedLodging.slice(0, 8),
    selectedFlights: input.selectedFlights.slice(0, 8),
    evidence: input.evidence.slice(0, 30),
  };

  const sections: Array<{
    key: TrailieContextSection;
    tag: string;
    value: unknown;
    include: boolean;
  }> = [
    { key: "trip", tag: "TRIP", value: contract.trip, include: true },
    {
      key: "requester_permissions",
      tag: "REQUESTER_PERMISSIONS",
      value: contract.requesterPermissions,
      include: true,
    },
    {
      key: "shared_trip_context",
      tag: "SHARED_TRIP_CONTEXT",
      value: contract.sharedTripContext,
      include: true,
    },
    {
      key: "crew_signals",
      tag: "AGGREGATED_CREW_SIGNALS",
      value: contract.crewSignals,
      include:
        contract.crewSignals.preferences.length > 0 ||
        contract.crewSignals.constraints.length > 0,
    },
    {
      key: "recent_messages",
      tag: "UNTRUSTED_RECENT_MESSAGES",
      value: contract.recentMessages,
      include: contract.recentMessages.length > 0,
    },
    {
      key: "current_plan",
      tag: "CURRENT_PLAN",
      value: contract.currentPlan,
      include: contract.currentPlan !== null,
    },
    {
      key: "version_history",
      tag: "VERSION_HISTORY",
      value: contract.versionHistory,
      include: contract.versionHistory.length > 0,
    },
    {
      key: "planning",
      tag: "PLANNING_STATE",
      value: contract.planning,
      include: contract.planning !== null,
    },
    {
      key: "revision",
      tag: "REVISION_STATE",
      value: contract.revision,
      include: contract.revision !== null,
    },
    {
      key: "selected_lodging",
      tag: "SELECTED_LODGING",
      value: contract.selectedLodging,
      include: contract.selectedLodging.length > 0,
    },
    {
      key: "selected_flights",
      tag: "SELECTED_FLIGHTS",
      value: contract.selectedFlights,
      include: contract.selectedFlights.length > 0,
    },
    {
      key: "evidence",
      tag: "VERIFIED_EVIDENCE",
      value: contract.evidence,
      include: contract.evidence.length > 0,
    },
  ];

  const usedSections: TrailieContextSection[] = [];
  const requested = input.requestedSections
    ? new Set(input.requestedSections)
    : null;
  let text = "";
  for (const section of sections) {
    if (!section.include || (requested && !requested.has(section.key)))
      continue;
    const next = block(section.tag, section.value);
    const separator = text ? "\n" : "";
    if (text.length + separator.length + next.length > maxCharacters) {
      if (!text) text = next.slice(0, maxCharacters);
      break;
    }
    text += `${separator}${next}`;
    usedSections.push(section.key);
  }

  return { contract, text, usedSections };
}
