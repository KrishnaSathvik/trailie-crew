import { describe, expect, it } from "vitest";

import { productionSecurityHeaders } from "./security-headers";

describe("Production response headers", () => {
  const headers = Object.fromEntries(
    productionSecurityHeaders("https://abcdefghijklmnopqrst.supabase.co").map(
      ({ key, value }) => [key, value],
    ),
  );

  it("denies framing, MIME sniffing, and broad referrer disclosure", () => {
    expect(headers["Content-Security-Policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("uses exact trusted Supabase and Turnstile origins", () => {
    expect(headers["Content-Security-Policy"]).toContain(
      "https://abcdefghijklmnopqrst.supabase.co",
    );
    expect(headers["Content-Security-Policy"]).toContain(
      "wss://abcdefghijklmnopqrst.supabase.co",
    );
    expect(headers["Content-Security-Policy"]).toContain(
      "https://challenges.cloudflare.com",
    );
    expect(headers["Content-Security-Policy"]).not.toContain(
      "https://*.supabase.co",
    );
  });
});
