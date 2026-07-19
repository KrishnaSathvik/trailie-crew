import "server-only";

import {
  travelCapabilitySchema,
  travelProviderResponseSchema,
  type TravelProviderCache,
  type TravelProviderCacheEntry,
} from "@trailie/travel-tools";
import { z } from "zod";

import { createAdminSupabaseClient } from "@/server/supabase/admin";
import type { Json } from "@/types/database";

type RpcClient = Readonly<{
  rpc(
    name: string,
    parameters: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}>;

const cacheEnvelopeSchema = z
  .object({
    response: travelProviderResponseSchema,
    expiresAt: z.iso.datetime({ offset: true }),
    staleUntil: z.iso.datetime({ offset: true }).nullable(),
    negative: z.boolean(),
  })
  .strict();

function identity(key: string) {
  const match = key.match(
    /^travel:2:([a-zA-Z0-9_-]{1,40}):([a-zA-Z0-9._-]{1,80}):([a-z_]{1,80}):[a-f0-9]{64}$/,
  );
  if (!match) throw new Error("invalid_travel_cache_key");
  return {
    environment: match[1],
    provider: match[2],
    capability: travelCapabilitySchema.parse(match[3]),
  };
}

export function createTravelProviderCacheRepository(
  client: RpcClient = createAdminSupabaseClient() as unknown as RpcClient,
): TravelProviderCache {
  return {
    async get(key) {
      const parsed = identity(key);
      const { data, error } = await client.rpc("get_travel_cache_response", {
        target_environment: parsed.environment,
        target_provider: parsed.provider,
        target_capability: parsed.capability,
        target_cache_key: key,
      });
      if (error) throw new Error("travel_cache_read_failed");
      if (data === null) return null;
      return cacheEnvelopeSchema.parse(data);
    },
    async put(key, entry: TravelProviderCacheEntry) {
      const parsed = identity(key);
      const normalized = cacheEnvelopeSchema.parse(entry);
      const { data, error } = await client.rpc("put_travel_cache_response", {
        target_environment: parsed.environment,
        target_provider: parsed.provider,
        target_capability: parsed.capability,
        target_cache_key: key,
        target_response: normalized.response as unknown as Json,
        target_expires_at: normalized.expiresAt,
        target_stale_until: normalized.staleUntil,
        target_negative_result: normalized.negative,
      });
      if (error || typeof data !== "string")
        throw new Error("travel_cache_write_failed");
    },
  };
}
