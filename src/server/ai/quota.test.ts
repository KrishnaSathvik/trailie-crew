import { afterEach, describe, expect, it, vi } from "vitest";

import { AiQuotaError, createAiQuotaController, runWithAiQuota } from "./quota";

const subject = {
  userId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
  roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
};

function dependencies() {
  return {
    reserve: vi.fn().mockResolvedValue(undefined),
    reconcile: vi.fn().mockResolvedValue(undefined),
    createId: () => "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4",
  };
}

describe("AI quota controller", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("honors the server-only emergency environment switch before provider setup", () => {
    vi.stubEnv("AI_GENERATION_ENABLED", "false");
    const provider = vi.fn();
    expect(() =>
      runWithAiQuota(
        {
          ...subject,
          workflow: "focused_answer",
          model: "model",
          estimatedTokens: 100,
        },
        provider,
      ),
    ).toThrow(new AiQuotaError("ai_disabled"));
    expect(provider).not.toHaveBeenCalled();
  });
  it("reserves before calling a provider and reconciles actual usage", async () => {
    const deps = dependencies();
    const provider = vi.fn().mockResolvedValue({
      usage: { totalTokens: 812 },
      value: "ok",
    });
    const controller = createAiQuotaController(deps);
    await expect(
      controller.run(
        {
          ...subject,
          workflow: "focused_answer",
          model: "model",
          estimatedTokens: 1200,
        },
        provider,
      ),
    ).resolves.toMatchObject({ value: "ok" });
    expect(deps.reserve.mock.invocationCallOrder[0]).toBeLessThan(
      provider.mock.invocationCallOrder[0],
    );
    expect(deps.reconcile).toHaveBeenCalledWith(
      "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4",
      812,
      "used",
    );
  });

  it("releases a reservation when the provider fails", async () => {
    const deps = dependencies();
    const controller = createAiQuotaController(deps);
    await expect(
      controller.run(
        {
          ...subject,
          workflow: "planning_summary",
          model: "model",
          estimatedTokens: 4000,
        },
        async () => {
          throw new Error("provider failed");
        },
      ),
    ).rejects.toThrow("provider failed");
    expect(deps.reconcile).toHaveBeenCalledWith(
      "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4",
      0,
      "released",
    );
  });

  it("maps database quota failures to safe codes without a provider call", async () => {
    const deps = dependencies();
    deps.reserve.mockRejectedValue(new Error("room_ai_limit_reached"));
    const provider = vi.fn();
    await expect(
      createAiQuotaController(deps).run(
        {
          ...subject,
          workflow: "itinerary_generation",
          model: "model",
          estimatedTokens: 8000,
        },
        provider,
      ),
    ).rejects.toEqual(new AiQuotaError("room_ai_limit_reached"));
    expect(provider).not.toHaveBeenCalled();
  });
});
