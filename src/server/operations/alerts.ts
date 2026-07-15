import "server-only";

import { z } from "zod";

type EnvironmentSource = Record<string, string | undefined>;
type AlertMetadata = Record<string, unknown>;

const alertEnvironmentSchema = z.object({
  OPERATIONAL_ALERT_WEBHOOK_URL: z
    .url()
    .refine((value) => new URL(value).protocol === "https:")
    .optional(),
  OPERATIONAL_ALERT_WEBHOOK_SECRET: z.string().min(16).max(512).optional(),
  OPERATIONAL_ALERT_OWNER: z.string().trim().min(2).max(100).optional(),
  ALERT_ENVIRONMENT: z.string().trim().min(1).max(50).optional(),
  VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
});

export type OperationalAlertConfiguration = ReturnType<
  typeof parseOperationalAlertEnv
>;

export function parseOperationalAlertEnv(source: EnvironmentSource) {
  const values = alertEnvironmentSchema.parse(source);
  if (values.OPERATIONAL_ALERT_WEBHOOK_URL && !values.OPERATIONAL_ALERT_OWNER)
    throw new Error("Operational alert owner is required.");
  return {
    enabled: Boolean(values.OPERATIONAL_ALERT_WEBHOOK_URL),
    webhookUrl: values.OPERATIONAL_ALERT_WEBHOOK_URL ?? null,
    webhookSecret: values.OPERATIONAL_ALERT_WEBHOOK_SECRET ?? null,
    environment:
      values.ALERT_ENVIRONMENT ??
      values.VERCEL_ENV ??
      values.NODE_ENV ??
      "development",
    owner: values.OPERATIONAL_ALERT_OWNER ?? "unassigned",
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
  context: { environment: string; owner: string },
) {
  const counts = numericTree(metadata.counts);
  return {
    schemaVersion: "1" as const,
    event: safeCode(event, 120) ?? "operations.invalid_event",
    severity: severity(event, metadata.status),
    environment: safeCode(context.environment, 50) ?? "unknown",
    owner: safeCode(context.owner, 100) ?? "unassigned",
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
