import "server-only";

import { memoryPatchSchema, type MemoryPatch } from "@trailie/schemas";

import { parseOpenAIEnv, requireAiGeneration } from "@/server/env";
import { createSafetyIdentifier } from "@/server/ai/safety-identifier";
import {
  resolveAiQuotaSubject,
  runWithAiQuota,
  type AiQuotaSubject,
} from "@/server/ai/quota";
import { classifyMemoryEligibility } from "./eligibility";
import { createOpenAIMemoryExtractionProvider } from "./openai-provider";
import {
  createFakeMemoryExtractionProvider,
  MemoryProviderError,
  type MemoryExtractionProvider,
} from "./provider";
import { createMemoryRepository, type MemoryRepository } from "./repository";
import { validateMemoryPatch } from "./validation";
import {
  computeRetryDelay,
  parseWorkflowReliabilityPolicy,
  remainingProviderTimeout,
  type WorkflowReliabilityPolicy,
} from "@/server/ai/reliability-policy";
import {
  createDurableProviderAttemptController,
  type DurableProviderAttemptController,
  type ProviderAttemptExecutionResult,
} from "@/server/ai/provider-attempts";
import { createProviderAttemptRepository } from "@/server/ai/provider-attempt-repository";

type Dependencies = {
  repository: MemoryRepository;
  provider: MemoryExtractionProvider;
  safetyIdentifier: string;
  timeoutMs?: number;
  model?: string;
  quotaSubject?: AiQuotaSubject;
  reliabilityPolicy?: WorkflowReliabilityPolicy;
  retry?: {
    sleep: (milliseconds: number) => Promise<void>;
    random?: () => number;
  };
  providerAttempts?: DurableProviderAttemptController<MemoryPatch>;
};

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function safeFailure(error: unknown) {
  if (error instanceof MemoryProviderError) return error;
  if (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string"
  )
    return new MemoryProviderError(
      error.code as never,
      "retryable" in error && error.retryable === true,
    );
  if (
    error instanceof Error &&
    [
      "invalid_memory_patch",
      "source_message_invalid",
      "participant_not_found",
      "supersession_not_allowed",
    ].includes(error.message)
  )
    return new MemoryProviderError(error.message as never, false);
  return new MemoryProviderError("unknown_error", false);
}

export async function processMemoryExtraction(
  messageId: string,
  dependencies: Dependencies,
) {
  const policy =
    dependencies.reliabilityPolicy ?? parseWorkflowReliabilityPolicy({});
  const workflowStartedAt = Date.now();
  for (;;) {
    const claim = await dependencies.repository.claim(messageId);
    if (!claim.claimed || claim.status !== "running") return;
    const context = await dependencies.repository.loadContext(messageId);
    const eligibility = classifyMemoryEligibility({
      body: context.sourceMessage.body,
    });
    if (!eligibility.eligible) {
      await dependencies.repository.skip(messageId, eligibility.reason);
      return;
    }
    const startedAt = Date.now();
    try {
      const signal = AbortSignal.timeout(
        Math.min(
          dependencies.timeoutMs ?? Number.POSITIVE_INFINITY,
          remainingProviderTimeout(policy, "memoryProvider", workflowStartedAt),
        ),
      );
      const extract = () =>
        dependencies.provider.extract({
          operationKey: messageId,
          model: dependencies.model ?? "gpt-5.6-luna",
          safetyIdentifier: dependencies.safetyIdentifier,
          sourceMessage: context.sourceMessage,
          sourceParticipant: context.sourceParticipant,
          approvalMode: context.approvalMode,
          replyTarget: context.replyTarget,
          recentMessages: context.recentMessages,
          activeFacts: context.activeFacts,
          signal,
        });
      const execute = async (reservationId?: string) => {
        const providerStartedAt = Date.now();
        const result = dependencies.quotaSubject
          ? await runWithAiQuota(
              {
                ...dependencies.quotaSubject,
                workflow: "memory_extraction",
                model: dependencies.model ?? "gpt-5.6-luna",
                estimatedTokens: 3_000,
                ...(reservationId ? { reservationId } : {}),
              },
              extract,
            )
          : await extract();
        const providerDurationMs = Date.now() - providerStartedAt;
        const patch = validateMemoryPatch(result.patch, {
          roomId: context.roomId,
          sourceMessageId: context.sourceMessage.id,
          sourceParticipantId: context.sourceParticipant.id,
          approvalMode: context.approvalMode,
          sourceBody: context.sourceMessage.body,
          sourceParticipantRole: context.sourceParticipant.role,
          participants: context.participantIds,
          activeFacts: context.activeFacts as never,
        });
        return {
          value: patch,
          responseId: result.responseId,
          requestId: result.requestId,
          usage: result.usage,
          providerDurationMs,
          totalDurationMs: Date.now() - startedAt,
          retryCount: Math.max(claim.attemptCount - 1, 0),
          repairCount: 0,
        } satisfies ProviderAttemptExecutionResult<MemoryPatch>;
      };
      const apply = (
        patch: MemoryPatch,
        result: ProviderAttemptExecutionResult<MemoryPatch>,
      ) =>
        dependencies.repository.complete(
          messageId,
          patch,
          { patch, ...result },
          result.totalDurationMs,
        );
      if (dependencies.providerAttempts) {
        const outcome = await dependencies.providerAttempts.run({
          workflow: "memory_extraction",
          operationKey: `memory:${messageId}`,
          attempt: claim.attemptCount,
          model: dependencies.model ?? "gpt-5.6-luna",
          leaseMs: policy.recoveryLeaseMs,
          execute: ({ attemptId }) => execute(attemptId),
          parse: (value) => memoryPatchSchema.parse(value),
          apply,
        });
        if (outcome.status !== "applied") return;
      } else {
        const result = await execute();
        await apply(result.value, result);
      }
      return;
    } catch (error) {
      const failure = safeFailure(error);
      if (!failure.retryable) {
        await dependencies.repository.fail(messageId, failure.code);
        return;
      }
      if (claim.attemptCount >= policy.maximumAttempts) {
        await dependencies.repository.fail(messageId, "retry_exhausted");
        return;
      }
      const delay = computeRetryDelay(
        policy,
        claim.attemptCount,
        dependencies.retry?.random,
      );
      if (
        Date.now() - workflowStartedAt + delay >=
        policy.totalWorkflowDeadlineMs
      ) {
        await dependencies.repository.fail(
          messageId,
          "workflow_deadline_exceeded",
        );
        return;
      }
      await dependencies.repository.fail(messageId, failure.code);
      await (dependencies.retry?.sleep ?? sleep)(delay);
    }
  }
}

export async function drainMemoryExtraction(messageId: string) {
  const environment = requireAiGeneration(parseOpenAIEnv(process.env));
  const provider =
    environment.provider === "fake"
      ? createFakeMemoryExtractionProvider()
      : createOpenAIMemoryExtractionProvider({
          apiKey: environment.apiKey!,
          timeoutMs: environment.reliabilityPolicy.timeoutsMs.memoryProvider,
        });
  const repository = createMemoryRepository({
    model: environment.memoryModel,
    promptVersion: environment.memoryPromptVersion,
    schemaVersion: environment.memorySchemaVersion,
  });
  const quotaSubject = await resolveAiQuotaSubject("memory", messageId);
  await processMemoryExtraction(messageId, {
    repository,
    provider,
    safetyIdentifier: createSafetyIdentifier(
      `memory:${messageId}`,
      environment.safetyHmacSecret,
    ),
    model: environment.memoryModel,
    quotaSubject,
    reliabilityPolicy: environment.reliabilityPolicy,
    providerAttempts: createDurableProviderAttemptController(
      createProviderAttemptRepository<MemoryPatch>(),
    ),
  });
}
