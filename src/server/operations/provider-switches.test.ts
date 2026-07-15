import { afterEach, describe, expect, it, vi } from "vitest";
import { generationProviderSwitches } from "./provider-switches";

describe("server provider switches", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("defaults on and can fail closed without browser input", () => {
    expect(generationProviderSwitches()).toEqual({
      aiGenerationEnabled: true,
      travelProvidersEnabled: true,
    });
    vi.stubEnv("AI_GENERATION_ENABLED", "false");
    vi.stubEnv("TRAVEL_PROVIDERS_ENABLED", "FALSE");
    expect(generationProviderSwitches()).toEqual({
      aiGenerationEnabled: false,
      travelProvidersEnabled: false,
    });
  });
});
