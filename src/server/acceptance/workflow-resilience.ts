export const workflowInterruptionPoints = [
  "after_claim",
  "after_provider_persistence",
  "before_candidate_ready",
  "concurrent_recovery",
  "revision_patch_persisted_not_applied",
  "revision_patch_applied_not_validated",
  "revision_candidate_persisted_without_scope_report",
  "revision_scope_repair_persisted_not_finalized",
  "revision_final_pass_not_published",
] as const;

export type WorkflowInterruptionPoint =
  (typeof workflowInterruptionPoints)[number];

type InterruptionEvidence = {
  point: WorkflowInterruptionPoint;
  recoveryInvocations: number;
  providerCalls: number;
  applications: number;
  publications: number;
  recovered: boolean;
};

type QuotaEvidence = {
  workflow: string;
  rejectionCode: string;
  providerCalls: number;
  reservations: number;
  reconciliations: number;
};

export function assertDisposableAcceptanceRoom(input: {
  roomId: string;
  acceptedDemoRoomId?: string | null;
}) {
  if (!input.roomId.trim()) throw new Error("disposable_room_required");
  if (
    input.acceptedDemoRoomId &&
    input.roomId.trim() === input.acceptedDemoRoomId.trim()
  )
    throw new Error("accepted_demo_room_forbidden");
}

export function buildWorkflowInterruptionReport(
  evidence: readonly InterruptionEvidence[],
) {
  const observed = new Set(evidence.map(({ point }) => point));
  if (
    evidence.length !== workflowInterruptionPoints.length ||
    workflowInterruptionPoints.some((point) => !observed.has(point))
  )
    throw new Error("interruption_matrix_incomplete");

  const exactlyOnce = evidence.every((item) => {
    const publicationRequired =
      item.point === "before_candidate_ready" ||
      item.point === "revision_final_pass_not_published";
    return (
      item.recovered &&
      item.providerCalls === 1 &&
      item.applications === 1 &&
      item.publications === (publicationRequired ? 1 : 0) &&
      item.recoveryInvocations >= (item.point === "concurrent_recovery" ? 2 : 1)
    );
  });
  if (!exactlyOnce) throw new Error("interruption_exactly_once_failed");

  return {
    schemaVersion: "1" as const,
    evidenceClass: "deterministic_local" as const,
    completedPointCount: evidence.length,
    exactlyOnce,
    points: evidence.map((item) => ({
      point: item.point,
      recoveryInvocations: item.recoveryInvocations,
      providerCalls: item.providerCalls,
      applications: item.applications,
      publications: item.publications,
      recovered: item.recovered,
    })),
  };
}

export function buildQuotaAcceptanceReport(evidence: QuotaEvidence) {
  if (evidence.providerCalls !== 0)
    throw new Error("quota_provider_call_detected");
  return {
    schemaVersion: "1" as const,
    evidenceClass: "deterministic_local" as const,
    workflow: evidence.workflow,
    rejectionCode: evidence.rejectionCode,
    providerCalls: evidence.providerCalls,
    reservations: evidence.reservations,
    reconciliations: evidence.reconciliations,
    noProviderCallProven: true as const,
  };
}
