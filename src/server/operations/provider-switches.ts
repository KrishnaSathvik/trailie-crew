import "server-only";

function enabledUnlessFalse(value: string | undefined) {
  return value?.trim().toLowerCase() !== "false";
}

export function generationProviderSwitches() {
  return {
    aiGenerationEnabled: enabledUnlessFalse(process.env.AI_GENERATION_ENABLED),
    travelProvidersEnabled: enabledUnlessFalse(
      process.env.TRAVEL_PROVIDERS_ENABLED,
    ),
  };
}
