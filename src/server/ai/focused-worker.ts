import "server-only";

import { z } from "zod";
import {
  trailieResponseEnvelopeSchema,
  type TrailieResponseEnvelope,
} from "@trailie/schemas";

import { parseOpenAIEnv, requireAiGeneration } from "@/server/env";
import { assembleFocusedContext } from "@/server/ai/context";
import { consumeFocusedStream } from "@/server/ai/focused-stream";
import { createModelRouter } from "@/server/ai/model-router";
import { createOpenAIFocusedAnswerProvider } from "@/server/ai/openai-provider";
import {
  createFakeFocusedAnswerProvider,
  type FocusedAnswerProvider,
} from "@/server/ai/provider";
import {
  createDurableProviderAttemptController,
  runDurableProviderOperation,
  type DurableProviderAttemptController,
  type ProviderAttemptExecutionResult,
} from "@/server/ai/provider-attempts";
import { createProviderAttemptRepository } from "@/server/ai/provider-attempt-repository";
import {
  createDurableAiQuotaReservation,
  type AiQuotaSubject,
} from "@/server/ai/quota";
import { createSafetyIdentifier } from "@/server/ai/safety-identifier";
import type { WorkflowReliabilityPolicy } from "@/server/ai/reliability-policy";
import { ProviderFailure } from "@/server/ai/reliability-policy";
import { createCorrelationId } from "@/server/operations/logger";
import { createAdminSupabaseClient } from "@/server/supabase/admin";
import { withHostedFocusedFault } from "@/server/ai/hosted-acceptance-faults";

const contextSchema = z.object({
  id: z.uuid(),
  roomId: z.uuid(),
  sourceMessageId: z.uuid(),
  participantId: z.uuid(),
  userId: z.uuid(),
  normalizedRequest: z.string().min(1).max(4_000),
  promptVersion: z.string().min(1).max(100),
  providerAttemptCount: z.coerce.number().int().min(0).max(3),
  status: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
  model: z.string().min(1).max(160).nullable(),
  messages: z.array(
    z.object({
      id: z.uuid(),
      body: z.string().max(4_000),
      displayName: z.string().max(50),
      messageType: z.enum(["user", "system", "trailie"]),
      createdAt: z.string(),
      deletedAt: z.string().nullable(),
    }),
  ),
});

type RawFocusedRecoveryContext = z.infer<typeof contextSchema>;
type FocusedRecoveryContext = Omit<RawFocusedRecoveryContext, "model"> & {
  model: string;
};
type FocusedQuota = {
  id: string;
  reserve(): Promise<void>;
  reconcile(actualTokens: number): Promise<void>;
  release(): Promise<void>;
};

export type FocusedRecoveryDependencies = {
  load(invocationId: string): Promise<FocusedRecoveryContext>;
  start(
    invocationId: string,
    model: string,
    promptVersion: string,
  ): Promise<string | null>;
  complete(
    invocationId: string,
    runId: string,
    envelope: TrailieResponseEnvelope,
    result: ProviderAttemptExecutionResult<TrailieResponseEnvelope>,
  ): Promise<void>;
  fail(invocationId: string, runId: string, code: string): Promise<void>;
  provider: FocusedAnswerProvider;
  attempts: DurableProviderAttemptController<TrailieResponseEnvelope>;
  policy: WorkflowReliabilityPolicy;
  quota(
    subject: AiQuotaSubject & { invocationId: string; model: string },
  ): FocusedQuota;
  safetyIdentifier(userId: string): string;
  correlationId: string;
};

export async function processFocusedRecovery(
  invocationId: string,
  dependencies: FocusedRecoveryDependencies,
) {
  const policy = {
    ...dependencies.policy,
    maximumAttempts: Math.min(dependencies.policy.maximumAttempts, 2),
  };
  const context = await dependencies.load(invocationId);
  if (context.status === "completed") return { status: "completed" as const };
  if (
    context.status === "cancelled" ||
    context.providerAttemptCount >= policy.maximumAttempts
  )
    throw new ProviderFailure("retry_exhausted");

  const runId = await dependencies.start(
    invocationId,
    context.model,
    context.promptVersion,
  );
  if (!runId) return { status: "deferred" as const };

  const focusedContext = assembleFocusedContext(context.messages, {
    maxMessages: 12,
    maxCharacters: 12_000,
    requiredMessageIds: [context.sourceMessageId],
  });
  const quota = dependencies.quota({
    userId: context.userId,
    roomId: context.roomId,
    invocationId,
    model: context.model,
  });
  let providerResultStaged = false;
  const startedAt = Date.now();
  try {
    await quota.reserve();
    const outcome = await runDurableProviderOperation({
      controller: dependencies.attempts,
      workflow: "focused_answer",
      operationKey: `focused:${invocationId}`,
      model: context.model,
      stage: "focusedProvider",
      policy,
      initialAttempt: context.providerAttemptCount + 1,
      quotaReservationId: quota.id,
      correlationId: dependencies.correlationId,
      execute: async ({ signal, retryCount }) => {
        const providerStartedAt = Date.now();
        const consumed = await consumeFocusedStream(
          await dependencies.provider.stream({
            operationKey: invocationId,
            request: context.normalizedRequest,
            context: focusedContext.text,
            model: context.model,
            safetyIdentifier: dependencies.safetyIdentifier(context.userId),
            signal,
          }),
        );
        const result = consumed.result;
        const envelope = trailieResponseEnvelopeSchema.parse({
          schemaVersion: "1",
          ...result.answer,
          sourceMessageId: context.sourceMessageId,
          status: "completed",
        });
        return {
          value: envelope,
          responseId: result.responseId,
          requestId: result.requestId,
          usage: result.usage,
          providerDurationMs: Date.now() - providerStartedAt,
          totalDurationMs: Date.now() - startedAt,
          retryCount,
          repairCount: 0,
        };
      },
      parse: (value) => trailieResponseEnvelopeSchema.parse(value),
      afterStage: async (result) => {
        providerResultStaged = true;
        await quota.reconcile(result.usage.totalTokens ?? 4_000);
      },
      apply: (envelope, result) =>
        dependencies.complete(invocationId, runId, envelope, result),
    });
    if (outcome.status === "owned_elsewhere")
      return { status: "deferred" as const };
    return { status: "completed" as const };
  } catch (error) {
    if (!providerResultStaged) await quota.release().catch(() => undefined);
    const failure =
      error instanceof ProviderFailure
        ? error
        : new ProviderFailure("recovery_required", { cause: error });
    await dependencies.fail(invocationId, runId, failure.code);
    throw failure;
  }
}

function productionDependencies(): FocusedRecoveryDependencies {
  const environment = requireAiGeneration(parseOpenAIEnv(process.env));
  const admin = createAdminSupabaseClient();
  const provider =
    environment.provider === "fake"
      ? createFakeFocusedAnswerProvider({ failOnce: true })
      : withHostedFocusedFault(
          createOpenAIFocusedAnswerProvider({
            apiKey: environment.apiKey!,
            timeoutMs: environment.reliabilityPolicy.timeoutsMs.focusedProvider,
          }),
        );
  return {
    async load(invocationId) {
      const { data, error } = await admin.rpc("get_ai_invocation_context", {
        target_invocation_id: invocationId,
      });
      if (error) throw new Error("focused_context_unavailable");
      const parsed = contextSchema.parse(data);
      const model =
        parsed.model ??
        createModelRouter({
          conversation: environment.conversationModel,
          flagship: environment.flagshipModel,
        }).route({
          request: parsed.normalizedRequest,
          contextCharacters: parsed.messages.reduce(
            (total, message) => total + message.body.length,
            0,
          ),
        }).model;
      return { ...parsed, model };
    },
    async start(invocationId, model, promptVersion) {
      const { data, error } = await admin.rpc("start_ai_run", {
        target_invocation_id: invocationId,
        target_model: model,
        target_prompt_version: promptVersion,
      });
      if (error) throw new Error("focused_run_unavailable");
      const record =
        typeof data === "object" && data !== null
          ? (data as Record<string, unknown>)
          : {};
      return typeof record.run_id === "string" ? record.run_id : null;
    },
    async complete(invocationId, runId, envelope, result) {
      const { error } = await admin.rpc("complete_ai_run", {
        target_invocation_id: invocationId,
        target_run_id: runId,
        response_body: envelope.body,
        provider_response_id: result.responseId,
        provider_request_id: result.requestId,
        used_input_tokens: result.usage.inputTokens,
        used_output_tokens: result.usage.outputTokens,
        used_reasoning_tokens: result.usage.reasoningTokens,
        used_cached_input_tokens: result.usage.cachedInputTokens,
        used_total_tokens: result.usage.totalTokens,
        measured_latency_ms: result.totalDurationMs,
      });
      if (error) throw new Error("focused_application_failed");
    },
    async fail(invocationId, runId, code) {
      await admin.rpc("fail_ai_run", {
        target_invocation_id: invocationId,
        target_run_id: runId,
        safe_error_code: code,
      });
    },
    provider,
    attempts: createDurableProviderAttemptController(
      createProviderAttemptRepository<TrailieResponseEnvelope>(),
    ),
    policy: environment.reliabilityPolicy,
    quota({ userId, roomId, invocationId, model }) {
      return createDurableAiQuotaReservation({
        userId,
        roomId,
        workflow: "focused_answer",
        model,
        estimatedTokens: 4_000,
        reservationId: invocationId,
      });
    },
    safetyIdentifier: (userId) =>
      createSafetyIdentifier(userId, environment.safetyHmacSecret),
    correlationId: createCorrelationId(),
  };
}

export function drainFocusedAnswer(invocationId: string) {
  return processFocusedRecovery(invocationId, productionDependencies());
}
