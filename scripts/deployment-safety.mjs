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
  "SUPPORT_EMAIL",
  "PRIVACY_EMAIL",
  "SECURITY_EMAIL",
];

/**
 * Outbound email and webhook alert delivery are deferred, not abandoned. Each
 * channel is an explicit declaration rather than an absence so a forgotten
 * credential can never be mistaken for a deliberate deferral.
 */
const deliveryChannels = [
  {
    label: "Outbound email",
    switchName: "OUTBOUND_EMAIL_ENABLED",
    variables: ["EMAIL_PROVIDER_API_KEY", "EMAIL_FROM_ADDRESS"],
  },
  {
    label: "Operational alert delivery",
    switchName: "OPERATIONAL_ALERTS_ENABLED",
    variables: [
      "OPERATIONAL_ALERT_WEBHOOK_URL",
      "OPERATIONAL_ALERT_WEBHOOK_SECRET",
      "OPERATIONAL_ALERT_OWNER",
    ],
  },
];

const productionLaunchCredentials = [
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "RECOVERY_SECRET",
  "CRON_SECRET",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "TURNSTILE_SECRET_KEY",
  "EMAIL_PROVIDER_API_KEY",
  "OPERATIONAL_ALERT_WEBHOOK_SECRET",
];

const placeholderCredential =
  /(^|[-_])(dummy|example|fake|placeholder|replace|test)([-_]|$)/i;

function assertDeliveryChannel(source, channel) {
  const declared = source[channel.switchName];
  if (declared !== "true" && declared !== "false")
    throw new Error(`${channel.switchName} must be declared as true or false.`);
  if (declared === "true") {
    const missing = channel.variables.filter((name) => !source[name]?.trim());
    if (missing.length > 0)
      throw new Error(
        `${channel.label} is enabled but missing: ${missing.join(", ")}`,
      );
    return;
  }
  const configured = channel.variables.filter((name) => source[name]?.trim());
  if (configured.length > 0)
    throw new Error(
      `${channel.label} is disabled but still configured: ${configured.join(", ")}`,
    );
}

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
  for (const channel of deliveryChannels)
    assertDeliveryChannel(source, channel);
  for (const name of productionLaunchCredentials) {
    const value = source[name]?.trim();
    if (value && placeholderCredential.test(value))
      throw new Error(`Production launch credential ${name} is not real.`);
  }
  // Map tokens live only in Vercel, so the gate validates the release
  // declaration and the deployed runtime enforces the credential pairing.
  if (!["true", "false"].includes(source.MAPBOX_MAPS_ENABLED))
    throw new Error("MAPBOX_MAPS_ENABLED must be declared as true or false.");
  if (!["disabled", "temporary"].includes(source.MAPBOX_GEOCODING_STORAGE_MODE))
    throw new Error(
      "Production geocoding storage must be declared disabled or temporary.",
    );
  if (source.SUPABASE_AUTH_CAPTCHA_ENABLED !== "true")
    throw new Error("Production Auth CAPTCHA must be enabled before launch.");
  if (source.NEXT_PUBLIC_SITE_URL !== "https://app.trailiecrew.com")
    throw new Error("Production launch requires the canonical app hostname.");
  if (source.TURNSTILE_EXPECTED_HOSTNAME !== "app.trailiecrew.com")
    throw new Error("Production Turnstile hostname is invalid.");
}
