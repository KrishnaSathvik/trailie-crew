import { describe, expect, it } from "vitest";

import {
  assertDisposableAcceptanceRoom,
  buildQuotaAcceptanceReport,
  buildWorkflowInterruptionReport,
  workflowInterruptionPoints,
} from "./workflow-resilience";

describe("workflow resilience acceptance evidence", () => {
  it("requires the complete bounded interruption matrix", () => {
    expect(workflowInterruptionPoints).toEqual([
      "after_claim",
      "after_provider_persistence",
      "before_candidate_ready",
      "concurrent_recovery",
      "revision_patch_persisted_not_applied",
      "revision_patch_applied_not_validated",
      "revision_candidate_persisted_without_scope_report",
      "revision_scope_repair_persisted_not_finalized",
      "revision_final_pass_not_published",
    ]);
    const report = buildWorkflowInterruptionReport(
      workflowInterruptionPoints.map((point) => ({
        point,
        recoveryInvocations: point === "concurrent_recovery" ? 2 : 1,
        providerCalls: 1,
        applications: 1,
        publications:
          point === "before_candidate_ready" ||
          point === "revision_final_pass_not_published"
            ? 1
            : 0,
        recovered: true,
        prompt: "must not be copied",
      })),
    );
    expect(report).toMatchObject({
      schemaVersion: "1",
      evidenceClass: "deterministic_local",
      completedPointCount: 9,
      exactlyOnce: true,
    });
    expect(JSON.stringify(report)).not.toMatch(
      /prompt|message|cookie|authorization|shareToken|providerPayload/i,
    );
  });

  it("rejects incomplete or duplicate recovery outcomes", () => {
    expect(() =>
      buildWorkflowInterruptionReport([
        {
          point: "concurrent_recovery",
          recoveryInvocations: 2,
          providerCalls: 2,
          applications: 1,
          publications: 1,
          recovered: true,
        },
      ]),
    ).toThrow("interruption_matrix_incomplete");
    expect(() =>
      buildWorkflowInterruptionReport(
        workflowInterruptionPoints.map((point) => ({
          point,
          recoveryInvocations: point === "concurrent_recovery" ? 2 : 1,
          providerCalls: point === "concurrent_recovery" ? 2 : 1,
          applications: 1,
          publications: 0,
          recovered: true,
        })),
      ),
    ).toThrow("interruption_exactly_once_failed");
    expect(() =>
      buildWorkflowInterruptionReport(
        workflowInterruptionPoints.map((point) => ({
          point,
          recoveryInvocations: point === "concurrent_recovery" ? 2 : 1,
          providerCalls: 1,
          applications: 1,
          publications: point === "before_candidate_ready" ? 1 : 0,
          recovered: true,
        })),
      ),
    ).toThrow("interruption_exactly_once_failed");
  });

  it("refuses the accepted demo room", () => {
    expect(() =>
      assertDisposableAcceptanceRoom({
        roomId: "accepted-demo-room",
        acceptedDemoRoomId: "accepted-demo-room",
      }),
    ).toThrow("accepted_demo_room_forbidden");
    expect(() =>
      assertDisposableAcceptanceRoom({
        roomId: "phase-5c-disposable-room",
        acceptedDemoRoomId: "accepted-demo-room",
      }),
    ).not.toThrow();
  });

  it("accepts quota rejection only with proof of zero provider calls", () => {
    const unsafeEvidence = {
      workflow: "itinerary_generation",
      rejectionCode: "room_ai_limit_reached",
      providerCalls: 0,
      reservations: 0,
      reconciliations: 0,
      prompt: "must not be copied",
    };
    expect(buildQuotaAcceptanceReport(unsafeEvidence)).toEqual({
      schemaVersion: "1",
      evidenceClass: "deterministic_local",
      workflow: "itinerary_generation",
      rejectionCode: "room_ai_limit_reached",
      providerCalls: 0,
      reservations: 0,
      reconciliations: 0,
      noProviderCallProven: true,
    });
    expect(() =>
      buildQuotaAcceptanceReport({
        workflow: "itinerary_generation",
        rejectionCode: "room_ai_limit_reached",
        providerCalls: 1,
        reservations: 0,
        reconciliations: 0,
      }),
    ).toThrow("quota_provider_call_detected");
  });
});
