import "server-only";

import { z } from "zod";

import {
  planShareModeSchema,
  publicSharedItinerarySchema,
} from "@trailie/schemas";
import { createAdminSupabaseClient } from "@/server/supabase/admin";
import { createCorrelationId, logOperation } from "@/server/operations/logger";
import { hashShareToken } from "./token";

const verificationSchema = z
  .object({
    itinerary: publicSharedItinerarySchema,
    snapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
    mode: planShareModeSchema.exclude(["private"]),
    expiresAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

function withRequiredPublicLabels(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const envelope = value as Record<string, unknown>;
  if (
    !envelope.itinerary ||
    typeof envelope.itinerary !== "object" ||
    Array.isArray(envelope.itinerary)
  )
    return value;
  const itinerary = envelope.itinerary as Record<string, unknown>;
  const days = Array.isArray(itinerary.days)
    ? itinerary.days.map((day) => {
        if (!day || typeof day !== "object" || Array.isArray(day)) return day;
        const publicDay = day as Record<string, unknown>;
        const items = Array.isArray(publicDay.items)
          ? publicDay.items.map((item) => {
              if (!item || typeof item !== "object" || Array.isArray(item))
                return item;
              const publicItem = item as Record<string, unknown>;
              return {
                ...publicItem,
                title:
                  typeof publicItem.title === "string" &&
                  publicItem.title.trim()
                    ? publicItem.title
                    : "Itinerary item",
              };
            })
          : publicDay.items;
        return {
          ...publicDay,
          title:
            typeof publicDay.title === "string" && publicDay.title.trim()
              ? publicDay.title
              : "Itinerary day",
          items,
        };
      })
    : itinerary.days;
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
      days,
    },
  };
}

export async function verifyPlanShareToken(token: string) {
  const correlationId = createCorrelationId();
  const startedAt = Date.now();
  let tokenHash: string;
  try {
    tokenHash = hashShareToken(token);
  } catch {
    logOperation("share.verification_failed", {
      correlationId,
      category: "invalid_format",
      latencyMs: Date.now() - startedAt,
    });
    return null;
  }
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("verify_plan_share_token_hash", {
    target_token_hash: tokenHash,
  });
  if (error || data === null) {
    logOperation("share.verification_failed", {
      correlationId,
      category: "unavailable_or_revoked",
      latencyMs: Date.now() - startedAt,
    });
    return null;
  }
  const result = verificationSchema.safeParse(withRequiredPublicLabels(data));
  if (!result.success) {
    logOperation("share.verification_failed", {
      correlationId,
      category: "invalid_snapshot",
      latencyMs: Date.now() - startedAt,
    });
    return null;
  }
  logOperation("share.verified", {
    correlationId,
    status: "ok",
    latencyMs: Date.now() - startedAt,
  });
  return result.data;
}
