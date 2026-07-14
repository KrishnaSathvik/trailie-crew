import "server-only";

import { z } from "zod";

import type { MemoryPatch } from "@trailie/schemas";
import { createAdminSupabaseClient } from "@/server/supabase/admin";
import type { MemoryExtractionOutput } from "./provider";

const claimSchema = z
  .object({
    status: z.enum(["running", "completed", "failed", "skipped"]),
    claimed: z.boolean().default(false),
    attemptCount: z.number().int().min(0).max(2).default(0),
  })
  .passthrough();

const contextSchema = z.object({
  roomId: z.uuid(),
  sourceMessage: z.object({ id: z.uuid(), body: z.string().max(4000) }),
  sourceParticipant: z.object({
    id: z.uuid(),
    displayName: z.string().max(50),
    role: z.enum(["host", "member"]),
  }),
  approvalMode: z.enum(["all_active", "host_only"]),
  replyTarget: z
    .object({
      id: z.uuid(),
      body: z.string(),
      participantId: z.uuid(),
      displayName: z.string(),
      messageType: z.enum(["user", "system", "trailie"]),
    })
    .nullable(),
  recentMessages: z
    .array(
      z.object({
        id: z.uuid(),
        body: z.string(),
        participantId: z.uuid(),
        displayName: z.string(),
        messageType: z.enum(["user", "system", "trailie"]),
      }),
    )
    .max(6),
  activeFacts: z
    .array(
      z.object({
        id: z.uuid(),
        roomId: z.uuid(),
        subjectType: z.enum(["participant", "group", "trip"]),
        subjectParticipantId: z.uuid().nullable(),
        factType: z.string(),
        canonicalKey: z.string(),
        value: z.record(z.string(), z.unknown()),
        status: z.enum(["active", "rejected", "unresolved"]),
      }),
    )
    .max(12),
  participantIds: z.array(z.uuid()).max(50),
});

export type MessageExtractionContext = z.infer<typeof contextSchema>;

export interface MemoryRepository {
  claim(messageId: string): Promise<z.infer<typeof claimSchema>>;
  loadContext(messageId: string): Promise<MessageExtractionContext>;
  skip(messageId: string, reason: string): Promise<void>;
  complete(
    messageId: string,
    patch: MemoryPatch,
    result: MemoryExtractionOutput,
    latencyMs: number,
  ): Promise<void>;
  fail(messageId: string, code: string): Promise<void>;
}

function ensure(error: { message: string } | null, code: string) {
  if (error) throw new Error(code);
}

export function createMemoryRepository(configuration: {
  model: string;
  promptVersion: string;
  schemaVersion: string;
}): MemoryRepository {
  const admin = createAdminSupabaseClient();
  return {
    async claim(messageId) {
      const { data, error } = await admin.rpc("claim_message_extraction", {
        target_message_id: messageId,
        target_model: configuration.model,
        target_prompt_version: configuration.promptVersion,
        target_schema_version: configuration.schemaVersion,
      });
      ensure(error, "source_message_invalid");
      return claimSchema.parse(data);
    },
    async loadContext(messageId) {
      const { data, error } = await admin.rpc(
        "get_message_extraction_context",
        { target_message_id: messageId },
      );
      ensure(error, "source_message_invalid");
      return contextSchema.parse(data);
    },
    async skip(messageId, reason) {
      const { error } = await admin.rpc("skip_message_extraction", {
        target_message_id: messageId,
        skip_reason: reason,
      });
      ensure(error, "extraction_failed");
    },
    async complete(messageId, patch, result, latencyMs) {
      const { error } = await admin.rpc("complete_message_extraction", {
        target_message_id: messageId,
        proposed_patch: patch,
        target_provider_response_id: result.responseId,
        target_provider_request_id: result.requestId,
        used_input_tokens: result.usage.inputTokens,
        used_output_tokens: result.usage.outputTokens,
        used_reasoning_tokens: result.usage.reasoningTokens,
        used_cached_input_tokens: result.usage.cachedInputTokens,
        used_total_tokens: result.usage.totalTokens,
        measured_latency_ms: latencyMs,
      });
      ensure(error, "invalid_memory_patch");
    },
    async fail(messageId, code) {
      const { error } = await admin.rpc("fail_message_extraction", {
        target_message_id: messageId,
        safe_error_code: code,
      });
      ensure(error, "extraction_failed");
    },
  };
}
