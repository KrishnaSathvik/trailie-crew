import "server-only";

import type { TrailieRuntimeRecord } from "@/server/ai/runtime-telemetry";
import { createAdminSupabaseClient } from "@/server/supabase/admin";

type RuntimeTelemetryRpc = (
  name: "record_ai_runtime_telemetry" | "record_ai_runtime_expansion_metric",
  args:
    | { payload: TrailieRuntimeRecord }
    | { target_request_id: string; target_expansion_ms: number },
) => Promise<{ error: { message: string } | null }>;

export function createRuntimeTelemetryRepository(dependencies?: {
  rpc: RuntimeTelemetryRpc;
}) {
  const rpc: RuntimeTelemetryRpc =
    dependencies?.rpc ??
    (async (name, args) => {
      const result = await createAdminSupabaseClient().rpc(
        name as never,
        args as never,
      );
      return { error: result.error };
    });
  return {
    async record(record: TrailieRuntimeRecord) {
      const { error } = await rpc("record_ai_runtime_telemetry", {
        payload: record,
      });
      if (error) throw new Error("runtime_telemetry_unavailable");
      if (record.expansionMs !== null) {
        const expansion = await rpc("record_ai_runtime_expansion_metric", {
          target_request_id: record.requestId,
          target_expansion_ms: record.expansionMs,
        });
        if (expansion.error) throw new Error("runtime_telemetry_unavailable");
      }
    },
  };
}
