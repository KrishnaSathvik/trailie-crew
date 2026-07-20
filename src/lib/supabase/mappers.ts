import {
  createTripResultSchema,
  getRoomMessagesResultSchema,
  joinTripResultSchema,
  participantSummarySchema,
  roomMessageSchema,
  roomSummarySchema,
  toggleReactionResultSchema,
  type CreateTripResult,
  type GetRoomMessagesResult,
  type JoinTripResult,
  type ParticipantSummary,
  type RoomSummary,
  type RoomMessage,
  type ToggleReactionResult,
} from "@trailie/schemas";

import type {
  DbCreateTripResult,
  DbGetRoomMessagesResult,
  DbJoinTripResult,
  DbRoomMessage,
  DbToggleReactionResult,
  ParticipantRow,
  RoomRow,
} from "@/types/database";

export function mapRoomMessage(row: DbRoomMessage): RoomMessage {
  return roomMessageSchema.parse({
    id: row.id,
    roomId: row.room_id,
    participantId: row.participant_id,
    messageType: row.message_type,
    body: row.body,
    trailieResponse: row.trailie_response ?? null,
    clientMessageId: row.client_message_id,
    replyToMessageId: row.reply_to_message_id,
    sender: {
      participantId: row.sender.participant_id,
      displayName: row.sender.display_name,
      role: row.sender.role,
    },
    reply: row.reply
      ? {
          id: row.reply.id,
          body: row.reply.body,
          senderDisplayName: row.reply.sender_display_name,
        }
      : null,
    reactions: row.reactions.map((reaction) => ({
      reaction: reaction.reaction,
      count: reaction.count,
      reactedByCurrentParticipant: reaction.reacted_by_current_participant,
    })),
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
  });
}

export function mapGetRoomMessagesResult(
  row: DbGetRoomMessagesResult,
): GetRoomMessagesResult {
  return getRoomMessagesResultSchema.parse({
    messages: row.messages.map(mapRoomMessage),
    hasMore: row.has_more,
    nextCursor: row.next_cursor
      ? { createdAt: row.next_cursor.created_at, id: row.next_cursor.id }
      : null,
  });
}

export function mapToggleReactionResult(
  row: DbToggleReactionResult,
): ToggleReactionResult {
  return toggleReactionResultSchema.parse({
    messageId: row.message_id,
    reaction: row.reaction,
    active: row.active,
    count: row.count,
  });
}

export function mapRoomSummary(
  row: Omit<RoomRow, "host_user_id">,
): RoomSummary {
  return roomSummarySchema.parse({
    id: row.id,
    name: row.name,
    roomCode: row.room_code,
    expectedTravelers: row.expected_travelers,
    approvalMode: row.approval_mode,
    status: row.status,
    currentPlanVersion: row.current_plan_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function mapParticipantSummary(row: ParticipantRow): ParticipantSummary {
  return participantSummarySchema.parse({
    id: row.id,
    roomId: row.room_id,
    userId: row.user_id,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    joinedAt: row.joined_at,
    lastSeenAt: row.last_seen_at,
  });
}

export function mapCreateTripResult(row: DbCreateTripResult): CreateTripResult {
  return createTripResultSchema.parse({
    roomId: row.room_id,
    roomName: row.room_name,
    participantId: row.participant_id,
    roomCode: row.room_code,
    inviteToken: row.invite_token,
    createdAt: row.created_at,
  });
}

export function mapJoinTripResult(row: DbJoinTripResult): JoinTripResult {
  return joinTripResultSchema.parse({
    roomId: row.room_id,
    roomName: row.room_name,
    participantId: row.participant_id,
    displayName: row.member_display_name,
    role: row.participant_role,
    roomCode: row.room_code,
    joinedAt: row.joined_at,
  });
}
