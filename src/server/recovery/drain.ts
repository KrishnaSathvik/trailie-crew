import "server-only";

import { drainItineraryGeneration } from "@/features/itinerary/scheduler";
import { drainMemoryExtraction } from "@/features/memory/worker";
import { drainPlanningSummary } from "@/features/planning/scheduler";
import {
  drainPlanChange,
  publishPlanChange,
} from "@/features/revisions/scheduler";
import { drainFocusedAnswer } from "@/server/ai/focused-worker";
import { createAdminSupabaseClient } from "@/server/supabase/admin";

export const recoveryCategories = [
  "focused",
  "memory",
  "planning",
  "itinerary",
  "revision",
  "revisionPublication",
] as const;

export type RecoveryCategory = (typeof recoveryCategories)[number];
type RecoveryCounts = Record<RecoveryCategory, number>;

export type RecoveryDependencies = {
  prepare(): Promise<void>;
  list(category: RecoveryCategory, batchSize: number): Promise<string[]>;
  drain(
    category: RecoveryCategory,
    id: string,
  ): Promise<void | { status: "completed" | "deferred" | "skipped" }>;
};

export class RecoveryRateLimitedError extends Error {
  constructor() {
    super("recovery_rate_limited");
    this.name = "RecoveryRateLimitedError";
  }
}

const emptyCounts = (): RecoveryCounts => ({
  focused: 0,
  memory: 0,
  planning: 0,
  itinerary: 0,
  revision: 0,
  revisionPublication: 0,
});

export async function runRecovery(
  dependencies: RecoveryDependencies,
  options: { batchSize: number; maxJobs: number },
) {
  const batchSize = Math.min(Math.max(options.batchSize, 1), 5);
  const maxJobs = Math.min(Math.max(options.maxJobs, 1), 5);
  await dependencies.prepare();
  const listed = await Promise.all(
    recoveryCategories.map(async (category) => ({
      category,
      ids: await dependencies.list(category, batchSize),
    })),
  );
  const eligible = listed.flatMap(({ category, ids }) =>
    ids.map((id) => ({ category, id })),
  );
  const selectedJobs = eligible.slice(0, maxJobs);
  const selected = emptyCounts();
  for (const job of selectedJobs) selected[job.category] += 1;

  const outcomes = await Promise.all(
    selectedJobs.map(async (job) => {
      try {
        const result = await dependencies.drain(job.category, job.id);
        return {
          category: job.category,
          status: result?.status ?? "completed",
        } as const;
      } catch (error) {
        const retryExhausted =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "retry_exhausted";
        return {
          category: job.category,
          status: retryExhausted ? "retry_exhausted" : "failed",
        } as const;
      }
    }),
  );
  const completed = emptyCounts();
  const failed = emptyCounts();
  for (const outcome of outcomes)
    if (outcome.status === "completed") completed[outcome.category] += 1;
    else if (outcome.status === "failed") failed[outcome.category] += 1;

  const deferredJobs = outcomes.filter(
    (outcome) => outcome.status === "deferred",
  ).length;
  const retryExhausted = outcomes.filter(
    (outcome) => outcome.status === "retry_exhausted",
  ).length;
  const skipped = outcomes.filter(
    (outcome) => outcome.status === "skipped",
  ).length;
  const unselected = Math.max(eligible.length - selectedJobs.length, 0);

  return {
    selected,
    completed,
    failed,
    claimed: selectedJobs.length,
    deferred: unselected + deferredJobs,
    retryExhausted,
    skipped,
    remainingEligible: unselected + deferredJobs,
  };
}

const rpcByCategory = {
  focused: {
    name: "list_recoverable_ai_invocations",
  },
  memory: {
    name: "list_recoverable_message_extractions",
  },
  planning: {
    name: "list_recoverable_planning_requests",
  },
  itinerary: {
    name: "list_recoverable_itinerary_generations",
  },
  revision: { name: "list_recoverable_plan_changes" },
  revisionPublication: {
    name: "list_recoverable_plan_change_publications",
  },
} as const;

export function createDefaultRecoveryDependencies(): RecoveryDependencies {
  const admin = createAdminSupabaseClient();
  return {
    async prepare() {
      const { error } = await admin.rpc("prepare_ai_recovery" as never);
      if (error) throw new Error("recovery_preparation_failed");
      const { error: revisionError } = await admin.rpc(
        "prepare_revision_ai_recovery" as never,
      );
      if (revisionError) throw new Error("recovery_preparation_failed");
    },
    async list(category, batchSize) {
      const rpc = rpcByCategory[category];
      const { data, error } = await admin.rpc(
        rpc.name as never,
        {
          batch_size: batchSize,
        } as never,
      );
      if (error) throw new Error("recovery_listing_failed");
      return (data ?? []) as string[];
    },
    async drain(category, id) {
      if (category === "focused") return drainFocusedAnswer(id);
      if (category === "memory") return drainMemoryExtraction(id);
      if (category === "planning") return drainPlanningSummary(id);
      if (category === "itinerary") return drainItineraryGeneration(id);
      if (category === "revision") return drainPlanChange(id);
      return publishPlanChange(id);
    },
  };
}

export async function runDefaultRecovery() {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("claim_recovery_execution", {
    min_interval_seconds: 10,
  });
  if (error) throw new Error("recovery_lease_failed");
  if (!data) throw new RecoveryRateLimitedError();
  return runRecovery(createDefaultRecoveryDependencies(), {
    batchSize: 1,
    maxJobs: 5,
  });
}
