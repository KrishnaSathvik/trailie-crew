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
  TripPlanStatus,
  ValidationStatus,
  PlanChangeType,
  PlanChangeStatus,
  ChangeMateriality,
  ChangeFeasibility,
  PlanShareMode,
  PlanShareStatus,
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
export type TripPlanRow = {
  id: string;
  room_id: string;
  planning_request_id: string;
  planning_summary_id: string;
  version: number;
  status: TripPlanStatus;
  schema_version: string;
  prompt_version: string;
  model: string;
  itinerary_json: Json | null;
  validation_status: ValidationStatus;
  validation_summary: Json | null;
  basis_summary_version: number;
  basis_summary_hash: string;
  plan_hash: string | null;
  change_request_id: string | null;
  base_trip_plan_id: string | null;
  created_by_participant_id: string;
  created_by_user_id: string;
  generation_attempt_count: number;
  lease_expires_at: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  failed_at: string | null;
};
export type PlanChangeRequestRow = {
  id: string;
  room_id: string;
  base_trip_plan_id: string;
  base_plan_version: number;
  basis_plan_hash: string;
  basis_membership_fingerprint: string;
  requested_by_participant_id: string;
  requested_by_user_id: string;
  request_type: PlanChangeType;
  target_item_id: string | null;
  request_text: string;
  normalized_request_text: string;
  status: PlanChangeStatus;
  approval_mode: ApprovalMode;
  current_analysis_version: number;
  approved_analysis_version: number | null;
  candidate_trip_plan_id: string | null;
  candidate_diff: Json | null;
  idempotency_key: string;
  analysis_attempt_count: number;
  candidate_attempt_count: number;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  published_at: string | null;
  cancelled_at: string | null;
  error_code: string | null;
};
export type PlanChangeAnalysisRow = {
  id: string;
  change_request_id: string;
  room_id: string;
  version: number;
  schema_version: string;
  prompt_version: string;
  model: string;
  analysis_json: Json;
  analysis_hash: string;
  materiality: ChangeMateriality;
  feasibility: ChangeFeasibility;
  basis_plan_hash: string;
  basis_plan_version: number;
  created_at: string;
};
export type PlanChangeApprovalRow = {
  id: string;
  change_request_id: string;
  analysis_version: number;
  participant_id: string;
  user_id: string;
  decision: "approved" | "changes_requested";
  note: string | null;
  created_at: string;
  updated_at: string;
};
export type PlanShareLinkRow = {
  id: string;
  room_id: string;
  trip_plan_id: string;
  plan_version: number;
  mode: PlanShareMode;
  status: PlanShareStatus;
  token_hash: string;
  token_prefix: string | null;
  snapshot_plan_hash: string;
  snapshot_hash: string;
  public_snapshot: Json;
  created_by_participant_id: string;
  created_by_user_id: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
  last_accessed_at: string | null;
  access_count: number;
};
export type TripPlanEventRow = {
  id: string;
  trip_plan_id: string;
  room_id: string;
  event_type: string;
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
      planning_requests: TableDefinition<PlanningRequestRow>;
      planning_summaries: TableDefinition<PlanningSummaryRow>;
      planning_approvals: TableDefinition<PlanningApprovalRow>;
      trip_plans: TableDefinition<TripPlanRow>;
      trip_plan_events: TableDefinition<TripPlanEventRow>;
      plan_change_requests: TableDefinition<PlanChangeRequestRow>;
      plan_change_analyses: TableDefinition<PlanChangeAnalysisRow>;
      plan_change_approvals: TableDefinition<PlanChangeApprovalRow>;
      plan_share_links: TableDefinition<PlanShareLinkRow>;
    };
    Views: {
      room_invite_metadata: {
        Row: Omit<RoomInviteRow, "token_hash">;
        Relationships: [];
      };
    };
    Functions: {
      claim_recovery_execution: {
        Args: { min_interval_seconds?: number };
        Returns: boolean;
      };
      create_trip_protected: {
        Args: {
          trip_name: string;
          display_name: string;
          expected_travelers: number | null;
          target_receipt_id: string;
        };
        Returns: DbCreateTripResult[];
      };
      join_trip_protected: {
        Args: {
          invite_value: string;
          display_name: string;
          target_receipt_id: string;
        };
        Returns: DbJoinTripResult[];
      };
      record_captcha_receipt: {
        Args: {
          target_user_id: string;
          target_purpose: string;
          verification_id: string;
          target_expires_at: string;
        };
        Returns: string;
      };
      delete_room: {
        Args: { target_room_id: string; confirmation: string };
        Returns: boolean;
      };
      transfer_room_host: {
        Args: { target_room_id: string; target_participant_id: string };
        Returns: boolean;
      };
      assess_account_deletion: { Args: Record<never, never>; Returns: Json };
      prepare_account_deletion: {
        Args: { confirmation: string };
        Returns: Json;
      };
      list_anonymous_cleanup_candidates: {
        Args: { retention: string; batch_size: number; dry_run: boolean };
        Returns: { user_id: string; created_at: string }[];
      };
      record_anonymous_cleanup_result: {
        Args: { target_user_id: string; succeeded: boolean };
        Returns: undefined;
      };
      claim_lifecycle_execution: {
        Args: { target_category: string; lease_seconds: number };
        Returns: boolean;
      };
      reserve_ai_quota: {
        Args: {
          target_user_id: string;
          target_room_id: string;
          target_workflow: string;
          target_model: string;
          estimated_tokens: number;
          reservation_id: string;
        };
        Returns: Json;
      };
      get_ai_quota_subject: {
        Args: { target_kind: string; target_id: string };
        Returns: Json;
      };
      reconcile_ai_quota: {
        Args: {
          reservation_id: string;
          actual_tokens: number;
          result_status: string;
        };
        Returns: Json;
      };
      get_ai_usage_report: {
        Args: { target_day: string };
        Returns: Json;
      };
      set_ai_generation_enabled: {
        Args: { enabled: boolean };
        Returns: boolean;
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
      create_itinerary_generation: {
        Args: {
          target_planning_request_id: string;
          participant_id: string;
        };
        Returns: Json;
      };
      retry_itinerary_generation: {
        Args: {
          target_trip_plan_id: string;
          participant_id: string;
        };
        Returns: Json;
      };
      get_trip_plan: {
        Args: { target_room_id: string };
        Returns: Json;
      };
      claim_itinerary_generation: {
        Args: { target_trip_plan_id: string };
        Returns: Json;
      };
      get_itinerary_generation_context: {
        Args: { target_trip_plan_id: string };
        Returns: Json;
      };
      record_plan_progress: {
        Args: { target_trip_plan_id: string; target_event_type: string };
        Returns: undefined;
      };
      record_itinerary_draft: {
        Args: {
          target_trip_plan_id: string;
          validated_draft: Json;
          target_provider_response_id: string | null;
          target_provider_request_id: string | null;
          target_input_tokens: number | null;
          target_output_tokens: number | null;
          target_reasoning_tokens: number | null;
          target_cached_input_tokens: number | null;
          target_total_tokens: number | null;
          target_latency_ms: number;
        };
        Returns: undefined;
      };
      record_tool_evidence: {
        Args: {
          target_trip_plan_id: string;
          target_provider: string;
          target_tool_name: string;
          target_request_fingerprint: string;
          target_retrieved_at: string;
          target_expires_at: string | null;
          target_status: string;
          target_normalized_result: Json;
          target_source_reference: Json | null;
          target_itinerary_item_id: string | null;
        };
        Returns: string;
      };
      record_validation_report: {
        Args: {
          target_trip_plan_id: string;
          target_plan_version: number;
          target_validator_version: string;
          target_status: string;
          target_issues: Json;
          target_warnings: Json;
        };
        Returns: string;
      };
      mark_itinerary_needs_revision: {
        Args: { target_trip_plan_id: string };
        Returns: undefined;
      };
      complete_itinerary_publication: {
        Args: { target_trip_plan_id: string; validated_itinerary: Json };
        Returns: Json;
      };
      fail_itinerary_generation: {
        Args: { target_trip_plan_id: string; target_error_code: string };
        Returns: undefined;
      };
      list_recoverable_itinerary_generations: {
        Args: { batch_size?: number };
        Returns: string[];
      };
      create_plan_change_request: {
        Args: {
          base_trip_plan_id: string;
          participant_id: string;
          request_type: string;
          target_item_id?: string | null;
          request_text: string;
        };
        Returns: Json;
      };
      review_plan_change: {
        Args: {
          target_change_request_id: string;
          target_analysis_version: number;
          target_participant_id: string;
          target_decision: string;
          note?: string | null;
        };
        Returns: Json;
      };
      confirm_plan_change_candidate: {
        Args: {
          target_change_request_id: string;
          target_candidate_trip_plan_id: string;
          target_participant_id: string;
          target_decision: string;
          note?: string | null;
        };
        Returns: Json;
      };
      cancel_plan_change_request: {
        Args: {
          target_change_request_id: string;
          target_participant_id: string;
        };
        Returns: Json;
      };
      get_plan_change_request: {
        Args: { target_room_id: string };
        Returns: Json;
      };
      list_plan_versions: { Args: { target_room_id: string }; Returns: Json };
      get_trip_plan_version: {
        Args: { target_room_id: string; target_version: number };
        Returns: Json;
      };
      compare_plan_versions: {
        Args: {
          target_room_id: string;
          base_version: number;
          candidate_version: number;
        };
        Returns: Json;
      };
      authorize_plan_export: {
        Args: {
          target_room_id: string;
          target_version: number;
          target_export_type: string;
        };
        Returns: boolean;
      };
      create_plan_share_link: {
        Args: {
          target_trip_plan_id: string;
          participant_id: string;
          share_mode: string;
          target_token_hash: string;
          target_token_prefix: string;
          target_expires_at?: string | null;
        };
        Returns: Json;
      };
      revoke_plan_share_link: {
        Args: { share_link_id: string; participant_id: string };
        Returns: Json;
      };
      get_plan_share_status: {
        Args: { target_trip_plan_id: string; target_plan_version: number };
        Returns: Json;
      };
      verify_plan_share_token_hash: {
        Args: { target_token_hash: string };
        Returns: Json;
      };
      claim_change_analysis: {
        Args: {
          target_change_request_id: string;
          target_model: string;
          target_prompt_version: string;
          target_schema_version: string;
        };
        Returns: Json;
      };
      complete_change_analysis: {
        Args: {
          target_change_request_id: string;
          validated_analysis: Json;
          target_materiality: string;
          target_feasibility: string;
          target_analysis_hash: string;
          target_model: string;
          target_prompt_version: string;
          target_schema_version: string;
        };
        Returns: Json;
      };
      claim_candidate_generation: {
        Args: { target_change_request_id: string };
        Returns: Json;
      };
      attach_candidate_trip_plan: {
        Args: {
          target_change_request_id: string;
          validated_itinerary: Json;
          target_model: string;
          target_prompt_version: string;
          target_schema_version: string;
        };
        Returns: Json;
      };
      update_plan_change_candidate: {
        Args: {
          target_candidate_trip_plan_id: string;
          validated_itinerary: Json;
        };
        Returns: undefined;
      };
      start_plan_change_repair: {
        Args: { target_change_request_id: string };
        Returns: Json;
      };
      block_plan_change: {
        Args: { target_change_request_id: string; target_error_code: string };
        Returns: undefined;
      };
      record_plan_change_run_usage: {
        Args: {
          target_change_request_id: string;
          target_run_type: string;
          target_provider_response_id: string | null;
          target_provider_request_id: string | null;
          target_input_tokens: number | null;
          target_output_tokens: number | null;
          target_reasoning_tokens: number | null;
          target_cached_input_tokens: number | null;
          target_total_tokens: number | null;
          target_latency_ms: number;
        };
        Returns: undefined;
      };
      complete_plan_change_candidate: {
        Args: {
          target_change_request_id: string;
          boundary_report: Json;
          candidate_diff: Json;
        };
        Returns: Json;
      };
      complete_plan_change_publication: {
        Args: { target_change_request_id: string };
        Returns: Json;
      };
      get_plan_change_context: {
        Args: { target_change_request_id: string };
        Returns: Json;
      };
      fail_plan_change: {
        Args: { target_change_request_id: string; target_error_code: string };
        Returns: undefined;
      };
      list_recoverable_plan_changes: {
        Args: { batch_size?: number };
        Returns: string[];
      };
      list_recoverable_plan_change_publications: {
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
      trip_plan_status: TripPlanStatus;
      itinerary_validation_status: ValidationStatus;
      plan_change_type: PlanChangeType;
      plan_change_status: PlanChangeStatus;
      change_materiality: ChangeMateriality;
      change_feasibility: ChangeFeasibility;
      plan_share_mode: PlanShareMode;
      plan_share_status: PlanShareStatus;
    };
    CompositeTypes: Record<never, never>;
  };
};
