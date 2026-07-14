import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { refreshSupabaseSession } from "@/lib/supabase/proxy";
import { proxy } from "./proxy";

vi.mock("@/lib/supabase/proxy", () => ({
  refreshSupabaseSession: vi.fn(),
}));

describe("security response proxy", () => {
  beforeEach(() => {
    vi.mocked(refreshSupabaseSession).mockResolvedValue(NextResponse.next());
  });

  it("forces non-cacheable, non-indexable responses for token and print routes", async () => {
    for (const path of [
      "/share/opaque-token",
      "/trips/00000000-0000-4000-8000-000000000001/plans/1/print",
    ]) {
      const response = await proxy(new NextRequest(`http://localhost${path}`));
      expect(response.headers.get("cache-control")).toBe(
        "private, no-store, max-age=0",
      );
      expect(response.headers.get("x-robots-tag")).toBe(
        "noindex, nofollow, noarchive",
      );
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    }
  });
});
