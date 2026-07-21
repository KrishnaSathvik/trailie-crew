import { spawnSync } from "node:child_process";

import { assertLocalDatabaseTarget } from "./deployment-safety.mjs";

assertLocalDatabaseTarget({
  APP_ENV: process.env.APP_ENV,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
});

const result = spawnSync(
  "pnpm",
  ["exec", "supabase", "db", "reset", "--local"],
  {
    stdio: "inherit",
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
