import type {
  ApprovalMode,
  ParticipantRole,
  ParticipantStatus,
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
    };
    Enums: {
      approval_mode: ApprovalMode;
      room_status: RoomStatus;
      participant_role: ParticipantRole;
      participant_status: ParticipantStatus;
    };
    CompositeTypes: Record<never, never>;
  };
};
