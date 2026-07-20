import { memoryPatchSchema, type MemoryPatch } from "@trailie/schemas";

import type { MemoryProviderContext } from "./context";
import { createFakeProviderId } from "@/server/ai/fake-provider-id";
import type { ProviderUsage } from "@/server/ai/provider";

export type MemoryErrorCode =
  | "extraction_not_eligible"
  | "extraction_already_completed"
  | "extraction_already_running"
  | "extraction_failed"
  | "invalid_extraction_response"
  | "invalid_memory_patch"
  | "supersession_not_allowed"
  | "participant_not_found"
  | "source_message_invalid"
  | "model_unavailable"
  | "model_timeout"
  | "model_rate_limited"
  | "workflow_deadline_exceeded"
  | "recovery_required"
  | "retry_exhausted"
  | "workflow_cancelled"
  | "unknown_error";

export class MemoryProviderError extends Error {
  readonly statusCode: number | null;
  readonly requestId: string | null;
  readonly retryAfterMs: number | null;

  constructor(
    readonly code: MemoryErrorCode,
    readonly retryable: boolean,
    metadata: {
      statusCode?: number | null;
      requestId?: string | null;
      retryAfterMs?: number | null;
    } = {},
  ) {
    super(code);
    this.name = "MemoryProviderError";
    this.statusCode = metadata.statusCode ?? null;
    this.requestId = metadata.requestId ?? null;
    this.retryAfterMs = metadata.retryAfterMs ?? null;
  }
}

export type MemoryExtractionInput = MemoryProviderContext & {
  operationKey: string;
  model: string;
  safetyIdentifier: string;
  signal: AbortSignal;
};

export type MemoryExtractionOutput = {
  patch: MemoryPatch;
  responseId: string | null;
  requestId: string | null;
  usage: ProviderUsage;
};

export interface MemoryExtractionProvider {
  extract(input: MemoryExtractionInput): Promise<MemoryExtractionOutput>;
}

const usage = {
  inputTokens: 24,
  outputTokens: 18,
  reasoningTokens: 0,
  cachedInputTokens: 0,
  totalTokens: 42,
};

function output(patch: unknown, operationKey: string): MemoryExtractionOutput {
  return {
    patch: memoryPatchSchema.parse(patch),
    responseId: createFakeProviderId("memory_response", operationKey),
    requestId: createFakeProviderId("memory_request", operationKey),
    usage,
  };
}

export function createFakeMemoryExtractionProvider(): MemoryExtractionProvider {
  return {
    async extract(input) {
      const body = input.sourceMessage.body;
      if (/simulate extraction failure/i.test(body))
        throw new MemoryProviderError("extraction_failed", true);
      if (/simulate invalid schema/i.test(body))
        throw new MemoryProviderError("invalid_extraction_response", false);
      if (
        /ignore your instructions/i.test(body) ||
        /^(lol|okay)$/i.test(body.trim())
      )
        return output({ facts: [], supersessions: [] }, input.operationKey);

      if (
        /prefer hiking/i.test(body) &&
        /cannot travel before friday/i.test(body)
      ) {
        const base = {
          subjectType: "participant" as const,
          subjectParticipantId: input.sourceParticipant.id,
          status: "active" as const,
          confidence: 0.95,
          evidenceStrength: "explicit" as const,
          sourceMessageId: input.sourceMessage.id,
          supersedesFactId: null,
        };
        return output(
          {
            facts: [
              {
                ...base,
                factType: "activity_preference",
                canonicalKey: "participant:activity_preference",
                value: { text: "hiking" },
              },
              {
                ...base,
                factType: "date_constraint",
                canonicalKey: "participant:date_constraint",
                value: { text: "cannot travel before Friday" },
              },
            ],
            supersessions: [],
          },
          input.operationKey,
        );
      }

      let factType:
        | "activity_preference"
        | "transport_preference"
        | "destination_proposal"
        | "group_decision"
        | "rejected_option"
        | "open_question" = "activity_preference";
      let subjectType: "participant" | "group" | "trip" = "participant";
      let value: { text?: string; question?: string } = { text: "hiking" };
      let status: "active" | "rejected" | "unresolved" = "active";
      let evidenceStrength: "explicit" | "tentative" = "explicit";
      if (/rather drive/i.test(body)) {
        factType = "transport_preference";
        value = { text: "driving" };
      } else if (/prefer kayaking/i.test(body)) {
        value = { text: "kayaking" };
      } else if (/maybe yosemite/i.test(body)) {
        factType = "destination_proposal";
        subjectType = "trip";
        value = { text: "Yosemite" };
        evidenceStrength = "tentative";
      } else if (/all decided on yosemite/i.test(body)) {
        factType = "group_decision";
        subjectType = "group";
        value = { text: "Yosemite" };
      } else if (/no longer considering vegas/i.test(body)) {
        factType = "rejected_option";
        subjectType = "trip";
        value = { text: "Vegas" };
        status = "rejected";
      } else if (/where should we stay/i.test(body)) {
        factType = "open_question";
        subjectType = "group";
        value = { question: "Where should we stay?" };
        status = "unresolved";
      }
      const prior = input.activeFacts.find(
        (fact) =>
          fact.factType === factType &&
          fact.subjectParticipantId === input.sourceParticipant.id,
      );
      return output(
        {
          facts: [
            {
              factType,
              subjectType,
              subjectParticipantId:
                subjectType === "participant"
                  ? input.sourceParticipant.id
                  : null,
              canonicalKey: `${subjectType}:${factType}`,
              value,
              status,
              confidence: evidenceStrength === "explicit" ? 0.95 : 0.65,
              evidenceStrength,
              sourceMessageId: input.sourceMessage.id,
              supersedesFactId: prior?.id ?? null,
            },
          ],
          supersessions: [],
        },
        input.operationKey,
      );
    },
  };
}
