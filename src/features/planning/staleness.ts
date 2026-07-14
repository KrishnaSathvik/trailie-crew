import type { ApprovalMode } from "@trailie/schemas";

export type PlanningBasis = {
  memoryVersion: number;
  latestPlanningMessageId: string | null;
  membershipFingerprint: string;
  approvalMode: ApprovalMode;
};

export function evaluateSummaryStaleness(
  basis: PlanningBasis,
  current: PlanningBasis,
) {
  const reasons: string[] = [];
  if (current.memoryVersion > basis.memoryVersion)
    reasons.push("memory_changed");
  if (current.latestPlanningMessageId !== basis.latestPlanningMessageId)
    reasons.push("planning_message_changed");
  if (current.membershipFingerprint !== basis.membershipFingerprint)
    reasons.push("membership_changed");
  if (current.approvalMode !== basis.approvalMode)
    reasons.push("approval_mode_changed");
  return { isStale: reasons.length > 0, reasons };
}
