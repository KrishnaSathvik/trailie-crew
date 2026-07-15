import { describe, expect, it, vi } from "vitest";

import { runAnonymousCleanup } from "./cleanup";

const candidates = [
  { userId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2" },
  { userId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3" },
];

describe("anonymous cleanup", () => {
  it("returns safe counts without deletion in dry-run mode", async () => {
    const dependencies = {
      claim: vi.fn().mockResolvedValue(true),
      list: vi.fn().mockResolvedValue(candidates),
      deleteUser: vi.fn(),
      record: vi.fn(),
    };
    await expect(
      runAnonymousCleanup(dependencies, {
        dryRun: true,
        batchSize: 25,
        retentionDays: 30,
      }),
    ).resolves.toEqual({ selected: 2, deleted: 0, failed: 0, dryRun: true });
    expect(dependencies.deleteUser).not.toHaveBeenCalled();
  });

  it("continues after one deletion failure and records only safe outcomes", async () => {
    const dependencies = {
      claim: vi.fn().mockResolvedValue(true),
      list: vi.fn().mockResolvedValue(candidates),
      deleteUser: vi
        .fn()
        .mockRejectedValueOnce(new Error("private provider detail"))
        .mockResolvedValueOnce(undefined),
      record: vi.fn().mockResolvedValue(undefined),
    };
    await expect(
      runAnonymousCleanup(dependencies, {
        dryRun: false,
        batchSize: 25,
        retentionDays: 30,
      }),
    ).resolves.toEqual({ selected: 2, deleted: 1, failed: 1, dryRun: false });
    expect(dependencies.record).toHaveBeenCalledTimes(2);
  });

  it("rejects overlap before listing candidates", async () => {
    const dependencies = {
      claim: vi.fn().mockResolvedValue(false),
      list: vi.fn(),
      deleteUser: vi.fn(),
      record: vi.fn(),
    };
    await expect(
      runAnonymousCleanup(dependencies, {
        dryRun: true,
        batchSize: 25,
        retentionDays: 30,
      }),
    ).rejects.toThrow("cleanup_already_running");
    expect(dependencies.list).not.toHaveBeenCalled();
  });
});
