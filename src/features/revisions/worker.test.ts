import { describe, expect, it, vi } from "vitest";
import type {
  PlanChangeAnalysis,
  RevisionAllowedChangeManifestV1,
  RevisionPatchV1,
} from "@trailie/schemas";
import { processPlanChange, type RevisionContext } from "./worker";
import {
  approvedMoveAnalysis,
  revisionItinerary,
  revisionPlanningSummary,
} from "./test-fixtures";
import { parseWorkflowReliabilityPolicy } from "@/server/ai/reliability-policy";
import {
  deriveAllowedChangeManifest,
  hashAllowedChangeManifest,
} from "./manifest";
import { applyRevisionPatch, deriveDeterministicRevisionPatch } from "./patch";

function analysisContext(): RevisionContext {
  return {
    request: {
      id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
      roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
      baseTripPlanId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a5",
      basePlanHash: "a".repeat(64),
      status: "draft" as const,
      requestType: "move_item" as const,
      targetItemId: "item:sunset",
      requestText: "Move it later",
      basePlanVersion: 1,
      approvedAnalysisVersion: null,
      currentAnalysisVersion: 0,
      candidateTripPlanId: null,
      candidateAttemptCount: 0,
      scopeRepairCount: 0,
      conflictRepairCount: 0,
    },
    basePlan: revisionItinerary(),
    approvedSummary: revisionPlanningSummary(),
    analysis: null,
    candidatePlan: null,
    manifest: null,
    patch: null,
    evidence: [],
  };
}

function removalContext(): RevisionContext {
  const context = analysisContext();
  context.request.status = "approved";
  context.request.requestType = "remove_item";
  context.request.targetItemId = "item:walk";
  context.request.requestText =
    "Remove the timed Valley walk and keep everything else unchanged.";
  context.request.currentAnalysisVersion = 1;
  context.request.approvedAnalysisVersion = 1;
  context.analysis = {
    ...approvedMoveAnalysis(),
    requestSummary: "Remove the timed Valley walk.",
    requestedChange: {
      type: "remove_item",
      targetItemIds: ["item:walk"],
      normalizedInstruction: "Remove the timed Valley walk.",
    },
    affectedItems: [
      {
        itemId: "item:walk",
        dayId: "day:2026-09-12",
        summary: "Remove the timed Valley walk.",
        direct: true,
      },
    ],
  };
  return context;
}

function noTravelProvider() {
  const unavailable = (toolName: string) => ({
    provider: "fake",
    toolName,
    requestFingerprint: toolName,
    status: "unavailable" as const,
    retrievedAt: "2026-07-16T20:00:00.000Z",
    expiresAt: null,
    data: {},
    sourceReference: null,
  });
  return {
    geocode: vi.fn(async () => unavailable("geocode")),
    placeDetails: vi.fn(async () => unavailable("place_details")),
    route: vi.fn(async () => unavailable("route")),
    daylight: vi.fn(async () => unavailable("daylight")),
    destinationFacts: vi.fn(async () => unavailable("destination_facts")),
  };
}

function revisionRepository(context: RevisionContext) {
  return {
    loadContext: vi.fn().mockResolvedValue(context),
    claimAnalysis: vi.fn(),
    completeAnalysis: vi.fn(),
    claimCandidate: vi.fn().mockResolvedValue({ claimed: true }),
    persistManifest: vi.fn(),
    persistPatch: vi.fn(),
    attachCandidate: vi.fn().mockResolvedValue({
      id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4",
      version: 2,
    }),
    recordEvidence: vi.fn(
      async (_id, evidence) => `evidence:${evidence.toolName}`,
    ),
    updateCandidate: vi.fn(),
    recordValidation: vi.fn(),
    startScopeRepair: vi.fn().mockResolvedValue({ claimed: true }),
    completeScopeRepair: vi.fn(),
    startRepair: vi.fn().mockResolvedValue({ claimed: true }),
    recordRunUsage: vi.fn(),
    completeCandidate: vi.fn(),
    block: vi.fn(),
    fail: vi.fn(),
  };
}

describe("revision worker", () => {
  it("applies a narrow removal deterministically without a Sol candidate call", async () => {
    const context = removalContext();
    const repository = revisionRepository(context);
    const provider = {
      analyze: vi.fn(),
      generatePatch: vi.fn(),
      generate: vi.fn(),
      repairScope: vi.fn(),
      repair: vi.fn(),
    };
    await processPlanChange("request-remove", {
      repository,
      provider,
      travelProvider: noTravelProvider() as never,
      safetyIdentifier: "safe",
      now: "2026-07-16T20:00:00.000Z",
    });
    expect(repository.persistManifest).toHaveBeenCalledWith(
      "request-remove",
      expect.objectContaining({
        requestType: "remove_item",
        targetItemIds: ["item:walk"],
      }) as RevisionAllowedChangeManifestV1,
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(repository.persistPatch).toHaveBeenCalledWith(
      "request-remove",
      expect.objectContaining({
        operations: [expect.objectContaining({ operation: "remove" })],
      }) as RevisionPatchV1,
    );
    expect(provider.generatePatch).not.toHaveBeenCalled();
    expect(provider.generate).not.toHaveBeenCalled();
    expect(repository.attachCandidate).toHaveBeenCalledWith(
      "request-remove",
      expect.objectContaining({
        days: expect.arrayContaining([
          expect.objectContaining({
            id: "day:2026-09-12",
            items: [expect.objectContaining({ id: "item:sunset" })],
          }),
        ]),
      }),
      expect.any(Object),
      {
        model: "trailie-deterministic",
        promptVersion: "trailie-revision-patch-v1",
      },
    );
    expect(repository.completeCandidate).toHaveBeenCalledOnce();
    expect(repository.block).not.toHaveBeenCalled();
  });

  it("resumes a persisted deterministic patch without applying it twice or calling a provider", async () => {
    const context = removalContext();
    const manifest = deriveAllowedChangeManifest({
      changeRequestId: context.request.id,
      basePlanId: context.request.baseTripPlanId,
      baseVersion: context.request.basePlanVersion,
      basePlanHash: context.request.basePlanHash,
      analysisVersion: context.request.currentAnalysisVersion,
      requestType: context.request.requestType,
      targetItemId: context.request.targetItemId,
      basePlan: context.basePlan,
      analysis: context.analysis!,
      approvedSummary: context.approvedSummary,
    });
    const patch = deriveDeterministicRevisionPatch({
      basePlan: context.basePlan,
      manifest,
      analysis: context.analysis!,
    });
    context.request.status = "applying";
    context.request.candidateAttemptCount = 1;
    context.manifest = manifest;
    context.patch = patch;
    const repository = revisionRepository(context);
    const provider = {
      analyze: vi.fn(),
      generatePatch: vi.fn(),
      generate: vi.fn(),
      repairScope: vi.fn(),
      repair: vi.fn(),
    };

    await processPlanChange(context.request.id, {
      repository,
      provider,
      travelProvider: noTravelProvider() as never,
      safetyIdentifier: "safe",
      now: "2026-07-16T20:00:00.000Z",
    });

    expect(repository.claimCandidate).not.toHaveBeenCalled();
    expect(repository.attachCandidate).toHaveBeenCalledOnce();
    expect(provider.generatePatch).not.toHaveBeenCalled();
    expect(provider.generate).not.toHaveBeenCalled();
    expect(hashAllowedChangeManifest(context.manifest)).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });

  it("reuses a durable candidate and validates it without a duplicate application or provider call", async () => {
    const context = removalContext();
    const manifest = deriveAllowedChangeManifest({
      changeRequestId: context.request.id,
      basePlanId: context.request.baseTripPlanId,
      baseVersion: context.request.basePlanVersion,
      basePlanHash: context.request.basePlanHash,
      analysisVersion: context.request.currentAnalysisVersion,
      requestType: context.request.requestType,
      targetItemId: context.request.targetItemId,
      basePlan: context.basePlan,
      analysis: context.analysis!,
      approvedSummary: context.approvedSummary,
    });
    const patch = deriveDeterministicRevisionPatch({
      basePlan: context.basePlan,
      manifest,
      analysis: context.analysis!,
    });
    context.request.status = "validating";
    context.request.candidateAttemptCount = 1;
    context.request.candidateTripPlanId =
      "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4";
    context.manifest = manifest;
    context.patch = patch;
    context.candidatePlan = applyRevisionPatch(
      context.basePlan,
      patch,
      manifest,
    );
    const repository = revisionRepository(context);
    const provider = {
      analyze: vi.fn(),
      generatePatch: vi.fn(),
      generate: vi.fn(),
      repairScope: vi.fn(),
      repair: vi.fn(),
    };

    await processPlanChange(context.request.id, {
      repository,
      provider,
      travelProvider: noTravelProvider() as never,
      safetyIdentifier: "safe",
      now: "2026-07-16T20:00:00.000Z",
    });

    expect(repository.claimCandidate).not.toHaveBeenCalled();
    expect(repository.attachCandidate).not.toHaveBeenCalled();
    expect(provider.generatePatch).not.toHaveBeenCalled();
    expect(provider.generate).not.toHaveBeenCalled();
    expect(repository.completeCandidate).toHaveBeenCalledOnce();
  });

  it("runs one dedicated scope repair and never the conflict repair for drift", async () => {
    const context = analysisContext();
    context.request.status = "approved";
    context.request.currentAnalysisVersion = 1;
    context.request.approvedAnalysisVersion = 1;
    context.request.requestType = "replace_item";
    context.analysis = {
      ...approvedMoveAnalysis(),
      requestedChange: {
        type: "replace_item",
        targetItemIds: ["item:sunset"],
        normalizedInstruction: "Replace the sunset stop.",
      },
    };
    const repository = revisionRepository(context);
    const valid = structuredClone(context.basePlan);
    valid.days[0].items[1].description = "A revised approved sunset stop.";
    const drifting = structuredClone(valid);
    drifting.days[1].items[0].description = "Unauthorized rewrite.";
    const provider = {
      analyze: vi.fn(),
      generatePatch: vi.fn().mockImplementation(async (input) => ({
        patch: {
          schemaVersion: "1",
          status: "ready",
          blockers: [],
          baseVersion: 1,
          manifestHash: input.manifestHash,
          operations: [
            {
              operation: "replace",
              targetId: "item:sunset",
              dayId: "day:2026-09-12",
              fieldChanges: {
                description: "A revised approved sunset stop.",
              },
              reason: "Approved replacement",
              downstreamEffects: [],
            },
          ],
          preservedItemIds: input.manifest.protectedItemIds,
          evidenceRefreshTargets: ["item:sunset"],
        },
        responseId: null,
        requestId: null,
        usage: {},
      })),
      generate: vi.fn().mockResolvedValue({
        itinerary: drifting,
        responseId: null,
        requestId: null,
        usage: {},
      }),
      repairScope: vi.fn().mockResolvedValue({
        itinerary: valid,
        responseId: null,
        requestId: null,
        usage: {},
      }),
      repair: vi.fn(),
    };
    await processPlanChange("request-scope-repair", {
      repository,
      provider,
      travelProvider: noTravelProvider() as never,
      safetyIdentifier: "safe",
      now: "2026-07-16T20:00:00.000Z",
    });
    expect(repository.startScopeRepair).toHaveBeenCalledWith(
      "request-scope-repair",
      expect.objectContaining({
        preservation: expect.objectContaining({
          unauthorizedDifferences: expect.arrayContaining(["items.item:falls"]),
        }),
      }),
    );
    expect(provider.repairScope).toHaveBeenCalledOnce();
    expect(provider.repair).not.toHaveBeenCalled();
    expect(repository.completeScopeRepair).toHaveBeenCalledWith(
      "request-scope-repair",
    );
    expect(repository.completeCandidate).toHaveBeenCalledOnce();
  });

  it("blocks a second scope violation with no third attempt or publication", async () => {
    const context = analysisContext();
    context.request.status = "approved";
    context.request.requestType = "replace_item";
    context.request.currentAnalysisVersion = 1;
    context.request.approvedAnalysisVersion = 1;
    context.analysis = {
      ...approvedMoveAnalysis(),
      requestedChange: {
        type: "replace_item",
        targetItemIds: ["item:sunset"],
        normalizedInstruction: "Replace the sunset stop.",
      },
    };
    const repository = revisionRepository(context);
    const drifting = structuredClone(context.basePlan);
    drifting.days[0].items[1].description = "Approved replacement.";
    drifting.days[1].items[0].description = "Unauthorized rewrite.";
    const provider = {
      analyze: vi.fn(),
      generatePatch: vi.fn().mockImplementation(async (input) => ({
        patch: {
          schemaVersion: "1",
          status: "ready",
          blockers: [],
          baseVersion: 1,
          manifestHash: input.manifestHash,
          operations: [
            {
              operation: "replace",
              targetId: "item:sunset",
              dayId: "day:2026-09-12",
              fieldChanges: { description: "Approved replacement." },
              reason: "Approved replacement",
              downstreamEffects: [],
            },
          ],
          preservedItemIds: input.manifest.protectedItemIds,
          evidenceRefreshTargets: ["item:sunset"],
        },
        responseId: null,
        requestId: null,
        usage: {},
      })),
      generate: vi.fn().mockResolvedValue({
        itinerary: drifting,
        responseId: null,
        requestId: null,
        usage: {},
      }),
      repairScope: vi.fn().mockResolvedValue({
        itinerary: drifting,
        responseId: null,
        requestId: null,
        usage: {},
      }),
      repair: vi.fn(),
    };
    await processPlanChange("request-second-scope-violation", {
      repository,
      provider,
      travelProvider: noTravelProvider() as never,
      safetyIdentifier: "safe",
      now: "2026-07-16T20:00:00.000Z",
    });
    expect(provider.repairScope).toHaveBeenCalledOnce();
    expect(repository.completeScopeRepair).not.toHaveBeenCalled();
    expect(provider.repair).not.toHaveBeenCalled();
    expect(repository.block).toHaveBeenCalledWith(
      "request-second-scope-violation",
      "change_scope_exceeded",
    );
    expect(repository.completeCandidate).not.toHaveBeenCalled();
  });

  it("analyzes only an explicit draft and records deterministic materiality", async () => {
    const completeAnalysis = vi.fn();
    const repository = {
      loadContext: vi.fn().mockResolvedValue(analysisContext()),
      claimAnalysis: vi.fn().mockResolvedValue({ claimed: true }),
      completeAnalysis,
      claimCandidate: vi.fn(),
      attachCandidate: vi.fn(),
      recordEvidence: vi.fn(),
      updateCandidate: vi.fn(),
      recordValidation: vi.fn(),
      startRepair: vi.fn(),
      recordRunUsage: vi.fn(),
      completeCandidate: vi.fn(),
      block: vi.fn(),
      fail: vi.fn(),
    };
    const proposed = {
      ...approvedMoveAnalysis(),
      materiality: "minor",
    } as PlanChangeAnalysis;
    await processPlanChange("request", {
      repository,
      provider: {
        analyze: vi.fn().mockResolvedValue({
          analysis: proposed,
          responseId: null,
          requestId: null,
          usage: {},
        }),
        generatePatch: vi.fn(),
        generate: vi.fn(),
        repairScope: vi.fn(),
        repair: vi.fn(),
      },
      travelProvider: {} as never,
      safetyIdentifier: "safe",
      now: "2026-07-13T19:00:00.000Z",
    });
    expect(repository.claimAnalysis).toHaveBeenCalledWith(
      "request",
      "gpt-5.6-terra",
    );
    expect(completeAnalysis).toHaveBeenCalledWith(
      "request",
      expect.objectContaining({ materiality: "material" }),
      expect.any(Object),
    );
  });

  it("generates, fully validates, boundary-checks, and stages an approved candidate", async () => {
    const base = revisionItinerary();
    const candidate = structuredClone(base);
    candidate.days[0].items[1].startTime = "18:00";
    candidate.days[0].items[1].endTime = "19:30";
    candidate.days[0].items[1].title = "Glacier Point overlook sunset";
    candidate.days[0].items[1].description =
      "A replacement Glacier Point sunset experience.";
    const context = analysisContext();
    context.request.status = "approved";
    context.request.requestType = "replace_item";
    context.request.currentAnalysisVersion = 1;
    context.request.approvedAnalysisVersion = 1;
    context.analysis = {
      ...approvedMoveAnalysis(),
      requestedChange: {
        type: "replace_item",
        targetItemIds: ["item:sunset"],
        normalizedInstruction: "Replace the sunset stop at a later time.",
      },
    };
    const completeCandidate = vi.fn();
    const run = vi.fn(async (input) => {
      const result = await input.execute({
        attemptId: "5c000000-0000-4000-8000-000000000003",
        leaseOwner: "5c000000-0000-4000-8000-000000000004",
      });
      await input.apply(result.value, result);
      expect(repository.attachCandidate).toHaveBeenCalledOnce();
      expect(repository.attachCandidate).toHaveBeenCalledWith(
        "request",
        candidate,
        expect.any(Object),
        {
          model: "gpt-5.6-sol",
          promptVersion: "trailie-itinerary-revision-v2",
        },
      );
      expect(repository.recordRunUsage).toHaveBeenCalledWith(
        "request",
        "candidate_generation",
        expect.any(Object),
      );
      return { status: "applied", recovered: false, result };
    });
    const repository = {
      loadContext: vi.fn().mockResolvedValue(context),
      claimAnalysis: vi.fn(),
      completeAnalysis: vi.fn(),
      claimCandidate: vi.fn().mockResolvedValue({ claimed: true }),
      attachCandidate: vi.fn().mockResolvedValue({
        id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4",
        version: 2,
      }),
      recordEvidence: vi
        .fn()
        .mockImplementation(
          async (_id, evidence) => `evidence:${evidence.toolName}`,
        ),
      updateCandidate: vi.fn(),
      recordValidation: vi.fn(),
      startRepair: vi.fn(),
      recordRunUsage: vi.fn(),
      completeCandidate,
      block: vi.fn(),
      fail: vi.fn(),
    };
    const travelProvider = {
      geocode: vi.fn(),
      placeDetails: vi.fn().mockResolvedValue({
        provider: "fake",
        toolName: "place_details",
        requestFingerprint: "p",
        status: "verified",
        retrievedAt: "2026-07-13T18:00:00.000Z",
        expiresAt: null,
        data: {},
        sourceReference: null,
      }),
      route: vi.fn().mockResolvedValue({
        provider: "fake",
        toolName: "route",
        requestFingerprint: "r",
        status: "verified",
        retrievedAt: "2026-07-13T18:00:00.000Z",
        expiresAt: null,
        data: { durationMinutes: 120, distanceMeters: 104000 },
        sourceReference: null,
      }),
      daylight: vi.fn().mockResolvedValue({
        provider: "fake",
        toolName: "daylight",
        requestFingerprint: "d",
        status: "verified",
        retrievedAt: "2026-07-13T18:00:00.000Z",
        expiresAt: null,
        data: {},
        sourceReference: null,
      }),
      destinationFacts: vi.fn().mockResolvedValue({
        provider: "fake",
        toolName: "destination_facts",
        requestFingerprint: "f",
        status: "verified",
        retrievedAt: "2026-07-13T18:00:00.000Z",
        expiresAt: null,
        data: {},
        sourceReference: null,
      }),
    };
    await processPlanChange("request", {
      repository,
      provider: {
        analyze: vi.fn(),
        generatePatch: vi.fn().mockImplementation(async (input) => ({
          patch: {
            schemaVersion: "1",
            status: "ready",
            blockers: [],
            baseVersion: 1,
            manifestHash: input.manifestHash,
            operations: [
              {
                operation: "replace",
                targetId: "item:sunset",
                dayId: "day:2026-09-12",
                fieldChanges: {
                  startTime: "18:00",
                  endTime: "19:30",
                  title: "Glacier Point overlook sunset",
                  description: "A replacement Glacier Point sunset experience.",
                },
                reason: "Approved replacement",
                downstreamEffects: [],
              },
            ],
            preservedItemIds: input.manifest.protectedItemIds,
            evidenceRefreshTargets: ["item:sunset"],
          },
          responseId: null,
          requestId: null,
          usage: {},
        })),
        generate: vi.fn().mockResolvedValue({
          itinerary: candidate,
          responseId: null,
          requestId: null,
          usage: {},
        }),
        repairScope: vi.fn(),
        repair: vi.fn(),
      },
      travelProvider: travelProvider as never,
      safetyIdentifier: "safe",
      candidateAttempts: { run } as never,
      reliabilityPolicy: parseWorkflowReliabilityPolicy({}),
      now: "2026-07-13T19:00:00.000Z",
    });
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow: "revision_candidate",
        operationKey: "request:candidate:1",
        attempt: 1,
        model: "gpt-5.6-sol",
      }),
    );
    expect(repository.recordValidation).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: "pass" }),
      2,
    );
    expect(completeCandidate).toHaveBeenCalledWith(
      "request",
      expect.objectContaining({ status: "pass" }),
      expect.objectContaining({ candidateVersion: 2 }),
    );
  });

  it("classifies an analysis deadline separately from invalid model output", async () => {
    const repository = {
      loadContext: vi.fn().mockResolvedValue(analysisContext()),
      claimAnalysis: vi.fn().mockResolvedValue({ claimed: true }),
      completeAnalysis: vi.fn(),
      claimCandidate: vi.fn(),
      attachCandidate: vi.fn(),
      recordEvidence: vi.fn(),
      updateCandidate: vi.fn(),
      recordValidation: vi.fn(),
      startRepair: vi.fn(),
      recordRunUsage: vi.fn(),
      completeCandidate: vi.fn(),
      block: vi.fn(),
      fail: vi.fn(),
    };
    await processPlanChange("request-timeout", {
      repository,
      provider: {
        analyze: vi
          .fn()
          .mockRejectedValue(
            new DOMException("The operation timed out", "TimeoutError"),
          ),
        generatePatch: vi.fn(),
        generate: vi.fn(),
        repairScope: vi.fn(),
        repair: vi.fn(),
      },
      travelProvider: {} as never,
      safetyIdentifier: "safe",
      reliabilityPolicy: parseWorkflowReliabilityPolicy({}),
      now: "2026-07-13T19:00:00.000Z",
    });
    expect(repository.fail).toHaveBeenCalledWith(
      "request-timeout",
      "model_timeout",
    );
    expect(repository.completeAnalysis).not.toHaveBeenCalled();
  });

  it("stages verified change analysis before the review-ready transition", async () => {
    const repository = {
      loadContext: vi.fn().mockResolvedValue(analysisContext()),
      claimAnalysis: vi.fn().mockResolvedValue({ claimed: true }),
      completeAnalysis: vi.fn(),
      claimCandidate: vi.fn(),
      attachCandidate: vi.fn(),
      recordEvidence: vi.fn(),
      updateCandidate: vi.fn(),
      recordValidation: vi.fn(),
      startRepair: vi.fn(),
      recordRunUsage: vi.fn(),
      completeCandidate: vi.fn(),
      block: vi.fn(),
      fail: vi.fn(),
    };
    const run = vi.fn(async (input) => {
      const result = await input.execute({
        attemptId: "5c000000-0000-4000-8000-000000000001",
        leaseOwner: "5c000000-0000-4000-8000-000000000002",
      });
      await input.apply(result.value, result);
      return { status: "applied", recovered: false, result };
    });
    await processPlanChange("request-durable", {
      repository,
      provider: {
        analyze: vi.fn().mockResolvedValue({
          analysis: approvedMoveAnalysis(),
          responseId: "response",
          requestId: "request",
          usage: {},
        }),
        generatePatch: vi.fn(),
        generate: vi.fn(),
        repairScope: vi.fn(),
        repair: vi.fn(),
      },
      travelProvider: {} as never,
      safetyIdentifier: "safe",
      analysisAttempts: { run } as never,
      reliabilityPolicy: parseWorkflowReliabilityPolicy({}),
      now: "2026-07-13T19:00:00.000Z",
    });
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow: "revision_analysis",
        operationKey: "request-durable:analysis:1",
        attempt: 1,
        model: "gpt-5.6-terra",
      }),
    );
    expect(repository.completeAnalysis).toHaveBeenCalledOnce();
  });
});
