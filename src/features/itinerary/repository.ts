import "server-only";
import { z } from "zod";
import {
  itinerarySchema,
  planningSummarySchema,
  validationReportSchema,
  type Itinerary,
  type ValidationReport,
} from "@trailie/schemas";
import { createAdminSupabaseClient } from "@/server/supabase/admin";
import type { Json } from "@/types/database";
import type { ItineraryProviderOutput } from "./provider";
import type { NormalizedToolEvidence } from "./validation/validate-itinerary";

const claimSchema = z
  .object({
    claimed: z.boolean(),
    stage: z.enum(["generate", "validate", "repair"]).optional(),
    attemptCount: z.number().int().optional().default(0),
  })
  .passthrough();
const rawEvidenceSchema = z.object({
  id: z.union([z.uuid(), z.string().regex(/^evidence:/)]),
  itemId: z.string().nullable(),
  provider: z.string(),
  toolName: z.string(),
  requestFingerprint: z.string(),
  status: z.enum(["verified", "unavailable", "stale", "failed"]),
  retrievedAt: z.string(),
  expiresAt: z.string().nullable(),
  normalizedResult: z.record(z.string(), z.unknown()),
  sourceReference: z
    .object({ label: z.string(), url: z.string().nullable() })
    .nullable(),
});
const contextSchema = z.object({
  tripPlanId: z.uuid(),
  roomId: z.uuid(),
  version: z.number().int().positive(),
  approvedSummary: planningSummarySchema,
  basisSummaryVersion: z.number().int().positive(),
  basisSummaryHash: z.string(),
  travelers: z.array(
    z.object({
      id: z.string(),
      displayName: z.string(),
      role: z.enum(["host", "member"]),
    }),
  ),
  draft: itinerarySchema.nullable(),
  latestValidation: z
    .object({
      status: z.enum(["pass", "needs_revision", "blocked"]),
      issues: z.array(z.unknown()),
      warnings: z.array(z.unknown()),
      validatorVersion: z.string(),
    })
    .nullable(),
  evidence: z.array(rawEvidenceSchema),
});

export type ItineraryGenerationContext = {
  tripPlanId: string;
  roomId: string;
  version: number;
  approvedSummary: z.infer<typeof planningSummarySchema>;
  basisSummaryVersion: number;
  basisSummaryHash: string;
  travelers: Array<{
    id: string;
    displayName: string;
    role: "host" | "member";
  }>;
  draft: Itinerary | null;
  latestValidation: ValidationReport | null;
  evidence: NormalizedToolEvidence[];
};
export interface ItineraryRepository {
  claim(id: string): Promise<z.infer<typeof claimSchema>>;
  loadContext(id: string): Promise<ItineraryGenerationContext>;
  recordDraft(
    id: string,
    itinerary: Itinerary,
    output: ItineraryProviderOutput,
  ): Promise<void>;
  recordEvidence(
    id: string,
    evidence: Omit<NormalizedToolEvidence, "id">,
  ): Promise<string>;
  recordProgress(
    id: string,
    event: "route_validation_started" | "constraint_validation_started",
  ): Promise<void>;
  recordValidation(
    id: string,
    report: ValidationReport,
    version?: number,
  ): Promise<void>;
  markNeedsRevision(id: string): Promise<void>;
  publish(id: string, itinerary: Itinerary): Promise<void>;
  fail(id: string, code: string): Promise<void>;
}

function ensure(error: { message: string } | null, code: string) {
  if (error) throw new Error(code);
}

export function createItineraryRepository(): ItineraryRepository {
  const admin = createAdminSupabaseClient();
  let loadedVersion = 1;
  return {
    async claim(id) {
      const { data, error } = await admin.rpc("claim_itinerary_generation", {
        target_trip_plan_id: id,
      });
      ensure(error, "plan_generation_active");
      return claimSchema.parse(data);
    },
    async loadContext(id) {
      const { data, error } = await admin.rpc(
        "get_itinerary_generation_context",
        {
          target_trip_plan_id: id,
        },
      );
      ensure(error, "plan_not_found");
      const value = contextSchema.parse(data);
      loadedVersion = value.version;
      return {
        ...value,
        latestValidation: value.latestValidation
          ? validationReportSchema.parse({
              validatorVersion: value.latestValidation.validatorVersion,
              status: value.latestValidation.status,
              issues: value.latestValidation.issues,
              warnings: value.latestValidation.warnings,
              passedChecks: [],
              repairedIssues: [],
              evidenceLastCheckedAt: null,
            })
          : null,
        evidence: value.evidence.map((entry) => ({
          ...entry,
          id: entry.id.startsWith("evidence:")
            ? entry.id
            : `evidence:${entry.id}`,
        })),
      };
    },
    async recordDraft(id, itinerary, output) {
      const { error } = await admin.rpc("record_itinerary_draft", {
        target_trip_plan_id: id,
        validated_draft: itinerary,
        target_provider_response_id: output.responseId,
        target_provider_request_id: output.requestId,
        target_input_tokens: output.usage.inputTokens,
        target_output_tokens: output.usage.outputTokens,
        target_reasoning_tokens: output.usage.reasoningTokens,
        target_cached_input_tokens: output.usage.cachedInputTokens,
        target_total_tokens: output.usage.totalTokens,
        target_latency_ms: 0,
      });
      ensure(error, "invalid_itinerary_response");
    },
    async recordEvidence(id, evidence) {
      const { data, error } = await admin.rpc("record_tool_evidence", {
        target_trip_plan_id: id,
        target_provider: evidence.provider,
        target_tool_name: evidence.toolName,
        target_request_fingerprint:
          evidence.requestFingerprint ??
          `${evidence.toolName}:${evidence.itemId ?? "plan"}`,
        target_retrieved_at: evidence.retrievedAt,
        target_expires_at: evidence.expiresAt,
        target_status: evidence.status,
        target_normalized_result: evidence.normalizedResult as Json,
        target_source_reference: evidence.sourceReference as Json | null,
        target_itinerary_item_id: evidence.itemId,
      });
      ensure(error, "tool_unavailable");
      return `evidence:${String(data)}`;
    },
    async recordProgress(id, event) {
      const { error } = await admin.rpc("record_plan_progress", {
        target_trip_plan_id: id,
        target_event_type: event,
      });
      ensure(error, "unknown_error");
    },
    async recordValidation(id, report, version = loadedVersion) {
      const { error } = await admin.rpc("record_validation_report", {
        target_trip_plan_id: id,
        target_plan_version: version,
        target_validator_version: report.validatorVersion,
        target_status: report.status,
        target_issues: report.issues,
        target_warnings: report.warnings,
      });
      ensure(error, "validation_failed");
    },
    async markNeedsRevision(id) {
      const { error } = await admin.rpc("mark_itinerary_needs_revision", {
        target_trip_plan_id: id,
      });
      ensure(error, "repair_failed");
    },
    async publish(id, itinerary) {
      const { error } = await admin.rpc("complete_itinerary_publication", {
        target_trip_plan_id: id,
        validated_itinerary: itinerary,
      });
      ensure(error, "publication_not_allowed");
    },
    async fail(id, code) {
      const { error } = await admin.rpc("fail_itinerary_generation", {
        target_trip_plan_id: id,
        target_error_code: code,
      });
      ensure(error, "plan_generation_failed");
    },
  };
}
