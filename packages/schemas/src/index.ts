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
