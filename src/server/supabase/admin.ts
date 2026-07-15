import "server-only";

import { createClient } from "@supabase/supabase-js";

import { parseServerSupabaseEnv } from "@/server/env";
import type { Database } from "@/types/database";

export function createAdminSupabaseClient() {
  const environment = parseServerSupabaseEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  });

  return createClient<Database>(environment.url, environment.secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
