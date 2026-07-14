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
