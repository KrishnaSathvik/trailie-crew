import { NextResponse, type NextRequest } from "next/server";

import { refreshSupabaseSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const isShare = request.nextUrl.pathname.startsWith("/share/");
  const response = isShare
    ? NextResponse.next({ request })
    : await refreshSupabaseSession(request);
  if (isShare || /\/plans\/\d+\/print$/.test(request.nextUrl.pathname)) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Content-Type-Options", "nosniff");
  }
  return response;
}

export const config = {
  matcher: ["/trips/:path*", "/join/:path*", "/share/:path*"],
};
