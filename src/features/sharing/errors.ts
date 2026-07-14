export type ShareActionError =
  | "share_not_allowed"
  | "plan_not_published"
  | "plan_version_mismatch"
  | "share_link_not_found"
  | "share_link_unavailable"
  | "share_link_expired"
  | "share_link_revoked"
  | "share_rotation_failed"
  | "invalid_expiration"
  | "rate_limited"
  | "host_required"
  | "permission_denied"
  | "unknown_error";

export function mapShareError(
  error: { message?: string } | null,
): ShareActionError {
  const message = error?.message ?? "";
  if (/host required/i.test(message)) return "host_required";
  if (/plan not published/i.test(message)) return "plan_not_published";
  if (/version mismatch/i.test(message)) return "plan_version_mismatch";
  if (/share link not found/i.test(message)) return "share_link_not_found";
  if (/rotation failed/i.test(message)) return "share_rotation_failed";
  if (/invalid expiration/i.test(message)) return "invalid_expiration";
  if (/rate limited/i.test(message)) return "rate_limited";
  if (/authentication|membership/i.test(message)) return "permission_denied";
  if (/share not allowed/i.test(message)) return "share_not_allowed";
  return "unknown_error";
}
