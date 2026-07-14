import { describe, expect, it } from "vitest";
import {
  createFakeTravelProvider,
  createUnavailableTravelProvider,
} from "@trailie/travel-tools";
import type { PlanningSummary } from "@trailie/schemas";
import { createFakeItineraryProvider } from "./provider";
import { enrichWithTravelEvidence, processItineraryGeneration } from "./worker";
import type {
  ItineraryGenerationContext,
  ItineraryRepository,
} from "./repository";

function summary(): PlanningSummary {
  const item = (id: string, label: string, detail: string) => ({
    id,
    label,
    detail,
    sourceMessageIds: [],
  });
  return {
    schemaVersion: "1",
    title: "Before I build the trip",
    tripSnapshot: {
      destinations: ["Yosemite"],
      dateWindows: ["2026-09-12 to 2026-09-13"],
      travelerCount: 1,
      origins: [],
      budget: ["USD 500"],
      approvalMode: "host_only",
    },
    confirmedDecisions: [
      item("confirmed:destination", "Destination", "Yosemite"),
      item("confirmed:sunset", "Must do", "Glacier Point sunset"),
    ],
    travelerPreferences: [],
    constraints: [],
    proposals: [],
    rejectedOptions: [item("rejected:vegas", "Rejected", "Las Vegas casino")],
    conflicts: [],
    openQuestions: [],
    missingCriticalInformation: [],
    nonAssumptions: [],
    readiness: { status: "ready_for_review", blockers: [], warnings: [] },
    evidence: { memoryVersion: 1, latestMessageId: null, sourceMessageIds: [] },
  };
}

function repository() {
  const calls = {
    claims: 0,
    generatedDrafts: 0,
    reports: [] as string[],
    progress: [] as string[],
    evidence: [] as ItineraryGenerationContext["evidence"],
    published: 0,
    failed: [] as string[],
    markedRevision: 0,
  };
  let draft: ItineraryGenerationContext["draft"] = null;
  let latestValidation: ItineraryGenerationContext["latestValidation"] = null;
  const repo: ItineraryRepository = {
    async claim() {
      calls.claims += 1;
      return {
        claimed: true,
        stage: calls.claims === 1 ? "generate" : "repair",
        attemptCount: calls.claims,
      };
    },
    async loadContext() {
      return {
        tripPlanId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
        roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
        version: 1,
        approvedSummary: summary(),
        basisSummaryVersion: 1,
        basisSummaryHash: "hash",
        travelers: [{ id: "traveler:crew", displayName: "Crew", role: "host" }],
        draft,
        latestValidation,
        evidence: calls.evidence,
      };
    },
    async recordDraft(_id, value) {
      draft = value;
      calls.generatedDrafts += 1;
    },
    async recordEvidence(_id, value) {
      const id = `evidence:00000000-0000-4000-8000-${String(calls.evidence.length + 1).padStart(12, "0")}`;
      calls.evidence.push({ ...value, id });
      return id;
    },
    async recordProgress(_id, event) {
      calls.progress.push(event);
    },
    async recordValidation(_id, report) {
      calls.reports.push(report.status);
      latestValidation = report;
    },
    async markNeedsRevision() {
      calls.markedRevision += 1;
    },
    async publish() {
      calls.published += 1;
    },
    async fail(_id, code) {
      calls.failed.push(code);
    },
  };
  return { repo, calls };
}

describe("itinerary worker", () => {
  it("handles an empty day without crashing during evidence enrichment", async () => {
    const output = await createFakeItineraryProvider().generate({
      operationKey: "empty-day",
      model: "gpt-5.6-sol",
      safetyIdentifier: "safe",
      context: "fixture",
      signal: AbortSignal.timeout(1000),
    });
    output.itinerary.days[0].items = [];
    output.itinerary.days[0].travelSegments = [];
    const { repo } = repository();
    await expect(
      enrichWithTravelEvidence("plan-empty", output.itinerary, [], {
        repository: repo,
        travelProvider: createUnavailableTravelProvider("unconfigured"),
        now: "2026-07-13T19:00:00.000Z",
      }),
    ).resolves.toMatchObject({ itinerary: { days: expect.any(Array) } });
  });

  it("validates a route conflict, repairs once, revalidates, and publishes", async () => {
    const { repo, calls } = repository();
    await processItineraryGeneration("plan-1", {
      repository: repo,
      provider: createFakeItineraryProvider(),
      travelProvider: createFakeTravelProvider({ scenario: "valid" }),
      safetyIdentifier: "safe",
      now: "2026-07-13T19:00:00.000Z",
    });
    expect(calls.reports).toEqual(["needs_revision", "pass"]);
    expect(calls.generatedDrafts).toBe(2);
    expect(calls.markedRevision).toBe(1);
    expect(calls.published).toBe(1);
    expect(calls.progress).toEqual(
      expect.arrayContaining([
        "route_validation_started",
        "constraint_validation_started",
      ]),
    );
  });

  it("blocks an unrepairable approved-boundary conflict without publishing", async () => {
    const { repo, calls } = repository();
    await processItineraryGeneration("plan-2", {
      repository: repo,
      provider: createFakeItineraryProvider({ scenario: "unrepairable" }),
      travelProvider: createFakeTravelProvider({ scenario: "valid" }),
      safetyIdentifier: "safe",
      now: "2026-07-13T19:00:00.000Z",
    });
    expect(calls.reports).toEqual(["blocked"]);
    expect(calls.markedRevision).toBe(0);
    expect(calls.published).toBe(0);
  });

  it("does not loop when the single repair remains invalid", async () => {
    const { repo, calls } = repository();
    const provider = createFakeItineraryProvider();
    provider.repair = provider.generate;
    await processItineraryGeneration("plan-3", {
      repository: repo,
      provider,
      travelProvider: createFakeTravelProvider({ scenario: "valid" }),
      safetyIdentifier: "safe",
      now: "2026-07-13T19:00:00.000Z",
    });
    expect(calls.reports).toEqual(["needs_revision", "needs_revision"]);
    expect(calls.claims).toBe(2);
    expect(calls.published).toBe(0);
  });

  it("maps provider failure to one safe terminal failure", async () => {
    const { repo, calls } = repository();
    await processItineraryGeneration("plan-4", {
      repository: repo,
      provider: createFakeItineraryProvider({ scenario: "provider_failure" }),
      travelProvider: createFakeTravelProvider({ scenario: "valid" }),
      safetyIdentifier: "safe",
      now: "2026-07-13T19:00:00.000Z",
    });
    expect(calls.failed).toEqual(["model_unavailable"]);
    expect(calls.published).toBe(0);
  });
});
