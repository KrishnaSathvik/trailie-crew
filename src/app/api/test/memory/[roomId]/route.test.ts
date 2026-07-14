import { afterEach, describe, expect, it, vi } from "vitest";

import { createAdminSupabaseClient } from "@/server/supabase/admin";
import { GET } from "./route";

vi.mock("@/server/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(),
}));
vi.mock("@/features/memory/worker", () => ({
  drainMemoryExtraction: vi.fn(),
}));

const roomId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2";

describe("test-only memory inspection", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is inert in production even with the test secret", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TRAILIE_TEST_MEMORY_SECRET", "secret");
    const response = await GET(
      new Request(`http://localhost/api/test/memory/${roomId}`, {
        headers: { "x-trailie-test-secret": "secret" },
      }),
      { params: Promise.resolve({ roomId }) },
    );
    expect(response.status).toBe(404);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("requires the development secret before opening an admin client", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TRAILIE_TEST_MEMORY_SECRET", "secret");
    const response = await GET(
      new Request(`http://localhost/api/test/memory/${roomId}`),
      { params: Promise.resolve({ roomId }) },
    );
    expect(response.status).toBe(404);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });
});
