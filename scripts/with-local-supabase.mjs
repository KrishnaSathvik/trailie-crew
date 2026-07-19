import { spawnSync } from "node:child_process";

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error(
    "Usage: node scripts/with-local-supabase.mjs <command> [...args]",
  );
  process.exit(1);
}

const status = spawnSync("pnpm", ["exec", "supabase", "status", "-o", "env"], {
  encoding: "utf8",
});

const localEnvironment = Object.fromEntries(
  status.stdout
    .split("\n")
    .map((line) => line.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((match) => {
      const value = match[2].trim().replace(/^"|"$/g, "");
      return [match[1], value];
    }),
);

if (!localEnvironment.API_URL || !localEnvironment.PUBLISHABLE_KEY) {
  console.error(
    "Local Supabase is unavailable or did not return the required public values. Run `pnpm exec supabase start` first.",
  );
  process.exit(status.status ?? 1);
}

const child = spawnSync(command, args, {
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: localEnvironment.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: localEnvironment.PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY:
      process.env.SUPABASE_SECRET_KEY ?? localEnvironment.SECRET_KEY,
    TRAILIE_AI_PROVIDER: process.env.TRAILIE_AI_PROVIDER ?? "fake",
    CAPTCHA_TEST_MODE: process.env.CAPTCHA_TEST_MODE ?? "true",
    NEXT_PUBLIC_CAPTCHA_TEST_MODE:
      process.env.NEXT_PUBLIC_CAPTCHA_TEST_MODE ?? "true",
    MAPBOX_MAPS_ENABLED: process.env.MAPBOX_MAPS_ENABLED ?? "true",
    MAPBOX_MAP_ADAPTER: process.env.MAPBOX_MAP_ADAPTER ?? "deterministic",
    SUPABASE_AUTH_CAPTCHA_ENABLED:
      process.env.SUPABASE_AUTH_CAPTCHA_ENABLED ?? "false",
    RECOVERY_SECRET:
      process.env.RECOVERY_SECRET ??
      "local-recovery-secret-must-be-at-least-32-characters",
    CLEANUP_SECRET:
      process.env.CLEANUP_SECRET ??
      "local-cleanup-secret-must-be-at-least-32-characters",
  },
  stdio: "inherit",
});

if (child.error) {
  console.error(`Unable to start ${command}.`);
  process.exit(1);
}

process.exit(child.status ?? 1);
