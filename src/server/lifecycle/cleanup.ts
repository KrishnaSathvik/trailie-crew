import "server-only";

import { createAdminSupabaseClient } from "@/server/supabase/admin";

export type CleanupDependencies = {
  claim(): Promise<boolean>;
  list(input: {
    batchSize: number;
    retentionDays: number;
    dryRun: boolean;
  }): Promise<Array<{ userId: string }>>;
  deleteUser(userId: string): Promise<void>;
  record(userId: string, succeeded: boolean): Promise<void>;
};

export async function runAnonymousCleanup(
  dependencies: CleanupDependencies,
  options: { dryRun: boolean; batchSize: number; retentionDays: number },
) {
  const batchSize = Math.min(Math.max(options.batchSize, 1), 100);
  const retentionDays = Math.min(Math.max(options.retentionDays, 1), 3650);
  if (!(await dependencies.claim())) throw new Error("cleanup_already_running");
  const candidates = await dependencies.list({
    batchSize,
    retentionDays,
    dryRun: options.dryRun,
  });
  if (options.dryRun)
    return {
      selected: candidates.length,
      deleted: 0,
      failed: 0,
      dryRun: true,
    } as const;

  let deleted = 0;
  let failed = 0;
  for (const candidate of candidates) {
    try {
      await dependencies.deleteUser(candidate.userId);
      deleted += 1;
      await dependencies.record(candidate.userId, true);
    } catch {
      failed += 1;
      await dependencies.record(candidate.userId, false).catch(() => undefined);
    }
  }
  return {
    selected: candidates.length,
    deleted,
    failed,
    dryRun: false,
  } as const;
}

export function createDefaultCleanupDependencies(): CleanupDependencies {
  const admin = createAdminSupabaseClient();
  return {
    async claim() {
      const { data, error } = await admin.rpc("claim_lifecycle_execution", {
        target_category: "anonymous_cleanup",
        lease_seconds: 300,
      });
      if (error) throw new Error("cleanup_lease_failed");
      return data;
    },
    async list(input) {
      const { data, error } = await admin.rpc(
        "list_anonymous_cleanup_candidates",
        {
          retention: `${input.retentionDays} days`,
          batch_size: input.batchSize,
          dry_run: input.dryRun,
        },
      );
      if (error) throw new Error("cleanup_listing_failed");
      return (data ?? []).map((candidate) => ({
        userId: candidate.user_id,
      }));
    },
    async deleteUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId, true);
      if (error) throw new Error("cleanup_deletion_failed");
    },
    async record(userId, succeeded) {
      const { error } = await admin.rpc("record_anonymous_cleanup_result", {
        target_user_id: userId,
        succeeded,
      });
      if (error) throw new Error("cleanup_audit_failed");
    },
  };
}

export function runDefaultAnonymousCleanup(options: {
  dryRun: boolean;
  batchSize: number;
  retentionDays: number;
}) {
  return runAnonymousCleanup(createDefaultCleanupDependencies(), options);
}
