"use server";

import {
  createTripInputSchema,
  joinTripInputSchema,
  type CreateTripResult,
  type JoinTripResult,
} from "@trailie/schemas";

import type { TripActionResult } from "@/features/trips/actions/action-types";
import { verifyCaptchaForAction } from "@/features/security/captcha-server";
import { CaptchaVerificationError } from "@/features/security/captcha";
import { mapTripOperationError } from "@/features/trips/errors/trip-errors";
import { mapCreateTripResult, mapJoinTripResult } from "@/lib/supabase/mappers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function fieldErrorsFromIssues(
  issues: { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  return Object.fromEntries(
    issues
      .filter((issue) => typeof issue.path[0] === "string")
      .map((issue) => [String(issue.path[0]), issue.message]),
  );
}

async function getAuthenticatedUser(
  client: Awaited<ReturnType<typeof createServerSupabaseClient>>,
) {
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
}

function captchaTokenFromInput(input: unknown) {
  if (!input || typeof input !== "object" || !("captchaToken" in input))
    return "";
  return typeof input.captchaToken === "string" ? input.captchaToken : "";
}

export async function createTripAction(
  input: unknown,
): Promise<TripActionResult<CreateTripResult>> {
  const parsed = createTripInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid_input",
      fieldErrors: fieldErrorsFromIssues(parsed.error.issues),
    };
  }

  try {
    const client = await createServerSupabaseClient();
    const user = await getAuthenticatedUser(client);
    if (!user) {
      return { ok: false, error: "authentication_required" };
    }
    const receiptId = await verifyCaptchaForAction({
      token: captchaTokenFromInput(input),
      purpose: "create_trip",
      user,
    });

    const { data, error } = await client.rpc("create_trip_protected", {
      trip_name: parsed.data.tripName,
      display_name: parsed.data.displayName,
      expected_travelers: parsed.data.expectedTravelers ?? null,
      target_receipt_id: receiptId,
    });

    if (error) {
      return { ok: false, error: mapTripOperationError(error) };
    }

    if (!data || data.length !== 1) {
      return { ok: false, error: "invalid_server_response" };
    }

    try {
      return { ok: true, data: mapCreateTripResult(data[0]) };
    } catch {
      return { ok: false, error: "invalid_server_response" };
    }
  } catch (error) {
    if (error instanceof CaptchaVerificationError)
      return { ok: false, error: error.code };
    if (
      error instanceof Error &&
      [
        "captcha_required",
        "captcha_invalid",
        "captcha_expired",
        "captcha_unavailable",
      ].includes(error.message)
    )
      return { ok: false, error: error.message as "captcha_required" };
    return { ok: false, error: mapTripOperationError(error) };
  }
}

export async function joinTripAction(
  input: unknown,
): Promise<TripActionResult<JoinTripResult>> {
  const parsed = joinTripInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid_input",
      fieldErrors: fieldErrorsFromIssues(parsed.error.issues),
    };
  }

  try {
    const client = await createServerSupabaseClient();
    const user = await getAuthenticatedUser(client);
    if (!user) {
      return { ok: false, error: "authentication_required" };
    }
    const receiptId = await verifyCaptchaForAction({
      token: captchaTokenFromInput(input),
      purpose: "join_trip",
      user,
    });

    const { data, error } = await client.rpc("join_trip_protected", {
      invite_value: parsed.data.inviteValue,
      display_name: parsed.data.displayName,
      target_receipt_id: receiptId,
    });

    if (error) {
      return { ok: false, error: mapTripOperationError(error) };
    }

    if (!data || data.length !== 1) {
      return { ok: false, error: "invalid_server_response" };
    }

    try {
      return { ok: true, data: mapJoinTripResult(data[0]) };
    } catch {
      return { ok: false, error: "invalid_server_response" };
    }
  } catch (error) {
    if (error instanceof CaptchaVerificationError)
      return { ok: false, error: error.code };
    if (
      error instanceof Error &&
      [
        "captcha_required",
        "captcha_invalid",
        "captcha_expired",
        "captcha_unavailable",
      ].includes(error.message)
    )
      return { ok: false, error: error.message as "captcha_required" };
    return { ok: false, error: mapTripOperationError(error) };
  }
}
