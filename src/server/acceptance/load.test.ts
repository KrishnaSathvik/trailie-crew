import { describe, expect, it } from "vitest";

import { buildLoadAcceptanceReport } from "./load";

describe("bounded load acceptance report", () => {
  it("reports the fixed provider-free envelope without percentile claims", () => {
    const report = buildLoadAcceptanceReport({
      database: {
        environment: "isolated_local_postgres",
        testedEnvelope: {
          users: 10,
          messages: 1000,
          reactions: 1000,
          paginationPages: 50,
        },
        messageInsertMs: 50,
        messageThroughputPerSecond: 20_000,
        reactionInsertMs: 100,
        fiftyPageReadsMs: 25,
        messageCount: 1000,
        reactionCount: 1000,
      },
      raceSuites: [
        "planning",
        "itinerary",
        "revision",
        "sharing",
        "lifecycle",
        "provider_disabled_quota",
      ],
      databaseHealth: { connections: 8, waitingLocks: 0 },
    });
    expect(report).toMatchObject({
      schemaVersion: "1",
      status: "pass",
      samplePolicy: "aggregate_timings_only",
      providerCalls: 0,
      testedEnvelope: { messages: 1000, reactions: 1000 },
      databaseHealth: { waitingLocks: 0 },
    });
    expect(JSON.stringify(report)).not.toMatch(/p50|p95|p99|percentile/i);
  });

  it("rejects an expanded or incomplete load envelope", () => {
    expect(() =>
      buildLoadAcceptanceReport({
        database: {
          environment: "isolated_local_postgres",
          testedEnvelope: {
            users: 10,
            messages: 1001,
            reactions: 1000,
            paginationPages: 50,
          },
          messageInsertMs: 50,
          messageThroughputPerSecond: 20_000,
          reactionInsertMs: 100,
          fiftyPageReadsMs: 25,
          messageCount: 1001,
          reactionCount: 1000,
        },
        raceSuites: [],
        databaseHealth: { connections: 8, waitingLocks: 0 },
      }),
    ).toThrow("load_envelope_invalid");
  });
});
