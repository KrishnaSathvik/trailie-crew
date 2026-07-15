import { beforeEach, describe, expect, it, vi } from "vitest";

import { runDefaultAnonymousCleanup } from "@/server/lifecycle/cleanup";
import { GET, POST } from "./route";

vi.mock("@/server/lifecycle/cleanup", () => ({
  runDefaultAnonymousCleanup: vi.fn(),
}));

const secret = "c".repeat(48);

describe("anonymous cleanup route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CLEANUP_SECRET", secret);
    vi.stubEnv("ANONYMOUS_RETENTION_DAYS", "30");
    vi.stubEnv("ANONYMOUS_CLEANUP_BATCH_SIZE", "25");
  });

  it("rejects unauthenticated requests before listing users", async () => {
    const response = await GET(
      new Request("https://preview.example/api/internal/anonymous-cleanup"),
    );
    expect(response.status).toBe(401);
    expect(runDefaultAnonymousCleanup).not.toHaveBeenCalled();
  });

  it("supports a protected Preview dry-run with safe counts", async () => {
    vi.mocked(runDefaultAnonymousCleanup).mockResolvedValue({
      selected: 3,
      deleted: 0,
      failed: 0,
      dryRun: true,
    });
    const response = await POST(
      new Request(
        "https://preview.example/api/internal/anonymous-cleanup?dryRun=true",
        { method: "POST", headers: { authorization: `Bearer ${secret}` } },
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      counts: { selected: 3, deleted: 0, failed: 0 },
      dryRun: true,
    });
  });

  it("runs scheduled GET cleanup in destructive mode", async () => {
    vi.mocked(runDefaultAnonymousCleanup).mockResolvedValue({
      selected: 2,
      deleted: 2,
      failed: 0,
      dryRun: false,
    });
    const response = await GET(
      new Request("https://production.example/api/internal/anonymous-cleanup", {
        headers: { authorization: `Bearer ${secret}` },
      }),
    );
    expect(response.status).toBe(200);
    expect(runDefaultAnonymousCleanup).toHaveBeenCalledWith({
      dryRun: false,
      batchSize: 25,
      retentionDays: 30,
    });
  });
});
