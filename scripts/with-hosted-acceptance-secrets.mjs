import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { selectGeneratedAutomationBypass } from "./hosted-acceptance-bypass.mjs";

const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error("A child command is required.");

function run(commandName, commandArgs, options = {}) {
  const result = spawnSync(commandName, commandArgs, {
    encoding: "utf8",
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${commandName} failed during hosted acceptance setup.`);
  }
  return result;
}

const supabaseProjectRef =
  process.env.SUPABASE_PROJECT_REF ?? "tkccksmiuucdstvvfglp";
const supabaseKeys = JSON.parse(
  run("pnpm", [
    "exec",
    "supabase",
    "projects",
    "api-keys",
    "--project-ref",
    supabaseProjectRef,
    "-o",
    "json",
  ]).stdout,
);
const supabaseKey =
  supabaseKeys.find((item) => item.name === "service_role") ??
  supabaseKeys.find((item) => item.type === "secret");
const supabasePublicKey =
  supabaseKeys.find((item) => item.type === "publishable") ??
  supabaseKeys.find((item) => item.name === "anon");
if (!supabaseKey?.api_key)
  throw new Error("Linked Supabase secret is unavailable.");
if (!supabasePublicKey?.api_key)
  throw new Error("Linked Supabase public key is unavailable.");

let recoverySecret = process.env.RECOVERY_SECRET;
if (process.env.ROTATE_HOSTED_RECOVERY_SECRET === "1") {
  recoverySecret = randomBytes(32).toString("hex");
  run(
    "vercel",
    [
      "env",
      "add",
      "RECOVERY_SECRET",
      "hosted-acceptance",
      "--force",
      "--sensitive",
      "--yes",
    ],
    { input: `${recoverySecret}\n` },
  );
}

let hostedBaseUrl = process.env.HOSTED_BASE_URL;
if (process.env.REDEPLOY_HOSTED_ACCEPTANCE === "1") {
  const deployment = run("vercel", [
    "deploy",
    "--target=hosted-acceptance",
    "--yes",
  ]);
  process.stdout.write(deployment.stderr);
  const urls = `${deployment.stdout}\n${deployment.stderr}`.match(
    /https:\/\/[^\s]+\.vercel\.app/g,
  );
  hostedBaseUrl = urls?.at(-1) ?? hostedBaseUrl;
  if (!hostedBaseUrl)
    throw new Error("Hosted deployment URL was not returned by Vercel.");
  const inspection = run("vercel", [
    "inspect",
    hostedBaseUrl,
    "--wait",
    "--timeout",
    "3m",
  ]);
  process.stdout.write(inspection.stdout);
  process.stderr.write(inspection.stderr);
}
if (!hostedBaseUrl) throw new Error("Hosted deployment URL is unavailable.");

const vercelProject = process.env.VERCEL_PROJECT_NAME ?? "trailie-crew-preview";
const linkedVercelProject = JSON.parse(
  readFileSync(new URL("../.vercel/project.json", import.meta.url), "utf8"),
);
const projectId = linkedVercelProject.projectId;
if (!projectId) throw new Error("Vercel project identifier is unavailable.");
const protection = JSON.parse(
  run("vercel", ["project", "protection", vercelProject, "--format", "json"])
    .stdout,
);
const generated = JSON.parse(
  run(
    "vercel",
    [
      "api",
      `/v1/projects/${encodeURIComponent(projectId)}/protection-bypass`,
      "-X",
      "PATCH",
      "--input",
      "-",
    ],
    { input: JSON.stringify({ generate: {} }) },
  ).stdout,
);
const bypass = selectGeneratedAutomationBypass(
  protection.protectionBypass,
  generated.protectionBypass,
);

const [bypassSecret] = bypass;

let childStatus = 1;
try {
  const child = spawnSync(command, args, {
    env: {
      ...process.env,
      CLEANUP_SECRET: recoverySecret,
      HOSTED_ACCEPTANCE: "1",
      HOSTED_BASE_URL: hostedBaseUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabasePublicKey.api_key,
      NEXT_PUBLIC_SUPABASE_URL: `https://${supabaseProjectRef}.supabase.co`,
      RECOVERY_SECRET: recoverySecret,
      SUPABASE_SECRET_KEY: supabaseKey.api_key,
      VERCEL_AUTOMATION_BYPASS_SECRET: bypassSecret,
    },
    stdio: "inherit",
  });
  if (child.error) throw new Error("Unable to run hosted acceptance command.");
  childStatus = child.status ?? 1;
} finally {
  const revoke = spawnSync(
    "vercel",
    [
      "api",
      `/v1/projects/${encodeURIComponent(projectId)}/protection-bypass`,
      "-X",
      "PATCH",
      "--input",
      "-",
      "--silent",
    ],
    {
      encoding: "utf8",
      input: JSON.stringify({
        revoke: { secret: bypassSecret, regenerate: false },
      }),
    },
  );
  if (revoke.error || revoke.status !== 0) {
    throw new Error("Temporary Vercel automation bypass revocation failed.");
  }
}

process.exit(childStatus);
