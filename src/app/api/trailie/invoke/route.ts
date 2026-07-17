import { z } from "zod";
import {
  trailieResponseEnvelopeSchema,
  trailieStreamEventSchema,
} from "@trailie/schemas";

import { authorizeTrailieSource } from "@/features/trailie/invocation/authorize-source";
import { detectTrailieInvocation } from "@/features/trailie/invocation/detect-invocation";
import { parseOpenAIEnv } from "@/server/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assembleFocusedContext } from "@/server/ai/context";
import { logAiEvent } from "@/server/ai/logger";
import { createModelRouter } from "@/server/ai/model-router";
import { createOpenAIFocusedAnswerProvider } from "@/server/ai/openai-provider";
import {
  createFakeFocusedAnswerProvider,
  TrailieProviderError,
  type FocusedAnswerProvider,
} from "@/server/ai/provider";
import { createSafetyIdentifier } from "@/server/ai/safety-identifier";
import {
  AiQuotaError,
  createDurableAiQuotaReservation,
} from "@/server/ai/quota";
import { createAdminSupabaseClient } from "@/server/supabase/admin";
import { createCorrelationId, logOperation } from "@/server/operations/logger";
import {
  createDurableProviderAttemptController,
  runDurableProviderOperation,
} from "@/server/ai/provider-attempts";
import { createProviderAttemptRepository } from "@/server/ai/provider-attempt-repository";
import type { ProviderAttemptExecutionResult } from "@/server/ai/provider-attempts";
import { ProviderFailure } from "@/server/ai/reliability-policy";
import { consumeFocusedStream } from "@/server/ai/focused-stream";
import { withHostedFocusedFault } from "@/server/ai/hosted-acceptance-faults";

export const runtime = "nodejs";
export const maxDuration = 60;

const inputSchema = z
  .object({
    roomId: z.uuid(),
    participantId: z.uuid(),
    sourceMessageId: z.uuid(),
  })
  .strict();

type SafeRecord = Record<string, unknown>;
const asRecord = (value: unknown) =>
  typeof value === "object" && value !== null ? (value as SafeRecord) : {};
const asString = (value: unknown) => (typeof value === "string" ? value : null);

function jsonError(code: string, status: number) {
  return Response.json({ code }, { status });
}

function providerFor(
  environment: ReturnType<typeof parseOpenAIEnv>,
): FocusedAnswerProvider {
  if (environment.provider === "fake")
    return createFakeFocusedAnswerProvider({ failOnce: true });
  if (!environment.apiKey) throw new Error("missing_openai_configuration");
  return withHostedFocusedFault(
    createOpenAIFocusedAnswerProvider({
      apiKey: environment.apiKey,
      timeoutMs: environment.reliabilityPolicy.timeoutsMs.focusedProvider,
    }),
  );
}

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("source_message_invalid", 400);

  const client = await createServerSupabaseClient();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return jsonError("membership_required", 401);

  const admin = createAdminSupabaseClient();
  const [participantResult, sourceResult] = await Promise.all([
    admin
      .from("participants")
      .select("*")
      .eq("id", parsed.data.participantId)
      .maybeSingle(),
    admin
      .from("messages")
      .select("*")
      .eq("id", parsed.data.sourceMessageId)
      .maybeSingle(),
  ]);
  const participant = participantResult.data;
  const source = sourceResult.data;
  if (
    participantResult.error ||
    sourceResult.error ||
    !participant ||
    !source
  ) {
    return jsonError("source_message_invalid", 404);
  }
  if (
    !authorizeTrailieSource({
      authUserId: authData.user.id,
      roomId: parsed.data.roomId,
      participant: {
        id: participant.id,
        roomId: participant.room_id,
        userId: participant.user_id,
        status: participant.status,
      },
      source: {
        id: source.id,
        roomId: source.room_id,
        participantId: source.participant_id,
        senderUserId: source.sender_user_id,
        messageType: source.message_type,
        deletedAt: source.deleted_at,
      },
    })
  )
    return jsonError("permission_denied", 403);

  let replyTargetType: "user" | "system" | "trailie" | null = null;
  let replyTarget: typeof source | null = null;
  if (source.reply_to_message_id) {
    const { data: reply } = await admin
      .from("messages")
      .select("*")
      .eq("id", source.reply_to_message_id)
      .maybeSingle();
    if (
      reply &&
      reply.room_id === parsed.data.roomId &&
      reply.deleted_at === null
    ) {
      replyTargetType = reply.message_type;
      replyTarget = reply;
    }
  }
  const decision = detectTrailieInvocation({
    body: source.body,
    replyTargetType,
  });
  if (!decision.invoked) return jsonError("trailie_not_invoked", 422);

  let environment: ReturnType<typeof parseOpenAIEnv>;
  try {
    environment = parseOpenAIEnv(process.env);
  } catch {
    return jsonError("openai_authentication_failed", 503);
  }
  if (!environment.generationEnabled)
    return jsonError("ai_generation_disabled", 503);

  const { data: invocationData, error: invocationError } = await admin.rpc(
    "create_ai_invocation",
    {
      target_room_id: parsed.data.roomId,
      target_source_message_id: parsed.data.sourceMessageId,
      target_participant_id: parsed.data.participantId,
      target_invocation_type: decision.invocationType,
      target_normalized_request: decision.normalizedRequest,
      target_prompt_version: environment.promptVersion,
    },
  );
  if (invocationError) {
    const rateLimited = invocationError.message.includes("rate limit");
    logOperation(
      rateLimited
        ? "rate_limit.focused_answer"
        : "trailie_ai.invocation_failed",
      {
        correlationId,
        workflow: "focused_answer",
        status: "rejected",
        errorCode: rateLimited ? "rate_limited" : "invocation_failed",
      },
    );
    return jsonError(
      rateLimited ? "openai_rate_limited" : "invocation_failed",
      429,
    );
  }
  const invocation = asRecord(invocationData);
  const invocationId = asString(invocation.id);
  if (!invocationId) return jsonError("invocation_failed", 500);

  if (invocation.status === "completed")
    return jsonError("retry_not_allowed", 409);

  const { data: recentRows, error: contextError } = await admin
    .from("messages")
    .select("*")
    .eq("room_id", parsed.data.roomId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(14);
  if (contextError) return jsonError("context_unavailable", 503);
  const contextRows = [...(recentRows ?? [])];
  if (replyTarget && !contextRows.some((item) => item.id === replyTarget.id)) {
    contextRows.push(replyTarget);
  }
  const participantIds = [
    ...new Set(contextRows.map((item) => item.participant_id)),
  ];
  const { data: contextParticipants } = await admin
    .from("participants")
    .select("id,display_name")
    .in("id", participantIds);
  const names = new Map(
    (contextParticipants ?? []).map((item) => [item.id, item.display_name]),
  );
  const context = assembleFocusedContext(
    contextRows.map((item) => ({
      id: item.id,
      body: item.body,
      displayName:
        item.message_type === "trailie"
          ? "Trailie"
          : (names.get(item.participant_id) ?? "Crew member"),
      messageType: item.message_type,
      createdAt: item.created_at,
      deletedAt: item.deleted_at,
    })),
    {
      maxMessages: 12,
      maxCharacters: 12_000,
      requiredMessageIds: [source.id, ...(replyTarget ? [replyTarget.id] : [])],
    },
  );
  const route = createModelRouter({
    conversation: environment.conversationModel,
    flagship: environment.flagshipModel,
  }).route({
    request: decision.normalizedRequest,
    contextCharacters: context.text.length,
  });

  const { data: runData, error: runError } = await admin.rpc("start_ai_run", {
    target_invocation_id: invocationId,
    target_model: route.model,
    target_prompt_version: environment.promptVersion,
  });
  if (runError) return jsonError("retry_not_allowed", 409);
  const runId = asString(asRecord(runData).run_id);
  if (!runId)
    return jsonError(
      asRecord(runData).status === "completed"
        ? "retry_not_allowed"
        : "invocation_already_running",
      409,
    );

  const encoder = new TextEncoder();
  const startedAt = Date.now();
  const stream = new ReadableStream({
    async start(controller) {
      let clientConnected = true;
      let quota: ReturnType<typeof createDurableAiQuotaReservation> | null =
        null;
      let providerResultStaged = false;
      const emit = (event: unknown) => {
        if (!clientConnected) return;
        const safe = trailieStreamEventSchema.parse(event);
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(safe)}\n`));
        } catch {
          clientConnected = false;
        }
      };
      emit({ type: "invocation_started", invocationId });
      try {
        type Envelope = z.infer<typeof trailieResponseEnvelopeSchema>;
        const attempts = createDurableProviderAttemptController<Envelope>(
          createProviderAttemptRepository<Envelope>(),
        );
        const durableQuota = createDurableAiQuotaReservation({
          userId: authData.user.id,
          roomId: parsed.data.roomId,
          workflow: "focused_answer",
          model: route.model,
          estimatedTokens: 4_000,
          reservationId: invocationId,
        });
        quota = durableQuota;
        await durableQuota.reserve();
        const routePolicy = {
          ...environment.reliabilityPolicy,
          maximumAttempts: Math.min(
            environment.reliabilityPolicy.maximumAttempts,
            2,
          ),
          totalWorkflowDeadlineMs: Math.min(
            environment.reliabilityPolicy.totalWorkflowDeadlineMs,
            55_000,
          ),
        };
        const outcome = await runDurableProviderOperation({
          controller: attempts,
          workflow: "focused_answer",
          operationKey: `focused:${invocationId}`,
          model: route.model,
          stage: "focusedProvider",
          policy: routePolicy,
          quotaReservationId: invocationId,
          correlationId,
          execute: async ({ signal, retryCount }) => {
            if (retryCount > 0) emit({ type: "provider_retrying" });
            const providerStartedAt = Date.now();
            const consumed = await consumeFocusedStream(
              await providerFor(environment).stream({
                operationKey: invocationId,
                request: decision.normalizedRequest,
                context: context.text,
                model: route.model,
                safetyIdentifier: createSafetyIdentifier(
                  authData.user.id,
                  environment.safetyHmacSecret,
                ),
                signal,
              }),
            );
            for (const delta of consumed.bufferedDeltas)
              emit({ type: "text_delta", delta });
            const result = consumed.result;
            const envelope = trailieResponseEnvelopeSchema.parse({
              schemaVersion: "1",
              ...result.answer,
              sourceMessageId: parsed.data.sourceMessageId,
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
            } satisfies ProviderAttemptExecutionResult<Envelope>;
          },
          parse: (value) => trailieResponseEnvelopeSchema.parse(value),
          afterStage: async (result) => {
            providerResultStaged = true;
            await durableQuota.reconcile(result.usage.totalTokens ?? 4_000);
          },
          apply: async (envelope, result) => {
            const { error: completeError } = await admin.rpc(
              "complete_ai_run",
              {
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
              },
            );
            if (completeError)
              throw new TrailieProviderError("openai_unavailable", true);
          },
        });
        if (outcome.status !== "applied")
          throw new TrailieProviderError("openai_unavailable", true);
        emit({ type: "response_completed", response: outcome.result.value });
        logAiEvent("completed", {
          invocationId,
          runId,
          model: route.model,
          promptVersion: environment.promptVersion,
          latencyMs: outcome.result.totalDurationMs,
          providerLatencyMs: outcome.result.providerDurationMs,
          totalWorkflowLatencyMs: outcome.result.totalDurationMs,
          attemptCount: outcome.result.retryCount + 1,
          retryCount: outcome.result.retryCount,
          providerStatus: "completed",
          recoveryCount: outcome.recovered ? 1 : 0,
          quotaStatus: "reconciled",
        });
      } catch (error) {
        if (quota && !providerResultStaged)
          await quota.release().catch(() => undefined);
        const failure =
          error instanceof AiQuotaError
            ? new TrailieProviderError(error.code as never, false)
            : error instanceof TrailieProviderError
              ? error
              : error instanceof ProviderFailure
                ? new TrailieProviderError(
                    error.code as never,
                    error.retryable,
                    {
                      statusCode: error.statusCode,
                      requestId: error.requestId,
                      retryAfterMs: error.retryAfterMs,
                    },
                  )
                : new TrailieProviderError("openai_unavailable", true);
        await admin.rpc("fail_ai_run", {
          target_invocation_id: invocationId,
          target_run_id: runId,
          safe_error_code: failure.code,
        });
        emit({
          type: "response_failed",
          code: failure.code,
          message: failure.code,
          retryable: failure.retryable,
        });
        logAiEvent("failed", {
          invocationId,
          runId,
          model: route.model,
          promptVersion: environment.promptVersion,
          errorCode: failure.code,
          totalWorkflowLatencyMs: Date.now() - startedAt,
          providerStatus: failure.statusCode,
        });
      } finally {
        if (clientConnected) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
