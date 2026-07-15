import { parseCleanupEnv } from "@/server/env";
import { runDefaultAnonymousCleanup } from "@/server/lifecycle/cleanup";
import { createCorrelationId, logOperation } from "@/server/operations/logger";
import { recoveryRequestIsAuthorized } from "@/server/recovery/auth";
import { tryDeliverOperationalAlert } from "@/server/operations/alerts";

export const runtime = "nodejs";
export const maxDuration = 300;

const headers = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
};

async function handle(request: Request, scheduled: boolean) {
  const correlationId = createCorrelationId();
  const startedAt = Date.now();
  let environment: ReturnType<typeof parseCleanupEnv>;
  try {
    environment = parseCleanupEnv(process.env);
  } catch {
    return Response.json(
      { status: "error", code: "cleanup_unavailable" },
      { status: 503, headers },
    );
  }
  if (!recoveryRequestIsAuthorized(request, environment.secret))
    return Response.json(
      { status: "error", code: "cleanup_unauthorized" },
      { status: 401, headers },
    );

  const dryRun = scheduled
    ? false
    : new URL(request.url).searchParams.get("dryRun") !== "false";
  try {
    const result = await runDefaultAnonymousCleanup({
      dryRun,
      batchSize: environment.batchSize,
      retentionDays: environment.retentionDays,
    });
    const counts = {
      selected: result.selected,
      deleted: result.deleted,
      failed: result.failed,
    };
    logOperation("cleanup.completed", {
      correlationId,
      workflow: "anonymous_cleanup",
      status: "ok",
      latencyMs: Date.now() - startedAt,
      counts,
      dryRun,
    });
    return Response.json(
      { status: "ok", counts, dryRun, correlationId },
      { headers },
    );
  } catch (error) {
    const overlap =
      error instanceof Error && error.message === "cleanup_already_running";
    logOperation("cleanup.failed", {
      correlationId,
      workflow: "anonymous_cleanup",
      status: "error",
      errorCode: overlap ? "cleanup_already_running" : "cleanup_unavailable",
      latencyMs: Date.now() - startedAt,
    });
    await tryDeliverOperationalAlert("cleanup.failed", {
      correlationId,
      workflow: "anonymous_cleanup",
      status: "error",
      errorCode: overlap ? "cleanup_already_running" : "cleanup_unavailable",
      latencyMs: Date.now() - startedAt,
    });
    return Response.json(
      {
        status: "error",
        code: overlap ? "cleanup_already_running" : "cleanup_unavailable",
      },
      { status: overlap ? 429 : 503, headers },
    );
  }
}

export function GET(request: Request) {
  return handle(request, true);
}

export function POST(request: Request) {
  return handle(request, false);
}
