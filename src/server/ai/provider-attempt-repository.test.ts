import { describe, expect, it, vi } from "vitest";

import {
  createProviderAttemptRepository,
  createSupabaseRpc,
} from "./provider-attempt-repository";

const attemptId = "5c000000-0000-4000-8000-000000000001";
const leaseOwner = "5c000000-0000-4000-8000-000000000002";

describe("provider attempt repository", () => {
  it("preserves the Supabase client receiver when invoking RPCs", async () => {
    const client = {
      rest: { marker: "bound" },
      async rpc(this: { rest?: { marker: string } }) {
        expect(this.rest?.marker).toBe("bound");
        return { data: { status: "ok" }, error: null };
      },
    };

    await expect(createSupabaseRpc(client)("test_rpc", {})).resolves.toEqual({
      status: "ok",
    });
  });

  it("maps a bounded durable claim without content fields", async () => {
    const rpc = vi.fn().mockResolvedValue({
      attemptId,
      claimed: true,
      resultAvailable: false,
      applied: false,
      recovered: false,
    });
    await expect(
      createProviderAttemptRepository({
        rpc,
        createLeaseOwner: () => leaseOwner,
      }).claim({
        workflow: "planning_summary",
        operationKey: "planning:request-1:summary-1",
        attempt: 1,
        model: "gpt-5.6-sol",
        leaseOwner,
        leaseMs: 360_000,
        quotaReservationId: null,
      }),
    ).resolves.toMatchObject({ attemptId, claimed: true });
    expect(rpc).toHaveBeenCalledWith("claim_ai_provider_attempt", {
      target_workflow: "planning_summary",
      target_operation_key: "planning:request-1:summary-1",
      target_attempt: 1,
      target_model: "gpt-5.6-sol",
      target_lease_owner: leaseOwner,
      target_lease_ms: 360_000,
      target_quota_reservation_id: null,
    });
  });

  it("stages only validated output and safe provider metadata", async () => {
    const rpc = vi.fn().mockResolvedValue({ status: "provider_completed" });
    await createProviderAttemptRepository({
      rpc,
      createLeaseOwner: () => leaseOwner,
    }).stage(attemptId, leaseOwner, {
      value: { schemaVersion: "1", title: "Validated" },
      responseId: "response-1",
      requestId: "request-1",
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        reasoningTokens: 0,
        cachedInputTokens: 0,
        totalTokens: 150,
      },
      providerDurationMs: 1_200,
      totalDurationMs: 1_300,
      retryCount: 0,
      repairCount: 0,
    });
    expect(rpc).toHaveBeenCalledWith(
      "complete_ai_provider_attempt",
      expect.objectContaining({
        target_attempt_id: attemptId,
        target_validated_result: { schemaVersion: "1", title: "Validated" },
        target_total_tokens: 150,
      }),
    );
    const serialized = JSON.stringify(vi.mocked(rpc).mock.calls[0]);
    expect(serialized).not.toContain("prompt");
    expect(serialized).not.toContain("cookie");
    expect(serialized).not.toContain("authorization");
  });

  it("loads staged metadata and maps apply/failure RPCs", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        validatedResult: { schemaVersion: "1", title: "Recovered" },
        providerResponseId: "response-1",
        providerRequestId: "request-1",
        inputTokens: 100,
        outputTokens: 50,
        reasoningTokens: 0,
        cachedInputTokens: 0,
        totalTokens: 150,
        providerDurationMs: 1_200,
        totalDurationMs: 1_300,
        retryCount: 0,
        repairCount: 0,
      })
      .mockResolvedValue({ status: "ok" });
    const repository = createProviderAttemptRepository({
      rpc,
      createLeaseOwner: () => leaseOwner,
    });
    await expect(repository.load(attemptId, leaseOwner)).resolves.toMatchObject(
      {
        value: { title: "Recovered" },
        usage: { totalTokens: 150 },
      },
    );
    await repository.markApplied(attemptId, leaseOwner);
    await repository.fail(attemptId, leaseOwner, "model_unavailable", true);
    expect(rpc).toHaveBeenNthCalledWith(2, "mark_ai_provider_attempt_applied", {
      target_attempt_id: attemptId,
      target_lease_owner: leaseOwner,
    });
    expect(rpc).toHaveBeenNthCalledWith(3, "fail_ai_provider_attempt", {
      target_attempt_id: attemptId,
      target_lease_owner: leaseOwner,
      target_error_code: "model_unavailable",
      target_retryable: true,
    });
  });
});
