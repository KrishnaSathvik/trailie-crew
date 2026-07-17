import { describe, expect, it } from "vitest";

import {
  approvalModeSchema,
  createTripInputSchema,
  createTripResultSchema,
  getRoomMessagesInputSchema,
  getRoomMessagesResultSchema,
  joinTripInputSchema,
  memoryFactTypeSchema,
  memoryPatchSchema,
  memorySubjectTypeSchema,
  messageExtractionResultSchema,
  messageTypeSchema,
  participantRoleSchema,
  participantStatusSchema,
  presenceStateSchema,
  reactionTypeSchema,
  roomMessageSchema,
  roomStatusSchema,
  sendMessageInputSchema,
  toggleReactionInputSchema,
  typingEventSchema,
  evidenceStrengthSchema,
  extractionStatusSchema,
  planningApprovalStateSchema,
  planningReadinessStatusSchema,
  planningRequestStatusSchema,
  planningReviewDecisionSchema,
  planningSummarySchema,
  tripPlanStatusSchema,
  validationStatusSchema,
  itinerarySchema,
  validationReportSchema,
  tripPlanViewSchema,
  planProgressEventSchema,
  planChangeTypeSchema,
  planChangeStatusSchema,
  changeMaterialitySchema,
  changeFeasibilitySchema,
  planChangeAnalysisSchema,
  planVersionDiffSchema,
  planShareModeSchema,
  planShareStatusSchema,
  publicSharedItinerarySchema,
  revisionAllowedChangeManifestV1Schema,
  revisionPatchV1Schema,
} from "./index";

const uuid = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2";

describe("Phase 1A schemas", () => {
  it("accepts the locked database enum values", () => {
    expect(approvalModeSchema.options).toEqual(["all_active", "host_only"]);
    expect(roomStatusSchema.options).toEqual(["active", "archived", "deleted"]);
    expect(participantRoleSchema.options).toEqual(["host", "member"]);
    expect(participantStatusSchema.options).toEqual([
      "active",
      "left",
      "removed",
    ]);
  });

  it("validates and trims create Trip input", () => {
    expect(
      createTripInputSchema.parse({
        tripName: "  Boundary Waters  ",
        displayName: "  Maya  ",
        expectedTravelers: 6,
      }),
    ).toEqual({
      tripName: "Boundary Waters",
      displayName: "Maya",
      expectedTravelers: 6,
    });
  });

  it.each([
    { tripName: "", displayName: "Maya" },
    { tripName: "x".repeat(101), displayName: "Maya" },
    { tripName: "Boundary Waters", displayName: "" },
    { tripName: "Boundary Waters", displayName: "x".repeat(51) },
    { tripName: "Boundary Waters", displayName: "Maya", expectedTravelers: 0 },
    { tripName: "Boundary Waters", displayName: "Maya", expectedTravelers: 51 },
    {
      tripName: "Boundary Waters",
      displayName: "Maya",
      expectedTravelers: 2.5,
    },
  ])("rejects invalid create Trip input %#", (input) => {
    expect(createTripInputSchema.safeParse(input).success).toBe(false);
  });

  it("validates join input and safe create results", () => {
    expect(
      joinTripInputSchema.parse({
        inviteValue: "  ABCD2345  ",
        displayName: "  Leo  ",
      }),
    ).toEqual({ inviteValue: "ABCD2345", displayName: "Leo" });

    expect(
      createTripResultSchema.parse({
        roomId: uuid,
        roomName: "Boundary Waters",
        participantId: uuid,
        roomCode: "ABCD2345",
        inviteToken: "a".repeat(43),
        createdAt: "2026-07-13T18:00:00.000Z",
      }),
    ).toMatchObject({ roomCode: "ABCD2345" });
  });
});

describe("Phase 4A itinerary revision schemas", () => {
  it("locks canonical request, state, materiality, and feasibility values", () => {
    expect(planChangeTypeSchema.options).toEqual([
      "add_item",
      "remove_item",
      "replace_item",
      "move_item",
      "reschedule_item",
      "shorten_item",
      "extend_item",
      "update_note",
      "change_route",
      "change_lodging",
      "change_food",
      "rebalance_day",
      "update_traveler_logistics",
      "adjust_budget",
      "general_revision",
    ]);
    expect(planChangeStatusSchema.options).toContain("awaiting_confirmation");
    expect(changeMaterialitySchema.options).toEqual([
      "minor",
      "material",
      "critical",
    ]);
    expect(changeFeasibilitySchema.options).toEqual([
      "feasible",
      "needs_information",
      "blocked",
    ]);
  });

  it("accepts a strict safe analysis and rejects private or arbitrary fields", () => {
    const analysis = {
      schemaVersion: "1",
      title: "Move Glacier Point later",
      requestSummary: "Move the sunset stop later on September 12.",
      requestedChange: {
        type: "move_item",
        targetItemIds: ["item:sunset"],
        normalizedInstruction: "Move Glacier Point later.",
      },
      affectedDays: ["2026-09-12"],
      affectedItems: [
        {
          itemId: "item:sunset",
          dayId: "day:2026-09-12",
          summary: "Glacier Point sunset moves later.",
          direct: true,
        },
      ],
      impacts: {
        schedule: ["Later start and end time"],
        routes: ["Refresh the inbound driving segment"],
        budget: [],
        reservations: [],
        lodging: [],
        food: [],
        travelerConstraints: [],
        confirmedDecisions: ["Preserve Glacier Point sunset"],
      },
      proposedApproach: ["Shift the stop and its inbound route timing"],
      preservedItems: ["All other days"],
      risks: ["Reduced evening buffer"],
      missingInformation: [],
      materiality: "material",
      feasibility: "feasible",
      blockers: [],
      approvalSummary: "All active crew members must approve.",
    };
    expect(planChangeAnalysisSchema.parse(analysis)).toEqual(analysis);
    expect(
      planChangeAnalysisSchema.safeParse({
        ...analysis,
        providerResponseId: "resp_1",
      }).success,
    ).toBe(false);
    expect(
      planChangeAnalysisSchema.safeParse({
        ...analysis,
        title: "<script>alert(1)</script>",
      }).success,
    ).toBe(false);
  });

  it("requires target items for targeted request types and strict diff operations", () => {
    const diff = {
      schemaVersion: "1",
      baseVersion: 1,
      candidateVersion: 2,
      summary: "One activity moved later.",
      changedDays: ["2026-09-12"],
      items: [
        {
          itemId: "item:sunset",
          dayId: "day:2026-09-12",
          date: "2026-09-12",
          operation: "rescheduled",
          beforeSummary: "17:30–19:00 Glacier Point sunset",
          afterSummary: "18:00–19:30 Glacier Point sunset",
          reason: "Requested by the crew",
          downstreamImpact: ["Inbound drive shifts by 30 minutes"],
          validationStatus: "pass",
        },
      ],
      routeChanges: ["Inbound segment shifts by 30 minutes"],
      budgetDelta: null,
      warningsAdded: [],
      warningsResolved: [],
    };
    expect(planVersionDiffSchema.parse(diff)).toEqual(diff);
    expect(
      planVersionDiffSchema.safeParse({
        ...diff,
        items: [{ ...diff.items[0], operation: "patched" }],
      }).success,
    ).toBe(false);
  });
});

describe("Phase 2B conversation-memory schemas", () => {
  it("locks extraction, subject, evidence, and fact-type values", () => {
    expect(extractionStatusSchema.options).toEqual([
      "queued",
      "running",
      "completed",
      "failed",
      "skipped",
    ]);
    expect(memorySubjectTypeSchema.options).toEqual([
      "participant",
      "group",
      "trip",
    ]);
    expect(evidenceStrengthSchema.options).toEqual([
      "explicit",
      "strong",
      "tentative",
    ]);
    expect(memoryFactTypeSchema.options).toContain("group_decision");
    expect(memoryFactTypeSchema.options).not.toContain("custom");
  });

  it("accepts the smallest strict patch and rejects generated database ids", () => {
    const fact = {
      factType: "activity_preference",
      subjectType: "participant",
      subjectParticipantId: uuid,
      canonicalKey: "ignored-by-application",
      value: { text: "hiking" },
      status: "active",
      confidence: 0.92,
      evidenceStrength: "explicit",
      sourceMessageId: uuid,
    };
    expect(
      memoryPatchSchema.parse({ facts: [fact], supersessions: [] }),
    ).toEqual({
      facts: [fact],
      supersessions: [],
    });
    expect(
      memoryPatchSchema.safeParse({
        facts: [{ ...fact, id: uuid }],
        supersessions: [],
      }).success,
    ).toBe(false);
    expect(
      messageExtractionResultSchema.parse({
        status: "completed",
        patch: { facts: [], supersessions: [] },
      }),
    ).toMatchObject({ status: "completed" });
  });

  it("requires participant subjects and caps patch size and confidence", () => {
    const base = {
      factType: "activity_preference",
      subjectType: "participant",
      canonicalKey: "activity_preference:hiking",
      value: { text: "hiking" },
      status: "active",
      confidence: 0.8,
      evidenceStrength: "explicit",
      sourceMessageId: uuid,
    };
    expect(
      memoryPatchSchema.safeParse({ facts: [base], supersessions: [] }).success,
    ).toBe(false);
    expect(
      memoryPatchSchema.safeParse({
        facts: [{ ...base, subjectParticipantId: uuid, confidence: 1.1 }],
        supersessions: [],
      }).success,
    ).toBe(false);
    expect(
      memoryPatchSchema.safeParse({
        facts: Array.from({ length: 13 }, () => ({
          ...base,
          subjectParticipantId: uuid,
        })),
        supersessions: [],
      }).success,
    ).toBe(false);
  });
});

describe("Phase 3A planning schemas", () => {
  const item = {
    id: "confirmed:0",
    label: "Destination",
    detail: "Yosemite",
    sourceMessageIds: [uuid],
  };
  const summary = {
    schemaVersion: "1",
    title: "Before I build the trip",
    tripSnapshot: {
      destinations: ["Yosemite"],
      dateWindows: ["September 12–16"],
      travelerCount: 2,
      origins: [],
      budget: [],
      approvalMode: "all_active",
    },
    confirmedDecisions: [item],
    travelerPreferences: [],
    constraints: [],
    proposals: [],
    rejectedOptions: [],
    conflicts: [],
    openQuestions: [],
    missingCriticalInformation: [],
    nonAssumptions: [],
    readiness: { status: "ready_for_review", blockers: [], warnings: [] },
    evidence: {
      memoryVersion: 2,
      latestMessageId: uuid,
      sourceMessageIds: [uuid],
    },
  };

  it("locks lifecycle, readiness, and review enums", () => {
    expect(planningRequestStatusSchema.options).toEqual([
      "draft",
      "generating_summary",
      "awaiting_review",
      "changes_requested",
      "approved_for_generation",
      "superseded",
      "cancelled",
      "failed",
    ]);
    expect(planningReadinessStatusSchema.options).toEqual([
      "ready_for_review",
      "needs_information",
      "blocked",
    ]);
    expect(planningReviewDecisionSchema.options).toEqual([
      "approved",
      "changes_requested",
    ]);
  });

  it("strictly parses the fixed public summary and rejects private fields", () => {
    expect(planningSummarySchema.parse(summary).title).toBe(
      "Before I build the trip",
    );
    expect(
      planningSummarySchema.safeParse({ ...summary, confidence: 0.9 }).success,
    ).toBe(false);
    expect(
      planningSummarySchema.safeParse({ ...summary, title: "Itinerary" })
        .success,
    ).toBe(false);
    expect(
      planningSummarySchema.safeParse({
        ...summary,
        confirmedDecisions: [{ ...item, html: "<b>x</b>" }],
      }).success,
    ).toBe(false);
  });

  it("returns safe approval state without auth identities", () => {
    const participant = { id: uuid, displayName: "Maya", role: "host" };
    const parsed = planningApprovalStateSchema.parse({
      approvalMode: "host_only",
      summaryVersion: 1,
      requiredParticipants: [participant],
      approvedParticipants: [participant],
      changeRequestedParticipants: [],
      pendingParticipants: [],
      isComplete: true,
      isStale: false,
      blockers: [],
    });
    expect(parsed).not.toHaveProperty("userId");
  });
});

describe("Phase 3B itinerary schemas", () => {
  const itinerary = {
    schemaVersion: "1",
    title: "Yosemite crew escape",
    destinationSummary: "Four days in Yosemite Valley",
    timezone: "America/Los_Angeles",
    startDate: "2026-09-12",
    endDate: "2026-09-15",
    travelers: [
      {
        id: "traveler:maya",
        displayName: "Maya",
        origin: "Chicago",
        accessibilityNotes: [],
        dietaryNotes: ["vegetarian"],
      },
    ],
    arrivals: [],
    departures: [],
    lodging: [],
    days: [
      {
        id: "day:2026-09-12",
        date: "2026-09-12",
        title: "Valley arrival",
        summary: "Settle in and walk the valley floor.",
        items: [
          {
            id: "item:valley-walk",
            type: "activity",
            startTime: "15:00",
            endTime: "17:00",
            title: "Valley walk",
            description: "An easy orientation walk.",
            location: {
              name: "Yosemite Valley",
              address: null,
              latitude: 37.7459,
              longitude: -119.5936,
              timezone: "America/Los_Angeles",
              verificationStatus: "verified",
            },
            reservation: {
              status: "not_required",
              details: null,
              evidenceRefs: [],
            },
            cost: {
              status: "estimated",
              currency: "USD",
              amount: 0,
              minAmount: null,
              maxAmount: null,
              retrievedAt: null,
              evidenceRef: null,
            },
            evidenceRefs: [],
            notes: [],
          },
        ],
        travelSegments: [],
        estimatedDailyCost: {
          status: "unknown",
          currency: "USD",
          amount: null,
          minAmount: null,
          maxAmount: null,
          retrievedAt: null,
          evidenceRef: null,
        },
        warnings: [],
      },
    ],
    restaurants: [],
    unresolvedItems: [],
    assumptions: [],
    validationMetadata: {
      validatorVersion: "trailie-itinerary-validator-v1",
      validatedAt: null,
    },
  };

  it("locks plan, validation, and progress values", () => {
    expect(tripPlanStatusSchema.options).toEqual([
      "generating",
      "validating",
      "needs_revision",
      "blocked",
      "published",
      "failed",
      "superseded",
    ]);
    expect(validationStatusSchema.options).toEqual([
      "pending",
      "pass",
      "needs_revision",
      "blocked",
    ]);
    expect(
      planProgressEventSchema.parse({
        id: uuid,
        tripPlanId: uuid,
        type: "route_validation_started",
        createdAt: "2026-07-13T18:00:00.000Z",
      }),
    ).not.toHaveProperty("reasoning");
  });

  it("strictly parses an itinerary and rejects unsafe or ambiguous fields", () => {
    expect(itinerarySchema.parse(itinerary).days).toHaveLength(1);
    expect(
      itinerarySchema.safeParse({ ...itinerary, html: "<script>x</script>" })
        .success,
    ).toBe(false);
    expect(
      itinerarySchema.safeParse({ ...itinerary, timezone: "Central time" })
        .success,
    ).toBe(false);
    expect(
      itinerarySchema.safeParse({
        ...itinerary,
        endDate: "2026-09-11",
      }).success,
    ).toBe(false);
    expect(
      itinerarySchema.safeParse({
        ...itinerary,
        days: [
          {
            ...itinerary.days[0],
            items: [
              {
                ...itinerary.days[0].items[0],
                componentName: "BookingButton",
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("enforces cost provenance, evidence shape, stable IDs, and collection caps", () => {
    const item = itinerary.days[0].items[0];
    expect(
      itinerarySchema.safeParse({
        ...itinerary,
        days: [
          {
            ...itinerary.days[0],
            items: [
              {
                ...item,
                id: crypto.randomUUID(),
                cost: {
                  ...item.cost,
                  status: "verified",
                  amount: 25,
                  retrievedAt: null,
                  evidenceRef: null,
                },
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      itinerarySchema.safeParse({
        ...itinerary,
        assumptions: Array.from({ length: 51 }, () => "assumption"),
      }).success,
    ).toBe(false);
  });

  it("parses safe validation and plan projections without operational data", () => {
    const report = validationReportSchema.parse({
      validatorVersion: "trailie-itinerary-validator-v1",
      status: "pass",
      issues: [],
      warnings: [],
      passedChecks: ["date_range", "route_duration"],
      repairedIssues: ["travel_buffer"],
      evidenceLastCheckedAt: "2026-07-13T18:00:00.000Z",
    });
    const view = tripPlanViewSchema.parse({
      id: uuid,
      roomId: uuid,
      planningRequestId: uuid,
      version: 1,
      status: "published",
      validationStatus: "pass",
      basisSummaryVersion: 1,
      itinerary,
      validationSummary: report,
      progressEvents: [],
      createdAt: "2026-07-13T18:00:00.000Z",
      updatedAt: "2026-07-13T18:00:00.000Z",
      publishedAt: "2026-07-13T18:01:00.000Z",
      errorCode: null,
    });
    expect(view).not.toHaveProperty("providerResponseId");
    expect(view).not.toHaveProperty("inputTokens");
  });
});

describe("Phase 5D revision scope schemas", () => {
  const manifest = {
    schemaVersion: "1",
    changeRequestId: uuid,
    basePlanId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
    baseVersion: 1,
    basePlanHash: "a".repeat(64),
    analysisVersion: 1,
    requestType: "remove_item",
    targetItemIds: ["item:kayaking"],
    affectedDayIds: ["day:2026-09-12"],
    allowedOperations: ["remove", "route_adjustment", "cost_recalculation"],
    allowedFieldsByItem: { "item:kayaking": [] },
    allowedDownstreamEffects: [
      {
        effect: "route_cleanup",
        dayId: "day:2026-09-12",
        itemIds: ["item:kayaking"],
        allowedFields: ["travelSegments"],
      },
    ],
    protectedItemIds: ["item:arrival", "item:dinner"],
    protectedDayIds: ["day:2026-09-13"],
    protectedTopLevelFields: [
      "destinationSummary",
      "startDate",
      "endDate",
      "timezone",
      "travelers",
      "arrivals",
      "departures",
      "lodging",
      "restaurants",
    ],
    editableTopLevelFields: [],
    maximumAffectedTopLevelEntries: 0,
    requiredPreservations: [
      "stable_ids",
      "confirmed_decisions",
      "hard_constraints",
      "rejected_options_absent",
    ],
    forbiddenChanges: [
      "destination",
      "date_range",
      "confirmed_decisions",
      "request_type",
    ],
    evidenceRefreshTargets: ["item:kayaking"],
    maximumAffectedItems: 1,
    maximumAffectedDays: 1,
  } as const;

  it("strictly parses an application-owned allowed-change manifest", () => {
    expect(revisionAllowedChangeManifestV1Schema.parse(manifest)).toEqual(
      manifest,
    );
    expect(
      revisionAllowedChangeManifestV1Schema.safeParse({
        ...manifest,
        maximumAffectedDays: 2,
        applicationOwnedMaximumAffectedDays: 1,
      }).success,
    ).toBe(false);
    expect(
      revisionAllowedChangeManifestV1Schema.safeParse({
        ...manifest,
        allowedOperations: ["rewrite_plan"],
      }).success,
    ).toBe(false);
  });

  it("strictly parses a manifest-bound patch and rejects undeclared shapes", () => {
    const patch = {
      schemaVersion: "1",
      status: "ready",
      blockers: [],
      baseVersion: 1,
      manifestHash: "b".repeat(64),
      operations: [
        {
          operation: "remove",
          targetId: "item:kayaking",
          dayId: "day:2026-09-12",
          fieldChanges: {},
          reason: "The crew approved removing kayaking.",
          downstreamEffects: ["route_cleanup"],
        },
      ],
      preservedItemIds: ["item:arrival", "item:dinner"],
      evidenceRefreshTargets: ["item:kayaking"],
    } as const;
    expect(revisionPatchV1Schema.parse(patch)).toEqual(patch);
    expect(
      revisionPatchV1Schema.safeParse({
        ...patch,
        operations: [{ ...patch.operations[0], operation: "general_revision" }],
      }).success,
    ).toBe(false);
  });
});

describe("Phase 4B public sharing schemas", () => {
  const shared = {
    schemaVersion: "1",
    title: "Yosemite crew escape",
    destinationSummary: "Yosemite Valley",
    timezone: "America/Los_Angeles",
    startDate: "2026-09-12",
    endDate: "2026-09-13",
    version: 1,
    publishedAt: "2026-07-14T00:00:00.000Z",
    validation: { status: "pass", passed: true },
    days: [
      {
        date: "2026-09-12",
        title: "Valley arrival",
        summary: "Arrival and sunset.",
        items: [
          {
            key: "item:sunset",
            type: "activity",
            startTime: "17:30",
            endTime: "19:00",
            title: "Glacier Point sunset",
            description: "Watch sunset.",
            location: {
              name: "Glacier Point",
              timezone: "America/Los_Angeles",
              verificationStatus: "verified",
            },
            reservationStatus: "recommended",
            dataStatus: "verified",
          },
        ],
        travelSegments: [],
        warnings: ["Road timing can change"],
      },
    ],
    lodging: [],
    food: [],
    disclaimer: "No bookings were made by Trailie",
  } as const;

  it("locks modes, derived states, and the strict public projection", () => {
    expect(planShareModeSchema.options).toEqual([
      "private",
      "public_link",
      "expiring_link",
    ]);
    expect(planShareStatusSchema.options).toEqual([
      "active",
      "revoked",
      "expired",
    ]);
    expect(publicSharedItinerarySchema.parse(shared)).toEqual(shared);
    const databaseProjectionWithOmittedNulls = structuredClone(
      shared,
    ) as unknown as {
      days: Array<{
        items: Array<{ startTime?: string; endTime?: string }>;
      }>;
    };
    delete databaseProjectionWithOmittedNulls.days[0]?.items[0]?.startTime;
    delete databaseProjectionWithOmittedNulls.days[0]?.items[0]?.endTime;
    expect(
      publicSharedItinerarySchema.safeParse(databaseProjectionWithOmittedNulls)
        .success,
    ).toBe(true);
  });

  it("rejects private, operational, HTML, URL, and identity-shaped fields", () => {
    for (const extra of [
      { travelers: [{ displayName: "Maya" }] },
      { roomId: uuid },
      { participantId: uuid },
      { model: "gpt-private" },
      { evidenceRefs: ["evidence:secret"] },
      { sourceUrl: "https://private.example" },
    ]) {
      expect(
        publicSharedItinerarySchema.safeParse({ ...shared, ...extra }).success,
      ).toBe(false);
    }
    expect(
      publicSharedItinerarySchema.safeParse({
        ...shared,
        title: "<script>alert(1)</script>",
      }).success,
    ).toBe(false);
  });
});

describe("Phase 1C chat schemas", () => {
  it("locks message and reaction values", () => {
    expect(messageTypeSchema.options).toEqual(["user", "system", "trailie"]);
    expect(reactionTypeSchema.options).toEqual([
      "like",
      "love",
      "laugh",
      "celebrate",
      "thinking",
    ]);
  });

  it("trims valid send input and enforces the 4000 character boundary", () => {
    expect(
      sendMessageInputSchema.parse({
        roomId: uuid,
        participantId: uuid,
        body: "  @Trailie find a campsite  ",
        clientMessageId: uuid,
        replyToMessageId: null,
      }),
    ).toMatchObject({ body: "@Trailie find a campsite" });
    expect(
      sendMessageInputSchema.safeParse({
        roomId: uuid,
        participantId: uuid,
        body: "   ",
        clientMessageId: uuid,
      }).success,
    ).toBe(false);
    expect(
      sendMessageInputSchema.safeParse({
        roomId: uuid,
        participantId: uuid,
        body: "x".repeat(4001),
        clientMessageId: uuid,
      }).success,
    ).toBe(false);
  });

  it("validates safe message pages without private auth fields", () => {
    const message = {
      id: uuid,
      roomId: uuid,
      participantId: uuid,
      messageType: "user",
      body: "Meet at the north trailhead.",
      clientMessageId: uuid,
      replyToMessageId: null,
      sender: { participantId: uuid, displayName: "Maya", role: "host" },
      reply: null,
      reactions: [
        { reaction: "like", count: 2, reactedByCurrentParticipant: true },
      ],
      createdAt: "2026-07-13T18:00:00.000Z",
      editedAt: null,
      deletedAt: null,
    };
    expect(roomMessageSchema.parse(message)).toEqual(message);
    expect(
      getRoomMessagesResultSchema.parse({
        messages: [message],
        hasMore: true,
        nextCursor: { createdAt: message.createdAt, id: uuid },
      }),
    ).toMatchObject({ hasMore: true });
    expect(
      roomMessageSchema.safeParse({ ...message, email: "hidden@x.test" })
        .success,
    ).toBe(false);
  });

  it("requires paired cursors, caps page requests, and validates reactions", () => {
    expect(
      getRoomMessagesInputSchema.safeParse({ roomId: uuid, pageSize: 51 })
        .success,
    ).toBe(false);
    expect(
      getRoomMessagesInputSchema.safeParse({
        roomId: uuid,
        beforeCreatedAt: "2026-07-13T18:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      toggleReactionInputSchema.safeParse({
        messageId: uuid,
        participantId: uuid,
        reaction: "fire",
      }).success,
    ).toBe(false);
  });

  it("accepts privacy-minimal presence and expiring typing events", () => {
    expect(
      presenceStateSchema.parse({
        participantId: uuid,
        displayName: "Maya",
        connectedAt: "2026-07-13T18:00:00.000Z",
        currentArea: "chat",
      }),
    ).not.toHaveProperty("userId");
    expect(
      typingEventSchema.parse({
        participantId: uuid,
        displayName: "Maya",
        isTyping: true,
        expiresAt: "2026-07-13T18:00:03.000Z",
      }),
    ).toMatchObject({ isTyping: true });
  });
});
