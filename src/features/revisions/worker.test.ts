import { describe, expect, it, vi } from "vitest";
import type { PlanChangeAnalysis } from "@trailie/schemas";
import { processPlanChange, type RevisionContext } from "./worker";
import {
  approvedMoveAnalysis,
  revisionItinerary,
  revisionPlanningSummary,
} from "./test-fixtures";

function analysisContext(): RevisionContext {
  return {
    request: {
      id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
      roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
      status: "draft" as const,
      requestType: "move_item" as const,
      targetItemId: "item:sunset",
      requestText: "Move it later",
      basePlanVersion: 1,
      approvedAnalysisVersion: null,
      currentAnalysisVersion: 0,
      candidateTripPlanId: null,
    },
    basePlan: revisionItinerary(),
    approvedSummary: revisionPlanningSummary(),
    analysis: null,
    candidatePlan: null,
    evidence: [],
  };
}

describe("revision worker", () => {
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
        generate: vi.fn(),
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
    const context = analysisContext();
    context.request.status = "approved";
    context.request.currentAnalysisVersion = 1;
    context.request.approvedAnalysisVersion = 1;
    context.analysis = approvedMoveAnalysis();
    const completeCandidate = vi.fn();
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
        generate: vi.fn().mockResolvedValue({
          itinerary: candidate,
          responseId: null,
          requestId: null,
          usage: {},
        }),
        repair: vi.fn(),
      },
      travelProvider: travelProvider as never,
      safetyIdentifier: "safe",
      now: "2026-07-13T19:00:00.000Z",
    });
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
});
