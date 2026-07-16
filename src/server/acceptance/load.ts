const requiredRaceSuites = [
  "planning",
  "itinerary",
  "revision",
  "sharing",
  "lifecycle",
  "provider_disabled_quota",
] as const;

type DatabaseLoadEvidence = {
  environment: string;
  testedEnvelope: {
    users: number;
    messages: number;
    reactions: number;
    paginationPages: number;
  };
  messageInsertMs: number;
  messageThroughputPerSecond: number;
  reactionInsertMs: number;
  fiftyPageReadsMs: number;
  messageCount: number;
  reactionCount: number;
};

export function buildLoadAcceptanceReport(input: {
  database: DatabaseLoadEvidence;
  raceSuites: readonly string[];
  databaseHealth: { connections: number; waitingLocks: number };
}) {
  const envelope = input.database.testedEnvelope;
  if (
    envelope.users !== 10 ||
    envelope.messages !== 1000 ||
    envelope.reactions !== 1000 ||
    envelope.paginationPages !== 50 ||
    input.database.messageCount !== envelope.messages ||
    input.database.reactionCount !== envelope.reactions
  )
    throw new Error("load_envelope_invalid");
  if (
    requiredRaceSuites.some((suite) => !input.raceSuites.includes(suite)) ||
    input.raceSuites.length !== requiredRaceSuites.length
  )
    throw new Error("load_race_matrix_incomplete");

  return {
    schemaVersion: "1" as const,
    status: input.databaseHealth.waitingLocks === 0 ? "pass" : "fail",
    samplePolicy: "aggregate_timings_only" as const,
    environment: input.database.environment,
    providerCalls: 0 as const,
    testedEnvelope: { ...envelope },
    aggregateTimingsMs: {
      messageInsert: input.database.messageInsertMs,
      reactionInsert: input.database.reactionInsertMs,
      fiftyPageReads: input.database.fiftyPageReadsMs,
    },
    messageThroughputPerSecond: input.database.messageThroughputPerSecond,
    raceSuites: [...input.raceSuites],
    databaseHealth: { ...input.databaseHealth },
    limitations: [
      "Database-only aggregate timings do not claim HTTP, browser, Realtime, CPU, memory, or provider scale.",
      "The run has insufficient independent latency samples for distribution reporting.",
    ],
  } as const;
}
