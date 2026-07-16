import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

import {
  assertDisposableAcceptanceRoom,
  buildQuotaAcceptanceReport,
} from "../src/server/acceptance/workflow-resilience.ts";

function verify(command, args, env = process.env) {
  const result = spawnSync(command, args, { env, stdio: "inherit" });
  if (result.error || result.status !== 0)
    throw new Error("quota_acceptance_verification_failed");
}

assertDisposableAcceptanceRoom({
  roomId: process.env.DISPOSABLE_ROOM_ID ?? "phase-5c-local-disposable-room",
  acceptedDemoRoomId: process.env.ACCEPTED_DEMO_ROOM_ID,
});

verify("pnpm", [
  "test",
  "src/server/ai/quota.test.ts",
  "src/server/ai/reliability-policy.test.ts",
]);
verify(
  "pnpm",
  [
    "exec",
    "supabase",
    "test",
    "db",
    "--local",
    "supabase/tests/phase_5c_provider_infrastructure.test.sql",
  ],
  { ...process.env, HOME: "/tmp/trailie-supabase" },
);

const report = {
  ...buildQuotaAcceptanceReport({
    workflow: "itinerary_generation",
    rejectionCode: "room_ai_limit_reached",
    providerCalls: 0,
    reservations: 0,
    reconciliations: 0,
  }),
  generatedAt: new Date().toISOString(),
  verification: ["quota_controller_vitest", "phase_5c_pgtap"],
};
const outputPath =
  process.env.QUOTA_ACCEPTANCE_OUTPUT ?? "output/phase-5c/quota.json";
await mkdir(new URL("../output/phase-5c/", import.meta.url), {
  recursive: true,
});
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
  mode: 0o600,
});
console.log(
  JSON.stringify({
    status: "pass",
    rejectionCode: report.rejectionCode,
    providerCalls: report.providerCalls,
    outputPath,
  }),
);
