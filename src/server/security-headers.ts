type Header = Readonly<{ key: string; value: string }>;

function trustedSupabaseOrigins(supabaseUrl: string) {
  const url = new URL(supabaseUrl);
  if (url.protocol !== "https:")
    throw new Error("Hosted Supabase origin must use HTTPS.");
  return [`https://${url.host}`, `wss://${url.host}`];
}

export function productionSecurityHeaders(supabaseUrl: string): Header[] {
  const [supabaseHttps, supabaseWss] = trustedSupabaseOrigins(supabaseUrl);
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https://api.mapbox.com https://*.tiles.mapbox.com",
    `connect-src 'self' ${supabaseHttps} ${supabaseWss} https://api.mapbox.com https://events.mapbox.com https://challenges.cloudflare.com`,
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "upgrade-insecure-requests",
  ].join("; ");

  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy },
    { key: "Strict-Transport-Security", value: "max-age=31536000" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value:
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
}
