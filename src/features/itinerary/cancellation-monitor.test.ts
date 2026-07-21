import { describe, expect, it, vi } from "vitest";
import { withCancellationPolling } from "./cancellation-monitor";

describe("itinerary cancellation monitor", () => {
  it("aborts active provider work when cancellation becomes durable", async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const work = vi.fn(
      (signal: AbortSignal) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    );
    const running = withCancellationPolling({
      intervalMs: 100,
      isCancelled: async () => cancelled,
      run: work,
    });
    const stopped = expect(running).rejects.toMatchObject({
      name: "AbortError",
    });
    cancelled = true;
    await vi.advanceTimersByTimeAsync(100);

    await stopped;
    expect(work).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("cleans up polling after successful completion", async () => {
    vi.useFakeTimers();
    const isCancelled = vi.fn().mockResolvedValue(false);
    await expect(
      withCancellationPolling({
        intervalMs: 100,
        isCancelled,
        run: async () => "done",
      }),
    ).resolves.toBe("done");
    await vi.advanceTimersByTimeAsync(500);
    expect(isCancelled).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
