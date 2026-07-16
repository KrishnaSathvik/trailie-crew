type EnvironmentVariable = {
  key: string;
  type: string;
  value?: unknown;
};

type EvidenceStatus = "pass" | "fail" | "not_run";

type InfrastructureAcceptanceInput = {
  environment: string;
  envVariables: readonly EnvironmentVariable[];
  protection: {
    ssoDeploymentType: string | null;
    bypassCount: number;
  };
  firewall: { configured: boolean; ruleCount: number };
  cronPaths: readonly string[];
  evidence: {
    turnstile: EvidenceStatus;
    cron: EvidenceStatus;
    waf: EvidenceStatus;
  };
};

const turnstileKeys = [
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "TURNSTILE_SECRET_KEY",
  "SUPABASE_AUTH_CAPTCHA_ENABLED",
] as const;
const captchaTestModeKeys = [
  "CAPTCHA_TEST_MODE",
  "NEXT_PUBLIC_CAPTCHA_TEST_MODE",
] as const;
const cronSecretKeys = ["CRON_SECRET", "RECOVERY_SECRET", "CLEANUP_SECRET"];

export function parseFirstJsonValue(output: string): unknown {
  const objectStart = output.indexOf("{");
  const arrayStart = output.indexOf("[");
  const start =
    objectStart < 0
      ? arrayStart
      : arrayStart < 0
        ? objectStart
        : Math.min(objectStart, arrayStart);
  if (start < 0) throw new Error("infrastructure_inventory_invalid_json");

  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let index = start; index < output.length; index += 1) {
    const character = output[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{" || character === "[") stack.push(character);
    else if (character === "}" || character === "]") {
      stack.pop();
      if (stack.length === 0) return JSON.parse(output.slice(start, index + 1));
    }
  }
  throw new Error("infrastructure_inventory_invalid_json");
}

export function buildInfrastructureAcceptanceReport(
  input: InfrastructureAcceptanceInput,
) {
  const envKeys = new Set(input.envVariables.map(({ key }) => key));
  const environmentVariables = input.envVariables
    .map(({ key, type }) => ({ key, type }))
    .sort((left, right) => left.key.localeCompare(right.key));
  const testModeVariablesPresent = captchaTestModeKeys.some((key) =>
    envKeys.has(key),
  );
  const turnstileConfigured =
    turnstileKeys.every((key) => envKeys.has(key)) && !testModeVariablesPresent;
  const protectedEnvironment =
    input.protection.ssoDeploymentType === "all_except_custom_domains" &&
    input.protection.bypassCount === 0;
  const cronConfigured =
    input.cronPaths.length > 0 &&
    cronSecretKeys.some((key) => envKeys.has(key));
  const turnstileAccepted =
    protectedEnvironment &&
    turnstileConfigured &&
    input.evidence.turnstile === "pass";
  const cronAccepted =
    protectedEnvironment && cronConfigured && input.evidence.cron === "pass";
  const wafAccepted =
    input.firewall.configured && input.evidence.waf === "pass";
  const accepted = turnstileAccepted && cronAccepted && wafAccepted;

  return {
    schemaVersion: "1" as const,
    environment: input.environment,
    environmentVariables,
    protected: protectedEnvironment,
    protection: {
      ssoDeploymentType: input.protection.ssoDeploymentType,
      bypassCount: input.protection.bypassCount,
    },
    turnstile: {
      configured: turnstileConfigured,
      testModeVariablesPresent,
      evidence: input.evidence.turnstile,
      accepted: turnstileAccepted,
    },
    cron: {
      configured: cronConfigured,
      paths: [...input.cronPaths],
      evidence: input.evidence.cron,
      accepted: cronAccepted,
    },
    waf: {
      configured: input.firewall.configured,
      ruleCount: input.firewall.ruleCount,
      evidence: input.evidence.waf,
      accepted: wafAccepted,
    },
    verdict: accepted ? ("accepted" as const) : ("blocked" as const),
  };
}
