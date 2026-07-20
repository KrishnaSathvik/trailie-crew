import {
  trailieResponseDraftV1Schema,
  trailieResponseV1Schema,
  type TrailieIntent,
  type TrailieResponseDraftV1,
} from "@trailie/schemas";

import { getTrailieIntentPolicy } from "./intent";
import { sanitizeTrailieMarkdown } from "../rendering/safe-markdown";

export class TrailieResponseValidationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "TrailieResponseValidationError";
  }
}

function fail(code: string): never {
  throw new TrailieResponseValidationError(code);
}

function sensitiveInternalContent(value: string) {
  return /\b(?:ignore (?:the |your )?(?:system|developer) (?:prompt|instructions)|reveal (?:private memory|hidden prompt|api keys?|secrets?)|chain[- ]of[- ]thought|internal reasoning)\b/i.test(
    value,
  );
}

export function finalizeTrailieResponse(input: {
  draft: unknown;
  expectedIntent: TrailieIntent;
  responseId: string;
  sourceMessageId: string;
  now: string;
  requester?: {
    kind: "member" | "guest";
    permission?: "viewer" | "commenter" | "suggester";
  };
  referenceResolutionStatus?: "resolved" | "ambiguous" | "unresolved";
}) {
  const parsed = trailieResponseDraftV1Schema.safeParse(input.draft);
  if (!parsed.success) fail("invalid_response_contract");
  let draft: TrailieResponseDraftV1 = parsed.data;
  if (
    input.expectedIntent === "itinerary_revision" &&
    input.referenceResolutionStatus &&
    input.referenceResolutionStatus !== "resolved"
  ) {
    draft = {
      ...draft,
      blocks: draft.blocks.map((block) =>
        block.type === "itinerary_change_summary"
          ? { ...block, status: "needs_clarification" as const }
          : block,
      ),
      unresolvedQuestions:
        draft.unresolvedQuestions.length > 0
          ? draft.unresolvedQuestions
          : ["Which exact item should I change?"],
    };
  }
  if (draft.intent !== input.expectedIntent) fail("intent_mismatch");
  if (
    sensitiveInternalContent(draft.message) ||
    draft.warnings.some(sensitiveInternalContent) ||
    draft.assumptions.some(sensitiveInternalContent)
  )
    fail("sensitive_internal_content");

  const policy = getTrailieIntentPolicy(input.expectedIntent);
  const blockTypes = new Set(draft.blocks.map((block) => block.type));

  if (
    input.expectedIntent === "create_itinerary" &&
    !blockTypes.has("understanding_summary")
  )
    fail("understanding_summary_required");
  if (
    input.expectedIntent === "create_itinerary" &&
    (draft.approvalDirective !== "required" ||
      draft.persistenceDirective !== "none")
  )
    fail("planning_approval_gate_required");
  if (
    input.expectedIntent === "itinerary_revision" &&
    (draft.approvalDirective === "not_required" ||
      draft.persistenceDirective !== "propose_revision")
  )
    fail("revision_workflow_required");
  if (
    input.expectedIntent === "itinerary_revision" &&
    !blockTypes.has("itinerary_change_summary")
  )
    fail("revision_change_summary_required");
  if (draft.persistenceDirective !== policy.persistence)
    fail("persistence_directive_mismatch");
  if (policy.approvalRequired && draft.approvalDirective === "not_required")
    fail("approval_directive_mismatch");
  if (!policy.approvalRequired && draft.approvalDirective !== "not_required")
    fail("approval_directive_mismatch");

  if (
    input.expectedIntent === "booking_handoff" &&
    (/\b(?:i|we|trailie)\s+(?:booked|reserved|purchased|confirmed)\b/i.test(
      draft.message,
    ) ||
      /\b(?:your|the)\s+(?:hotel|room|flight|permit|reservation|booking)\s+(?:is|was|has been)\s+(?:booked|reserved|purchased|confirmed)\b/i.test(
        draft.message,
      ))
  )
    fail("booking_completion_claim");

  const freshSourceIds = new Set(
    draft.sources
      .filter(
        (source) => source.status === "verified" && source.checkedAt !== null,
      )
      .map((source) => source.sourceId),
  );
  const hasFreshEvidence =
    draft.freshness === "current" && freshSourceIds.size > 0;
  if (
    policy.externalEvidence === "required" &&
    draft.sources.length === 0 &&
    draft.freshness !== "unavailable"
  )
    fail("fresh_evidence_required");
  if (draft.freshness === "current" && !hasFreshEvidence)
    fail("fresh_evidence_required");

  for (const block of draft.blocks)
    if (!policy.outputBlocks.includes(block.type))
      fail(`block_not_permitted:${block.type}`);

  for (const block of draft.blocks) {
    if (block.type === "map_locations") {
      for (const location of block.locations) {
        const hasCoordinates =
          location.latitude !== null || location.longitude !== null;
        if (
          hasCoordinates &&
          (location.latitude === null ||
            location.longitude === null ||
            location.verification !== "verified" ||
            location.sourceId === null ||
            !freshSourceIds.has(location.sourceId))
        )
          fail("unsupported_coordinates");
      }
    }
    if (block.type === "route_summary") {
      if (block.verification === "verified" && !hasFreshEvidence)
        fail("fresh_evidence_required");
    }
    if (block.type === "hotel_options") {
      const claimsLiveInventory = block.options.some(
        (option) =>
          option.availabilityState !== "unknown" ||
          option.priceState !== "unavailable",
      );
      if (claimsLiveInventory && !hasFreshEvidence)
        fail("fresh_evidence_required");
    }
    if (block.type === "booking_options") {
      const claimsLiveInventory = block.options.some(
        (option) =>
          !["unknown", "unavailable"].includes(option.availability) ||
          option.price !== "unavailable",
      );
      if (claimsLiveInventory && !hasFreshEvidence)
        fail("fresh_evidence_required");
    }
    if (
      block.type === "weather_summary" &&
      block.state === "verified" &&
      !hasFreshEvidence
    )
      fail("fresh_evidence_required");
    if (block.type === "reservation_requirements") {
      const unsupportedRequirement = block.requirements.some(
        (requirement) =>
          requirement.requirement !== "unknown" &&
          (requirement.sourceId === null ||
            !freshSourceIds.has(requirement.sourceId)),
      );
      if (unsupportedRequirement) fail("fresh_evidence_required");
    }
    if (block.type === "evidence_summary") {
      const unsupportedVerifiedItem = block.items.some(
        (item) =>
          item.status === "verified" &&
          (item.sourceId === null || !freshSourceIds.has(item.sourceId)),
      );
      if (unsupportedVerifiedItem) fail("fresh_evidence_required");
    }
  }

  if (
    input.requester?.kind === "guest" &&
    draft.persistenceDirective !== "none"
  )
    fail("guest_persistence_not_allowed");

  const sanitizedDraft = {
    ...draft,
    message: sanitizeTrailieMarkdown(draft.message),
    blocks: draft.blocks.map((block) =>
      block.type === "markdown"
        ? { ...block, markdown: sanitizeTrailieMarkdown(block.markdown) }
        : block,
    ),
    privacyLevel: "room" as const,
  };

  return trailieResponseV1Schema.parse({
    ...sanitizedDraft,
    responseId: input.responseId,
    sourceMessageId: input.sourceMessageId,
    createdAt: input.now,
  });
}
