import { describe, expect, it, vi } from "vitest";

import { runStructuredRuntime } from "./structured-runtime";

describe("structured runtime telemetry", () => {
  it("records a successful atomic workflow without private content", async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    await expect(
      runStructuredRuntime(
        {
          requestId: "8b000000-0000-4000-8000-000000000010",
          roomId: "8b000000-0000-4000-8000-000000000011",
          responseType: "full_itinerary",
          intent: "create_itinerary",
          complexity: "full_itinerary",
          selectedModelRoute: "reasoning_planning",
          toolClasses: ["nps", "ridb", "weather", "maps_geocoding"],
        },
        async () => "published",
        { record },
      ),
    ).resolves.toBe("published");
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        responseType: "full_itinerary",
        requestComplexity: "full_itinerary",
        successState: "success",
      }),
    );
    expect(JSON.stringify(record.mock.calls)).not.toMatch(
      /hiddenPrompt|conversationBody|privateMemory|inviteToken/i,
    );
  });

  it("records cancellation distinctly and rethrows the safe failure", async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const failure = Object.assign(new Error("workflow_cancelled"), {
      code: "workflow_cancelled",
    });
    await expect(
      runStructuredRuntime(
        {
          requestId: "8b000000-0000-4000-8000-000000000012",
          roomId: "8b000000-0000-4000-8000-000000000013",
          responseType: "small_revision",
          intent: "itinerary_revision",
          complexity: "small_revision",
          selectedModelRoute: "fast",
          toolClasses: ["database_read", "database_write"],
        },
        async () => {
          throw failure;
        },
        { record },
      ),
    ).rejects.toBe(failure);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        successState: "cancelled",
        cancellationReason: "user_stop",
      }),
    );
  });
});
