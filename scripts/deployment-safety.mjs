export const PRODUCTION_SUPABASE_PROJECT_REF = "tkccksmiuucdstvvfglp";
export const PREVIEW_VERCEL_PROJECT_NAME = "trailie-crew-preview";
export const PRODUCTION_VERCEL_PROJECT_NAME = "trailie-crew-production";

function requireValue(source, name) {
  const value = source[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function assertHostedAcceptanceTarget(source) {
  void source;
  throw new Error(
    "Hosted acceptance is disabled until a separate staging Supabase project exists.",
  );
}

export function assertLocalDatabaseTarget(source) {
  if (source.APP_ENV !== "local")
    throw new Error("Database reset is restricted to APP_ENV=local.");
  const url = new URL(requireValue(source, "NEXT_PUBLIC_SUPABASE_URL"));
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname))
    throw new Error("Database reset requires a loopback local Supabase URL.");
}

export function assertProductionReleaseTarget(source) {
  if (source.APP_ENV !== "production")
    throw new Error("Production release requires APP_ENV=production.");
  if (source.VERCEL_PROJECT_NAME !== PRODUCTION_VERCEL_PROJECT_NAME)
    throw new Error(
      "Production release requires the Production Vercel project.",
    );
  const projectRef = requireValue(source, "SUPABASE_PROJECT_REF");
  const productionRef = requireValue(source, "PRODUCTION_SUPABASE_PROJECT_REF");
  if (
    projectRef !== PRODUCTION_SUPABASE_PROJECT_REF ||
    productionRef !== PRODUCTION_SUPABASE_PROJECT_REF
  )
    throw new Error(
      "Production release requires the promoted Supabase project.",
    );
  if (source.PRODUCTION_RELEASE_APPROVED !== "true")
    throw new Error("Production release requires explicit manual approval.");
  const selectedCommit = requireValue(source, "PRODUCTION_RELEASE_COMMIT");
  const checkedOutCommit = requireValue(source, "GIT_COMMIT_SHA");
  if (
    !/^[0-9a-f]{40}$/.test(selectedCommit) ||
    selectedCommit !== checkedOutCommit
  )
    throw new Error("Production release commit does not match the checkout.");
}

const productionLaunchRequired = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "RECOVERY_SECRET",
  "CRON_SECRET",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "TURNSTILE_SECRET_KEY",
  "TURNSTILE_EXPECTED_HOSTNAME",
  "OPERATIONAL_ALERT_WEBHOOK_URL",
  "OPERATIONAL_ALERT_WEBHOOK_SECRET",
  "OPERATIONAL_ALERT_OWNER",
  "EMAIL_PROVIDER_API_KEY",
  "EMAIL_FROM_ADDRESS",
  "SUPPORT_EMAIL",
  "PRIVACY_EMAIL",
  "SECURITY_EMAIL",
];

export function assertProductionLaunchConfiguration(source) {
  if (source.APP_ENV !== "production")
    throw new Error(
      "Production launch validation requires APP_ENV=production.",
    );
  const missing = productionLaunchRequired.filter(
    (name) => !source[name]?.trim(),
  );
  if (missing.length > 0)
    throw new Error(
      `Production launch configuration is missing: ${missing.join(", ")}`,
    );
  if (source.SUPABASE_AUTH_CAPTCHA_ENABLED !== "true")
    throw new Error("Production Auth CAPTCHA must be enabled before launch.");
  if (source.NEXT_PUBLIC_SITE_URL !== "https://app.trailiecrew.com")
    throw new Error("Production launch requires the canonical app hostname.");
  if (source.TURNSTILE_EXPECTED_HOSTNAME !== "app.trailiecrew.com")
    throw new Error("Production Turnstile hostname is invalid.");
}
