import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

import { parseFirstJsonValue } from "../src/server/acceptance/infrastructure.ts";
import { buildLoadAcceptanceReport } from "../src/server/acceptance/load.ts";

const databaseUrl =
  process.env.LOAD_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:55322/postgres";

function run(command, args, { capture = false } = {}) {
  const result = spawnSync(command, args, {
    encoding: capture ? "utf8" : undefined,
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error || result.status !== 0)
    throw new Error("load_acceptance_verification_failed");
  return result.stdout ?? "";
}

const database = parseFirstJsonValue(
  run(
    "psql",
    [databaseUrl, "-X", "-q", "-f", "scripts/sql/phase-5c-chat-load.sql"],
    { capture: true },
  ),
);

const raceSuites = [
  "planning",
  "itinerary",
  "revision",
  "sharing",
  "lifecycle",
  "provider_disabled_quota",
];
run("pnpm", [
  "test",
  "src/features/planning/worker.test.ts",
  "src/features/itinerary/worker.test.ts",
  "src/features/revisions/worker.test.ts",
  "src/features/sharing/repository.test.ts",
  "src/server/lifecycle/cleanup.test.ts",
  "src/server/ai/quota.test.ts",
]);

const databaseHealth = parseFirstJsonValue(
  run(
    "psql",
    [
      databaseUrl,
      "-X",
      "-qAtc",
      "select json_build_object('connections',count(*),'waitingLocks',count(*) filter (where wait_event_type='Lock')) from pg_stat_activity where datname=current_database()",
    ],
    { capture: true },
  ),
);

const report = {
  ...buildLoadAcceptanceReport({ database, raceSuites, databaseHealth }),
  generatedAt: new Date().toISOString(),
};
const outputPath =
  process.env.LOAD_ACCEPTANCE_OUTPUT ?? "output/phase-5c/load.json";
await mkdir(new URL("../output/phase-5c/", import.meta.url), {
  recursive: true,
});
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
  mode: 0o600,
});
console.log(
  JSON.stringify({
    status: report.status,
    testedEnvelope: report.testedEnvelope,
    providerCalls: report.providerCalls,
    waitingLocks: report.databaseHealth.waitingLocks,
    outputPath,
  }),
);
if (report.status !== "pass") process.exit(1);
