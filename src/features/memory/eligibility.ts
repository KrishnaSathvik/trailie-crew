import type {
  ExtractionStatus,
  MessageType,
  RoomStatus,
} from "@trailie/schemas";

type EligibilityReason =
  | "non_durable_chatter"
  | "message_type"
  | "deleted"
  | "inactive_room"
  | "already_processed";

const NON_DURABLE =
  /^(?:h+i+|hey+|hello+|lol+|lmao|ok(?:ay)?|k|sounds good|got it|thanks?(?: you)?|cool|nice|yep|yes|nope|no|👍|😂|❤️)[.!?\s]*$/i;

export function classifyMemoryEligibility(input: {
  body: string;
  messageType?: MessageType;
  deletedAt?: string | null;
  roomStatus?: RoomStatus;
  extractionStatus?: ExtractionStatus | null;
}): { eligible: true } | { eligible: false; reason: EligibilityReason } {
  if ((input.messageType ?? "user") !== "user")
    return { eligible: false, reason: "message_type" };
  if (input.deletedAt) return { eligible: false, reason: "deleted" };
  if ((input.roomStatus ?? "active") !== "active")
    return { eligible: false, reason: "inactive_room" };
  if (["completed", "skipped"].includes(input.extractionStatus ?? ""))
    return { eligible: false, reason: "already_processed" };
  const body = input.body.trim();
  if (body.length < 2 || NON_DURABLE.test(body))
    return { eligible: false, reason: "non_durable_chatter" };
  return { eligible: true };
}
