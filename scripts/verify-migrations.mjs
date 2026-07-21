import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationDirectory = resolve(process.cwd(), "supabase/migrations");
const migrationName = /^(\d{14})_[a-z0-9_]+\.sql$/;
const files = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith(".sql"))
  .sort();

if (files.length === 0) throw new Error("No SQL migrations were found.");

const timestamps = files.map((name) => {
  const match = name.match(migrationName);
  if (!match) throw new Error(`Invalid migration filename: ${name}`);
  return match[1];
});
if (new Set(timestamps).size !== timestamps.length)
  throw new Error("Migration timestamps must be unique.");

const allowedDestructiveStatements = new Set([
  "20260714035028_phase_4a_itinerary_revisions.sql:alter table public.trip_plans drop constraint trip_plans_planning_request_id_basis_summary_version_key",
  "20260716221617_phase_5d_revision_scope_reliability.sql:alter table private.ai_provider_attempts drop constraint ai_provider_attempts_workflow_check",
]);
const destructivePattern =
  /\b(drop\s+(table|schema|type|column)|truncate\s+table|alter\s+table[^;]+drop\s+(column|constraint)|vacuum\s+full)\b/gi;
const unexpectedDestructiveStatements = [];
const checksums = [];

for (const file of files) {
  const sql = readFileSync(resolve(migrationDirectory, file), "utf8");
  checksums.push(`${file}:${createHash("sha256").update(sql).digest("hex")}`);
  for (const match of sql.matchAll(destructivePattern)) {
    const statement = sql
      .slice(match.index, sql.indexOf(";", match.index) + 1 || undefined)
      .replace(/\s+/g, " ")
      .trim()
      .replace(/;$/, "")
      .toLowerCase();
    if (!allowedDestructiveStatements.has(`${file}:${statement}`))
      unexpectedDestructiveStatements.push(`${file}: ${statement}`);
  }
}

if (unexpectedDestructiveStatements.length > 0)
  throw new Error(
    `Unexpected destructive migration SQL:\n${unexpectedDestructiveStatements.join("\n")}`,
  );

const stateChecksum = createHash("sha256")
  .update(checksums.join("\n"))
  .digest("hex");
process.stdout.write(
  JSON.stringify(
    {
      migrationCount: files.length,
      first: timestamps[0],
      last: timestamps.at(-1),
      stateChecksum,
      reviewedDestructiveStatements: allowedDestructiveStatements.size,
    },
    null,
    2,
  ) + "\n",
);
