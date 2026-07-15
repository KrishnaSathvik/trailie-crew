"use client";

import { createBrowserClient } from "@supabase/ssr";

import { parsePublicSupabaseEnv } from "@/lib/env-public";
import type { Database } from "@/types/database";

export function createBrowserSupabaseClient() {
  const environment = parsePublicSupabaseEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  return createBrowserClient<Database>(
    environment.url,
    environment.publishableKey,
  );
}
