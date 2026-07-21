import { describe, expect, it, vi } from "vitest";
import {
  createFakeTravelProviderAdapter,
  createFakeTravelProvider,
  createUnavailableTravelProvider,
} from "@trailie/travel-tools";
import type { PlanningSummary, TravelEvidenceV1 } from "@trailie/schemas";
import { revisionItinerary } from "@/features/revisions/test-fixtures";
import { createFakeItineraryProvider } from "./provider";
import {
  enrichWithTravelEvidence,
  bindOfficialItemEvidence,
  parseItineraryDates,
  processItineraryGeneration,
} from "./worker";

function officialEvidence(
  name: string,
  type: TravelEvidenceV1["evidenceType"],
): TravelEvidenceV1 {
  return {
    schemaVersion: "1",
    evidenceId: `evidence:${name.toLowerCase().replaceAll(" ", "-")}`,
    evidenceType: type,
    provider: type === "campground" ? "ridb" : "nps",
    sourceName: "Official source",
    sourceUrl: "https://www.nps.gov",
    sourceEntityId: `official:${name}`,
    retrievedAt: "2026-07-19T00:00:00.000Z",
    observedAt: null,
    validFrom: null,
    validUntil: null,
    freshnessState: "fresh",
    verificationState: "verified",
    confidence: "high",
    availabilityState: "available",
    locationBinding: {
      coordinates: { latitude: 37, longitude: -119 },
      boundingBox: null,
      timezone: "America/Los_Angeles",
      precision: "place",
      privacy: "public",
    },
    entityBinding: {
      entityType: type === "campground" ? "campground" : "visitor_center",
      canonicalId: `official:${name}`,
      name,
    },
    normalizedValue: { kind: type, data: {} },
    providerMetadata: {},
    attribution: {
      label: "Official",
      url: "https://www.nps.gov",
      required: true,
    },
    restrictions: { storage: "permanent", display: "Official source" },
    cacheStatus: "miss",
    requestId: null,
    errorState: null,
  };
}

describe("official item evidence binding", () => {
  it("binds one exact official item and leaves ambiguous items unresolved", () => {
    const itinerary = structuredClone(revisionItinerary());
    const item = itinerary.days[0].items[0];
    item.title = "Visitor Center";
    item.location = null;
    const evidence = officialEvidence("Visitor Center", "visitor_center");
    const bound = bindOfficialItemEvidence(itinerary, [evidence]);
    expect(bound.days[0].items[0].sourceEntityId).toBe(
      "official:Visitor Center",
    );
    expect(bound.days[0].items[0].location?.verificationStatus).toBe(
      "verified",
    );
    const unresolvedInput = structuredClone(revisionItinerary());
    unresolvedInput.days[0].items[0].title = "Visitor Center";
    unresolvedInput.days[0].items[0].location = null;
    const unresolved = bindOfficialItemEvidence(unresolvedInput, [
      evidence,
      {
        ...evidence,
        evidenceId: "evidence:other",
        entityBinding: {
          ...evidence.entityBinding!,
          canonicalId: "official:other",
          name: "Visitor Center",
        },
      },
    ]);
    expect(unresolved.days[0].items[0].location).toBeNull();
  });
});
import type {
  ItineraryGenerationContext,
  ItineraryRepository,
} from "./repository";
import { parseWorkflowReliabilityPolicy } from "@/server/ai/reliability-policy";

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
    drafts: [] as NonNullable<ItineraryGenerationContext["draft"]>[],
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
      calls.drafts.push(structuredClone(value));
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
  it("validates a compact candidate and persists only its deterministic full expansion", async () => {
    const { repo, calls } = repository();
    await processItineraryGeneration("plan-compact", {
      repository: repo,
      provider: createFakeItineraryProvider(),
      travelProvider: createFakeTravelProvider({ scenario: "valid" }),
      safetyIdentifier: "safe",
      now: "2026-07-13T19:00:00.000Z",
    });

    expect(calls.drafts.length).toBeGreaterThan(0);
    expect(calls.drafts[0]).toMatchObject({
      schemaVersion: "1",
      startDate: "2026-09-12",
      endDate: "2026-09-13",
    });
    expect(calls.drafts[0].days).toHaveLength(2);
    expect(calls.drafts[0].days[0]).toMatchObject({
      id: "day:2026-09-12",
    });
    expect(calls.drafts[0].days[0].items[0]).toMatchObject({
      id: "item:valley-walk",
    });
    expect(JSON.stringify(calls.drafts[0])).not.toContain("clientKey");
  });

  it("fails a compact candidate with incomplete date coverage without partial persistence", async () => {
    const { repo, calls } = repository();
    const provider = createFakeItineraryProvider();
    const output = await provider.generate({
      operationKey: "invalid-coverage",
      model: "fixture",
      safetyIdentifier: "safe",
      context: "fixture",
      signal: AbortSignal.timeout(1_000),
    });
    output.candidate.days = output.candidate.days.slice(0, 1);
    await processItineraryGeneration("plan-invalid-coverage", {
      repository: repo,
      provider: { generate: async () => output, repair: provider.repair },
      travelProvider: createFakeTravelProvider({ scenario: "valid" }),
      safetyIdentifier: "safe",
      now: "2026-07-13T19:00:00.000Z",
    });

    expect(calls.generatedDrafts).toBe(0);
    expect(calls.published).toBe(0);
    expect(calls.failed).toEqual(["invalid_itinerary_response"]);
  });

  it("bounds a ten-day trip to three day-group calls and persists only the combined expansion", async () => {
    const { repo, calls } = repository();
    const dates = Array.from({ length: 10 }, (_, index) =>
      new Date(Date.UTC(2026, 8, 1 + index)).toISOString().slice(0, 10),
    );
    const loadContext = repo.loadContext.bind(repo);
    repo.loadContext = async (id) => {
      const context = await loadContext(id);
      return {
        ...context,
        approvedSummary: {
          ...context.approvedSummary,
          tripSnapshot: {
            ...context.approvedSummary.tripSnapshot,
            dateWindows: [`${dates[0]} to ${dates.at(-1)}`],
          },
          confirmedDecisions: [],
          rejectedOptions: [],
        },
      };
    };
    const generate = vi.fn(async (input: { context: string }) => {
      const group = JSON.parse(
        input.context.match(/<DATE_GROUP>([^<]+)<\/DATE_GROUP>/)?.[1] ?? "[]",
      ) as string[];
      return {
        candidate: {
          schemaVersion: "1" as const,
          title: "Ten days in Yosemite",
          summary: "A bounded long-trip candidate for Yosemite.",
          assumptions: [],
          warnings: [],
          days: group.map((date) => ({
            date,
            theme: `Yosemite on ${date}`,
            locationArea: "Yosemite Valley",
            items: [
              {
                clientKey: `day-${date}`,
                type: "activity" as const,
                title: `Yosemite activity ${date}`,
                startTime: "10:00",
                endTime: "12:00",
                locationText: "Yosemite Valley",
                sourceEntityHint: null,
                shortDescription: "A measured activity in Yosemite.",
                rationale: "Keeps the day intentionally bounded.",
                bookingRequirement: "unknown" as const,
                importantWarning: null,
              },
            ],
            travelSegments: [],
          })),
        },
        responseId: "response:chunk",
        requestId: "request:chunk",
        usage: {
          inputTokens: 100,
          outputTokens: 200,
          reasoningTokens: 0,
          cachedInputTokens: 0,
          totalTokens: 300,
        },
        structuralRepairCount: 0,
      };
    });
    await processItineraryGeneration("plan-long", {
      repository: repo,
      provider: { generate, repair: vi.fn() } as never,
      travelProvider: createUnavailableTravelProvider("unconfigured"),
      safetyIdentifier: "safe",
      now: "2026-07-13T19:00:00.000Z",
    });

    expect(generate).toHaveBeenCalledTimes(3);
    expect(
      generate.mock.calls.map(
        ([input]) => input.context.match(/<DATE_GROUP>/g)?.length,
      ),
    ).toEqual([1, 1, 1]);
    expect(calls.generatedDrafts).toBe(1);
    expect(calls.drafts[0].days).toHaveLength(10);
    expect(
      new Set(
        calls.drafts[0].days.flatMap((day) => day.items.map((item) => item.id)),
      ).size,
    ).toBe(10);
    expect(calls.failed).toEqual([]);
    expect(calls.published).toBe(1);
  });
  it("normalizes a bounded natural-language planning date range for weather", () => {
    expect(parseItineraryDates(["July 22 through July 25, 2026"])).toEqual([
      "2026-07-22",
      "2026-07-23",
      "2026-07-24",
      "2026-07-25",
    ]);
  });

  it("handles an empty day without crashing during evidence enrichment", async () => {
    const output = revisionItinerary();
    output.days[0].items = [];
    output.days[0].travelSegments = [];
    const { repo } = repository();
    await expect(
      enrichWithTravelEvidence("plan-empty", output, [], {
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

  it("records a validated core preview before optional enrichment completes", async () => {
    const { repo, calls } = repository();
    const fixtureProvider = createFakeItineraryProvider();
    const ready = await fixtureProvider.repair({
      operationKey: "preview-ready",
      model: "gpt-5.6-sol",
      safetyIdentifier: "safe",
      context: "fixture",
      signal: AbortSignal.timeout(1000),
    });
    const provider = {
      generate: vi.fn().mockResolvedValue(ready),
      repair: vi.fn(),
    };
    const travelProvider = createFakeTravelProvider({ scenario: "valid" });
    const originalPlaceDetails =
      travelProvider.placeDetails.bind(travelProvider);
    let releaseEnrichment: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseEnrichment = resolve;
    });
    const placeDetails = vi
      .spyOn(travelProvider, "placeDetails")
      .mockImplementation(async (input) => {
        await gate;
        return originalPlaceDetails(input);
      });

    const processing = processItineraryGeneration("plan-preview", {
      repository: repo,
      provider,
      travelProvider,
      safetyIdentifier: "safe",
      now: "2026-07-13T19:00:00.000Z",
    });
    await vi.waitFor(() => expect(placeDetails).toHaveBeenCalled());

    try {
      expect(calls.reports).toEqual(["pass"]);
      expect(calls.published).toBe(0);
    } finally {
      releaseEnrichment?.();
      await processing;
    }
    expect(calls.published).toBe(1);
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

  it("ends in a blocked state when the single repair remains invalid", async () => {
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
    expect(calls.reports).toEqual(["needs_revision", "blocked"]);
    expect(calls.claims).toBe(2);
    expect(calls.published).toBe(0);
  });

  it("does not start a semantic repair after the one structural repair budget is used", async () => {
    const { repo, calls } = repository();
    const provider = createFakeItineraryProvider();
    const generate = provider.generate.bind(provider);
    provider.generate = async (input) => ({
      ...(await generate(input)),
      structuralRepairCount: 1,
    });
    await processItineraryGeneration("plan-structural-budget", {
      repository: repo,
      provider,
      travelProvider: createFakeTravelProvider({ scenario: "valid" }),
      safetyIdentifier: "safe",
      now: "2026-07-13T19:00:00.000Z",
    });

    expect(calls.claims).toBe(1);
    expect(calls.reports).toEqual(["needs_revision", "blocked"]);
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

  it("classifies a provider deadline as model_timeout rather than validation failure", async () => {
    const { repo, calls } = repository();
    const generate = vi
      .fn()
      .mockRejectedValue(
        new DOMException("The operation timed out", "TimeoutError"),
      );
    await processItineraryGeneration("plan-timeout", {
      repository: repo,
      provider: { generate, repair: vi.fn() },
      travelProvider: createFakeTravelProvider({ scenario: "valid" }),
      safetyIdentifier: "safe",
      reliabilityPolicy: parseWorkflowReliabilityPolicy({}),
      now: "2026-07-13T19:00:00.000Z",
    });
    expect(generate).toHaveBeenCalledOnce();
    expect(calls.failed).toEqual(["model_timeout"]);
    expect(calls.reports).toEqual([]);
  });

  it("maps an external cancellation to a stopped terminal state", async () => {
    const { repo, calls } = repository();
    const controller = new AbortController();
    const generate = vi.fn(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    );
    const processing = processItineraryGeneration("plan-cancel", {
      repository: repo,
      provider: { generate, repair: vi.fn() },
      travelProvider: createFakeTravelProvider({ scenario: "valid" }),
      safetyIdentifier: "safe",
      cancellationSignal: controller.signal,
      now: "2026-07-13T19:00:00.000Z",
    });
    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
    controller.abort(new DOMException("Stopped", "AbortError"));
    await processing;

    expect(calls.failed).toEqual(["workflow_cancelled"]);
    expect(calls.published).toBe(0);
  });

  it("stages generation and the bounded repair through distinct durable attempts", async () => {
    const { repo, calls } = repository();
    const run = vi.fn(async (input) => {
      const result = await input.execute({
        attemptId: `5c000000-0000-4000-8000-00000000000${run.mock.calls.length}`,
        leaseOwner: "5c000000-0000-4000-8000-000000000009",
      });
      await input.apply(result.value, result);
      return { status: "applied", recovered: false, result };
    });
    await processItineraryGeneration("plan-durable", {
      repository: repo,
      provider: createFakeItineraryProvider(),
      travelProvider: createFakeTravelProvider({ scenario: "valid" }),
      safetyIdentifier: "safe",
      providerAttempts: { run } as never,
      reliabilityPolicy: parseWorkflowReliabilityPolicy({}),
      now: "2026-07-13T19:00:00.000Z",
    });
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        workflow: "itinerary_generation",
        operationKey: "plan-durable:generate",
      }),
    );
    expect(run).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        workflow: "itinerary_repair",
        operationKey: "plan-durable:repair",
      }),
    );
    expect(calls.published).toBe(1);
  });

  it("supplies normalized live evidence and snapshots it before publication", async () => {
    const { repo, calls } = repository();
    const itineraryProvider = createFakeItineraryProvider();
    const generate = vi.spyOn(itineraryProvider, "generate");
    const repair = vi.spyOn(itineraryProvider, "repair");
    const fixture = createFakeTravelProviderAdapter({
      scenario: "baseline",
      now: "2026-07-13T19:00:00.000Z",
    });
    const store = vi.fn(async () => crypto.randomUUID());
    const bindSnapshot = vi.fn(async () => crypto.randomUUID());
    const resolutionId = crypto.randomUUID();

    await processItineraryGeneration("plan-live-evidence", {
      repository: repo,
      provider: itineraryProvider,
      travelProvider: createFakeTravelProvider({ scenario: "valid" }),
      travelIntelligence: {
        providers: {
          geocoding: fixture,
          weather: fixture,
          parks: fixture,
          recreation: fixture,
        },
        evidenceRepository: {
          store,
          bindSnapshot,
          copySnapshots: vi.fn(async () => 0),
          storeDestinationResolution: vi.fn(async () => resolutionId),
          loadDestinationResolution: vi.fn(async (input) => ({
            schemaVersion: "1" as const,
            originalQuery: "Yosemite National Park",
            normalizedQuery: "Yosemite",
            status: "resolved" as const,
            canonicalPlaceId: "nps:yose",
            canonicalName: "Yosemite National Park",
            providerPlaceId: null,
            npsParkCode: "yose",
            coordinates: { latitude: 37.8651, longitude: -119.5383 },
            boundingBox: null,
            locality: null,
            region: null,
            country: null,
            candidateCount: 1,
            selectedCandidateIndex: 0,
            resolutionMethod: "exact_official_match" as const,
            corroborationSources: ["trailie-fake-v1"],
            corroborationScore: 0.8,
            confidence: "high" as const,
            ambiguityReasons: [],
            evidenceIds: [],
            semanticHash: input.semanticHash,
          })),
          bindDestinationResolutionEvidence: vi.fn(async () =>
            crypto.randomUUID(),
          ),
        },
        maximumCallsPerProvider: 8,
      },
      safetyIdentifier: "safe",
      now: "2026-07-13T19:00:00.000Z",
    });

    expect(generate.mock.calls[0][0].context).toContain("<OFFICIAL_EVIDENCE>");
    expect(generate.mock.calls[0][0].context).toContain(
      '"type":"weather_forecast"',
    );
    expect(generate.mock.calls[0][0].context).toContain("<DESTINATION>");
    expect(generate.mock.calls[0][0].context).toContain(resolutionId);
    if (repair.mock.calls.length)
      expect(repair.mock.calls[0][0].context).toContain(resolutionId);
    expect(store).toHaveBeenCalled();
    expect(bindSnapshot).toHaveBeenCalled();
    expect(bindSnapshot.mock.calls.length).toBeLessThanOrEqual(
      store.mock.calls.length,
    );
    expect(bindSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ tripPlanId: "plan-live-evidence" }),
    );
    expect(calls.published).toBe(1);
  });
});
