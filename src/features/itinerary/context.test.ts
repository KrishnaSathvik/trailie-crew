import { describe, expect, it } from "vitest";
import { createFakeTravelProviderAdapter } from "@trailie/travel-tools";
import type { PlanningSummary } from "@trailie/schemas";
import { buildItineraryContext, buildItineraryRepairContext } from "./context";

const compactDraft = {
  schemaVersion: "1" as const,
  title: "Yosemite trip",
  summary: "A compact Yosemite plan.",
  assumptions: [],
  warnings: [],
  days: [
    {
      date: "2026-07-18",
      theme: "Valley day",
      locationArea: "Yosemite Valley",
      items: [
        {
          clientKey: "valley-walk",
          type: "activity" as const,
          title: "Valley walk",
          startTime: "10:00",
          endTime: "12:00",
          locationText: "Yosemite Valley",
          sourceEntityHint: null,
          shortDescription: "Take a valley walk.",
          rationale: "Matches the approved trip.",
          bookingRequirement: "not_required" as const,
          importantWarning: null,
        },
      ],
      travelSegments: [],
    },
  ],
};

describe("itinerary context", () => {
  it("bounds generation and repair context without including old versions", () => {
    const approvedSummary = {
      schemaVersion: "1",
      title: "Before I build the trip",
      tripSnapshot: {
        destinations: ["Yosemite"],
        dateWindows: ["2026-07-18"],
        travelerCount: 1,
        origins: [],
        budget: [],
        approvalMode: "host_only",
      },
      confirmedDecisions: [],
      travelerPreferences: [],
      constraints: [],
      proposals: [],
      rejectedOptions: [],
      conflicts: [],
      openQuestions: [],
      missingCriticalInformation: [],
      nonAssumptions: [
        {
          id: "bounded",
          label: "Relevant context",
          detail: "x".repeat(30_000),
          sourceMessageIds: [],
        },
      ],
      readiness: { status: "ready_for_review", blockers: [], warnings: [] },
      evidence: {
        memoryVersion: 1,
        latestMessageId: null,
        sourceMessageIds: [],
      },
    } satisfies PlanningSummary;
    const oversizedEvidence = Array.from({ length: 200 }, (_, index) => ({
      evidenceId: `evidence:${index}`,
      provider: "nps",
      entityBinding: null,
      locationBinding: null,
      verificationState: "verified",
      confidence: "high",
      providerMetadata: { detail: "z".repeat(1_000) },
    })) as never;
    const generation = buildItineraryContext({
      approvedSummary,
      travelers: [],
      evidence: [],
      liveEvidence: oversizedEvidence,
    });
    const repair = buildItineraryRepairContext({
      approvedSummary,
      draft: compactDraft,
      validation: {
        validatorVersion: "test",
        status: "needs_revision",
        issues: [],
        warnings: [],
        passedChecks: [],
        repairedIssues: [],
        evidenceLastCheckedAt: null,
      },
      evidence: [],
      liveEvidence: oversizedEvidence,
    });

    expect(generation.length).toBeLessThanOrEqual(14_000);
    expect(repair.length).toBeLessThanOrEqual(24_000);
    expect(generation).not.toContain("oldVersion");
    expect(generation).not.toContain("sourceMessageIds");
    expect(generation).not.toContain("providerMetadata");
    expect(generation).not.toContain("cacheStatus");
    expect(repair).toContain("valley-walk");
  });

  it("labels verified, stale, missing, and conflicting live evidence for Sol", async () => {
    const evidence = (
      await createFakeTravelProviderAdapter({
        scenario: "active_closure",
        now: "2026-07-17T20:00:00.000Z",
      }).getParkAlerts({ parkCode: "yose", locale: "en-US" })
    ).evidence;
    const context = buildItineraryContext({
      approvedSummary: {
        schemaVersion: "1",
        title: "Before I build the trip",
        tripSnapshot: {
          destinations: ["Yosemite"],
          dateWindows: ["2026-07-18"],
          travelerCount: 1,
          origins: [],
          budget: [],
          approvalMode: "host_only",
        },
        confirmedDecisions: [],
        travelerPreferences: [],
        constraints: [],
        proposals: [],
        rejectedOptions: [],
        conflicts: [],
        openQuestions: [],
        missingCriticalInformation: [],
        nonAssumptions: [],
        readiness: {
          status: "ready_for_review",
          blockers: [],
          warnings: [],
        },
        evidence: {
          memoryVersion: 1,
          latestMessageId: null,
          sourceMessageIds: [],
        },
      } satisfies PlanningSummary,
      travelers: [],
      evidence: [],
      liveEvidence: evidence,
    });

    expect(context).toContain("<OFFICIAL_EVIDENCE>");
    expect(context).toContain('"verification":"verified"');
    expect(context).toContain('"type":"park_closure"');
    expect(context).toContain("<OUTPUT_RULES>");
    expect(context).toMatch(
      /missing[\s\S]*conflicting[\s\S]*user confirmation/i,
    );
  });
});
