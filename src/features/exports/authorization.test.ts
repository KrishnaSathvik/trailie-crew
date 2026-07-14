import { beforeEach, describe, expect, it, vi } from "vitest";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { authorizePlanExport } from "./authorization";

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

describe("export authorization", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: "user" } }, error: null }),
      },
      rpc,
    } as never);
  });

  it("authorizes the exact selected version through the database quota", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(
      authorizePlanExport({
        roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a1",
        version: 1,
        type: "calendar",
      }),
    ).resolves.toBe("allowed");
    expect(rpc).toHaveBeenCalledWith("authorize_plan_export", {
      target_room_id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a1",
      target_version: 1,
      target_export_type: "calendar",
    });
  });

  it("maps quota and authorization failures to closed safe results", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Rate limited." },
    });
    await expect(
      authorizePlanExport({
        roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a1",
        version: 1,
        type: "print",
      }),
    ).resolves.toBe("rate_limited");
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Export not allowed." },
    });
    await expect(
      authorizePlanExport({
        roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a1",
        version: 1,
        type: "print",
      }),
    ).resolves.toBe("export_not_allowed");
  });
});
