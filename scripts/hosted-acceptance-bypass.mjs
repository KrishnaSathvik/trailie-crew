export function selectGeneratedAutomationBypass(existing, generated) {
  const existingSecrets = new Set(Object.keys(existing ?? {}));
  const bypass = Object.entries(generated ?? {}).find(
    ([secret, value]) =>
      !existingSecrets.has(secret) && value?.scope === "automation-bypass",
  );
  if (!bypass)
    throw new Error("Temporary Vercel automation bypass is unavailable.");
  return bypass;
}
