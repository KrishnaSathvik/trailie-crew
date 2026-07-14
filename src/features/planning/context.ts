import type { ApprovalMode, ParticipantRole } from "@trailie/schemas";

export type PlanningProviderContext = {
  requestId: string;
  roomId: string;
  approvalMode: ApprovalMode;
  memoryVersion: number;
  memorySnapshot: Record<string, unknown>;
  participants: Array<{
    id: string;
    displayName: string;
    role: ParticipantRole;
  }>;
  activeFacts: Array<Record<string, unknown>>;
  recentMessages: Array<Record<string, unknown>>;
  reviewNotes: Array<Record<string, unknown>>;
};

function bounded(value: unknown, max: number) {
  const text = JSON.stringify(value);
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function buildPlanningContext(input: PlanningProviderContext) {
  return [
    `<ROOM_POLICY>${bounded({ approvalMode: input.approvalMode }, 200)}</ROOM_POLICY>`,
    `<ACTIVE_TRAVELERS>${bounded(input.participants.slice(0, 50), 4_000)}</ACTIVE_TRAVELERS>`,
    `<PRIVATE_MEMORY_SNAPSHOT>${bounded(input.memorySnapshot, 6_000)}</PRIVATE_MEMORY_SNAPSHOT>`,
    `<ACTIVE_EVIDENCE>${bounded(input.activeFacts.slice(0, 50), 4_000)}</ACTIVE_EVIDENCE>`,
    `<RECENT_CONVERSATION>${bounded(input.recentMessages.slice(-12), 5_000)}</RECENT_CONVERSATION>`,
    `<REVIEW_NOTES>${bounded(input.reviewNotes.slice(-20), 2_000)}</REVIEW_NOTES>`,
  ]
    .join("\n")
    .slice(0, 16_000);
}
