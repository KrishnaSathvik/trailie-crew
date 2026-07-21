export const environmentGroups = [
  "PUBLIC",
  "SERVER-ONLY",
  "PROVIDER",
  "AUTH",
  "SECURITY",
  "OBSERVABILITY",
  "RECOVERY",
  "EMAIL",
  "DATABASE",
] as const;

export type EnvironmentGroup = (typeof environmentGroups)[number];

type EnvironmentRequirement = Readonly<{
  local: boolean;
  preview: boolean;
  production: boolean;
}>;

export type EnvironmentVariableContract = Readonly<{
  name: string;
  group: EnvironmentGroup;
  required: EnvironmentRequirement;
  exposure: "public" | "server-only";
  rotationOwner: string;
  validationRule: string;
  safeDefault: string | null;
  launchBlockedWhenMissing: boolean;
}>;

const nowhere = { local: false, preview: false, production: false } as const;
const hosted = { local: false, preview: true, production: true } as const;
const production = { local: false, preview: false, production: true } as const;
const everywhere = { local: true, preview: true, production: true } as const;

function variable(
  name: string,
  group: EnvironmentGroup,
  options: {
    required?: EnvironmentRequirement;
    exposure?: "public" | "server-only";
    rotationOwner?: string;
    validationRule: string;
    safeDefault?: string | null;
    launchBlockedWhenMissing?: boolean;
  },
): EnvironmentVariableContract {
  const required = options.required ?? nowhere;
  return {
    name,
    group,
    required,
    exposure: options.exposure ?? "server-only",
    rotationOwner: options.rotationOwner ?? "Engineering",
    validationRule: options.validationRule,
    safeDefault: options.safeDefault ?? null,
    launchBlockedWhenMissing:
      options.launchBlockedWhenMissing ?? required.production,
  };
}

const publicVariable = (
  name: string,
  group: EnvironmentGroup,
  options: Parameters<typeof variable>[2],
) => variable(name, group, { ...options, exposure: "public" });

/**
 * Non-secret deployment contract. Values live in each environment's secret
 * store; this inventory records ownership and validation without copying them.
 */
export const environmentVariableContract = [
  variable("APP_ENV", "SERVER-ONLY", {
    required: everywhere,
    validationRule: "local | preview | production",
    safeDefault: "local (off Vercel only)",
  }),
  variable("DEPLOYMENT_PROJECT_NAME", "SERVER-ONLY", {
    required: hosted,
    validationRule: "exact environment-specific Vercel project name",
  }),
  variable("VERCEL_ENV", "SERVER-ONLY", {
    required: hosted,
    rotationOwner: "Vercel platform",
    validationRule: "platform-set development | preview | production",
  }),
  variable("NODE_ENV", "SERVER-ONLY", {
    rotationOwner: "Runtime platform",
    validationRule: "platform-set development | test | production",
  }),
  variable("NEXT_RUNTIME", "SERVER-ONLY", {
    rotationOwner: "Next.js runtime",
    validationRule: "platform-set runtime identifier",
  }),
  variable("SUPABASE_PROJECT_REF", "DATABASE", {
    required: production,
    rotationOwner: "Database owner",
    validationRule:
      "exact promoted Production reference; prohibited in Preview until staging exists",
  }),
  variable("PRODUCTION_SUPABASE_PROJECT_REF", "DATABASE", {
    required: production,
    rotationOwner: "Database owner",
    validationRule: "exact promoted Production reference",
  }),
  publicVariable("NEXT_PUBLIC_SUPABASE_URL", "PUBLIC", {
    required: production,
    rotationOwner: "Database owner",
    validationRule:
      "Production project URL; prohibited in Preview until staging exists",
  }),
  publicVariable("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "PUBLIC", {
    required: production,
    rotationOwner: "Database owner",
    validationRule:
      "Production publishable key; prohibited in Preview until staging exists",
  }),
  publicVariable("NEXT_PUBLIC_SITE_URL", "PUBLIC", {
    required: everywhere,
    validationRule: "exact canonical origin for APP_ENV",
    safeDefault: "http://127.0.0.1:3000 (local only)",
  }),
  publicVariable("NEXT_PUBLIC_APP_URL", "PUBLIC", {
    validationRule: "HTTPS origin for trip entry links",
    safeDefault: "https://app.trailiecrew.com",
  }),
  variable("SUPABASE_SECRET_KEY", "DATABASE", {
    required: production,
    rotationOwner: "Database owner",
    validationRule:
      "server key with at least 20 characters; differs from public key",
  }),

  variable("OPENAI_API_KEY", "PROVIDER", {
    rotationOwner: "AI provider owner",
    validationRule: "required only when OpenAI generation is enabled",
  }),
  variable("AI_GENERATION_ENABLED", "PROVIDER", {
    required: everywhere,
    validationRule: "true | false; false for Production bootstrap",
    safeDefault: "false",
  }),
  variable("TRAILIE_AI_PROVIDER", "PROVIDER", {
    required: everywhere,
    validationRule: "openai | fake; fake forbidden in Production",
    safeDefault: "openai",
  }),
  ...[
    ["OPENAI_MODEL_CONVERSATION", "gpt-5.6-terra"],
    ["OPENAI_MODEL_FLAGSHIP", "gpt-5.6-sol"],
    ["OPENAI_PROMPT_VERSION", "trailie-focused-v1"],
    ["OPENAI_MEMORY_MODEL", "gpt-5.6-luna"],
    ["OPENAI_MEMORY_PROMPT_VERSION", "trailie-memory-v1"],
    ["OPENAI_MEMORY_SCHEMA_VERSION", "1"],
    ["OPENAI_PLANNING_MODEL", "gpt-5.6-sol"],
    ["OPENAI_PLANNING_PROMPT_VERSION", "trailie-planning-summary-v1"],
    ["OPENAI_PLANNING_SCHEMA_VERSION", "1"],
    ["OPENAI_ITINERARY_MODEL", "gpt-5.6-sol"],
    ["OPENAI_ITINERARY_PROMPT_VERSION", "trailie-itinerary-compact-v1"],
    ["OPENAI_ITINERARY_SCHEMA_VERSION", "1"],
    ["ITINERARY_VALIDATOR_VERSION", "trailie-itinerary-validator-v1"],
  ].map(([name, safeDefault]) =>
    variable(name, "PROVIDER", {
      validationRule: "non-empty versioned identifier",
      safeDefault,
    }),
  ),
  ...[
    ["OPENAI_TIMEOUT_MS", "30000"],
    ["OPENAI_MEMORY_TIMEOUT_MS", "20000"],
    ["OPENAI_PLANNING_TIMEOUT_MS", "90000"],
    ["OPENAI_ITINERARY_TIMEOUT_MS", "180000"],
  ].map(([name, safeDefault]) =>
    variable(name, "PROVIDER", {
      validationRule: "positive bounded integer milliseconds",
      safeDefault,
    }),
  ),
  variable("OPENAI_SAFETY_HMAC_SECRET", "SECURITY", {
    rotationOwner: "Security owner",
    validationRule: "at least 32 characters when AI is enabled",
  }),
  variable("MAPBOX_ACCESS_TOKEN", "PROVIDER", {
    rotationOwner: "Maps provider owner",
    validationRule: "server token restricted to approved APIs and origins",
  }),
  publicVariable("NEXT_PUBLIC_MAPBOX_MAP_TOKEN", "PUBLIC", {
    rotationOwner: "Maps provider owner",
    validationRule: "public token restricted to the exact environment hostname",
  }),
  variable("MAPBOX_GEOCODING_STORAGE_MODE", "PROVIDER", {
    required: everywhere,
    validationRule: "disabled | temporary | permanent; disabled at bootstrap",
    safeDefault: "disabled",
  }),
  variable("MAPBOX_MAPS_ENABLED", "PROVIDER", {
    required: everywhere,
    validationRule:
      "true | false; true in Production requires distinct pk. browser and server tokens, the mapbox renderer, non-permanent geocoding, and an enabled Mapbox provider",
    safeDefault: "false",
  }),
  variable("MAPBOX_MAP_ADAPTER", "PROVIDER", {
    validationRule:
      "mapbox | deterministic; only mapbox is permitted in Production",
    safeDefault: "mapbox",
  }),
  variable("MAPBOX_STYLE_URL", "PROVIDER", {
    validationRule: "approved mapbox:// style URL",
    safeDefault: "mapbox://styles/mapbox/standard",
  }),
  ...["NPS_API_KEY", "OPENWEATHER_API_KEY", "RIDB_API_KEY"].map((name) =>
    variable(name, "PROVIDER", {
      rotationOwner: "Travel provider owner",
      validationRule: "independently issued environment credential",
    }),
  ),
  variable("TRAVEL_PROVIDERS_ENABLED", "PROVIDER", {
    required: everywhere,
    validationRule: "true | false; false for Production bootstrap",
    safeDefault: "false",
  }),
  variable("TRAVEL_DISABLED_PROVIDERS", "PROVIDER", {
    validationRule: "comma-separated provider allowlist override",
    safeDefault: "all providers disabled when feature is off",
  }),
  variable("TRAVEL_PROVIDER_ROOM_DAILY_LIMIT", "PROVIDER", {
    validationRule: "integer 1..10000",
    safeDefault: "200",
  }),
  variable("TRAVEL_PROVIDER_GLOBAL_DAILY_LIMIT", "PROVIDER", {
    validationRule: "integer 1..1000000",
    safeDefault: "5000",
  }),

  publicVariable("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "PUBLIC", {
    required: production,
    rotationOwner: "Security owner",
    validationRule: "real site key restricted to app.trailiecrew.com",
  }),
  variable("TURNSTILE_SECRET_KEY", "SECURITY", {
    required: production,
    rotationOwner: "Security owner",
    validationRule: "server-only secret paired to Production site key",
  }),
  variable("TURNSTILE_EXPECTED_HOSTNAME", "SECURITY", {
    required: hosted,
    rotationOwner: "Security owner",
    validationRule: "exact hostname for APP_ENV; no wildcard",
  }),
  variable("SUPABASE_AUTH_CAPTCHA_ENABLED", "AUTH", {
    required: everywhere,
    validationRule: "true | false; true before Production exposure",
    safeDefault: "false",
  }),
  variable("CAPTCHA_TEST_MODE", "SECURITY", {
    validationRule: "true | false; forbidden in Production",
    safeDefault: "forbidden",
  }),
  publicVariable("NEXT_PUBLIC_CAPTCHA_TEST_MODE", "PUBLIC", {
    validationRule: "true | false; forbidden in Production",
    safeDefault: "forbidden",
  }),

  variable("RECOVERY_SECRET", "RECOVERY", {
    required: hosted,
    rotationOwner: "Operations owner",
    validationRule: "independent random secret, at least 32 characters",
  }),
  variable("CRON_SECRET", "RECOVERY", {
    required: hosted,
    rotationOwner: "Operations owner",
    validationRule: "independent random secret, at least 16 characters",
  }),
  variable("CLEANUP_SECRET", "RECOVERY", {
    rotationOwner: "Operations owner",
    validationRule: "independent random secret, at least 32 characters",
  }),
  variable("ANONYMOUS_RETENTION_DAYS", "RECOVERY", {
    validationRule: "integer 1..3650",
    safeDefault: "30",
  }),
  variable("ANONYMOUS_CLEANUP_BATCH_SIZE", "RECOVERY", {
    validationRule: "integer 1..100",
    safeDefault: "25",
  }),

  variable("OPERATIONAL_ALERTS_ENABLED", "OBSERVABILITY", {
    required: production,
    rotationOwner: "Operations owner",
    validationRule: "true | false; declared explicitly for every release",
    safeDefault: "false",
  }),
  variable("OPERATIONAL_ALERT_WEBHOOK_URL", "OBSERVABILITY", {
    rotationOwner: "Operations owner",
    validationRule:
      "HTTPS endpoint dedicated to Production; required only when OPERATIONAL_ALERTS_ENABLED=true",
  }),
  variable("OPERATIONAL_ALERT_WEBHOOK_SECRET", "OBSERVABILITY", {
    rotationOwner: "Operations owner",
    validationRule:
      "independent Production signing secret; required only when OPERATIONAL_ALERTS_ENABLED=true",
  }),
  variable("OPERATIONAL_ALERT_OWNER", "OBSERVABILITY", {
    rotationOwner: "Operations owner",
    validationRule:
      "named monitored owner or rotation; required only when OPERATIONAL_ALERTS_ENABLED=true",
  }),
  variable("ALERT_ENVIRONMENT", "OBSERVABILITY", {
    required: hosted,
    validationRule: "preview | production; must match APP_ENV",
  }),
  variable("ANALYTICS_WRITE_KEY", "OBSERVABILITY", {
    rotationOwner: "Analytics owner",
    validationRule: "Production-only stream; private content prohibited",
  }),

  variable("OUTBOUND_EMAIL_ENABLED", "EMAIL", {
    required: production,
    rotationOwner: "Support owner",
    validationRule: "true | false; declared explicitly for every release",
    safeDefault: "false",
  }),
  variable("EMAIL_PROVIDER_API_KEY", "EMAIL", {
    rotationOwner: "Support owner",
    validationRule:
      "Production credential with least privilege; required only when OUTBOUND_EMAIL_ENABLED=true",
  }),
  variable("EMAIL_FROM_ADDRESS", "EMAIL", {
    rotationOwner: "Support owner",
    validationRule:
      "verified trailiecrew.com sender; required only when OUTBOUND_EMAIL_ENABLED=true",
  }),
  variable("SUPPORT_EMAIL", "EMAIL", {
    required: production,
    rotationOwner: "Support owner",
    validationRule: "support@trailiecrew.com with verified delivery",
    safeDefault: "support@trailiecrew.com",
  }),
  variable("PRIVACY_EMAIL", "EMAIL", {
    required: production,
    rotationOwner: "Privacy owner",
    validationRule: "privacy@trailiecrew.com with verified delivery",
    safeDefault: "privacy@trailiecrew.com",
  }),
  variable("SECURITY_EMAIL", "EMAIL", {
    required: production,
    rotationOwner: "Security owner",
    validationRule: "security@trailiecrew.com with verified delivery",
    safeDefault: "security@trailiecrew.com",
  }),

  ...[
    "TRAVEL_CACHE_BYPASS",
    "VERCEL_AUTOMATION_BYPASS_SECRET",
    "HOSTED_ACCEPTANCE",
    "HOSTED_ACCEPTANCE_PROVIDER_FAULT",
    "HOSTED_ACCEPTANCE_PROVIDER_FAULT_ENABLED",
    "TRAILIE_FAKE_ITINERARY_SCENARIO",
    "TRAILIE_FAKE_REVISION_SCENARIO",
    "TRAILIE_FAKE_TRAVEL_SCENARIO",
    "ACCEPTED_DEMO_ROOM_ID",
    "DISPOSABLE_ROOM_ID",
    "HOSTED_BASE_URL",
    "INFRASTRUCTURE_ACCEPTANCE_OUTPUT",
    "INTERRUPTION_ACCEPTANCE_OUTPUT",
    "LOAD_ACCEPTANCE_OUTPUT",
    "LOAD_DATABASE_URL",
    "PLAYWRIGHT_BASE_URL",
    "PLAYWRIGHT_SKIP_WEBSERVER",
    "PROVIDER_ACCEPTANCE_OUTPUT",
    "QUOTA_ACCEPTANCE_OUTPUT",
    "REDEPLOY_HOSTED_ACCEPTANCE",
    "ROTATE_HOSTED_RECOVERY_SECRET",
    "VERCEL_ACCEPTANCE_ENV",
    "CRON_EVIDENCE",
    "TURNSTILE_EVIDENCE",
    "WAF_EVIDENCE",
  ].map((name) =>
    variable(name, "SECURITY", {
      validationRule: "Preview acceptance only; forbidden in Production",
      safeDefault: "forbidden",
    }),
  ),
  variable("VERCEL_PROJECT_NAME", "SERVER-ONLY", {
    validationRule: "exact target used only by deployment tooling",
  }),
  variable("CI", "SERVER-ONLY", {
    rotationOwner: "CI platform",
    validationRule: "platform-set boolean marker",
  }),
] satisfies readonly EnvironmentVariableContract[];
