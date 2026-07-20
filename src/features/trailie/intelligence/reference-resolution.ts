export type TrailieReferenceEntity = Readonly<{
  id: string;
  kind:
    | "destination"
    | "hotel"
    | "flight"
    | "itinerary_item"
    | "map_location"
    | "plan_version"
    | "option";
  label: string;
  version?: number;
  aliases?: readonly string[];
}>;

type Input = Readonly<{
  request: string;
  explicitEntityId?: string | null;
  materialChange: boolean;
  currentMessageEntities?: readonly TrailieReferenceEntity[];
  recentEntities: readonly TrailieReferenceEntity[];
  currentEntities: readonly TrailieReferenceEntity[];
  versionEntities: readonly TrailieReferenceEntity[];
}>;

type Result =
  | {
      status: "resolved";
      entity: TrailieReferenceEntity;
      source:
        | "explicit_id"
        | "current_message"
        | "recent_conversation"
        | "current_plan"
        | "exact_version";
    }
  | {
      status: "ambiguous";
      candidates: TrailieReferenceEntity[];
      reason: "multiple_safe_matches";
    }
  | { status: "unresolved"; reason: "no_safe_match" };

function normalized(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function relevantTerms(request: string) {
  const ignored = new Set([
    "a",
    "an",
    "and",
    "can",
    "could",
    "it",
    "me",
    "move",
    "our",
    "please",
    "show",
    "that",
    "the",
    "this",
    "to",
    "us",
  ]);
  return normalized(request)
    .split(" ")
    .filter((term) => term.length > 2 && !ignored.has(term));
}

function matchEntities(
  request: string,
  entities: readonly TrailieReferenceEntity[],
) {
  const terms = relevantTerms(request);
  return entities.filter((entity) => {
    const labels = [entity.label, ...(entity.aliases ?? [])].map(normalized);
    return (
      labels.some((label) =>
        terms.some((term) => label.includes(term) || term.includes(label)),
      ) ||
      (entity.kind === "itinerary_item" &&
        terms.some((term) => term === "hike" || term === "trail"))
    );
  });
}

function resolved(
  candidates: readonly TrailieReferenceEntity[],
  source: Extract<Result, { status: "resolved" }>["source"],
): Result | null {
  if (candidates.length === 1)
    return { status: "resolved", entity: candidates[0], source };
  if (candidates.length > 1)
    return {
      status: "ambiguous",
      candidates: [...candidates],
      reason: "multiple_safe_matches",
    };
  return null;
}

export function resolveTrailieReference(input: Input): Result {
  const all = [
    ...(input.currentMessageEntities ?? []),
    ...input.recentEntities,
    ...input.currentEntities,
    ...input.versionEntities,
  ];
  if (input.explicitEntityId) {
    const exact = all.find((entity) => entity.id === input.explicitEntityId);
    if (exact)
      return { status: "resolved", entity: exact, source: "explicit_id" };
  }

  const ordinal = normalized(input.request).match(
    /\b(first|second|third|fourth|fifth)\s+option\b/,
  );
  if (ordinal) {
    const index = ["first", "second", "third", "fourth", "fifth"].indexOf(
      ordinal[1],
    );
    const option = input.recentEntities[index];
    if (option)
      return {
        status: "resolved",
        entity: option,
        source: "recent_conversation",
      };
  }

  const currentMessage = resolved(
    matchEntities(input.request, input.currentMessageEntities ?? []),
    "current_message",
  );
  if (currentMessage) return currentMessage;

  const recent = resolved(
    matchEntities(input.request, input.recentEntities),
    "recent_conversation",
  );
  if (recent) return recent;

  const current = resolved(
    matchEntities(input.request, input.currentEntities),
    "current_plan",
  );
  if (current) return current;

  const versionMatch = normalized(input.request).match(/\bversion\s+(\d+)\b/);
  if (versionMatch) {
    const version = Number(versionMatch[1]);
    const exact = input.versionEntities.filter(
      (entity) => entity.version === version,
    );
    const result = resolved(exact, "exact_version");
    if (result) return result;
  }

  if (!input.materialChange) {
    const kindMatch = normalized(input.request).match(
      /\b(hotel|flight|hike|trail|place|option)\b/,
    )?.[1];
    if (kindMatch) {
      const candidates = [
        ...input.recentEntities,
        ...input.currentEntities,
      ].filter(
        (entity) =>
          entity.kind === kindMatch ||
          (kindMatch === "hike" && entity.kind === "itinerary_item") ||
          (kindMatch === "trail" && entity.kind === "itinerary_item"),
      );
      const result = resolved(candidates, "recent_conversation");
      if (result) return result;
    }
  }

  return { status: "unresolved", reason: "no_safe_match" };
}
