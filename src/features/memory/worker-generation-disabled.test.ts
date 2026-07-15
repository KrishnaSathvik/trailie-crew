import { beforeEach, describe, expect, it, vi } from "vitest";

import { createOpenAIMemoryExtractionProvider } from "./openai-provider";
import { createFakeMemoryExtractionProvider } from "./provider";
import { drainMemoryExtraction } from "./worker";

vi.mock("@/server/env", () => ({
  parseOpenAIEnv: vi.fn(() => ({ generationEnabled: false })),
  requireAiGeneration: vi.fn(() => {
    throw new Error("ai_generation_disabled");
  }),
}));
vi.mock("./openai-provider", () => ({
  createOpenAIMemoryExtractionProvider: vi.fn(),
}));
vi.mock("./provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./provider")>()),
  createFakeMemoryExtractionProvider: vi.fn(),
}));

describe("memory generation emergency switch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stops before constructing any provider", async () => {
    await expect(drainMemoryExtraction("message-id")).rejects.toThrow(
      "ai_generation_disabled",
    );
    expect(createOpenAIMemoryExtractionProvider).not.toHaveBeenCalled();
    expect(createFakeMemoryExtractionProvider).not.toHaveBeenCalled();
  });
});
