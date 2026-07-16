import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";

import {
  buildInfrastructureAcceptanceReport,
  parseFirstJsonValue,
} from "../src/server/acceptance/infrastructure.ts";

function run(command, args, { allowNotFound = false } = {}) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (
    result.error ||
    (result.status !== 0 && !(allowNotFound && output.includes("404")))
  )
    throw new Error("infrastructure_inventory_failed");
  return { output, notFound: result.status !== 0 };
}

const linkedProject = JSON.parse(
  readFileSync(new URL("../.vercel/project.json", import.meta.url), "utf8"),
);
const vercelConfig = JSON.parse(
  readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
);
const environment = process.env.VERCEL_ACCEPTANCE_ENV ?? "hosted-acceptance";
const envInventory = parseFirstJsonValue(
  run("vercel", ["env", "ls", environment, "--format", "json"]).output,
);
const protection = parseFirstJsonValue(
  run("vercel", [
    "project",
    "protection",
    linkedProject.projectName,
    "--format",
    "json",
  ]).output,
);
const firewallResult = run(
  "vercel",
  [
    "api",
    `/v1/security/firewall/config/active?projectId=${encodeURIComponent(linkedProject.projectId)}&teamId=${encodeURIComponent(linkedProject.orgId)}`,
  ],
  { allowNotFound: true },
);
const firewall = firewallResult.notFound
  ? { configured: false, ruleCount: 0 }
  : (() => {
      const config = parseFirstJsonValue(firewallResult.output);
      return {
        configured: Boolean(config.firewallEnabled),
        ruleCount: Array.isArray(config.rules) ? config.rules.length : 0,
      };
    })();

const report = {
  ...buildInfrastructureAcceptanceReport({
    environment,
    envVariables: (envInventory.envs ?? []).map(({ key, type }) => ({
      key,
      type,
    })),
    protection: {
      ssoDeploymentType: protection.ssoProtection?.deploymentType ?? null,
      bypassCount: Object.keys(protection.protectionBypass ?? {}).length,
    },
    firewall,
    cronPaths: (vercelConfig.crons ?? []).map(({ path }) => path),
    evidence: {
      turnstile: process.env.TURNSTILE_EVIDENCE === "pass" ? "pass" : "not_run",
      cron: process.env.CRON_EVIDENCE === "pass" ? "pass" : "not_run",
      waf: process.env.WAF_EVIDENCE === "pass" ? "pass" : "not_run",
    },
  }),
  generatedAt: new Date().toISOString(),
};
const outputPath =
  process.env.INFRASTRUCTURE_ACCEPTANCE_OUTPUT ??
  "output/phase-5c/infrastructure.json";
await mkdir(new URL("../output/phase-5c/", import.meta.url), {
  recursive: true,
});
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
  mode: 0o600,
});
console.log(
  JSON.stringify({
    status: report.verdict,
    protected: report.protected,
    turnstileAccepted: report.turnstile.accepted,
    cronAccepted: report.cron.accepted,
    wafAccepted: report.waf.accepted,
    outputPath,
  }),
);
