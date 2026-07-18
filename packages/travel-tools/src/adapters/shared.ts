import { createHash } from "node:crypto";

import {
  travelEvidenceV1Schema,
  type TravelEvidenceType,
  type TravelEvidenceV1,
} from "@trailie/schemas";

import {
  travelProviderResponseSchema,
  type TravelProviderResponse,
} from "../contracts";
import {
  normalizeTravelProviderError,
  type NormalizedTravelProviderError,
} from "../errors";

type EvidenceInput = Readonly<{
  provider: string;
  evidenceType: TravelEvidenceType;
  sourceName: string;
  sourceUrl: string | null;
  sourceEntityId?: string | null;
  now: string;
  ttlSeconds?: number;
  observedAt?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  verificationState?:
    "verified" | "partially_verified" | "unverified" | "inferred" | "failed";
  confidence?: "high" | "medium" | "low";
  availabilityState?:
    | "available"
    | "partial"
    | "unavailable"
    | "ambiguous"
    | "not_found"
    | "unsupported";
  locationBinding?: TravelEvidenceV1["locationBinding"];
  entityBinding?: TravelEvidenceV1["entityBinding"];
  data?: Record<string, unknown>;
  providerMetadata?: Record<string, unknown>;
  attribution: TravelEvidenceV1["attribution"];
  storage?: "permanent" | "bounded" | "prohibited" | "unknown";
  displayRestriction: string;
  cacheStatus?: TravelEvidenceV1["cacheStatus"];
  requestId?: string | null;
  errorState?: TravelEvidenceV1["errorState"];
}>;

function plusSeconds(iso: string, seconds: number) {
  return new Date(new Date(iso).getTime() + seconds * 1_000).toISOString();
}

export function makeTravelEvidence(input: EvidenceInput): TravelEvidenceV1 {
  const availabilityState = input.availabilityState ?? "available";
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        provider: input.provider,
        evidenceType: input.evidenceType,
        sourceEntityId: input.sourceEntityId ?? null,
        data: input.data ?? {},
      }),
    )
    .digest("hex")
    .slice(0, 32);
  const freshnessState =
    availabilityState === "available" || availabilityState === "partial"
      ? "fresh"
      : "unavailable";
  return travelEvidenceV1Schema.parse({
    schemaVersion: "1",
    evidenceId: `evidence:${input.provider}:${input.evidenceType}:${fingerprint}`,
    evidenceType: input.evidenceType,
    provider: input.provider,
    sourceName: input.sourceName,
    sourceUrl: input.sourceUrl,
    sourceEntityId: input.sourceEntityId ?? null,
    retrievedAt: input.now,
    observedAt: input.observedAt ?? null,
    validFrom: input.validFrom ?? null,
    validUntil:
      input.validUntil ??
      (input.ttlSeconds ? plusSeconds(input.now, input.ttlSeconds) : null),
    freshnessState,
    verificationState:
      input.verificationState ??
      (freshnessState === "unavailable" ? "failed" : "verified"),
    confidence:
      input.confidence ?? (freshnessState === "unavailable" ? "low" : "high"),
    availabilityState,
    locationBinding: input.locationBinding ?? null,
    entityBinding: input.entityBinding ?? null,
    normalizedValue: {
      kind: input.evidenceType,
      data: input.data ?? {},
    },
    providerMetadata: input.providerMetadata ?? {},
    attribution: input.attribution,
    restrictions: {
      storage: input.storage ?? "bounded",
      display: input.displayRestriction,
    },
    cacheStatus: input.cacheStatus ?? "miss",
    requestId: input.requestId ?? null,
    errorState: input.errorState ?? null,
  });
}

export function makeTravelResponse(
  state: TravelProviderResponse["state"],
  evidence: TravelEvidenceV1[],
  warnings: string[] = [],
) {
  return travelProviderResponseSchema.parse({ state, evidence, warnings });
}

export function makeProviderFailure(input: {
  provider: string;
  evidenceType: TravelEvidenceType;
  sourceName: string;
  sourceUrl: string | null;
  now: string;
  attribution: TravelEvidenceV1["attribution"];
  displayRestriction: string;
  error: unknown;
}) {
  const normalized = normalizeTravelProviderError(input.error);
  return makeTravelResponse("unavailable", [
    makeTravelEvidence({
      ...input,
      availabilityState:
        normalized.code === "not_found" ? "not_found" : "unavailable",
      verificationState: "failed",
      confidence: "low",
      data: {},
      errorState: normalized,
    }),
  ]);
}

export function makeUnsupported(input: {
  provider: string;
  evidenceType: TravelEvidenceType;
  sourceName: string;
  sourceUrl: string | null;
  now: string;
  attribution: TravelEvidenceV1["attribution"];
  displayRestriction: string;
}) {
  return makeTravelResponse("unsupported", [
    makeTravelEvidence({
      ...input,
      availabilityState: "unsupported",
      verificationState: "unverified",
      confidence: "low",
      data: {},
      errorState: {
        code: "unsupported_capability",
        retryable: false,
        httpStatus: null,
      },
    }),
  ]);
}

export const normalizeAdapterError = (
  error: unknown,
): NormalizedTravelProviderError => normalizeTravelProviderError(error);
