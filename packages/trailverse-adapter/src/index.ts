export type TrailVerseParkSummary = Readonly<{
  id: string;
  name: string;
  stateCodes: readonly string[];
}>;

export interface TrailVerseReadAdapter {
  getPark(id: string): Promise<TrailVerseParkSummary | null>;
  searchParks(query: string): Promise<readonly TrailVerseParkSummary[]>;
}

export type TrailVerseKnowledgeRecord = Readonly<{
  parkId: string;
  parkCode: string | null;
  displayName: string;
  providerEntityIds: Readonly<Record<string, string>>;
  officialLinks: readonly string[];
  lastCuratedAt: string;
  provenance: Readonly<{
    source: "trailverse_curated_mapping";
    liveStatus: "not_live_evidence";
  }>;
}>;

export type TrailVerseKnowledgeResult =
  | Readonly<{
      state: "available";
      record: TrailVerseKnowledgeRecord;
      reason: null;
    }>
  | Readonly<{
      state: "unavailable" | "not_found";
      record: null;
      reason: "stable_api_not_configured" | "not_found";
    }>;

export interface TrailVerseKnowledgeAdapter {
  getParkMapping(id: string): Promise<TrailVerseKnowledgeResult>;
  searchParkMappings(query: string): Promise<
    | Readonly<{
        state: "available";
        records: readonly TrailVerseKnowledgeRecord[];
        reason: null;
      }>
    | Readonly<{
        state: "unavailable";
        records: readonly [];
        reason: "stable_api_not_configured";
      }>
  >;
}

function safeOfficialLink(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const trusted =
      url.hostname === "nps.gov" ||
      url.hostname.endsWith(".nps.gov") ||
      url.hostname === "recreation.gov" ||
      url.hostname.endsWith(".recreation.gov");
    if (url.protocol !== "https:" || url.username || url.password || !trusted)
      return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeTrailVerseKnowledgeRecord(
  input: Readonly<Record<string, unknown>>,
): TrailVerseKnowledgeRecord {
  const providerEntityIds =
    input.providerEntityIds &&
    typeof input.providerEntityIds === "object" &&
    !Array.isArray(input.providerEntityIds)
      ? Object.fromEntries(
          Object.entries(input.providerEntityIds)
            .filter(
              ([key, value]) =>
                /^[a-z0-9_-]{1,40}$/i.test(key) &&
                typeof value === "string" &&
                /^[a-z0-9_-]{1,100}$/i.test(value),
            )
            .sort(([left], [right]) => left.localeCompare(right)),
        )
      : {};
  return {
    parkId:
      typeof input.parkId === "string" ? input.parkId.slice(0, 100) : "unknown",
    parkCode:
      typeof input.parkCode === "string" ? input.parkCode.slice(0, 20) : null,
    displayName:
      typeof input.displayName === "string"
        ? input.displayName.slice(0, 200)
        : "Unknown park",
    providerEntityIds,
    officialLinks: Array.isArray(input.officialLinks)
      ? input.officialLinks
          .map(safeOfficialLink)
          .filter((value): value is string => value !== null)
      : [],
    lastCuratedAt:
      typeof input.lastCuratedAt === "string"
        ? input.lastCuratedAt
        : new Date(0).toISOString(),
    provenance: {
      source: "trailverse_curated_mapping",
      liveStatus: "not_live_evidence",
    },
  };
}

export function preferOfficialTravelKnowledge<T>(input: {
  official: T | null;
  trailVerse: T | null;
}): Readonly<{
  value: T | null;
  source: "official" | "trailverse_curated_mapping" | "unavailable";
}> {
  if (input.official !== null)
    return { value: input.official, source: "official" };
  if (input.trailVerse !== null)
    return {
      value: input.trailVerse,
      source: "trailverse_curated_mapping",
    };
  return { value: null, source: "unavailable" };
}

export function createUnavailableTrailVerseKnowledgeAdapter(): TrailVerseKnowledgeAdapter {
  return {
    async getParkMapping() {
      return {
        state: "unavailable",
        record: null,
        reason: "stable_api_not_configured",
      };
    },
    async searchParkMappings() {
      return {
        state: "unavailable",
        records: [],
        reason: "stable_api_not_configured",
      };
    },
  };
}
