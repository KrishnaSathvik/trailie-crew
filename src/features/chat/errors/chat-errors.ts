export const chatErrorCodes = [
  "message_empty",
  "message_too_long",
  "invalid_reply_target",
  "message_send_failed",
  "reaction_invalid",
  "reaction_failed",
  "membership_required",
  "participant_mismatch",
  "realtime_unavailable",
  "history_load_failed",
  "rate_limited",
  "unknown_error",
] as const;

export type ChatErrorCode = (typeof chatErrorCodes)[number];
export type ChatOperation = "message" | "reaction" | "history" | "realtime";

const messages: Record<ChatErrorCode, string> = {
  message_empty: "Write a message before sending.",
  message_too_long: "Messages can contain up to 4,000 characters.",
  invalid_reply_target: "That reply target is no longer available.",
  message_send_failed: "Your message was not sent. Try again.",
  reaction_invalid: "That reaction is not available.",
  reaction_failed: "The reaction could not be updated. Try again.",
  membership_required: "You need active Trip membership to do that.",
  participant_mismatch: "Your Trip identity could not be verified.",
  realtime_unavailable: "Live updates are unavailable. Reconnecting…",
  history_load_failed: "Earlier messages could not be loaded. Try again.",
  rate_limited: "Messages are arriving too quickly. Wait a moment and retry.",
  unknown_error: "Something went wrong. Try again.",
};

const controlled = new Map<string, ChatErrorCode>([
  ["Authentication required.", "membership_required"],
  ["Membership required.", "membership_required"],
  ["Participant mismatch.", "participant_mismatch"],
  ["Message cannot be empty.", "message_empty"],
  ["Message is too long.", "message_too_long"],
  ["Invalid reply target.", "invalid_reply_target"],
  ["Reaction is invalid.", "reaction_invalid"],
  ["Rate limit exceeded.", "rate_limited"],
]);

export function getChatErrorMessage(code: ChatErrorCode): string {
  return messages[code];
}

export function mapChatOperationError(
  error: unknown,
  operation: ChatOperation,
): ChatErrorCode {
  if (typeof error === "object" && error !== null) {
    const databaseError = error as { code?: string; message?: string };
    if (databaseError.code === "P0001" && databaseError.message) {
      const mapped = controlled.get(databaseError.message);
      if (mapped) return mapped;
    }
    if (databaseError.code === "42501") return "membership_required";
  }

  if (operation === "message") return "message_send_failed";
  if (operation === "reaction") return "reaction_failed";
  if (operation === "history") return "history_load_failed";
  if (operation === "realtime") return "realtime_unavailable";
  return "unknown_error";
}
