export const trailieErrorMessages = {
  trailie_not_invoked: "Trailie was not invoked by that message.",
  invocation_already_running: "Trailie is already answering this message.",
  invocation_failed:
    "Trailie could not answer just now. You can retry without resending your message.",
  invocation_cancelled: "Trailie stopped answering.",
  ai_generation_disabled:
    "Trailie is temporarily paused. Crew chat is still available.",
  ai_disabled:
    "Trailie is temporarily paused. Crew chat and existing plans are still available.",
  user_ai_limit_reached:
    "Your daily Trailie allowance has been reached. Crew chat is still available.",
  room_ai_limit_reached:
    "This trip’s daily Trailie allowance has been reached. Crew chat is still available.",
  global_ai_limit_reached:
    "Trailie’s daily capacity has been reached. Crew chat is still available.",
  provider_budget_unavailable:
    "Trailie is temporarily unavailable. Crew chat is still available.",
  openai_authentication_failed:
    "Trailie is temporarily unavailable. Crew chat is still available.",
  openai_rate_limited:
    "Trailie is receiving too many requests. Please try again shortly.",
  openai_timeout: "Trailie took too long to answer. Please try again.",
  openai_unavailable: "Trailie is temporarily unavailable. Please try again.",
  invalid_model_response:
    "Trailie could not complete that answer. Please try again.",
  model_timeout: "Trailie took too long to answer. You can try again.",
  model_rate_limited:
    "Trailie is receiving too many requests. You can try again shortly.",
  model_unavailable:
    "Trailie is temporarily unavailable. You can try again shortly.",
  invalid_model_output:
    "Trailie could not complete that answer. Please try again.",
  workflow_deadline_exceeded:
    "Trailie could not complete that right now. The current Plan is unchanged.",
  retry_exhausted: "Trailie could not answer right now. Try again.",
  recovery_required:
    "Trailie is still checking this request. Chat remains available.",
  context_unavailable: "Trailie could not load the Trip conversation.",
  permission_denied: "You do not have permission to ask Trailie here.",
  membership_required: "Join this Trip to ask Trailie.",
  source_message_invalid: "Trailie cannot answer from that message.",
  retry_not_allowed: "This Trailie request cannot be retried.",
  unknown_error: "Trailie could not answer just now. Please try again.",
} as const;

export type TrailieErrorCode = keyof typeof trailieErrorMessages;
