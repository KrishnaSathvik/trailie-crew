"use server";
import { z } from "zod";
import {
  planningRequestViewSchema,
  planningReviewDecisionSchema,
  type PlanningRequestView,
} from "@trailie/schemas";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { schedulePlanningSummary } from "./scheduler";

export type PlanningErrorCode =
  | "planning_request_active"
  | "planning_request_not_found"
  | "planning_request_unavailable"
  | "summary_generation_failed"
  | "invalid_summary_response"
  | "summary_not_ready"
  | "summary_stale"
  | "approval_not_allowed"
  | "approval_version_mismatch"
  | "changes_note_required"
  | "participant_not_required"
  | "membership_required"
  | "permission_denied"
  | "model_unavailable"
  | "model_timeout"
  | "model_rate_limited"
  | "retry_exhausted"
  | "unknown_error";
type Result<T> =
  { ok: true; data: T } | { ok: false; error: PlanningErrorCode };
const identity = z.object({ roomId: z.uuid(), participantId: z.uuid() });
const review = z.object({
  planningRequestId: z.uuid(),
  summaryVersion: z.number().int().positive(),
  participantId: z.uuid(),
  decision: planningReviewDecisionSchema,
  note: z.string().trim().max(500).nullable().optional(),
});
async function client() {
  const value = await createServerSupabaseClient();
  const { data, error } = await value.auth.getUser();
  return !error && data.user ? value : null;
}
function map(error: { message?: string } | null): PlanningErrorCode {
  const message = error?.message ?? "";
  if (/stale/i.test(message)) return "summary_stale";
  if (/version/i.test(message)) return "approval_version_mismatch";
  if (/note/i.test(message)) return "changes_note_required";
  if (/membership|authentication/i.test(message)) return "membership_required";
  if (/not found/i.test(message)) return "planning_request_not_found";
  if (/unavailable/i.test(message)) return "planning_request_unavailable";
  return "unknown_error";
}
export async function createPlanningRequestAction(
  input: unknown,
): Promise<Result<{ id: string; status: string }>> {
  const parsed = identity.safeParse(input);
  if (!parsed.success) return { ok: false, error: "unknown_error" };
  const supabase = await client();
  if (!supabase) return { ok: false, error: "membership_required" };
  const { data, error } = await supabase.rpc("create_planning_request", {
    target_room_id: parsed.data.roomId,
    participant_id: parsed.data.participantId,
  });
  if (error) return { ok: false, error: map(error) };
  const result = z
    .object({
      id: z.uuid(),
      status: z.string(),
      created: z.boolean().optional().default(false),
    })
    .passthrough()
    .parse(data);
  if (result.created) schedulePlanningSummary(result.id);
  return { ok: true, data: { id: result.id, status: result.status } };
}
export async function getPlanningRequestAction(
  roomId: string,
): Promise<Result<PlanningRequestView | null>> {
  if (!z.uuid().safeParse(roomId).success)
    return { ok: false, error: "unknown_error" };
  const supabase = await client();
  if (!supabase) return { ok: false, error: "membership_required" };
  const { data, error } = await supabase.rpc("get_planning_request", {
    target_room_id: roomId,
  });
  if (error) return { ok: false, error: map(error) };
  const parsed = planningRequestViewSchema.nullable().safeParse(data);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, error: "unknown_error" };
}
export async function reviewPlanningSummaryAction(
  input: unknown,
): Promise<Result<null>> {
  const parsed = review.safeParse(input);
  if (
    !parsed.success ||
    (parsed.data.decision === "changes_requested" && !parsed.data.note)
  )
    return { ok: false, error: "changes_note_required" };
  const supabase = await client();
  if (!supabase) return { ok: false, error: "membership_required" };
  const { error } = await supabase.rpc("review_planning_summary", {
    target_request_id: parsed.data.planningRequestId,
    target_summary_version: parsed.data.summaryVersion,
    target_participant_id: parsed.data.participantId,
    target_decision: parsed.data.decision,
    note: parsed.data.note ?? null,
  });
  return error ? { ok: false, error: map(error) } : { ok: true, data: null };
}
export async function regeneratePlanningSummaryAction(
  input: unknown,
): Promise<Result<null>> {
  const parsed = z
    .object({
      planningRequestId: z.uuid(),
      summaryVersion: z.number().int().nonnegative(),
      participantId: z.uuid(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "unknown_error" };
  const supabase = await client();
  if (!supabase) return { ok: false, error: "membership_required" };
  const { error } = await supabase.rpc("regenerate_planning_summary", {
    target_request_id: parsed.data.planningRequestId,
    target_summary_version: parsed.data.summaryVersion,
    participant_id: parsed.data.participantId,
  });
  if (error) return { ok: false, error: map(error) };
  schedulePlanningSummary(parsed.data.planningRequestId);
  return { ok: true, data: null };
}
