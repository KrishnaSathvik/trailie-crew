"use server";
import { z } from "zod";
import { tripPlanViewSchema, type TripPlanView } from "@trailie/schemas";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { scheduleItineraryGeneration } from "./scheduler";

export type ItineraryActionError =
  | "plan_generation_not_allowed"
  | "approved_summary_required"
  | "approved_summary_stale"
  | "plan_generation_active"
  | "plan_generation_failed"
  | "invalid_itinerary_response"
  | "validation_failed"
  | "validation_blocked"
  | "repair_failed"
  | "tool_unavailable"
  | "route_unavailable"
  | "evidence_stale"
  | "publication_not_allowed"
  | "plan_not_found"
  | "membership_required"
  | "permission_denied"
  | "model_timeout"
  | "model_rate_limited"
  | "model_unavailable"
  | "retry_exhausted"
  | "unknown_error";
type Result<T> =
  { ok: true; data: T } | { ok: false; error: ItineraryActionError };

async function client() {
  const value = await createServerSupabaseClient();
  const { data, error } = await value.auth.getUser();
  return !error && data.user ? value : null;
}

function map(error: { message?: string } | null): ItineraryActionError {
  const message = error?.message ?? "";
  if (/retry exhausted/i.test(message)) return "retry_exhausted";
  if (/stale/i.test(message)) return "approved_summary_stale";
  if (/approved summary/i.test(message)) return "approved_summary_required";
  if (/membership|authentication/i.test(message)) return "membership_required";
  if (/publication/i.test(message)) return "publication_not_allowed";
  if (/not found/i.test(message)) return "plan_not_found";
  if (/not allowed/i.test(message)) return "plan_generation_not_allowed";
  return "unknown_error";
}

export async function retryItineraryAction(
  input: unknown,
): Promise<Result<{ id: string; status: string; version: number }>> {
  const parsed = z
    .object({ tripPlanId: z.uuid(), participantId: z.uuid() })
    .strict()
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "unknown_error" };
  const supabase = await client();
  if (!supabase) return { ok: false, error: "membership_required" };
  const { data, error } = await supabase.rpc("retry_itinerary_generation", {
    target_trip_plan_id: parsed.data.tripPlanId,
    participant_id: parsed.data.participantId,
  });
  if (error) return { ok: false, error: map(error) };
  const result = z
    .object({ id: z.uuid(), status: z.string(), version: z.number().int() })
    .strict()
    .parse(data);
  scheduleItineraryGeneration(result.id);
  return { ok: true, data: result };
}

export async function generateItineraryAction(
  input: unknown,
): Promise<
  Result<{ id: string; status: string; version: number; reused: boolean }>
> {
  const parsed = z
    .object({ planningRequestId: z.uuid(), participantId: z.uuid() })
    .strict()
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "unknown_error" };
  const supabase = await client();
  if (!supabase) return { ok: false, error: "membership_required" };
  const { data, error } = await supabase.rpc("create_itinerary_generation", {
    target_planning_request_id: parsed.data.planningRequestId,
    participant_id: parsed.data.participantId,
  });
  if (error) return { ok: false, error: map(error) };
  const result = z
    .object({
      id: z.uuid(),
      status: z.string(),
      version: z.number().int().positive(),
      created: z.boolean(),
    })
    .passthrough()
    .parse(data);
  scheduleItineraryGeneration(result.id);
  return {
    ok: true,
    data: {
      id: result.id,
      status: result.status,
      version: result.version,
      reused: !result.created,
    },
  };
}

export async function getTripPlanAction(
  roomId: string,
): Promise<Result<TripPlanView | null>> {
  if (!z.uuid().safeParse(roomId).success)
    return { ok: false, error: "unknown_error" };
  const supabase = await client();
  if (!supabase) return { ok: false, error: "membership_required" };
  const { data, error } = await supabase.rpc("get_trip_plan", {
    target_room_id: roomId,
  });
  if (error) return { ok: false, error: map(error) };
  const plan = tripPlanViewSchema.nullable().safeParse(data);
  return plan.success
    ? { ok: true, data: plan.data }
    : { ok: false, error: "unknown_error" };
}

export async function cancelItineraryAction(
  input: unknown,
): Promise<Result<{ id: string; status: "stopped" }>> {
  const parsed = z
    .object({ tripPlanId: z.uuid(), participantId: z.uuid() })
    .strict()
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "unknown_error" };
  const supabase = await client();
  if (!supabase) return { ok: false, error: "membership_required" };
  const { data, error } = await supabase.rpc("cancel_itinerary_generation", {
    target_trip_plan_id: parsed.data.tripPlanId,
    target_participant_id: parsed.data.participantId,
  });
  if (error) return { ok: false, error: map(error) };
  const result = z
    .object({ id: z.uuid(), status: z.literal("stopped") })
    .strict()
    .parse(data);
  return { ok: true, data: result };
}
