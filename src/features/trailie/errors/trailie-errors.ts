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
    "Trailie generation is temporarily unavailable. Crew chat is still available.",
  openai_authentication_failed:
    "Trailie is temporarily unavailable because its service is not configured.",
  openai_rate_limited:
    "Trailie is receiving too many requests. Please try again shortly.",
  openai_timeout: "Trailie took too long to answer. Please try again.",
  openai_unavailable: "Trailie is temporarily unavailable. Please try again.",
  invalid_model_response:
    "Trailie could not produce a safe answer. Please try again.",
  model_timeout:
    "Trailie took longer than the safe deadline. You can retry this request.",
  model_rate_limited:
    "Trailie’s provider is temporarily rate limited. You can retry shortly.",
  model_unavailable:
    "Trailie’s provider is temporarily unavailable. You can retry shortly.",
  invalid_model_output:
    "Trailie did not produce a response that passed validation.",
  workflow_deadline_exceeded:
    "Trailie reached the workflow deadline without publishing partial work.",
  retry_exhausted: "Trailie could not answer right now. Try again.",
  recovery_required:
    "Trailie saved this request for recovery. Chat remains available while recovery continues.",
  context_unavailable: "Trailie could not load the conversation context.",
  permission_denied: "You do not have access to invoke Trailie here.",
  membership_required: "Active Trip membership is required.",
  source_message_invalid: "That source message cannot invoke Trailie.",
  retry_not_allowed: "This Trailie request cannot be retried.",
  unknown_error: "Trailie could not answer just now. Please try again.",
} as const;

export type TrailieErrorCode = keyof typeof trailieErrorMessages;
