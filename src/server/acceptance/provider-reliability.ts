export const providerAcceptanceCases = [
  { workflow: "focused_answer", runs: 3 },
  { workflow: "memory_extraction", runs: 3 },
  { workflow: "planning_summary", runs: 2 },
  { workflow: "itinerary_generation", runs: 2 },
  { workflow: "itinerary_repair", runs: 1 },
  { workflow: "revision_analysis", runs: 2 },
  { workflow: "revision_candidate", runs: 2 },
] as const;

export type ProviderAcceptanceWorkflow =
  (typeof providerAcceptanceCases)[number]["workflow"];

export const providerAcceptanceRunCount = providerAcceptanceCases.reduce(
  (total, item) => total + item.runs,
  0,
);

export type ProviderAcceptanceRun = {
  workflow: ProviderAcceptanceWorkflow;
  model: string;
  requestId: string | null;
  providerStatus: string;
  applicationStatus: string;
  providerDurationMs: number;
  totalDurationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  retryCount: number;
  repairCount: number;
  finalErrorCode: string | null;
  recoveryNeeded: boolean;
};

const range = (values: number[]) => ({
  minimum: Math.min(...values),
  maximum: Math.max(...values),
});

export function buildProviderAcceptanceReport(runs: ProviderAcceptanceRun[]) {
  const summary = Object.fromEntries(
    providerAcceptanceCases.flatMap(({ workflow }) => {
      const selected = runs.filter((run) => run.workflow === workflow);
      if (!selected.length) return [];
      return [
        [
          workflow,
          {
            samples: selected.length,
            successes: selected.filter(
              (run) => run.applicationStatus === "completed",
            ).length,
            failures: selected.filter(
              (run) => run.applicationStatus !== "completed",
            ).length,
            observedProviderDurationMs: range(
              selected.map((run) => run.providerDurationMs),
            ),
            observedTotalDurationMs: range(
              selected.map((run) => run.totalDurationMs),
            ),
          },
        ] as const,
      ];
    }),
  ) as Partial<
    Record<
      ProviderAcceptanceWorkflow,
      {
        samples: number;
        successes: number;
        failures: number;
        observedProviderDurationMs: { minimum: number; maximum: number };
        observedTotalDurationMs: { minimum: number; maximum: number };
      }
    >
  >;
  return {
    schemaVersion: "1" as const,
    samplePolicy: "observed_ranges_only" as const,
    expectedRunCount: providerAcceptanceRunCount,
    completedRunCount: runs.length,
    runs,
    summary,
  };
}
