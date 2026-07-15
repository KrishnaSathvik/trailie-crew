import { parseRecoveryEnv } from "@/server/env";
import { createCorrelationId, logOperation } from "@/server/operations/logger";
import { recoveryRequestIsAuthorized } from "@/server/recovery/auth";
import {
  RecoveryRateLimitedError,
  runDefaultRecovery,
} from "@/server/recovery/drain";

export const runtime = "nodejs";
export const maxDuration = 300;

const responseHeaders = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
};

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  const startedAt = Date.now();
  let secret: string;
  try {
    secret = parseRecoveryEnv(process.env).secret;
  } catch {
    logOperation("recovery.configuration_failed", {
      correlationId,
      status: "error",
      errorCode: "recovery_configuration_invalid",
      latencyMs: Date.now() - startedAt,
    });
    return Response.json(
      { status: "error", code: "recovery_unavailable" },
      { status: 503, headers: responseHeaders },
    );
  }
  if (!recoveryRequestIsAuthorized(request, secret)) {
    logOperation("recovery.rejected", {
      correlationId,
      status: "rejected",
      errorCode: "recovery_unauthorized",
      latencyMs: Date.now() - startedAt,
    });
    return Response.json(
      { status: "error", code: "recovery_unauthorized" },
      { status: 401, headers: responseHeaders },
    );
  }
  try {
    const counts = await runDefaultRecovery();
    logOperation("recovery.completed", {
      correlationId,
      status: "ok",
      latencyMs: Date.now() - startedAt,
      counts,
    });
    return Response.json(
      { status: "ok", counts, correlationId },
      { headers: responseHeaders },
    );
  } catch (error) {
    if (error instanceof RecoveryRateLimitedError) {
      logOperation("recovery.rate_limited", {
        correlationId,
        status: "rejected",
        errorCode: "recovery_rate_limited",
        latencyMs: Date.now() - startedAt,
      });
      return Response.json(
        { status: "error", code: "recovery_rate_limited" },
        { status: 429, headers: responseHeaders },
      );
    }
    logOperation("recovery.failed", {
      correlationId,
      status: "error",
      errorCode: "recovery_unavailable",
      latencyMs: Date.now() - startedAt,
    });
    return Response.json(
      { status: "error", code: "recovery_unavailable" },
      { status: 503, headers: responseHeaders },
    );
  }
}
