import type {
  ApprovalMode,
  MessageType,
  ParticipantRole,
  ParticipantStatus,
  ReactionType,
  RoomStatus,
} from "@trailie/schemas";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type RoomRow = {
  id: string;
  name: string;
  room_code: string;
  host_user_id: string;
  expected_travelers: number | null;
  approval_mode: ApprovalMode;
  status: RoomStatus;
  current_plan_version: number | null;
  created_at: string;
  updated_at: string;
};

export type ParticipantRow = {
  id: string;
  room_id: string;
  user_id: string;
  display_name: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  joined_at: string;
  last_seen_at: string | null;
};

export type RoomInviteRow = {
  id: string;
  room_id: string;
  token_hash: string;
  short_code: string;
  created_by: string;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  revoked_at: string | null;
  created_at: string;
};

export type MessageRow = {
  id: string;
  room_id: string;
  participant_id: string;
  sender_user_id: string;
  message_type: MessageType;
  body: string;
  client_message_id: string | null;
  reply_to_message_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

export type MessageReactionRow = {
  message_id: string;
  participant_id: string;
  reaction: ReactionType;
  created_at: string;
};

export type DbRoomMessage = {
  id: string;
  room_id: string;
  participant_id: string;
  message_type: MessageType;
  body: string;
  client_message_id: string | null;
  reply_to_message_id: string | null;
  sender: {
    participant_id: string;
    display_name: string;
    role: ParticipantRole;
  };
  reply: {
    id: string;
    body: string;
    sender_display_name: string;
  } | null;
  reactions: Array<{
    reaction: ReactionType;
    count: number;
    reacted_by_current_participant: boolean;
  }>;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

export type DbGetRoomMessagesResult = {
  messages: DbRoomMessage[];
  has_more: boolean;
  next_cursor: { created_at: string; id: string } | null;
};

export type DbToggleReactionResult = {
  message_id: string;
  reaction: ReactionType;
  active: boolean;
  count: number;
};

export type DbCreateTripResult = {
  room_id: string;
  room_name: string;
  participant_id: string;
  room_code: string;
  invite_token: string;
  created_at: string;
};

export type DbJoinTripResult = {
  room_id: string;
  room_name: string;
  participant_id: string;
  member_display_name: string;
  participant_role: ParticipantRole;
  room_code: string;
  joined_at: string;
};

type TableDefinition<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      rooms: TableDefinition<RoomRow>;
      participants: TableDefinition<ParticipantRow>;
      room_invites: TableDefinition<RoomInviteRow>;
      messages: TableDefinition<MessageRow>;
      message_reactions: TableDefinition<MessageReactionRow>;
    };
    Views: {
      room_invite_metadata: {
        Row: Omit<RoomInviteRow, "token_hash">;
        Relationships: [];
      };
    };
    Functions: {
      create_trip: {
        Args: {
          trip_name: string;
          display_name: string;
          expected_travelers?: number | null;
        };
        Returns: DbCreateTripResult[];
      };
      join_trip: {
        Args: { invite_value: string; display_name: string };
        Returns: DbJoinTripResult[];
      };
      send_message: {
        Args: {
          target_room_id: string;
          participant_id: string;
          body: string;
          client_message_id: string;
          reply_to_message_id?: string | null;
        };
        Returns: DbRoomMessage;
      };
      toggle_message_reaction: {
        Args: {
          target_message_id: string;
          participant_id: string;
          reaction: string;
        };
        Returns: DbToggleReactionResult;
      };
      get_room_messages: {
        Args: {
          target_room_id: string;
          before_created_at?: string | null;
          before_id?: string | null;
          page_size?: number;
        };
        Returns: DbGetRoomMessagesResult;
      };
    };
    Enums: {
      approval_mode: ApprovalMode;
      room_status: RoomStatus;
      participant_role: ParticipantRole;
      participant_status: ParticipantStatus;
      message_type: MessageType;
    };
    CompositeTypes: Record<never, never>;
  };
};
