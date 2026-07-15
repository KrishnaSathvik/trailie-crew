import "server-only";

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

type Dependencies = {
  repository: MemoryRepository;
  provider: MemoryExtractionProvider;
  safetyIdentifier: string;
  timeoutMs?: number;
  model?: string;
  quotaSubject?: AiQuotaSubject;
};

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
  for (let pass = 0; pass < 2; pass += 1) {
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
      const signal = AbortSignal.timeout(dependencies.timeoutMs ?? 20_000);
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
      const result = dependencies.quotaSubject
        ? await runWithAiQuota(
            {
              ...dependencies.quotaSubject,
              workflow: "memory_extraction",
              model: dependencies.model ?? "gpt-5.6-luna",
              estimatedTokens: 3_000,
            },
            extract,
          )
        : await extract();
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
      await dependencies.repository.complete(
        messageId,
        patch,
        result,
        Date.now() - startedAt,
      );
      return;
    } catch (error) {
      const failure = safeFailure(error);
      await dependencies.repository.fail(messageId, failure.code);
      if (!failure.retryable || claim.attemptCount >= 2) return;
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
          timeoutMs: environment.memoryTimeoutMs,
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
    timeoutMs: environment.memoryTimeoutMs,
    model: environment.memoryModel,
    quotaSubject,
  });
}
