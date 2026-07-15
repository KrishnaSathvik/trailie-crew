import "server-only";

import { z } from "zod";

import {
  planShareModeSchema,
  publicSharedItinerarySchema,
} from "@trailie/schemas";
import { createAdminSupabaseClient } from "@/server/supabase/admin";
import { hashShareToken } from "./token";

const verificationSchema = z
  .object({
    itinerary: publicSharedItinerarySchema,
    snapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
    mode: planShareModeSchema.exclude(["private"]),
    expiresAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

function withRequiredPublicHeadings(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const envelope = value as Record<string, unknown>;
  if (
    !envelope.itinerary ||
    typeof envelope.itinerary !== "object" ||
    Array.isArray(envelope.itinerary)
  )
    return value;
  const itinerary = envelope.itinerary as Record<string, unknown>;
  return {
    ...envelope,
    itinerary: {
      ...itinerary,
      title:
        typeof itinerary.title === "string" && itinerary.title.trim()
          ? itinerary.title
          : "Shared trip itinerary",
      destinationSummary:
        typeof itinerary.destinationSummary === "string" &&
        itinerary.destinationSummary.trim()
          ? itinerary.destinationSummary
          : "Trip details shared by the host.",
    },
  };
}

export async function verifyPlanShareToken(token: string) {
  let tokenHash: string;
  try {
    tokenHash = hashShareToken(token);
  } catch {
    return null;
  }
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("verify_plan_share_token_hash", {
    target_token_hash: tokenHash,
  });
  if (error || data === null) return null;
  const result = verificationSchema.safeParse(withRequiredPublicHeadings(data));
  return result.success ? result.data : null;
}
