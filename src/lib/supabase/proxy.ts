import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { parsePublicSupabaseEnv } from "@/lib/env-public";
import { createCorrelationId, logOperation } from "@/server/operations/logger";
import type { Database } from "@/types/database";

export async function refreshSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const environment = parsePublicSupabaseEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  const client = createServerClient<Database>(
    environment.url,
    environment.publishableKey,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  try {
    await client.auth.getClaims();
  } catch {
    logOperation("auth.session_refresh_failed", {
      correlationId: createCorrelationId(),
      status: "signed_out",
      errorCode: "auth_session_invalid",
    });
  }
  return response;
}
