import "server-only";

import { z } from "zod";

import { absentWhenEmpty } from "@/server/env-values";

type EnvironmentSource = Record<string, string | undefined>;
type AlertMetadata = Record<string, unknown>;

const httpsUrl = z
  .url()
  .refine((value) => new URL(value).protocol === "https:");

const alertEnvironmentSchema = z.object({
  OPERATIONAL_ALERT_WEBHOOK_URL: absentWhenEmpty(httpsUrl),
  OPERATIONAL_ALERT_WEBHOOK_SECRET: absentWhenEmpty(
    z.string().min(16).max(512),
  ),
  OPERATIONAL_ALERT_OWNER: absentWhenEmpty(z.string().trim().min(2).max(100)),
  ALERT_ENVIRONMENT: absentWhenEmpty(z.string().trim().min(1).max(50)),
  NEXT_PUBLIC_SITE_URL: absentWhenEmpty(httpsUrl),
  APP_ENV: absentWhenEmpty(z.enum(["local", "preview", "production"])),
  VERCEL_ENV: absentWhenEmpty(z.enum(["development", "preview", "production"])),
  NODE_ENV: absentWhenEmpty(z.enum(["development", "test", "production"])),
});

export type OperationalAlertConfiguration = ReturnType<
  typeof parseOperationalAlertEnv
>;

export function parseOperationalAlertEnv(source: EnvironmentSource) {
  const values = alertEnvironmentSchema.parse(source);
  if (values.OPERATIONAL_ALERT_WEBHOOK_URL && !values.OPERATIONAL_ALERT_OWNER)
    throw new Error("Operational alert owner is required.");
  const environment =
    values.ALERT_ENVIRONMENT ??
    values.VERCEL_ENV ??
    values.NODE_ENV ??
    "development";
  const isProductionDeployment =
    values.APP_ENV === "production" ||
    values.ALERT_ENVIRONMENT === "production" ||
    values.VERCEL_ENV === "production";
  if (
    isProductionDeployment &&
    values.NEXT_PUBLIC_SITE_URL !== "https://app.trailiecrew.com"
  )
    throw new Error("Production alerts require the canonical application URL.");
  return {
    enabled: Boolean(values.OPERATIONAL_ALERT_WEBHOOK_URL),
    webhookUrl: values.OPERATIONAL_ALERT_WEBHOOK_URL ?? null,
    webhookSecret: values.OPERATIONAL_ALERT_WEBHOOK_SECRET ?? null,
    environment,
    owner: values.OPERATIONAL_ALERT_OWNER ?? "unassigned",
    applicationUrl: values.NEXT_PUBLIC_SITE_URL ?? null,
  } as const;
}

const safeCode = (value: unknown, maximum = 100) =>
  typeof value === "string" &&
  value.length <= maximum &&
  /^[a-zA-Z0-9_.:-]+$/.test(value)
    ? value
    : undefined;

function numericTree(value: unknown, depth = 0): unknown {
  if (depth > 3 || !value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const entries = Object.entries(value).flatMap(([key, item]) => {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/.test(key)) return [];
    if (typeof item === "number" && Number.isFinite(item))
      return [[key, item] as const];
    const nested = numericTree(item, depth + 1);
    return nested && Object.keys(nested).length ? [[key, nested] as const] : [];
  });
  return Object.fromEntries(entries);
}

function severity(event: string, status: unknown) {
  if (/security|configuration_failed|health.*failed/i.test(event))
    return "critical" as const;
  if (status === "warning" || /stale|quota|captcha|abuse/i.test(event))
    return "warning" as const;
  return "error" as const;
}

export function buildOperationalAlert(
  event: string,
  metadata: AlertMetadata,
  context: {
    environment: string;
    owner: string;
    applicationUrl?: string | null;
  },
) {
  const counts = numericTree(metadata.counts);
  return {
    schemaVersion: "1" as const,
    event: safeCode(event, 120) ?? "operations.invalid_event",
    severity: severity(event, metadata.status),
    environment: safeCode(context.environment, 50) ?? "unknown",
    owner: safeCode(context.owner, 100) ?? "unassigned",
    ...(context.applicationUrl
      ? { applicationUrl: context.applicationUrl }
      : {}),
    ...(safeCode(metadata.correlationId, 100)
      ? { correlationId: safeCode(metadata.correlationId, 100)! }
      : {}),
    ...(safeCode(metadata.workflow, 80)
      ? { workflow: safeCode(metadata.workflow, 80)! }
      : {}),
    ...(safeCode(metadata.status, 30)
      ? { status: safeCode(metadata.status, 30)! }
      : {}),
    ...(safeCode(metadata.errorCode, 80)
      ? { errorCode: safeCode(metadata.errorCode, 80)! }
      : {}),
    ...(typeof metadata.latencyMs === "number" &&
    Number.isFinite(metadata.latencyMs) &&
    metadata.latencyMs >= 0
      ? { latencyMs: Math.round(metadata.latencyMs) }
      : {}),
    ...(typeof metadata.ageSeconds === "number" &&
    Number.isFinite(metadata.ageSeconds) &&
    metadata.ageSeconds >= 0
      ? { ageSeconds: Math.round(metadata.ageSeconds) }
      : {}),
    ...(counts && Object.keys(counts).length ? { counts } : {}),
    occurredAt: new Date().toISOString(),
  };
}

export async function deliverOperationalAlert(
  event: string,
  metadata: AlertMetadata,
  dependencies: {
    configuration?: OperationalAlertConfiguration;
    fetcher?: typeof fetch;
  } = {},
) {
  const configuration =
    dependencies.configuration ?? parseOperationalAlertEnv(process.env);
  if (!configuration.enabled || !configuration.webhookUrl)
    return { delivered: false as const, reason: "disabled" as const };
  const payload = buildOperationalAlert(event, metadata, configuration);
  const response = await (dependencies.fetcher ?? fetch)(
    configuration.webhookUrl,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(configuration.webhookSecret
          ? { authorization: `Bearer ${configuration.webhookSecret}` }
          : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    },
  );
  if (!response.ok)
    return {
      delivered: false as const,
      reason: "destination_rejected" as const,
      status: response.status,
    };
  return { delivered: true as const, status: response.status };
}

export async function tryDeliverOperationalAlert(
  event: string,
  metadata: AlertMetadata,
) {
  try {
    return await deliverOperationalAlert(event, metadata);
  } catch {
    return { delivered: false as const, reason: "delivery_failed" as const };
  }
}
