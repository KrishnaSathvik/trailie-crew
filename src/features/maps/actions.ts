"use server";

import { z } from "zod";
import type { ItineraryMapProjectionV1 } from "@trailie/schemas";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseMapConfiguration, type MapConfiguration } from "./config";
import { loadMemberMapProjection } from "./repository";

type Result =
  | {
      ok: true;
      data: {
        projection: ItineraryMapProjectionV1;
        configuration: MapConfiguration;
      };
    }
  | {
      ok: false;
      error:
        "membership_required" | "projection_unavailable" | "invalid_request";
    };

function environment() {
  return {
    MAPBOX_MAPS_ENABLED: process.env.MAPBOX_MAPS_ENABLED,
    NEXT_PUBLIC_MAPBOX_MAP_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_MAP_TOKEN,
    MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN,
    MAPBOX_STYLE_URL: process.env.MAPBOX_STYLE_URL,
    MAPBOX_MAP_ADAPTER: process.env.MAPBOX_MAP_ADAPTER,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };
}

export async function getPlanMapProjectionAction(
  roomId: string,
  version: number,
): Promise<Result> {
  const parsed = z
    .object({
      roomId: z.uuid(),
      version: z.number().int().positive(),
    })
    .safeParse({ roomId, version });
  if (!parsed.success) return { ok: false, error: "invalid_request" };
  const client = await createServerSupabaseClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return { ok: false, error: "membership_required" };
  try {
    return {
      ok: true,
      data: {
        projection: await loadMemberMapProjection(
          client as unknown as Parameters<typeof loadMemberMapProjection>[0],
          parsed.data,
        ),
        configuration: parseMapConfiguration(environment()),
      },
    };
  } catch {
    return { ok: false, error: "projection_unavailable" };
  }
}

export async function getServerMapConfiguration() {
  return parseMapConfiguration(environment());
}
