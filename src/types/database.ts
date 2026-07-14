import type {
  ApprovalMode,
  MessageType,
  ParticipantRole,
  ParticipantStatus,
  ReactionType,
  RoomStatus,
  PlanningRequestStatus,
  PlanningReadinessStatus,
  PlanningReviewDecision,
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
export type PlanningRequestRow = {
  id: string;
  room_id: string;
  requested_by_participant_id: string;
  requested_by_user_id: string;
  status: PlanningRequestStatus;
  approval_mode: ApprovalMode;
  current_summary_version: number;
  approved_summary_version: number | null;
  basis_memory_version: number;
  basis_latest_message_id: string | null;
  basis_latest_message_created_at: string | null;
  basis_participant_ids: string[];
  basis_membership_fingerprint: string;
  idempotency_key: string;
  generation_attempt_count: number;
  generation_error_code: string | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  cancelled_at: string | null;
};
export type PlanningSummaryRow = {
  id: string;
  planning_request_id: string;
  room_id: string;
  version: number;
  schema_version: string;
  prompt_version: string;
  model: string;
  summary_json: Json;
  readiness_status: PlanningReadinessStatus;
  summary_hash: string;
  basis_memory_version: number;
  basis_latest_message_id: string | null;
  basis_latest_message_created_at: string | null;
  basis_participant_ids: string[];
  basis_membership_fingerprint: string;
  created_at: string;
};
export type PlanningApprovalRow = {
  id: string;
  planning_request_id: string;
  summary_version: number;
  participant_id: string;
  user_id: string;
  decision: PlanningReviewDecision;
  note: string | null;
  created_at: string;
  updated_at: string;
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
      planning_requests: TableDefinition<PlanningRequestRow>;
      planning_summaries: TableDefinition<PlanningSummaryRow>;
      planning_approvals: TableDefinition<PlanningApprovalRow>;
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
      create_ai_invocation: {
        Args: {
          target_room_id: string;
          target_source_message_id: string;
          target_participant_id: string;
          target_invocation_type: string;
          target_normalized_request: string;
          target_prompt_version: string;
        };
        Returns: Json;
      };
      start_ai_run: {
        Args: {
          target_invocation_id: string;
          target_model: string;
          target_prompt_version: string;
        };
        Returns: Json;
      };
      complete_ai_run: {
        Args: {
          target_invocation_id: string;
          target_run_id: string;
          response_body: string;
          provider_response_id: string | null;
          provider_request_id: string | null;
          used_input_tokens: number | null;
          used_output_tokens: number | null;
          used_reasoning_tokens: number | null;
          used_cached_input_tokens: number | null;
          used_total_tokens: number | null;
          measured_latency_ms: number;
        };
        Returns: Json;
      };
      fail_ai_run: {
        Args: {
          target_invocation_id: string;
          target_run_id: string;
          safe_error_code: string;
        };
        Returns: Json;
      };
      claim_message_extraction: {
        Args: {
          target_message_id: string;
          target_model: string;
          target_prompt_version: string;
          target_schema_version: string;
        };
        Returns: Json;
      };
      get_message_extraction_context: {
        Args: { target_message_id: string };
        Returns: Json;
      };
      skip_message_extraction: {
        Args: { target_message_id: string; skip_reason: string };
        Returns: Json;
      };
      complete_message_extraction: {
        Args: {
          target_message_id: string;
          proposed_patch: Json;
          target_provider_response_id: string | null;
          target_provider_request_id: string | null;
          used_input_tokens: number | null;
          used_output_tokens: number | null;
          used_reasoning_tokens: number | null;
          used_cached_input_tokens: number | null;
          used_total_tokens: number | null;
          measured_latency_ms: number;
        };
        Returns: Json;
      };
      fail_message_extraction: {
        Args: { target_message_id: string; safe_error_code: string };
        Returns: Json;
      };
      get_private_room_memory: {
        Args: { target_room_id: string };
        Returns: Json;
      };
      create_planning_request: {
        Args: { target_room_id: string; participant_id: string };
        Returns: Json;
      };
      get_planning_request: { Args: { target_room_id: string }; Returns: Json };
      review_planning_summary: {
        Args: {
          target_request_id: string;
          target_summary_version: number;
          target_participant_id: string;
          target_decision: string;
          note?: string | null;
        };
        Returns: Json;
      };
      regenerate_planning_summary: {
        Args: {
          target_request_id: string;
          target_summary_version: number;
          participant_id: string;
        };
        Returns: Json;
      };
      claim_planning_summary_generation: {
        Args: {
          target_request_id: string;
          target_model: string;
          target_prompt_version: string;
          target_schema_version: string;
        };
        Returns: Json;
      };
      get_planning_summary_context: {
        Args: { target_request_id: string };
        Returns: Json;
      };
      complete_planning_summary: {
        Args: {
          target_request_id: string;
          validated_summary: Json;
          readiness: string;
          target_summary_hash: string;
          target_provider_response_id: string | null;
          target_provider_request_id: string | null;
          target_model: string;
          target_prompt_version: string;
          target_schema_version: string;
          target_input_tokens: number | null;
          target_output_tokens: number | null;
          target_reasoning_tokens: number | null;
          target_cached_input_tokens: number | null;
          target_total_tokens: number | null;
          target_latency_ms: number;
        };
        Returns: Json;
      };
      fail_planning_summary: {
        Args: { target_request_id: string; target_error_code: string };
        Returns: undefined;
      };
      list_recoverable_planning_requests: {
        Args: { batch_size?: number };
        Returns: string[];
      };
      list_recoverable_message_extractions: {
        Args: { batch_size?: number };
        Returns: string[];
      };
    };
    Enums: {
      approval_mode: ApprovalMode;
      room_status: RoomStatus;
      participant_role: ParticipantRole;
      participant_status: ParticipantStatus;
      message_type: MessageType;
      planning_request_status: PlanningRequestStatus;
      planning_readiness_status: PlanningReadinessStatus;
      planning_review_decision: PlanningReviewDecision;
    };
    CompositeTypes: Record<never, never>;
  };
};
