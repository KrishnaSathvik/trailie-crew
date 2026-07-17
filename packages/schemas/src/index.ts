import { z } from "zod";

export const tripIdSchema = z.string().trim().min(1).brand("TripId");

export type TripId = z.infer<typeof tripIdSchema>;

export const approvalModeSchema = z.enum(["all_active", "host_only"]);
export const roomStatusSchema = z.enum(["active", "archived", "deleted"]);
export const participantRoleSchema = z.enum(["host", "member"]);
export const participantStatusSchema = z.enum(["active", "left", "removed"]);
export const messageTypeSchema = z.enum(["user", "system", "trailie"]);
export const reactionTypeSchema = z.enum([
  "like",
  "love",
  "laugh",
  "celebrate",
  "thinking",
]);

export const trailieInvocationTypeSchema = z.enum([
  "explicit_mention",
  "direct_address",
  "reply_to_trailie",
  "application_action",
]);
export const aiInvocationStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export const aiRunStatusSchema = z.enum([
  "started",
  "completed",
  "failed",
  "cancelled",
]);
export const extractionStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "skipped",
]);
export const memorySubjectTypeSchema = z.enum(["participant", "group", "trip"]);
export const memoryFactTypeSchema = z.enum([
  "destination_preference",
  "destination_proposal",
  "destination_constraint",
  "date_preference",
  "date_constraint",
  "budget_preference",
  "budget_constraint",
  "transport_preference",
  "lodging_preference",
  "food_preference",
  "accessibility_need",
  "activity_preference",
  "must_do",
  "avoid",
  "availability",
  "traveler_origin",
  "group_decision",
  "rejected_option",
  "open_question",
  "general_constraint",
]);
export const memoryFactStatusSchema = z.enum([
  "active",
  "superseded",
  "rejected",
  "unresolved",
]);
export const evidenceStrengthSchema = z.enum([
  "explicit",
  "strong",
  "tentative",
]);
export const trailieResponseTypeSchema = z.enum([
  "plain_answer",
  "comparison",
  "clarifying_question",
  "warning",
  "error",
]);

const tripNameSchema = z.string().trim().min(1).max(100);
const displayNameSchema = z.string().trim().min(1).max(50);
const roomCodeSchema = z.string().regex(/^[A-HJ-NP-Z2-9]{8}$/);
const timestampSchema = z.iso.datetime({ offset: true });
const memoryTextSchema = z.string().trim().min(1).max(500);
export const memoryFactValueSchema = z
  .object({
    text: memoryTextSchema.optional(),
    question: memoryTextSchema.optional(),
    startDate: z.string().trim().min(1).max(40).optional(),
    endDate: z.string().trim().min(1).max(40).optional(),
    amount: z.number().finite().nonnegative().optional(),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/)
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "A memory fact value cannot be empty.",
  });

export const extractedMemoryFactSchema = z
  .object({
    factType: memoryFactTypeSchema,
    subjectType: memorySubjectTypeSchema,
    subjectParticipantId: z.uuid().nullable().optional(),
    canonicalKey: z.string().trim().min(1).max(160),
    value: memoryFactValueSchema,
    status: memoryFactStatusSchema,
    confidence: z.number().finite().min(0).max(1),
    evidenceStrength: evidenceStrengthSchema,
    sourceMessageId: z.uuid(),
    supersedesFactId: z.uuid().nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.subjectType === "participant" && !value.subjectParticipantId) {
      context.addIssue({
        code: "custom",
        path: ["subjectParticipantId"],
        message: "Participant facts require a participant subject.",
      });
    }
    if (
      value.subjectType !== "participant" &&
      value.subjectParticipantId != null
    ) {
      context.addIssue({
        code: "custom",
        path: ["subjectParticipantId"],
        message: "Group and trip facts cannot name a participant subject.",
      });
    }
  });

export const memorySupersessionSchema = z
  .object({
    factId: z.uuid(),
    replacementFactIndex: z.number().int().min(0).max(11),
  })
  .strict();

export const memoryPatchSchema = z
  .object({
    facts: z.array(extractedMemoryFactSchema).max(12),
    supersessions: z.array(memorySupersessionSchema).max(12),
  })
  .strict();

export const messageExtractionResultSchema = z.discriminatedUnion("status", [
  z
    .object({ status: z.literal("completed"), patch: memoryPatchSchema })
    .strict(),
  z
    .object({
      status: z.literal("skipped"),
      skipReason: z.enum(["non_durable_chatter", "not_eligible"]),
    })
    .strict(),
]);

const projectedFactSchema = z
  .object({
    id: z.uuid(),
    key: z.string().min(1).max(160),
    value: memoryFactValueSchema,
    sourceMessageIds: z.array(z.uuid()).min(1).max(20),
  })
  .strict();
export const participantMemoryProfileSchema = z
  .object({
    displayName: displayNameSchema,
    preferences: z.array(projectedFactSchema),
    constraints: z.array(projectedFactSchema),
    mustDos: z.array(projectedFactSchema),
    avoids: z.array(projectedFactSchema),
  })
  .strict();
export const sharedRoomContextSchema = z
  .object({
    destinationsUnderConsideration: z.array(projectedFactSchema),
    dateWindows: z.array(projectedFactSchema),
    budgetContext: z.array(projectedFactSchema),
    transportContext: z.array(projectedFactSchema),
    lodgingContext: z.array(projectedFactSchema),
  })
  .strict();
export const confirmedDecisionSchema = projectedFactSchema
  .extend({
    confirmedAt: timestampSchema,
  })
  .strict();
export const rejectedOptionSchema = projectedFactSchema;
export const openQuestionSchema = projectedFactSchema
  .extend({
    question: memoryTextSchema,
  })
  .strict();
export const roomMemorySnapshotSchema = z
  .object({
    roomId: z.uuid(),
    memoryVersion: z.number().int().nonnegative(),
    participantProfiles: z.record(z.uuid(), participantMemoryProfileSchema),
    sharedContext: sharedRoomContextSchema,
    confirmedDecisions: z.array(confirmedDecisionSchema),
    rejectedOptions: z.array(rejectedOptionSchema),
    openQuestions: z.array(openQuestionSchema),
    updatedAt: timestampSchema,
  })
  .strict();

export const trailieInvocationDecisionSchema = z.discriminatedUnion("invoked", [
  z.object({ invoked: z.literal(false) }).strict(),
  z
    .object({
      invoked: z.literal(true),
      invocationType: trailieInvocationTypeSchema,
      normalizedRequest: z.string().trim().min(1).max(4000),
    })
    .strict(),
]);

export const trailieComparisonItemSchema = z
  .object({
    label: z.string().min(1).max(80),
    detail: z.string().min(1).max(500),
  })
  .strict();

export const trailieFocusedAnswerSchema = z
  .object({
    responseType: trailieResponseTypeSchema,
    body: z.string().trim().min(1).max(4000),
    title: z.string().trim().min(1).max(120).optional(),
    comparisonItems: z.array(trailieComparisonItemSchema).max(6).optional(),
    followUpQuestion: z.string().trim().min(1).max(300).optional(),
  })
  .strict();

export const trailieResponseEnvelopeSchema = trailieFocusedAnswerSchema
  .extend({
    schemaVersion: z.literal("1"),
    sourceMessageId: z.uuid().optional(),
    status: z.literal("completed"),
  })
  .strict();

export const trailieStreamEventSchema = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("invocation_started"), invocationId: z.uuid() })
    .strict(),
  z
    .object({
      type: z.literal("text_delta"),
      delta: z.string().min(1).max(1000),
    })
    .strict(),
  z
    .object({
      type: z.literal("response_completed"),
      response: trailieResponseEnvelopeSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("response_failed"),
      code: z.string().min(1).max(80),
      message: z.string().min(1).max(300),
      retryable: z.boolean(),
    })
    .strict(),
]);

export const planningRequestStatusSchema = z.enum([
  "draft",
  "generating_summary",
  "awaiting_review",
  "changes_requested",
  "approved_for_generation",
  "superseded",
  "cancelled",
  "failed",
]);
export const planningReadinessStatusSchema = z.enum([
  "ready_for_review",
  "needs_information",
  "blocked",
]);
export const planningReviewDecisionSchema = z.enum([
  "approved",
  "changes_requested",
]);
const planningTextSchema = z.string().trim().min(1).max(500);
const planningStringListSchema = z.array(planningTextSchema).max(24);

export const planningSummaryItemSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9:_-]{0,79}$/),
    label: z.string().trim().min(1).max(100),
    detail: planningTextSchema,
    sourceMessageIds: z.array(z.uuid()).max(12),
  })
  .strict();
export const planningSummarySectionSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    items: z.array(planningSummaryItemSchema).max(24),
  })
  .strict();
export const travelerPreferenceSummarySchema = planningSummaryItemSchema;
export const constraintSummarySchema = planningSummaryItemSchema;
export const proposedOptionSummarySchema = planningSummaryItemSchema;
export const confirmedDecisionSummarySchema = planningSummaryItemSchema;
export const conflictSummarySchema = planningSummaryItemSchema;
export const openQuestionSummarySchema = planningSummaryItemSchema;
export const missingInformationSummarySchema = planningSummaryItemSchema;

export const planningSummarySchema = z
  .object({
    schemaVersion: z.literal("1"),
    title: z.literal("Before I build the trip"),
    tripSnapshot: z
      .object({
        destinations: planningStringListSchema,
        dateWindows: planningStringListSchema,
        travelerCount: z.number().int().min(1).max(50),
        origins: planningStringListSchema,
        budget: planningStringListSchema,
        approvalMode: approvalModeSchema,
      })
      .strict(),
    confirmedDecisions: z.array(confirmedDecisionSummarySchema).max(24),
    travelerPreferences: z.array(travelerPreferenceSummarySchema).max(50),
    constraints: z.array(constraintSummarySchema).max(50),
    proposals: z.array(proposedOptionSummarySchema).max(24),
    rejectedOptions: z.array(planningSummaryItemSchema).max(24),
    conflicts: z.array(conflictSummarySchema).max(24),
    openQuestions: z.array(openQuestionSummarySchema).max(24),
    missingCriticalInformation: z
      .array(missingInformationSummarySchema)
      .max(16),
    nonAssumptions: z.array(planningSummaryItemSchema).max(16),
    readiness: z
      .object({
        status: planningReadinessStatusSchema,
        blockers: planningStringListSchema,
        warnings: planningStringListSchema,
      })
      .strict(),
    evidence: z
      .object({
        memoryVersion: z.number().int().positive(),
        latestMessageId: z.uuid().nullable(),
        sourceMessageIds: z.array(z.uuid()).max(50),
      })
      .strict(),
  })
  .strict();

const planningParticipantSchema = z
  .object({
    id: z.uuid(),
    displayName: displayNameSchema,
    role: participantRoleSchema,
  })
  .strict();
export const planningApprovalStateSchema = z
  .object({
    approvalMode: approvalModeSchema,
    summaryVersion: z.number().int().positive(),
    requiredParticipants: z.array(planningParticipantSchema).max(50),
    approvedParticipants: z.array(planningParticipantSchema).max(50),
    changeRequestedParticipants: z.array(planningParticipantSchema).max(50),
    pendingParticipants: z.array(planningParticipantSchema).max(50),
    isComplete: z.boolean(),
    isStale: z.boolean(),
    blockers: planningStringListSchema,
  })
  .strict();
export const planningRequestViewSchema = z
  .object({
    id: z.uuid(),
    roomId: z.uuid(),
    status: planningRequestStatusSchema,
    approvalMode: approvalModeSchema,
    currentSummaryVersion: z.number().int().nonnegative(),
    approvedSummaryVersion: z.number().int().positive().nullable(),
    readinessStatus: planningReadinessStatusSchema.nullable(),
    summary: planningSummarySchema.nullable(),
    approvalState: planningApprovalStateSchema.nullable(),
    generationErrorCode: z.string().max(80).nullable(),
    isStale: z.boolean(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const tripPlanStatusSchema = z.enum([
  "generating",
  "validating",
  "needs_revision",
  "blocked",
  "published",
  "failed",
  "superseded",
]);
export const validationStatusSchema = z.enum([
  "pending",
  "pass",
  "needs_revision",
  "blocked",
]);
export const validationSeveritySchema = z.enum([
  "critical",
  "high",
  "medium",
  "low",
  "info",
]);
export const evidenceStatusSchema = z.enum([
  "verified",
  "unavailable",
  "stale",
  "failed",
]);
export const costStatusSchema = z.enum(["verified", "estimated", "unknown"]);
export const reservationStatusSchema = z.enum([
  "required",
  "recommended",
  "not_required",
  "unknown",
]);
export const verificationStatusSchema = z.enum([
  "verified",
  "estimated",
  "unknown",
]);
export const itineraryItemTypeSchema = z.enum([
  "activity",
  "meal",
  "travel",
  "lodging",
  "arrival",
  "departure",
  "free_time",
]);
export const travelModeSchema = z.enum([
  "walk",
  "drive",
  "transit",
  "bike",
  "shuttle",
  "flight",
  "train",
  "unknown",
]);
export const planProgressEventTypeSchema = z.enum([
  "generation_started",
  "structure_created",
  "route_validation_started",
  "constraint_validation_started",
  "repair_started",
  "validation_completed",
  "published",
  "failed",
]);

const itineraryIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,31}:[a-z0-9][a-z0-9:_-]{0,79}$/);
const itineraryTextSchema = z.string().trim().min(1).max(1000);
const itineraryShortTextSchema = z.string().trim().min(1).max(200);
const localTimeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
  .nullable();
const isoDateSchema = z.iso.date();
const ianaTimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
      return value.includes("/") || value === "UTC";
    } catch {
      return false;
    }
  }, "A valid IANA timezone is required.");

export const evidenceReferenceSchema = z
  .object({
    id: itineraryIdSchema,
    provider: z.string().trim().min(1).max(80),
    toolName: z.string().trim().min(1).max(80),
    status: evidenceStatusSchema,
    retrievedAt: timestampSchema,
    expiresAt: timestampSchema.nullable(),
    sourceLabel: z.string().trim().min(1).max(160),
    sourceUrl: z.url().nullable(),
  })
  .strict();

export const costEstimateSchema = z
  .object({
    status: costStatusSchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    amount: z.number().finite().nonnegative().nullable(),
    minAmount: z.number().finite().nonnegative().nullable(),
    maxAmount: z.number().finite().nonnegative().nullable(),
    retrievedAt: timestampSchema.nullable(),
    evidenceRef: itineraryIdSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasAmount =
      value.amount !== null ||
      value.minAmount !== null ||
      value.maxAmount !== null;
    if (value.status === "unknown" && hasAmount) {
      context.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Unknown cost cannot include an amount.",
      });
    }
    if (
      value.status === "verified" &&
      (!hasAmount || !value.retrievedAt || !value.evidenceRef)
    ) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message:
          "Verified cost requires an amount, retrieval time, and evidence.",
      });
    }
    if (
      value.minAmount !== null &&
      value.maxAmount !== null &&
      value.minAmount > value.maxAmount
    ) {
      context.addIssue({
        code: "custom",
        path: ["maxAmount"],
        message: "Cost range is reversed.",
      });
    }
  });

export const itineraryLocationSchema = z
  .object({
    name: itineraryShortTextSchema,
    address: z.string().trim().min(1).max(300).nullable(),
    latitude: z.number().finite().min(-90).max(90).nullable(),
    longitude: z.number().finite().min(-180).max(180).nullable(),
    timezone: ianaTimezoneSchema,
    verificationStatus: verificationStatusSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.latitude === null) !== (value.longitude === null)) {
      context.addIssue({
        code: "custom",
        path: ["latitude"],
        message: "Coordinates must be present together.",
      });
    }
  });

export const reservationRequirementSchema = z
  .object({
    status: reservationStatusSchema,
    details: z.string().trim().min(1).max(500).nullable(),
    evidenceRefs: z.array(itineraryIdSchema).max(10),
  })
  .strict();

export const itineraryTravelerSchema = z
  .object({
    id: itineraryIdSchema,
    displayName: displayNameSchema,
    origin: z.string().trim().min(1).max(200).nullable(),
    accessibilityNotes: z.array(itineraryShortTextSchema).max(12),
    dietaryNotes: z.array(itineraryShortTextSchema).max(12),
  })
  .strict();

const travelerTransferSchema = z
  .object({
    id: itineraryIdSchema,
    travelerIds: z.array(itineraryIdSchema).min(1).max(50),
    date: isoDateSchema,
    localTime: localTimeSchema,
    location: itineraryLocationSchema,
    mode: travelModeSchema,
    reference: z.string().trim().min(1).max(200).nullable(),
    notes: z.array(itineraryShortTextSchema).max(12),
  })
  .strict();
export const travelerArrivalSchema = travelerTransferSchema;
export const travelerDepartureSchema = travelerTransferSchema;

export const itineraryItemSchema = z
  .object({
    id: itineraryIdSchema,
    type: itineraryItemTypeSchema,
    startTime: localTimeSchema,
    endTime: localTimeSchema,
    title: itineraryShortTextSchema,
    description: itineraryTextSchema,
    location: itineraryLocationSchema.nullable(),
    reservation: reservationRequirementSchema,
    cost: costEstimateSchema,
    evidenceRefs: z.array(itineraryIdSchema).max(12),
    notes: z.array(itineraryShortTextSchema).max(12),
  })
  .strict();

export const travelSegmentSchema = z
  .object({
    id: itineraryIdSchema,
    fromItemId: itineraryIdSchema.nullable(),
    toItemId: itineraryIdSchema.nullable(),
    mode: travelModeSchema,
    origin: itineraryLocationSchema,
    destination: itineraryLocationSchema,
    distanceMeters: z.number().int().nonnegative().nullable(),
    durationMinutes: z.number().int().nonnegative().max(2880).nullable(),
    bufferMinutes: z.number().int().nonnegative().max(720),
    verificationStatus: verificationStatusSchema,
    evidenceRefs: z.array(itineraryIdSchema).max(12),
  })
  .strict();

export const lodgingRecommendationSchema = z
  .object({
    id: itineraryIdSchema,
    name: itineraryShortTextSchema,
    area: itineraryShortTextSchema,
    checkInDate: isoDateSchema,
    checkOutDate: isoDateSchema,
    location: itineraryLocationSchema,
    reservation: reservationRequirementSchema,
    cost: costEstimateSchema,
    evidenceRefs: z.array(itineraryIdSchema).max(12),
    notes: z.array(itineraryShortTextSchema).max(12),
  })
  .strict();

export const restaurantRecommendationSchema = z
  .object({
    id: itineraryIdSchema,
    name: itineraryShortTextSchema,
    mealWindow: z.enum(["breakfast", "lunch", "dinner", "snack"]),
    location: itineraryLocationSchema,
    dietaryAlignment: z.array(itineraryShortTextSchema).max(12),
    reservation: reservationRequirementSchema,
    cost: costEstimateSchema,
    evidenceRefs: z.array(itineraryIdSchema).max(12),
    notes: z.array(itineraryShortTextSchema).max(12),
  })
  .strict();

export const itineraryDaySchema = z
  .object({
    id: itineraryIdSchema,
    date: isoDateSchema,
    title: itineraryShortTextSchema,
    summary: itineraryTextSchema,
    items: z.array(itineraryItemSchema).max(40),
    travelSegments: z.array(travelSegmentSchema).max(40),
    estimatedDailyCost: costEstimateSchema,
    warnings: z.array(itineraryShortTextSchema).max(24),
  })
  .strict();

export const itinerarySchema = z
  .object({
    schemaVersion: z.literal("1"),
    title: itineraryShortTextSchema,
    destinationSummary: itineraryTextSchema,
    timezone: ianaTimezoneSchema,
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    travelers: z.array(itineraryTravelerSchema).min(1).max(50),
    arrivals: z.array(travelerArrivalSchema).max(100),
    departures: z.array(travelerDepartureSchema).max(100),
    lodging: z.array(lodgingRecommendationSchema).max(30),
    days: z.array(itineraryDaySchema).min(1).max(60),
    restaurants: z.array(restaurantRecommendationSchema).max(100),
    unresolvedItems: z.array(itineraryTextSchema).max(50),
    assumptions: z.array(itineraryTextSchema).max(50),
    validationMetadata: z
      .object({
        validatorVersion: z.string().trim().min(1).max(100),
        validatedAt: timestampSchema.nullable(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.startDate > value.endDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Itinerary date range is reversed.",
      });
    }
    for (const [index, day] of value.days.entries()) {
      if (day.date < value.startDate || day.date > value.endDate) {
        context.addIssue({
          code: "custom",
          path: ["days", index, "date"],
          message: "Itinerary day is outside the trip date range.",
        });
      }
    }
  });

export const planShareModeSchema = z.enum([
  "private",
  "public_link",
  "expiring_link",
]);
export const planShareStatusSchema = z.enum(["active", "revoked", "expired"]);

const publicItineraryTextSchema = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine(
      (value) => !/[<>\u0000-\u001f\u007f]/.test(value),
      "Unsafe public itinerary text is not allowed.",
    );
const publicLocationSchema = z
  .object({
    name: publicItineraryTextSchema(200),
    timezone: ianaTimezoneSchema,
    verificationStatus: verificationStatusSchema,
  })
  .strict();
const publicReservationStatusSchema = reservationStatusSchema;
const publicSharedItineraryItemSchema = z
  .object({
    key: itineraryIdSchema,
    type: itineraryItemTypeSchema,
    startTime: localTimeSchema.optional(),
    endTime: localTimeSchema.optional(),
    title: publicItineraryTextSchema(200),
    description: publicItineraryTextSchema(1000).optional(),
    location: publicLocationSchema.nullable().optional(),
    reservationStatus: publicReservationStatusSchema,
    dataStatus: verificationStatusSchema,
  })
  .strict();
const publicTravelSegmentSchema = z
  .object({
    mode: travelModeSchema,
    origin: publicLocationSchema,
    destination: publicLocationSchema,
    durationMinutes: z
      .number()
      .int()
      .nonnegative()
      .max(2880)
      .nullable()
      .optional(),
    bufferMinutes: z
      .number()
      .int()
      .nonnegative()
      .max(720)
      .nullable()
      .optional(),
    dataStatus: verificationStatusSchema,
  })
  .strict();
const publicSharedItineraryDaySchema = z
  .object({
    date: isoDateSchema,
    title: publicItineraryTextSchema(200),
    summary: publicItineraryTextSchema(1000).optional(),
    items: z.array(publicSharedItineraryItemSchema).max(40),
    travelSegments: z.array(publicTravelSegmentSchema).max(40),
    warnings: z.array(publicItineraryTextSchema(200)).max(24),
  })
  .strict();
const publicStaySummarySchema = z
  .object({
    name: publicItineraryTextSchema(200),
    area: publicItineraryTextSchema(200),
    checkInDate: isoDateSchema,
    checkOutDate: isoDateSchema,
    location: publicLocationSchema.optional(),
    reservationStatus: publicReservationStatusSchema,
  })
  .strict();
const publicFoodSummarySchema = z
  .object({
    name: publicItineraryTextSchema(200),
    mealWindow: z.enum(["breakfast", "lunch", "dinner", "snack"]),
    location: publicLocationSchema.optional(),
    dietaryNote: z.literal("Dietary-friendly options are included.").optional(),
    reservationStatus: publicReservationStatusSchema,
  })
  .strict();
export const publicSharedItinerarySchema = z
  .object({
    schemaVersion: z.literal("1"),
    title: publicItineraryTextSchema(200),
    destinationSummary: publicItineraryTextSchema(1000),
    timezone: ianaTimezoneSchema,
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    version: z.number().int().positive(),
    publishedAt: timestampSchema,
    validation: z
      .object({ status: z.literal("pass"), passed: z.literal(true) })
      .strict(),
    days: z.array(publicSharedItineraryDaySchema).min(1).max(60),
    lodging: z.array(publicStaySummarySchema).max(30),
    food: z.array(publicFoodSummarySchema).max(100),
    disclaimer: z.literal("No bookings were made by Trailie"),
  })
  .strict();
export const publicShareMetadataSchema = z
  .object({
    mode: planShareModeSchema.exclude(["private"]),
    expiresAt: timestampSchema.nullable(),
    snapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export const validationIssueSchema = z
  .object({
    code: z.string().regex(/^[a-z][a-z0-9_]{1,79}$/),
    severity: validationSeveritySchema,
    message: z.string().trim().min(1).max(500),
    affectedItemIds: z.array(itineraryIdSchema).max(20),
    repairable: z.boolean(),
    evidenceRefs: z.array(itineraryIdSchema).max(20),
  })
  .strict();
export const validationWarningSchema = validationIssueSchema;
export const validationReportSchema = z
  .object({
    validatorVersion: z.string().trim().min(1).max(100),
    status: validationStatusSchema.exclude(["pending"]),
    issues: z.array(validationIssueSchema).max(100),
    warnings: z.array(validationWarningSchema).max(100),
    issueCount: z.number().int().nonnegative().max(100).optional(),
    warningCount: z.number().int().nonnegative().max(100).optional(),
    passedChecks: z.array(z.string().regex(/^[a-z][a-z0-9_]{1,79}$/)).max(50),
    repairedIssues: z.array(z.string().regex(/^[a-z][a-z0-9_]{1,79}$/)).max(50),
    evidenceLastCheckedAt: timestampSchema.nullable(),
  })
  .strict();

export const planProgressEventSchema = z
  .object({
    id: z.uuid(),
    tripPlanId: z.uuid(),
    type: planProgressEventTypeSchema,
    createdAt: timestampSchema,
  })
  .strict();
export const tripPlanViewSchema = z
  .object({
    id: z.uuid(),
    roomId: z.uuid(),
    planningRequestId: z.uuid(),
    version: z.number().int().positive(),
    status: tripPlanStatusSchema,
    validationStatus: validationStatusSchema,
    basisSummaryVersion: z.number().int().positive(),
    itinerary: itinerarySchema.nullable(),
    validationSummary: validationReportSchema.nullable(),
    progressEvents: z.array(planProgressEventSchema).max(50),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    publishedAt: timestampSchema.nullable(),
    errorCode: z.string().trim().min(1).max(80).nullable(),
  })
  .strict();

export const planChangeTypeSchema = z.enum([
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
export const planChangeStatusSchema = z.enum([
  "draft",
  "analyzing",
  "awaiting_review",
  "changes_requested",
  "approved",
  "applying",
  "validating",
  "awaiting_confirmation",
  "blocked",
  "published",
  "failed",
  "cancelled",
  "superseded",
]);
export const changeMaterialitySchema = z.enum([
  "minor",
  "material",
  "critical",
]);
export const changeFeasibilitySchema = z.enum([
  "feasible",
  "needs_information",
  "blocked",
]);
export const planChangeDecisionSchema = z.enum([
  "approved",
  "changes_requested",
]);
export const candidateConfirmationDecisionSchema = z.enum([
  "confirmed",
  "changes_requested",
]);
export const planDiffOperationSchema = z.enum([
  "added",
  "removed",
  "moved",
  "rescheduled",
  "replaced",
  "updated",
  "unchanged_but_impacted",
]);
export const planChangeEventTypeSchema = z.enum([
  "request_created",
  "analysis_started",
  "analysis_ready",
  "changes_requested",
  "approved",
  "candidate_generation_started",
  "candidate_validation_started",
  "repair_started",
  "scope_repair_started",
  "scope_repair_succeeded",
  "candidate_ready",
  "confirmation_changed",
  "published",
  "blocked",
  "failed",
  "cancelled",
]);

const safeRevisionText = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine((value) => !/[<>]/.test(value), "HTML is not allowed.");
const revisionTextList = z.array(safeRevisionText(500)).max(50);

export const changeTargetSchema = z
  .object({
    itemId: itineraryIdSchema.nullable(),
    dayId: itineraryIdSchema.nullable(),
    summary: safeRevisionText(300).nullable(),
  })
  .strict();
export const changeAffectedItemSchema = z
  .object({
    itemId: itineraryIdSchema,
    dayId: itineraryIdSchema,
    summary: safeRevisionText(500),
    direct: z.boolean(),
  })
  .strict();
export const changeConstraintImpactSchema = z
  .object({
    constraintId: itineraryIdSchema.nullable(),
    summary: safeRevisionText(500),
    severity: changeMaterialitySchema,
  })
  .strict();
export const changeRouteImpactSchema = z
  .object({
    segmentId: itineraryIdSchema.nullable(),
    summary: safeRevisionText(500),
    evidenceRefreshRequired: z.boolean(),
  })
  .strict();
export const changeBudgetImpactSchema = z
  .object({
    currency: z.string().regex(/^[A-Z]{3}$/),
    minimumDelta: z.number().finite().nullable(),
    maximumDelta: z.number().finite().nullable(),
    summary: safeRevisionText(500),
  })
  .strict();
export const changeReservationImpactSchema = z
  .object({
    itemId: itineraryIdSchema.nullable(),
    summary: safeRevisionText(500),
    requiresAction: z.boolean(),
  })
  .strict();
export const planChangeImpactSchema = z
  .object({
    schedule: revisionTextList,
    routes: revisionTextList,
    budget: revisionTextList,
    reservations: revisionTextList,
    lodging: revisionTextList,
    food: revisionTextList,
    travelerConstraints: revisionTextList,
    confirmedDecisions: revisionTextList,
  })
  .strict();

export const planChangeAnalysisSchema = z
  .object({
    schemaVersion: z.literal("1"),
    title: safeRevisionText(200),
    requestSummary: safeRevisionText(1000),
    requestedChange: z
      .object({
        type: planChangeTypeSchema,
        targetItemIds: z.array(itineraryIdSchema).max(20),
        normalizedInstruction: safeRevisionText(2000),
      })
      .strict(),
    affectedDays: z.array(isoDateSchema).max(60),
    affectedItems: z.array(changeAffectedItemSchema).max(100),
    impacts: planChangeImpactSchema,
    proposedApproach: revisionTextList,
    preservedItems: revisionTextList,
    risks: revisionTextList,
    missingInformation: revisionTextList,
    materiality: changeMaterialitySchema,
    feasibility: changeFeasibilitySchema,
    blockers: revisionTextList,
    approvalSummary: safeRevisionText(500),
  })
  .strict()
  .superRefine((value, context) => {
    const targeted = ![
      "add_item",
      "general_revision",
      "rebalance_day",
    ].includes(value.requestedChange.type);
    if (targeted && value.requestedChange.targetItemIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["requestedChange", "targetItemIds"],
        message: "This change type requires a target item.",
      });
    }
  });

export const revisionAllowedOperationSchema = z.enum([
  "add",
  "remove",
  "replace",
  "move",
  "reschedule",
  "update",
  "route_adjustment",
  "cost_recalculation",
  "evidence_refresh",
]);

export const revisionEditableFieldSchema = z.enum([
  "type",
  "startTime",
  "endTime",
  "title",
  "description",
  "location",
  "reservation",
  "cost",
  "evidenceRefs",
  "notes",
  "dayId",
  "travelSegments",
  "estimatedDailyCost",
]);

export const revisionDownstreamEffectSchema = z
  .object({
    effect: z.enum([
      "route_cleanup",
      "same_day_timing_adjustment",
      "day_cost_recalculation",
      "evidence_refresh",
    ]),
    dayId: itineraryIdSchema,
    itemIds: z.array(itineraryIdSchema).max(40),
    allowedFields: z.array(revisionEditableFieldSchema).max(20),
  })
  .strict();

export const revisionProtectedTopLevelFieldSchema = z.enum([
  "title",
  "destinationSummary",
  "timezone",
  "startDate",
  "endDate",
  "travelers",
  "arrivals",
  "departures",
  "lodging",
  "restaurants",
  "unresolvedItems",
  "assumptions",
  "validationMetadata",
]);

export const revisionAllowedChangeManifestV1Schema = z
  .object({
    schemaVersion: z.literal("1"),
    changeRequestId: z.uuid(),
    basePlanId: z.uuid(),
    baseVersion: z.number().int().positive(),
    basePlanHash: z.string().regex(/^[a-f0-9]{64}$/),
    analysisVersion: z.number().int().positive(),
    requestType: planChangeTypeSchema,
    targetItemIds: z.array(itineraryIdSchema).max(20),
    affectedDayIds: z.array(itineraryIdSchema).max(60),
    allowedOperations: z.array(revisionAllowedOperationSchema).max(20),
    allowedFieldsByItem: z.record(
      itineraryIdSchema,
      z.array(revisionEditableFieldSchema).max(20),
    ),
    allowedDownstreamEffects: z.array(revisionDownstreamEffectSchema).max(100),
    protectedItemIds: z.array(itineraryIdSchema).max(2400),
    protectedDayIds: z.array(itineraryIdSchema).max(60),
    protectedTopLevelFields: z
      .array(revisionProtectedTopLevelFieldSchema)
      .max(20),
    editableTopLevelFields: z
      .array(revisionProtectedTopLevelFieldSchema)
      .max(10),
    maximumAffectedTopLevelEntries: z.number().int().min(0).max(100),
    requiredPreservations: z
      .array(
        z.enum([
          "stable_ids",
          "item_order",
          "confirmed_decisions",
          "hard_constraints",
          "rejected_options_absent",
        ]),
      )
      .max(20),
    forbiddenChanges: z
      .array(
        z.enum([
          "destination",
          "date_range",
          "request_type",
          "confirmed_decisions",
          "hard_constraints",
          "rejected_options",
          "unapproved_lodging",
          "unapproved_traveler_logistics",
          "whole_plan_rewrite",
        ]),
      )
      .max(20),
    evidenceRefreshTargets: z.array(itineraryIdSchema).max(100),
    maximumAffectedItems: z.number().int().min(1).max(300),
    maximumAffectedDays: z.number().int().min(1).max(60),
  })
  .strict();

const revisionPatchValueSchema = z.union([
  z.string().max(4000),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(z.string().max(1000)).max(100),
]);

export const revisionPatchOperationSchema = z
  .object({
    operation: revisionAllowedOperationSchema,
    targetId: itineraryIdSchema,
    dayId: itineraryIdSchema,
    fieldChanges: z.partialRecord(
      revisionEditableFieldSchema,
      revisionPatchValueSchema,
    ),
    reason: safeRevisionText(500),
    downstreamEffects: z
      .array(revisionDownstreamEffectSchema.shape.effect)
      .max(20),
  })
  .strict();

export const revisionPatchV1Schema = z
  .object({
    schemaVersion: z.literal("1"),
    status: z.enum(["ready", "blocked"]),
    blockers: z.array(safeRevisionText(500)).max(20),
    baseVersion: z.number().int().positive(),
    manifestHash: z.string().regex(/^[a-f0-9]{64}$/),
    operations: z.array(revisionPatchOperationSchema).max(300),
    preservedItemIds: z.array(itineraryIdSchema).max(2400),
    evidenceRefreshTargets: z.array(itineraryIdSchema).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === "ready" && value.operations.length === 0)
      context.addIssue({
        code: "custom",
        path: ["operations"],
        message: "A ready patch requires at least one operation.",
      });
    if (value.status === "blocked" && value.blockers.length === 0)
      context.addIssue({
        code: "custom",
        path: ["blockers"],
        message: "A blocked patch requires a safe blocker.",
      });
  });

export const planChangeApprovalStateSchema = z
  .object({
    requiredParticipants: z.array(planningParticipantSchema).max(50),
    approvedParticipants: z.array(planningParticipantSchema).max(50),
    changeRequestedParticipants: z.array(planningParticipantSchema).max(50),
    pendingParticipants: z.array(planningParticipantSchema).max(50),
    isComplete: z.boolean(),
    isStale: z.boolean(),
    blockers: revisionTextList,
  })
  .strict();

export const planVersionDiffItemSchema = z
  .object({
    itemId: itineraryIdSchema,
    dayId: itineraryIdSchema,
    date: isoDateSchema,
    operation: planDiffOperationSchema,
    beforeSummary: safeRevisionText(1000).nullable(),
    afterSummary: safeRevisionText(1000).nullable(),
    reason: safeRevisionText(500),
    downstreamImpact: revisionTextList,
    validationStatus: z.enum(["pass", "warning", "blocked"]),
  })
  .strict();
export const planVersionDiffSchema = z
  .object({
    schemaVersion: z.literal("1"),
    baseVersion: z.number().int().positive(),
    candidateVersion: z.number().int().positive(),
    summary: safeRevisionText(1000),
    changedDays: z.array(isoDateSchema).max(60),
    items: z.array(planVersionDiffItemSchema).max(300),
    routeChanges: revisionTextList,
    budgetDelta: z
      .object({
        currency: z.string().regex(/^[A-Z]{3}$/),
        amount: z.number().finite(),
      })
      .strict()
      .nullable(),
    warningsAdded: revisionTextList,
    warningsResolved: revisionTextList,
  })
  .strict()
  .refine((value) => value.candidateVersion === value.baseVersion + 1, {
    message: "Candidate version must immediately follow the base version.",
    path: ["candidateVersion"],
  });

export const planVersionSummarySchema = z
  .object({
    tripPlanId: z.uuid(),
    version: z.number().int().positive(),
    publishedAt: timestampSchema,
    source: z.enum(["original_approved_summary", "change_request"]),
    requestedBy: planningParticipantSchema.nullable(),
    changeSummary: safeRevisionText(1000).nullable(),
    validationStatus: validationStatusSchema,
    isCurrent: z.boolean(),
  })
  .strict();
export const planChangeEventSchema = z
  .object({
    id: z.uuid(),
    changeRequestId: z.uuid(),
    type: planChangeEventTypeSchema,
    createdAt: timestampSchema,
  })
  .strict();
export const planChangeRequestSchema = z
  .object({
    id: z.uuid(),
    roomId: z.uuid(),
    baseTripPlanId: z.uuid(),
    basePlanVersion: z.number().int().positive(),
    requestType: planChangeTypeSchema,
    targetItemId: itineraryIdSchema.nullable(),
    requestText: safeRevisionText(2000),
    status: planChangeStatusSchema,
    approvalMode: approvalModeSchema,
    currentAnalysisVersion: z.number().int().nonnegative(),
    approvedAnalysisVersion: z.number().int().positive().nullable(),
    candidateTripPlanId: z.uuid().nullable(),
    scopeRepairCount: z.number().int().min(0).max(1),
    conflictRepairCount: z.number().int().min(0).max(1),
    isStale: z.boolean(),
    materiality: changeMaterialitySchema.nullable(),
    feasibility: changeFeasibilitySchema.nullable(),
    analysis: planChangeAnalysisSchema.nullable(),
    analysisApprovalState: planChangeApprovalStateSchema.nullable(),
    candidateConfirmationState: planChangeApprovalStateSchema.nullable(),
    candidateDiff: planVersionDiffSchema.nullable(),
    candidatePlan: tripPlanViewSchema.nullable(),
    events: z.array(planChangeEventSchema).max(100),
    errorCode: z.string().trim().min(1).max(80).nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    approvedAt: timestampSchema.nullable(),
    publishedAt: timestampSchema.nullable(),
    cancelledAt: timestampSchema.nullable(),
  })
  .strict();

export const modelRouteDecisionSchema = z
  .object({
    model: z.string().min(1).max(100),
    tier: z.enum(["conversation", "flagship"]),
    reason: z.enum(["focused_answer", "complex_multi_constraint"]),
  })
  .strict();

export const createTripInputSchema = z.object({
  tripName: tripNameSchema,
  displayName: displayNameSchema,
  expectedTravelers: z.number().int().min(1).max(50).nullable().optional(),
});

export const createTripResultSchema = z.object({
  roomId: z.uuid(),
  roomName: tripNameSchema,
  participantId: z.uuid(),
  roomCode: roomCodeSchema,
  inviteToken: z.string().min(43).max(128),
  createdAt: timestampSchema,
});

export const joinTripInputSchema = z.object({
  inviteValue: z.string().trim().min(1).max(128),
  displayName: displayNameSchema,
});

export const joinTripResultSchema = z.object({
  roomId: z.uuid(),
  roomName: tripNameSchema,
  participantId: z.uuid(),
  displayName: displayNameSchema,
  role: participantRoleSchema,
  roomCode: roomCodeSchema,
  joinedAt: timestampSchema,
});

export const roomSummarySchema = z.object({
  id: z.uuid(),
  name: tripNameSchema,
  roomCode: roomCodeSchema,
  expectedTravelers: z.number().int().min(1).max(50).nullable(),
  approvalMode: approvalModeSchema,
  status: roomStatusSchema,
  currentPlanVersion: z.number().int().positive().nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const participantSummarySchema = z.object({
  id: z.uuid(),
  roomId: z.uuid(),
  userId: z.uuid(),
  displayName: displayNameSchema,
  role: participantRoleSchema,
  status: participantStatusSchema,
  joinedAt: timestampSchema,
  lastSeenAt: timestampSchema.nullable(),
});

export const sendMessageInputSchema = z.object({
  roomId: z.uuid(),
  participantId: z.uuid(),
  body: z.string().trim().min(1).max(4000),
  clientMessageId: z.uuid(),
  replyToMessageId: z.uuid().nullable().optional().default(null),
});

export const messageSenderSummarySchema = z.object({
  participantId: z.uuid(),
  displayName: displayNameSchema,
  role: participantRoleSchema,
});

export const messageReactionSummarySchema = z.object({
  reaction: reactionTypeSchema,
  count: z.number().int().positive(),
  reactedByCurrentParticipant: z.boolean(),
});

export const messageReplySummarySchema = z.object({
  id: z.uuid(),
  body: z.string().max(4000),
  senderDisplayName: displayNameSchema,
});

export const roomMessageSchema = z
  .object({
    id: z.uuid(),
    roomId: z.uuid(),
    participantId: z.uuid(),
    messageType: messageTypeSchema,
    body: z.string().min(1).max(4000),
    clientMessageId: z.uuid().nullable(),
    replyToMessageId: z.uuid().nullable(),
    sender: messageSenderSummarySchema,
    reply: messageReplySummarySchema.nullable(),
    reactions: z.array(messageReactionSummarySchema),
    createdAt: timestampSchema,
    editedAt: timestampSchema.nullable(),
    deletedAt: timestampSchema.nullable(),
  })
  .strict();

export const messageCursorSchema = z.object({
  createdAt: timestampSchema,
  id: z.uuid(),
});

export const getRoomMessagesInputSchema = z
  .object({
    roomId: z.uuid(),
    beforeCreatedAt: timestampSchema.nullable().optional().default(null),
    beforeId: z.uuid().nullable().optional().default(null),
    pageSize: z.number().int().min(1).max(50).optional().default(30),
  })
  .refine(
    ({ beforeCreatedAt, beforeId }) =>
      (beforeCreatedAt === null && beforeId === null) ||
      (beforeCreatedAt !== null && beforeId !== null),
    { message: "Both cursor fields are required together." },
  );

export const getRoomMessagesResultSchema = z.object({
  messages: z.array(roomMessageSchema),
  hasMore: z.boolean(),
  nextCursor: messageCursorSchema.nullable(),
});

export const toggleReactionInputSchema = z.object({
  messageId: z.uuid(),
  participantId: z.uuid(),
  reaction: reactionTypeSchema,
});

export const toggleReactionResultSchema = z.object({
  messageId: z.uuid(),
  reaction: reactionTypeSchema,
  active: z.boolean(),
  count: z.number().int().nonnegative(),
});

export const presenceStateSchema = z
  .object({
    participantId: z.uuid(),
    displayName: displayNameSchema,
    connectedAt: timestampSchema,
    currentArea: z.literal("chat").optional(),
  })
  .strict();

export const typingEventSchema = z
  .object({
    participantId: z.uuid(),
    displayName: displayNameSchema,
    isTyping: z.boolean(),
    expiresAt: timestampSchema,
  })
  .strict();

export type ApprovalMode = z.infer<typeof approvalModeSchema>;
export type RoomStatus = z.infer<typeof roomStatusSchema>;
export type ParticipantRole = z.infer<typeof participantRoleSchema>;
export type ParticipantStatus = z.infer<typeof participantStatusSchema>;
export type MessageType = z.infer<typeof messageTypeSchema>;
export type ReactionType = z.infer<typeof reactionTypeSchema>;
export type CreateTripInput = z.infer<typeof createTripInputSchema>;
export type CreateTripResult = z.infer<typeof createTripResultSchema>;
export type JoinTripInput = z.infer<typeof joinTripInputSchema>;
export type JoinTripResult = z.infer<typeof joinTripResultSchema>;
export type RoomSummary = z.infer<typeof roomSummarySchema>;
export type ParticipantSummary = z.infer<typeof participantSummarySchema>;
export type SendMessageInput = z.infer<typeof sendMessageInputSchema>;
export type MessageSenderSummary = z.infer<typeof messageSenderSummarySchema>;
export type MessageReactionSummary = z.infer<
  typeof messageReactionSummarySchema
>;
export type MessageReplySummary = z.infer<typeof messageReplySummarySchema>;
export type RoomMessage = z.infer<typeof roomMessageSchema>;
export type MessageCursor = z.infer<typeof messageCursorSchema>;
export type GetRoomMessagesInput = z.infer<typeof getRoomMessagesInputSchema>;
export type GetRoomMessagesResult = z.infer<typeof getRoomMessagesResultSchema>;
export type ToggleReactionInput = z.infer<typeof toggleReactionInputSchema>;
export type ToggleReactionResult = z.infer<typeof toggleReactionResultSchema>;
export type PresenceState = z.infer<typeof presenceStateSchema>;
export type TypingEvent = z.infer<typeof typingEventSchema>;
export type TrailieInvocationType = z.infer<typeof trailieInvocationTypeSchema>;
export type TrailieInvocationDecision = z.infer<
  typeof trailieInvocationDecisionSchema
>;
export type TrailieResponseType = z.infer<typeof trailieResponseTypeSchema>;
export type TrailieFocusedAnswer = z.infer<typeof trailieFocusedAnswerSchema>;
export type TrailieResponseEnvelope = z.infer<
  typeof trailieResponseEnvelopeSchema
>;
export type TrailieStreamEvent = z.infer<typeof trailieStreamEventSchema>;
export type AiInvocationStatus = z.infer<typeof aiInvocationStatusSchema>;
export type AiRunStatus = z.infer<typeof aiRunStatusSchema>;
export type ModelRouteDecision = z.infer<typeof modelRouteDecisionSchema>;
export type ExtractionStatus = z.infer<typeof extractionStatusSchema>;
export type MemorySubjectType = z.infer<typeof memorySubjectTypeSchema>;
export type MemoryFactType = z.infer<typeof memoryFactTypeSchema>;
export type MemoryFactStatus = z.infer<typeof memoryFactStatusSchema>;
export type EvidenceStrength = z.infer<typeof evidenceStrengthSchema>;
export type ExtractedMemoryFact = z.infer<typeof extractedMemoryFactSchema>;
export type MemorySupersession = z.infer<typeof memorySupersessionSchema>;
export type MemoryPatch = z.infer<typeof memoryPatchSchema>;
export type MessageExtractionResult = z.infer<
  typeof messageExtractionResultSchema
>;
export type ParticipantMemoryProfile = z.infer<
  typeof participantMemoryProfileSchema
>;
export type SharedRoomContext = z.infer<typeof sharedRoomContextSchema>;
export type ConfirmedDecision = z.infer<typeof confirmedDecisionSchema>;
export type RejectedOption = z.infer<typeof rejectedOptionSchema>;
export type OpenQuestion = z.infer<typeof openQuestionSchema>;
export type RoomMemorySnapshot = z.infer<typeof roomMemorySnapshotSchema>;
export type PlanningRequestStatus = z.infer<typeof planningRequestStatusSchema>;
export type PlanningReadinessStatus = z.infer<
  typeof planningReadinessStatusSchema
>;
export type PlanningReviewDecision = z.infer<
  typeof planningReviewDecisionSchema
>;
export type PlanningSummarySection = z.infer<
  typeof planningSummarySectionSchema
>;
export type PlanningSummaryItem = z.infer<typeof planningSummaryItemSchema>;
export type TravelerPreferenceSummary = z.infer<
  typeof travelerPreferenceSummarySchema
>;
export type ConstraintSummary = z.infer<typeof constraintSummarySchema>;
export type ProposedOptionSummary = z.infer<typeof proposedOptionSummarySchema>;
export type ConfirmedDecisionSummary = z.infer<
  typeof confirmedDecisionSummarySchema
>;
export type ConflictSummary = z.infer<typeof conflictSummarySchema>;
export type OpenQuestionSummary = z.infer<typeof openQuestionSummarySchema>;
export type MissingInformationSummary = z.infer<
  typeof missingInformationSummarySchema
>;
export type PlanningSummary = z.infer<typeof planningSummarySchema>;
export type PlanningApprovalState = z.infer<typeof planningApprovalStateSchema>;
export type PlanningRequestView = z.infer<typeof planningRequestViewSchema>;
export type TripPlanStatus = z.infer<typeof tripPlanStatusSchema>;
export type ValidationStatus = z.infer<typeof validationStatusSchema>;
export type Itinerary = z.infer<typeof itinerarySchema>;
export type ItineraryTraveler = z.infer<typeof itineraryTravelerSchema>;
export type TravelerArrival = z.infer<typeof travelerArrivalSchema>;
export type TravelerDeparture = z.infer<typeof travelerDepartureSchema>;
export type ItineraryDay = z.infer<typeof itineraryDaySchema>;
export type ItineraryItem = z.infer<typeof itineraryItemSchema>;
export type ItineraryLocation = z.infer<typeof itineraryLocationSchema>;
export type TravelSegment = z.infer<typeof travelSegmentSchema>;
export type LodgingRecommendation = z.infer<typeof lodgingRecommendationSchema>;
export type RestaurantRecommendation = z.infer<
  typeof restaurantRecommendationSchema
>;
export type ReservationRequirement = z.infer<
  typeof reservationRequirementSchema
>;
export type CostEstimate = z.infer<typeof costEstimateSchema>;
export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;
export type ValidationIssue = z.infer<typeof validationIssueSchema>;
export type ValidationWarning = z.infer<typeof validationWarningSchema>;
export type ValidationReport = z.infer<typeof validationReportSchema>;
export type TripPlanView = z.infer<typeof tripPlanViewSchema>;
export type PlanShareMode = z.infer<typeof planShareModeSchema>;
export type PlanShareStatus = z.infer<typeof planShareStatusSchema>;
export type PublicSharedItinerary = z.infer<typeof publicSharedItinerarySchema>;
export type PublicSharedItineraryDay = z.infer<
  typeof publicSharedItineraryDaySchema
>;
export type PublicSharedItineraryItem = z.infer<
  typeof publicSharedItineraryItemSchema
>;
export type PublicLocation = z.infer<typeof publicLocationSchema>;
export type PublicTravelSegment = z.infer<typeof publicTravelSegmentSchema>;
export type PublicStaySummary = z.infer<typeof publicStaySummarySchema>;
export type PublicFoodSummary = z.infer<typeof publicFoodSummarySchema>;
export type PublicShareMetadata = z.infer<typeof publicShareMetadataSchema>;
export type PlanProgressEvent = z.infer<typeof planProgressEventSchema>;
export type PlanChangeType = z.infer<typeof planChangeTypeSchema>;
export type PlanChangeStatus = z.infer<typeof planChangeStatusSchema>;
export type ChangeMateriality = z.infer<typeof changeMaterialitySchema>;
export type ChangeFeasibility = z.infer<typeof changeFeasibilitySchema>;
export type ChangeTarget = z.infer<typeof changeTargetSchema>;
export type PlanChangeImpact = z.infer<typeof planChangeImpactSchema>;
export type ChangeAffectedItem = z.infer<typeof changeAffectedItemSchema>;
export type ChangeConstraintImpact = z.infer<
  typeof changeConstraintImpactSchema
>;
export type ChangeRouteImpact = z.infer<typeof changeRouteImpactSchema>;
export type ChangeBudgetImpact = z.infer<typeof changeBudgetImpactSchema>;
export type ChangeReservationImpact = z.infer<
  typeof changeReservationImpactSchema
>;
export type PlanChangeAnalysis = z.infer<typeof planChangeAnalysisSchema>;
export type RevisionAllowedOperation = z.infer<
  typeof revisionAllowedOperationSchema
>;
export type RevisionEditableField = z.infer<typeof revisionEditableFieldSchema>;
export type RevisionAllowedChangeManifestV1 = z.infer<
  typeof revisionAllowedChangeManifestV1Schema
>;
export type RevisionPatchOperation = z.infer<
  typeof revisionPatchOperationSchema
>;
export type RevisionPatchV1 = z.infer<typeof revisionPatchV1Schema>;
export type PlanChangeApprovalState = z.infer<
  typeof planChangeApprovalStateSchema
>;
export type PlanChangeRequest = z.infer<typeof planChangeRequestSchema>;
export type PlanVersionSummary = z.infer<typeof planVersionSummarySchema>;
export type PlanVersionDiff = z.infer<typeof planVersionDiffSchema>;
export type PlanVersionDiffItem = z.infer<typeof planVersionDiffItemSchema>;
