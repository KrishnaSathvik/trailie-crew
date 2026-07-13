import {
  createTripResultSchema,
  joinTripResultSchema,
  participantSummarySchema,
  roomSummarySchema,
  type CreateTripResult,
  type JoinTripResult,
  type ParticipantSummary,
  type RoomSummary,
} from "@trailie/schemas";

import type {
  DbCreateTripResult,
  DbJoinTripResult,
  ParticipantRow,
  RoomRow,
} from "@/types/database";

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
