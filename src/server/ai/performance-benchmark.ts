import type { TrailieIntent } from "@trailie/schemas";

import type {
  TrailieModelRoute,
  TrailieRequestComplexity,
} from "./model-router";
import { summarizeRuntimeSamples } from "./runtime-telemetry";

export type Phase8bBenchmarkCategory =
  | "simple_chat"
  | "context_backed"
  | "tool_backed"
  | "planning_summary"
  | "full_itinerary"
  | "small_revision"
  | "large_revision";

export type Phase8bBenchmarkFixture = {
  id: string;
  category: Phase8bBenchmarkCategory;
  intent: TrailieIntent;
  complexity: TrailieRequestComplexity;
  expectedRoute: TrailieModelRoute;
  request: string;
  structured: boolean;
};

export type Phase8bBenchmarkObservation = {
  fixtureId: string;
  selectedRoute: TrailieModelRoute;
  visibleStateMs: number;
  firstTokenMs: number | null;
  totalDurationMs: number;
  toolTimeMs: number;
  validationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCost: number | null;
  state: "success" | "failure" | "cancelled" | "timeout" | "fallback";
  fallbackReason: string | null;
};

const definitions: Array<{
  category: Phase8bBenchmarkCategory;
  count: number;
  intent: TrailieIntent;
  complexity: TrailieRequestComplexity;
  expectedRoute: TrailieModelRoute;
  request: string;
  structured: boolean;
}> = [
  {
    category: "simple_chat",
    count: 10,
    intent: "direct_question",
    complexity: "simple",
    expectedRoute: "fast",
    request: "What should a crew discuss before departure?",
    structured: false,
  },
  {
    category: "context_backed",
    count: 10,
    intent: "trip_context_question",
    complexity: "context_backed",
    expectedRoute: "fast",
    request: "Summarize the saved trip constraints.",
    structured: false,
  },
  {
    category: "tool_backed",
    count: 5,
    intent: "weather_question",
    complexity: "tool_backed",
    expectedRoute: "tool_pipeline",
    request: "Check current travel conditions for the saved destination.",
    structured: true,
  },
  {
    category: "planning_summary",
    count: 3,
    intent: "create_itinerary",
    complexity: "planning_summary",
    expectedRoute: "reasoning_planning",
    request: "Prepare the current trip understanding for crew review.",
    structured: true,
  },
  {
    category: "full_itinerary",
    count: 3,
    intent: "create_itinerary",
    complexity: "full_itinerary",
    expectedRoute: "reasoning_planning",
    request: "Build the approved day-by-day plan.",
    structured: true,
  },
  {
    category: "small_revision",
    count: 5,
    intent: "itinerary_revision",
    complexity: "small_revision",
    expectedRoute: "fast",
    request: "Move one saved activity later on its current day.",
    structured: true,
  },
  {
    category: "large_revision",
    count: 3,
    intent: "itinerary_revision",
    complexity: "large_revision",
    expectedRoute: "reasoning_planning",
    request: "Change the trip dates and rebuild the affected range.",
    structured: true,
  },
];

export function buildPhase8bBenchmarkFixtures(): Phase8bBenchmarkFixture[] {
  return definitions.flatMap((definition) =>
    Array.from({ length: definition.count }, (_, index) => ({
      ...definition,
      id: `${definition.category}-${String(index + 1).padStart(2, "0")}`,
    })),
  );
}

function sumNullable(values: Array<number | null>) {
  const available = values.filter((value): value is number => value !== null);
  return available.length === 0
    ? null
    : available.reduce((total, value) => total + value, 0);
}

function summarize(observations: Phase8bBenchmarkObservation[]) {
  const routes = observations.reduce<
    Partial<Record<TrailieModelRoute, number>>
  >((result, observation) => {
    result[observation.selectedRoute] =
      (result[observation.selectedRoute] ?? 0) + 1;
    return result;
  }, {});
  return {
    count: observations.length,
    visibleStateMs: summarizeRuntimeSamples(
      observations.map((item) => item.visibleStateMs),
    ),
    firstTokenMs: summarizeRuntimeSamples(
      observations.flatMap((item) =>
        item.firstTokenMs === null ? [] : [item.firstTokenMs],
      ),
    ),
    totalDurationMs: summarizeRuntimeSamples(
      observations.map((item) => item.totalDurationMs),
    ),
    toolTimeMs: summarizeRuntimeSamples(
      observations.map((item) => item.toolTimeMs),
    ),
    validationMs: summarizeRuntimeSamples(
      observations.map((item) => item.validationMs),
    ),
    routes,
    inputTokens: sumNullable(observations.map((item) => item.inputTokens)),
    outputTokens: sumNullable(observations.map((item) => item.outputTokens)),
    estimatedCost: sumNullable(observations.map((item) => item.estimatedCost)),
    failures: observations.filter((item) => item.state === "failure").length,
    fallbacks: observations.filter((item) => item.state === "fallback").length,
    cancellations: observations.filter((item) => item.state === "cancelled")
      .length,
  };
}

export async function runPhase8bBenchmark(input: {
  fixtures?: Phase8bBenchmarkFixture[];
  execute(
    fixture: Phase8bBenchmarkFixture,
  ): Promise<Phase8bBenchmarkObservation>;
}) {
  const fixtures = input.fixtures ?? buildPhase8bBenchmarkFixtures();
  const observations: Phase8bBenchmarkObservation[] = [];
  for (const fixture of fixtures)
    observations.push(await input.execute(fixture));
  const grouped = Object.groupBy(
    observations,
    (observation) =>
      fixtures.find((fixture) => fixture.id === observation.fixtureId)!
        .category,
  );
  const categories = Object.fromEntries(
    definitions.map(({ category }) => [
      category,
      summarize(grouped[category] ?? []),
    ]),
  ) as Record<Phase8bBenchmarkCategory, ReturnType<typeof summarize>>;
  return {
    totalRequests: observations.length,
    failures: observations.filter((item) => item.state === "failure").length,
    fallbacks: observations.filter((item) => item.state === "fallback").length,
    cancellations: observations.filter((item) => item.state === "cancelled")
      .length,
    estimatedCost:
      sumNullable(observations.map((item) => item.estimatedCost)) ?? 0,
    categories,
    observations,
  };
}
