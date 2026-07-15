import { parseRecoveryEnv } from "@/server/env";
import {
  deliverOperationalAlert,
  parseOperationalAlertEnv,
} from "@/server/operations/alerts";
import { createCorrelationId, logOperation } from "@/server/operations/logger";
import { recoveryRequestIsAuthorized } from "@/server/recovery/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const headers = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
};

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  let secret: string;
  try {
    secret = parseRecoveryEnv(process.env).secret;
    if (!parseOperationalAlertEnv(process.env).enabled)
      throw new Error("alerts_disabled");
  } catch {
    return Response.json(
      { status: "error", code: "alert_delivery_unavailable" },
      { status: 503, headers },
    );
  }
  if (!recoveryRequestIsAuthorized(request, secret))
    return Response.json(
      { status: "error", code: "alert_test_unauthorized" },
      { status: 401, headers },
    );
  try {
    const result = await deliverOperationalAlert(
      "monitoring.synthetic_failure",
      {
        correlationId,
        workflow: "monitoring",
        status: "error",
        errorCode: "synthetic_failure",
      },
    );
    logOperation("monitoring.synthetic_alert_test", {
      correlationId,
      status: result.delivered ? "ok" : "error",
      errorCode: result.delivered ? null : result.reason,
    });
    return Response.json(
      {
        status: result.delivered ? "ok" : "error",
        delivered: result.delivered,
        correlationId,
      },
      { status: result.delivered ? 200 : 502, headers },
    );
  } catch {
    logOperation("monitoring.synthetic_alert_test.failed", {
      correlationId,
      status: "error",
      errorCode: "alert_delivery_failed",
    });
    return Response.json(
      { status: "error", code: "alert_delivery_failed", correlationId },
      { status: 502, headers },
    );
  }
}
