import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { refreshSupabaseSession } from "./proxy";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));

describe("Supabase session refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "sb_publishable_example-value-long-enough",
    );
  });

  it("treats an invalid refresh token as signed out without leaking the provider error", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.mocked(createServerClient).mockReturnValue({
      auth: {
        getClaims: vi
          .fn()
          .mockRejectedValue(
            new Error("Invalid Refresh Token: Refresh Token Not Found"),
          ),
      },
    } as never);
    const request = new NextRequest("https://preview.example/trips/create");
    await expect(refreshSupabaseSession(request)).resolves.toBeDefined();
    const serialized = String(info.mock.calls[0]?.[0]);
    expect(serialized).toContain("auth.session_refresh_failed");
    expect(serialized).toContain("auth_session_invalid");
    expect(serialized).not.toContain("Invalid Refresh Token");
  });
});
