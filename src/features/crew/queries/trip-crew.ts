import type {
  GetRoomMessagesResult,
  ParticipantSummary,
  RoomSummary,
} from "@trailie/schemas";

export type SafeInviteMetadata = { shortCode: string };

export type TripShellData = {
  room: RoomSummary;
  currentParticipant: ParticipantSummary;
  participants: ParticipantSummary[];
  inviteMetadata: SafeInviteMetadata | null;
  initialMessages: GetRoomMessagesResult;
  initialHistoryError: boolean;
};
