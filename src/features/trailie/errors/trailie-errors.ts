export const trailieErrorMessages = {
  trailie_not_invoked: "Trailie was not invoked by that message.",
  invocation_already_running: "Trailie is already answering this message.",
  invocation_failed:
    "Trailie could not answer just now. You can retry without resending your message.",
  invocation_cancelled: "Trailie stopped answering.",
  ai_generation_disabled:
    "Trailie is temporarily paused. Crew chat is still available.",
  openai_authentication_failed:
    "Trailie is temporarily unavailable because its service is not configured.",
  openai_rate_limited:
    "Trailie is receiving too many requests. Please try again shortly.",
  openai_timeout: "Trailie took too long to answer. Please try again.",
  openai_unavailable: "Trailie is temporarily unavailable. Please try again.",
  invalid_model_response:
    "Trailie could not produce a safe answer. Please try again.",
  context_unavailable: "Trailie could not load the conversation context.",
  permission_denied: "You do not have access to invoke Trailie here.",
  membership_required: "Active Trip membership is required.",
  source_message_invalid: "That source message cannot invoke Trailie.",
  retry_not_allowed: "This Trailie request cannot be retried.",
  unknown_error: "Trailie could not answer just now. Please try again.",
} as const;

export type TrailieErrorCode = keyof typeof trailieErrorMessages;
