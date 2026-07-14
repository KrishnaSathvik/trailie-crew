import { defineConfig, devices } from "@playwright/test";
import { spawnSync } from "node:child_process";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  const status = spawnSync(
    "pnpm",
    ["exec", "supabase", "status", "-o", "env"],
    {
      encoding: "utf8",
      env: { ...process.env, HOME: "/tmp/trailie-supabase" },
    },
  );
  for (const line of status.stdout.split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (!match) continue;
    const value = match[2].trim().replace(/^"|"$/g, "");
    if (match[1] === "API_URL") process.env.NEXT_PUBLIC_SUPABASE_URL = value;
    if (match[1] === "SECRET_KEY") process.env.SUPABASE_SECRET_KEY = value;
  }
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 7_500 },
  reporter: "list",
  outputDir: "output/playwright/test-results",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: "pnpm dev:local",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
