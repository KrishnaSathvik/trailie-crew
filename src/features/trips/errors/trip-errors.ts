export const tripErrorCodes = [
  "authentication_required",
  "invalid_input",
  "invite_invalid",
  "invite_revoked",
  "invite_expired",
  "invite_exhausted",
  "duplicate_membership",
  "duplicate_display_name",
  "trip_unavailable",
  "permission_denied",
  "network_error",
  "invalid_server_response",
  "unknown_error",
] as const;

export type TripErrorCode = (typeof tripErrorCodes)[number];

const errorMessages: Record<TripErrorCode, string> = {
  authentication_required:
    "We could not start your private session. Please try again.",
  invalid_input: "Check the highlighted fields and try again.",
  invite_invalid: "That invitation is not valid. Check the link or room code.",
  invite_revoked: "That invitation has been revoked by the Trip host.",
  invite_expired: "That invitation has expired. Ask the host for a new one.",
  invite_exhausted:
    "That invitation has reached its usage limit. Ask the host for another.",
  duplicate_membership: "You have already joined this Trip.",
  duplicate_display_name: "That display name is already in use for this Trip.",
  trip_unavailable: "This Trip is unavailable or you do not have access to it.",
  permission_denied: "You do not have permission to do that.",
  network_error: "We could not connect. Check your connection and try again.",
  invalid_server_response:
    "The server returned an unexpected response. Please try again.",
  unknown_error: "Something went wrong. Please try again.",
};

const controlledRpcMessages = new Map<string, TripErrorCode>([
  ["Authentication required.", "authentication_required"],
  ["Trip name must be between 1 and 100 characters.", "invalid_input"],
  ["Display name must be between 1 and 50 characters.", "invalid_input"],
  ["Expected travelers must be between 1 and 50.", "invalid_input"],
  ["Invite is invalid.", "invite_invalid"],
  ["Invite is revoked.", "invite_revoked"],
  ["Invite has expired.", "invite_expired"],
  ["Invite has reached its usage limit.", "invite_exhausted"],
  ["You are already a member of this Trip.", "duplicate_membership"],
  [
    "That display name is already active in this Trip.",
    "duplicate_display_name",
  ],
  ["Trip is not active.", "trip_unavailable"],
]);

type DatabaseErrorLike = { code?: string; message?: string };

export function getTripErrorMessage(code: TripErrorCode): string {
  return errorMessages[code];
}

export function mapTripOperationError(error: unknown): TripErrorCode {
  if (error instanceof TypeError) {
    return "network_error";
  }

  if (typeof error === "object" && error !== null) {
    const databaseError = error as DatabaseErrorLike;

    if (databaseError.code === "42501") {
      return "permission_denied";
    }

    if (databaseError.code === "P0001" && databaseError.message) {
      return (
        controlledRpcMessages.get(databaseError.message) ?? "unknown_error"
      );
    }
  }

  return "unknown_error";
}
