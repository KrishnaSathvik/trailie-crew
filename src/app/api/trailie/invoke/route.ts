import { z } from "zod";
import {
  itinerarySchema,
  planVersionSummarySchema,
  roomMemorySnapshotSchema,
  trailieResponseDraftV1Schema,
  trailieResponseV1Schema,
  trailieStreamEventSchema,
  type TrailieProgressStage,
  tripPlanViewSchema,
  type TrailieResponseV1,
} from "@trailie/schemas";

import {
  buildTrailieContext,
  type TrailieContextSection,
} from "@/features/trailie/intelligence/context";
import {
  classifyTrailieIntent,
  getTrailieIntentPolicy,
} from "@/features/trailie/intelligence/intent";
import { finalizeTrailieResponse } from "@/features/trailie/intelligence/response-contract";
import {
  resolveTrailieReference,
  type TrailieReferenceEntity,
} from "@/features/trailie/intelligence/reference-resolution";
import { authorizeTrailieSource } from "@/features/trailie/invocation/authorize-source";
import { detectTrailieInvocation } from "@/features/trailie/invocation/detect-invocation";
import { parseOpenAIEnv, parseTravelProviderEnv } from "@/server/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assembleFocusedContext } from "@/server/ai/context";
import { logAiEvent } from "@/server/ai/logger";
import {
  createTrailieRuntimeRouter,
  type TrailieRequestComplexity,
} from "@/server/ai/model-router";
import { createOpenAIFocusedAnswerProvider } from "@/server/ai/openai-provider";
import {
  createFakeFocusedAnswerProvider,
  TrailieProviderError,
  type FocusedAnswerProvider,
} from "@/server/ai/provider";
import { createSafetyIdentifier } from "@/server/ai/safety-identifier";
import {
  AiQuotaError,
  createDurableAiQuotaReservation,
} from "@/server/ai/quota";
import { createAdminSupabaseClient } from "@/server/supabase/admin";
import { createCorrelationId, logOperation } from "@/server/operations/logger";
import {
  createDurableProviderAttemptController,
  runDurableProviderOperation,
} from "@/server/ai/provider-attempts";
import { createProviderAttemptRepository } from "@/server/ai/provider-attempt-repository";
import type { ProviderAttemptExecutionResult } from "@/server/ai/provider-attempts";
import { ProviderFailure } from "@/server/ai/reliability-policy";
import { consumeFocusedStream } from "@/server/ai/focused-stream";
import { withHostedFocusedFault } from "@/server/ai/hosted-acceptance-faults";
import { createSafeTrailieTextStream } from "@/server/ai/safe-streaming";
import {
  createRuntimeTrace,
  type TrailieResponseType,
  type TrailieToolClass,
} from "@/server/ai/runtime-telemetry";
import { createRuntimeTelemetryRepository } from "@/server/ai/runtime-telemetry-repository";
import {
  createTravelProviderRegistry,
  withTravelProviderCache,
} from "@/server/travel/provider-registry";
import { createTravelProviderCacheRepository } from "@/server/travel/cache-repository";
import { createTravelProviderOperationController } from "@/server/travel/operation-repository";
import { collectDestinationTravelEvidence } from "@/server/travel/intelligence";

export const runtime = "nodejs";
export const maxDuration = 60;

const inputSchema = z
  .object({
    roomId: z.uuid(),
    participantId: z.uuid(),
    sourceMessageId: z.uuid(),
    entityId: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .strict();

type SafeRecord = Record<string, unknown>;
const asRecord = (value: unknown) =>
  typeof value === "object" && value !== null ? (value as SafeRecord) : {};
const asString = (value: unknown) => (typeof value === "string" ? value : null);

function memoryValue(value: unknown) {
  const record = asRecord(value);
  for (const key of ["text", "question", "startDate", "endDate"]) {
    const item = asString(record[key]);
    if (item) return item;
  }
  return null;
}

function factValues(items: unknown) {
  return Array.isArray(items)
    ? items
        .map((item) => memoryValue(asRecord(item).value))
        .filter((item): item is string => item !== null)
    : [];
}

function boundedJson(value: unknown, maximum = 5_000) {
  const serialized = JSON.stringify(value);
  return serialized.length <= maximum
    ? serialized
    : `${serialized.slice(0, maximum - 1)}…`;
}

export function parseRoomMemory(roomId: string, value: unknown) {
  const root = asRecord(value);
  const snapshot = asRecord(root.snapshot ?? value);
  const sharedContext = asRecord(
    snapshot.shared_context ?? snapshot.sharedContext,
  );
  return roomMemorySnapshotSchema.safeParse({
    roomId,
    memoryVersion: snapshot.memory_version ?? snapshot.memoryVersion ?? 0,
    participantProfiles:
      snapshot.participant_profiles ?? snapshot.participantProfiles ?? {},
    sharedContext: {
      destinationsUnderConsideration:
        sharedContext.destinationsUnderConsideration ?? [],
      dateWindows: sharedContext.dateWindows ?? [],
      budgetContext: sharedContext.budgetContext ?? [],
      transportContext: sharedContext.transportContext ?? [],
      lodgingContext: sharedContext.lodgingContext ?? [],
    },
    confirmedDecisions:
      snapshot.confirmed_decisions ?? snapshot.confirmedDecisions ?? [],
    rejectedOptions:
      snapshot.rejected_options ?? snapshot.rejectedOptions ?? [],
    openQuestions: snapshot.open_questions ?? snapshot.openQuestions ?? [],
    updatedAt:
      snapshot.updated_at ?? snapshot.updatedAt ?? "1970-01-01T00:00:00.000Z",
  });
}

function planEntities(value: unknown): TrailieReferenceEntity[] {
  const parsed = itinerarySchema.safeParse(value);
  if (!parsed.success) return [];
  return [
    ...parsed.data.lodging.map((item) => ({
      id: item.id,
      kind: "hotel" as const,
      label: item.name,
      aliases: [item.area],
    })),
    ...parsed.data.days.flatMap((day) =>
      day.items.map((item) => ({
        id: item.id,
        kind: "itinerary_item" as const,
        label: item.title,
        aliases: item.location ? [item.location.name, item.type] : [item.type],
      })),
    ),
  ];
}

const contextSectionNames = new Set<TrailieContextSection>([
  "trip",
  "requester_permissions",
  "shared_trip_context",
  "crew_signals",
  "recent_messages",
  "current_plan",
  "version_history",
  "planning",
  "revision",
  "selected_lodging",
  "selected_flights",
  "evidence",
]);

function jsonError(code: string, status: number) {
  return Response.json({ code }, { status });
}

function providerFor(
  environment: ReturnType<typeof parseOpenAIEnv>,
): FocusedAnswerProvider {
  if (environment.provider === "fake")
    return createFakeFocusedAnswerProvider({ failOnce: true });
  if (!environment.apiKey) throw new Error("missing_openai_configuration");
  return withHostedFocusedFault(
    createOpenAIFocusedAnswerProvider({
      apiKey: environment.apiKey,
      timeoutMs: environment.reliabilityPolicy.timeoutsMs.focusedProvider,
    }),
  );
}

function responseTypeFor(
  complexity: TrailieRequestComplexity,
): TrailieResponseType {
  if (complexity === "context_backed") return "context_backed";
  if (complexity === "tool_backed" || complexity === "evidence_refresh")
    return "tool_backed";
  if (complexity === "planning_summary") return "planning_summary";
  if (complexity === "full_itinerary") return "full_itinerary";
  if (complexity === "small_revision") return "small_revision";
  if (complexity === "large_revision") return "large_revision";
  if (complexity === "map_resolution") return "map";
  if (complexity === "booking_guidance") return "booking";
  if (complexity === "unsupported") return "unsupported";
  return "normal_chat";
}

function selectedToolClasses(intent: string): TrailieToolClass[] {
  if (intent === "weather_question") return ["weather", "database_read"];
  if (intent === "permit_question") return ["nps", "ridb", "database_read"];
  if (intent === "route_question")
    return ["maps_geocoding", "directions", "database_read"];
  if (intent === "map_question") return ["maps_geocoding", "database_read"];
  if (intent === "evidence_question") return ["nps", "ridb", "database_read"];
  if (
    [
      "reservation_question",
      "lodging_recommendation",
      "lodging_search",
      "flight_guidance",
      "flight_search",
      "booking_handoff",
    ].includes(intent)
  )
    return [
      "booking_normalization",
      "approved_search_handoff",
      "database_read",
    ];
  return ["database_read"];
}

function progressStageFor(
  complexity: TrailieRequestComplexity,
): TrailieProgressStage {
  if (complexity === "planning_summary") return "understanding_trip";
  if (complexity === "small_revision" || complexity === "large_revision")
    return "reviewing_requested_change";
  if (complexity === "map_resolution") return "preparing_map";
  if (complexity === "booking_guidance") return "preparing_provider_links";
  return "preparing_answer";
}

function localUnsupportedDraft() {
  return trailieResponseDraftV1Schema.parse({
    schemaVersion: "1",
    intent: "unsupported_action",
    message: "I cannot complete that action.",
    blocks: [
      {
        type: "error_state",
        title: "That action is not available",
        detail: "I can help you prepare the next step instead.",
        actionLabel: null,
      },
    ],
    warnings: [],
    sources: [],
    assumptions: [],
    unresolvedQuestions: [],
    suggestedActions: [],
    persistenceDirective: "none",
    approvalDirective: "not_required",
    freshness: "not_applicable",
    privacyLevel: "room",
  });
}

export async function POST(request: Request) {
  const requestReceivedAt = Date.now();
  const correlationId = createCorrelationId();
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("source_message_invalid", 400);

  const permissionStartedAt = Date.now();
  const client = await createServerSupabaseClient();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return jsonError("membership_required", 401);

  const admin = createAdminSupabaseClient();
  const [participantResult, sourceResult] = await Promise.all([
    admin
      .from("participants")
      .select("*")
      .eq("id", parsed.data.participantId)
      .maybeSingle(),
    admin
      .from("messages")
      .select("*")
      .eq("id", parsed.data.sourceMessageId)
      .maybeSingle(),
  ]);
  const participant = participantResult.data;
  const source = sourceResult.data;
  if (
    participantResult.error ||
    sourceResult.error ||
    !participant ||
    !source
  ) {
    return jsonError("source_message_invalid", 404);
  }
  if (
    !authorizeTrailieSource({
      authUserId: authData.user.id,
      roomId: parsed.data.roomId,
      participant: {
        id: participant.id,
        roomId: participant.room_id,
        userId: participant.user_id,
        status: participant.status,
      },
      source: {
        id: source.id,
        roomId: source.room_id,
        participantId: source.participant_id,
        senderUserId: source.sender_user_id,
        messageType: source.message_type,
        deletedAt: source.deleted_at,
      },
    })
  )
    return jsonError("permission_denied", 403);
  const permissionEndedAt = Date.now();

  const contextStartedAt = Date.now();
  let replyTargetType: "user" | "system" | "trailie" | null = null;
  let replyTarget: typeof source | null = null;
  if (source.reply_to_message_id) {
    const { data: reply } = await admin
      .from("messages")
      .select("*")
      .eq("id", source.reply_to_message_id)
      .maybeSingle();
    if (
      reply &&
      reply.room_id === parsed.data.roomId &&
      reply.deleted_at === null
    ) {
      replyTargetType = reply.message_type;
      replyTarget = reply;
    }
  }
  const invocationDetectionStartedAt = Date.now();
  const decision = detectTrailieInvocation({
    body: source.body,
    replyTargetType,
  });
  const invocationDetectionEndedAt = Date.now();
  if (!decision.invoked) return jsonError("trailie_not_invoked", 422);

  let environment: ReturnType<typeof parseOpenAIEnv>;
  try {
    environment = parseOpenAIEnv(process.env);
  } catch {
    return jsonError("openai_authentication_failed", 503);
  }
  if (!environment.generationEnabled)
    return jsonError("ai_generation_disabled", 503);

  const { data: invocationData, error: invocationError } = await admin.rpc(
    "create_ai_invocation",
    {
      target_room_id: parsed.data.roomId,
      target_source_message_id: parsed.data.sourceMessageId,
      target_participant_id: parsed.data.participantId,
      target_invocation_type: decision.invocationType,
      target_normalized_request: decision.normalizedRequest,
      target_prompt_version: environment.promptVersion,
    },
  );
  if (invocationError) {
    const rateLimited = invocationError.message.includes("rate limit");
    logOperation(
      rateLimited
        ? "rate_limit.focused_answer"
        : "trailie_ai.invocation_failed",
      {
        correlationId,
        workflow: "focused_answer",
        status: "rejected",
        errorCode: rateLimited ? "rate_limited" : "invocation_failed",
      },
    );
    return jsonError(
      rateLimited ? "openai_rate_limited" : "invocation_failed",
      429,
    );
  }
  const invocation = asRecord(invocationData);
  const invocationId = asString(invocation.id);
  if (!invocationId) return jsonError("invocation_failed", 500);

  if (invocation.status === "completed")
    return jsonError("retry_not_allowed", 409);

  const { data: recentRows, error: contextError } = await admin
    .from("messages")
    .select("*")
    .eq("room_id", parsed.data.roomId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(14);
  if (contextError) return jsonError("context_unavailable", 503);
  const contextRows = [...(recentRows ?? [])];
  if (replyTarget && !contextRows.some((item) => item.id === replyTarget.id)) {
    contextRows.push(replyTarget);
  }
  const { data: contextParticipants } = await client
    .from("participants")
    .select("id,display_name")
    .eq("room_id", parsed.data.roomId)
    .eq("status", "active");
  const names = new Map(
    (contextParticipants ?? []).map((item) => [item.id, item.display_name]),
  );
  const context = assembleFocusedContext(
    contextRows.map((item) => ({
      id: item.id,
      body: item.body,
      displayName:
        item.message_type === "trailie"
          ? "Trailie"
          : (names.get(item.participant_id) ?? "Crew member"),
      messageType: item.message_type,
      createdAt: item.created_at,
      deletedAt: item.deleted_at,
    })),
    {
      maxMessages: 12,
      maxCharacters: 12_000,
      requiredMessageIds: [source.id, ...(replyTarget ? [replyTarget.id] : [])],
    },
  );
  const intentClassificationStartedAt = Date.now();
  const intent = classifyTrailieIntent({ request: decision.normalizedRequest });
  const intentClassificationEndedAt = Date.now();
  const route = createTrailieRuntimeRouter({
    fast: environment.conversationModel,
    reasoning: environment.flagshipModel,
    planning: environment.planningModel,
    itinerary: environment.itineraryModel,
  }).route({
    intent,
    request: decision.normalizedRequest,
  });
  const [
    roomResult,
    memoryResult,
    planResult,
    planningResult,
    revisionResult,
    versionResult,
  ] = await Promise.all([
    client.from("rooms").select("*").eq("id", parsed.data.roomId).maybeSingle(),
    admin.rpc("get_private_room_memory", {
      target_room_id: parsed.data.roomId,
    }),
    client.rpc("get_trip_plan", {
      target_room_id: parsed.data.roomId,
    }),
    client
      .from("planning_requests")
      .select("*")
      .eq("room_id", parsed.data.roomId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("plan_change_requests")
      .select("*")
      .eq("room_id", parsed.data.roomId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client.rpc("list_plan_versions", {
      target_room_id: parsed.data.roomId,
    }),
  ]);
  if (roomResult.error || !roomResult.data || memoryResult.error) {
    logOperation("trailie_ai.context_failed", {
      correlationId,
      workflow: "focused_answer",
      status: "failed",
      errorCode: roomResult.error
        ? `room_context_unavailable:${roomResult.error.code ?? "unknown"}`
        : memoryResult.error
          ? "memory_context_unavailable"
          : "room_context_missing",
    });
    return jsonError("context_unavailable", 503);
  }

  const memory = parseRoomMemory(parsed.data.roomId, memoryResult.data);
  if (!memory.success) {
    logOperation("trailie_ai.context_failed", {
      correlationId,
      workflow: "focused_answer",
      status: "failed",
      errorCode: "memory_context_invalid",
    });
    return jsonError("context_unavailable", 503);
  }
  const [planningApprovalsResult, revisionApprovalsResult] = await Promise.all([
    planningResult.data
      ? client
          .from("planning_approvals")
          .select("participant_id,decision")
          .eq("planning_request_id", planningResult.data.id)
      : Promise.resolve({ data: [], error: null }),
    revisionResult.data
      ? client
          .from("plan_change_approvals")
          .select("participant_id,decision")
          .eq("change_request_id", revisionResult.data.id)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const shared = memory.data.sharedContext;
  const participantProfiles = Object.values(memory.data.participantProfiles);
  const currentPlan = tripPlanViewSchema.nullable().safeParse(planResult.data);
  const planVersions = z
    .array(planVersionSummarySchema)
    .safeParse(versionResult.data);
  const intentPolicy = getTrailieIntentPolicy(intent);
  const requiredContextFailed =
    (intentPolicy.requiredContext.includes("current_plan") &&
      (Boolean(planResult.error) || !currentPlan.success)) ||
    (intentPolicy.requiredContext.includes("planning") &&
      Boolean(planningResult.error)) ||
    (intentPolicy.requiredContext.includes("revision") &&
      Boolean(revisionResult.error)) ||
    (intentPolicy.requiredContext.includes("version_history") &&
      (Boolean(versionResult.error) || !planVersions.success)) ||
    (intentPolicy.requiredContext.includes("approvals") &&
      (Boolean(planningApprovalsResult.error) ||
        Boolean(revisionApprovalsResult.error)));
  if (requiredContextFailed) {
    logOperation("trailie_ai.context_failed", {
      correlationId,
      workflow: "focused_answer",
      status: "failed",
      errorCode: "required_context_unavailable",
    });
    return jsonError("context_unavailable", 503);
  }
  const requestedSections = new Set<TrailieContextSection>([
    "trip",
    "requester_permissions",
    "recent_messages",
    ...intentPolicy.requiredContext.filter(
      (section): section is TrailieContextSection =>
        contextSectionNames.has(section as TrailieContextSection),
    ),
  ]);
  if (intentPolicy.requiredContext.includes("approvals")) {
    requestedSections.add("planning");
    requestedSections.add("revision");
  }
  if (intentPolicy.externalEvidence !== "not_required")
    requestedSections.add("evidence");
  if (intent.startsWith("lodging_")) requestedSections.add("selected_lodging");
  if (intent.startsWith("flight_")) requestedSections.add("selected_flights");
  const currentItinerary =
    currentPlan.success && currentPlan.data?.itinerary
      ? itinerarySchema.safeParse(currentPlan.data.itinerary)
      : null;
  let currentEvidence: readonly Record<string, unknown>[] = [];
  let toolPipelineDurationMs: number | null = null;
  let toolPipelineState: "success" | "failure" = "failure";
  let toolDurationsByCapability: Readonly<Record<string, number>> = {};
  if (route.route === "tool_pipeline") {
    const destination =
      factValues(shared.destinationsUnderConsideration)[0] ??
      currentItinerary?.data?.destinationSummary ??
      null;
    if (destination) {
      const toolStartedAt = Date.now();
      try {
        const travelEnvironment = parseTravelProviderEnv(process.env);
        const operationController = createTravelProviderOperationController({
          roomId: parsed.data.roomId,
          workflowKey: `focused:${invocationId}`,
          environment:
            process.env.VERCEL_ENV === "production"
              ? "production"
              : process.env.VERCEL_ENV === "preview"
                ? "hosted-acceptance"
                : process.env.NODE_ENV === "test"
                  ? "test"
                  : "local",
          roomDailyLimit: travelEnvironment.roomDailyLimit,
          globalDailyLimit: travelEnvironment.globalDailyLimit,
        });
        const registry = withTravelProviderCache(
          createTravelProviderRegistry(
            environment.provider === "fake"
              ? {
                  mode: "fake",
                  environment: travelEnvironment,
                  scenario: "baseline",
                }
              : { mode: "live", environment: travelEnvironment },
          ),
          {
            cache: createTravelProviderCacheRepository(),
            environment:
              process.env.VERCEL_ENV === "production"
                ? "production"
                : process.env.VERCEL_ENV === "preview"
                  ? "hosted-acceptance"
                  : process.env.NODE_ENV === "test"
                    ? "test"
                    : "local",
            bypass: process.env.TRAVEL_CACHE_BYPASS === "true",
            authorizeRequest: operationController.authorize,
            recordRequest: operationController.record,
          },
        );
        const evidenceResult = await collectDestinationTravelEvidence({
          destination,
          dates: factValues(shared.dateWindows),
          locale: "en-US",
          providers: registry,
          maximumCallsPerProvider: environment.provider === "fake" ? 8 : 12,
          signal: request.signal,
        });
        const evidence = [...evidenceResult.evidence];
        const capabilityDurations = {
          ...evidenceResult.durationMsByCapability,
        };
        if (intent === "route_question" && currentItinerary?.success) {
          const segment = currentItinerary.data.days
            .flatMap((day) => day.travelSegments)
            .find(
              (candidate) =>
                candidate.origin.latitude !== null &&
                candidate.origin.longitude !== null &&
                candidate.destination.latitude !== null &&
                candidate.destination.longitude !== null,
            );
          if (segment) {
            const routeStartedAt = performance.now();
            const routeResult = await registry.geocoding.getRoute(
              {
                origin: {
                  latitude: segment.origin.latitude!,
                  longitude: segment.origin.longitude!,
                },
                destination: {
                  latitude: segment.destination.latitude!,
                  longitude: segment.destination.longitude!,
                },
                mode:
                  segment.mode === "train"
                    ? "transit"
                    : segment.mode === "flight"
                      ? "unknown"
                      : segment.mode,
                locale: "en-US",
              },
              request.signal,
            );
            capabilityDurations.route = Math.max(
              Math.round(performance.now() - routeStartedAt),
              0,
            );
            evidence.push(...routeResult.evidence);
          }
        }
        currentEvidence = evidence;
        toolDurationsByCapability = capabilityDurations;
        toolPipelineState = evidence.length > 0 ? "success" : "failure";
      } catch (error) {
        if (request.signal.aborted) throw error;
      } finally {
        toolPipelineDurationMs = Date.now() - toolStartedAt;
      }
    }
  }
  const referenceResolution = resolveTrailieReference({
    request: decision.normalizedRequest,
    explicitEntityId: parsed.data.entityId,
    materialChange: intent === "itinerary_revision",
    recentEntities: [],
    currentEntities:
      currentPlan.success && currentPlan.data?.itinerary
        ? planEntities(currentPlan.data.itinerary)
        : [],
    versionEntities: (planVersions.success ? planVersions.data : []).map(
      (plan) => ({
        id: plan.tripPlanId,
        kind: "plan_version" as const,
        label: `Version ${plan.version}`,
        version: plan.version,
      }),
    ),
  });
  const trailieContext = buildTrailieContext({
    trip: {
      id: roomResult.data.id,
      name: roomResult.data.name,
      approvalMode: roomResult.data.approval_mode,
    },
    requester: {
      participantId: participant.id,
      role: participant.role,
    },
    recentMessages: context.messages.map((message) => ({
      id: message.id,
      author: message.displayName,
      body: message.body,
      createdAt: message.createdAt,
    })),
    sharedMemory: {
      destinations: factValues(shared.destinationsUnderConsideration),
      dates: factValues(shared.dateWindows),
      decisions: factValues(memory.data.confirmedDecisions),
      openQuestions: memory.data.openQuestions
        .map((item) => item.question)
        .filter(Boolean),
    },
    crewSignals: {
      preferences: participantProfiles.flatMap((profile) => [
        ...factValues(profile.preferences),
        ...factValues(profile.mustDos),
      ]),
      constraints: participantProfiles.flatMap((profile) => [
        ...factValues(profile.constraints),
        ...factValues(profile.avoids),
      ]),
    },
    currentPlan:
      currentPlan.success && currentPlan.data
        ? {
            id: currentPlan.data.id,
            version: currentPlan.data.version,
            status: currentPlan.data.status,
            summary: boundedJson(currentPlan.data.itinerary),
          }
        : null,
    versionHistory: (planVersions.success ? planVersions.data : []).map(
      (plan) => ({
        id: plan.tripPlanId,
        version: plan.version,
        publishedAt: plan.publishedAt,
        changeSummary: plan.changeSummary,
        isCurrent: plan.isCurrent,
      }),
    ),
    planning: planningResult.data
      ? {
          id: planningResult.data.id,
          status: planningResult.data.status,
          summaryVersion: planningResult.data.current_summary_version,
          approvalMode: planningResult.data.approval_mode,
          approvals: (planningApprovalsResult.data ?? []).map((approval) => ({
            crewMember: names.get(approval.participant_id) ?? "A crew member",
            decision: approval.decision,
          })),
        }
      : null,
    revision: revisionResult.data
      ? {
          id: revisionResult.data.id,
          status: revisionResult.data.status,
          basePlanVersion: revisionResult.data.base_plan_version,
          requestType: revisionResult.data.request_type,
          request: revisionResult.data.request_text,
          approvals: (revisionApprovalsResult.data ?? []).map((approval) => ({
            crewMember: names.get(approval.participant_id) ?? "A crew member",
            decision: approval.decision,
          })),
          referenceResolution,
        }
      : intent === "itinerary_revision" || intent === "version_question"
        ? { referenceResolution }
        : null,
    selectedLodging: currentItinerary?.success
      ? currentItinerary.data.lodging.map((lodging) => ({
          name: lodging.name,
          area: lodging.area,
          checkInDate: lodging.checkInDate,
          checkOutDate: lodging.checkOutDate,
          location: lodging.location.name,
          reservationStatus: lodging.reservation.status,
        }))
      : [],
    selectedFlights: currentItinerary?.success
      ? [
          ...currentItinerary.data.arrivals.map((arrival) => ({
            direction: "arrival",
            date: arrival.date,
            localTime: arrival.localTime,
            location: arrival.location.name,
            mode: arrival.mode,
            reference: arrival.reference,
          })),
          ...currentItinerary.data.departures.map((departure) => ({
            direction: "departure",
            date: departure.date,
            localTime: departure.localTime,
            location: departure.location.name,
            mode: departure.mode,
            reference: departure.reference,
          })),
        ]
      : [],
    evidence: currentEvidence,
    requestedSections: [...requestedSections],
  });
  const runtimeTrace = createRuntimeTrace({
    requestId: correlationId,
    roomId: parsed.data.roomId,
    responseType: responseTypeFor(route.complexity),
    startedAt: new Date(requestReceivedAt),
    monotonicStartedAt: requestReceivedAt,
  });
  runtimeTrace.recordDuration(
    "permissionCheck",
    permissionEndedAt - permissionStartedAt,
  );
  runtimeTrace.recordDuration(
    "invocationDetection",
    invocationDetectionEndedAt - invocationDetectionStartedAt,
  );
  runtimeTrace.recordDuration(
    "intentClassification",
    intentClassificationEndedAt - intentClassificationStartedAt,
  );
  runtimeTrace.recordDuration("contextAssembly", Date.now() - contextStartedAt);
  const toolClasses = selectedToolClasses(intent);
  runtimeTrace.setRouting({
    intent,
    complexity: route.complexity,
    selectedModelRoute: route.route,
    toolClasses,
  });
  runtimeTrace.recordToolCall("database_read", Date.now() - contextStartedAt, {
    cache: "not_applicable",
    retries: 0,
    state: "success",
  });
  const telemetryClassByCapability: Record<string, TrailieToolClass> = {
    geocode: "maps_geocoding",
    park: "nps",
    park_alerts: "nps",
    recreation: "ridb",
    reservation_links: "ridb",
    route: "directions",
    weather: "weather",
    daylight: "weather",
  };
  for (const [capability, durationMs] of Object.entries(
    toolDurationsByCapability,
  )) {
    const toolClass = telemetryClassByCapability[capability];
    if (!toolClass) continue;
    runtimeTrace.recordToolCall(toolClass, durationMs, {
      cache: "not_applicable",
      retries: 0,
      state: toolPipelineState,
    });
  }
  const primaryToolClass = toolClasses.find(
    (toolClass) => toolClass !== "database_read",
  );
  if (
    toolPipelineDurationMs !== null &&
    Object.keys(toolDurationsByCapability).length === 0 &&
    primaryToolClass
  )
    runtimeTrace.recordToolCall(primaryToolClass, toolPipelineDurationMs, {
      cache: "not_applicable",
      retries: 0,
      state: toolPipelineState,
    });
  const selectedModel = route.model ?? "trailie-deterministic";

  const { data: runData, error: runError } = await admin.rpc("start_ai_run", {
    target_invocation_id: invocationId,
    target_model: selectedModel,
    target_prompt_version: environment.promptVersion,
  });
  if (runError) return jsonError("retry_not_allowed", 409);
  const runId = asString(asRecord(runData).run_id);
  if (!runId)
    return jsonError(
      asRecord(runData).status === "completed"
        ? "retry_not_allowed"
        : "invocation_already_running",
      409,
    );

  const encoder = new TextEncoder();
  const startedAt = Date.now();
  const stream = new ReadableStream({
    async start(controller) {
      let clientConnected = true;
      let runtimeState:
        "success" | "failure" | "cancelled" | "timeout" | "fallback" =
        "failure";
      let cancellationReason: string | null = null;
      let timeoutReason: string | null = null;
      let fallbackReason: string | null = null;
      let quota: ReturnType<typeof createDurableAiQuotaReservation> | null =
        null;
      let providerResultStaged = false;
      const emit = (event: unknown) => {
        if (!clientConnected) return;
        const safe = trailieStreamEventSchema.parse(event);
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(safe)}\n`));
        } catch {
          clientConnected = false;
        }
      };
      emit({ type: "invocation_started", invocationId });
      emit({
        type: "progress_state",
        stage: progressStageFor(route.complexity),
      });
      runtimeTrace.markFirstVisibleOutput();
      try {
        if (route.route === "deterministic") {
          const validationStartedAt = Date.now();
          const envelope = finalizeTrailieResponse({
            draft: localUnsupportedDraft(),
            expectedIntent: intent,
            responseId: invocationId,
            sourceMessageId: parsed.data.sourceMessageId,
            now: new Date().toISOString(),
            referenceResolutionStatus: referenceResolution.status,
          });
          runtimeTrace.recordDuration(
            "validation",
            Date.now() - validationStartedAt,
          );
          emit({ type: "text_delta", delta: envelope.message });
          const persistenceStartedAt = Date.now();
          const { error: stageError } = await admin.rpc(
            "stage_ai_response_contract",
            {
              target_invocation_id: invocationId,
              target_run_id: runId,
              validated_response_contract: envelope,
              target_detected_intent: intent,
              target_context_sections: trailieContext.usedSections,
              target_validation_result: "pass",
              target_repair_count: 0,
            },
          );
          if (stageError)
            throw new TrailieProviderError("invalid_model_response", false);
          const { error: completeError } = await admin.rpc("complete_ai_run", {
            target_invocation_id: invocationId,
            target_run_id: runId,
            response_body: envelope.message,
            provider_response_id: null,
            provider_request_id: null,
            used_input_tokens: null,
            used_output_tokens: null,
            used_reasoning_tokens: null,
            used_cached_input_tokens: null,
            used_total_tokens: null,
            measured_latency_ms: Date.now() - startedAt,
          });
          if (completeError)
            throw new TrailieProviderError("openai_unavailable", true);
          runtimeTrace.recordDuration(
            "persistence",
            Date.now() - persistenceStartedAt,
          );
          runtimeTrace.recordDuration("finalRenderReady", 0);
          emit({ type: "response_completed", response: envelope });
          runtimeState = "success";
          return;
        }
        type Envelope = TrailieResponseV1;
        const attempts = createDurableProviderAttemptController<Envelope>(
          createProviderAttemptRepository<Envelope>(),
        );
        const durableQuota = createDurableAiQuotaReservation({
          userId: authData.user.id,
          roomId: parsed.data.roomId,
          workflow: "focused_answer",
          model: selectedModel,
          estimatedTokens: 4_000,
          reservationId: runId,
        });
        quota = durableQuota;
        await durableQuota.reserve();
        const routePolicy = {
          ...environment.reliabilityPolicy,
          maximumAttempts: Math.min(
            environment.reliabilityPolicy.maximumAttempts,
            2,
          ),
          totalWorkflowDeadlineMs: Math.min(
            environment.reliabilityPolicy.totalWorkflowDeadlineMs,
            55_000,
          ),
        };
        const outcome = await runDurableProviderOperation({
          controller: attempts,
          workflow: "focused_answer",
          operationKey: `focused:${invocationId}:${runId}`,
          model: selectedModel,
          stage: "focusedProvider",
          policy: routePolicy,
          quotaReservationId: runId,
          correlationId,
          signal: request.signal,
          execute: async ({ signal, retryCount }) => {
            if (retryCount > 0) emit({ type: "provider_retrying" });
            const providerStartedAt = Date.now();
            const safeText = createSafeTrailieTextStream();
            runtimeTrace.markModelRequestStarted();
            const consumed = await consumeFocusedStream(
              await providerFor(environment).stream({
                operationKey: invocationId,
                request: decision.normalizedRequest,
                context: trailieContext.text,
                model: selectedModel,
                intent,
                safetyIdentifier: createSafetyIdentifier(
                  authData.user.id,
                  environment.safetyHmacSecret,
                ),
                signal,
              }),
              {
                onFirstToken: () => runtimeTrace.markFirstModelToken(),
                onTextDelta: (delta) => {
                  for (const visible of safeText.push(delta))
                    emit({ type: "text_delta", delta: visible });
                },
              },
            );
            const result = consumed.result;
            const validationStartedAt = Date.now();
            const envelope = finalizeTrailieResponse({
              draft: result.answer,
              expectedIntent: intent,
              responseId: invocationId,
              sourceMessageId: parsed.data.sourceMessageId,
              now: new Date().toISOString(),
              referenceResolutionStatus: referenceResolution.status,
            });
            runtimeTrace.recordDuration(
              "validation",
              Date.now() - validationStartedAt,
            );
            const responseRepairCount =
              result.answer.message !== envelope.message ||
              JSON.stringify(result.answer.blocks) !==
                JSON.stringify(envelope.blocks) ||
              result.answer.privacyLevel !== envelope.privacyLevel ||
              JSON.stringify(result.answer.unresolvedQuestions) !==
                JSON.stringify(envelope.unresolvedQuestions)
                ? 1
                : 0;
            if (responseRepairCount > 0) runtimeTrace.recordRepair(0);
            const remainingVisible = safeText.flushValidated();
            if (remainingVisible)
              emit({ type: "text_delta", delta: remainingVisible });
            runtimeTrace.setUsage({
              inputTokens: result.usage.inputTokens,
              outputTokens: result.usage.outputTokens,
              estimatedCost: null,
            });
            return {
              value: envelope,
              responseId: result.responseId,
              requestId: result.requestId,
              usage: result.usage,
              providerDurationMs: Date.now() - providerStartedAt,
              totalDurationMs: Date.now() - startedAt,
              retryCount,
              repairCount: responseRepairCount,
            } satisfies ProviderAttemptExecutionResult<Envelope>;
          },
          parse: (value) => trailieResponseV1Schema.parse(value),
          afterStage: async (result) => {
            providerResultStaged = true;
            await durableQuota.reconcile(result.usage.totalTokens ?? 4_000);
          },
          apply: async (envelope, result) => {
            const persistenceStartedAt = Date.now();
            const { error: stageError } = await admin.rpc(
              "stage_ai_response_contract",
              {
                target_invocation_id: invocationId,
                target_run_id: runId,
                validated_response_contract: envelope,
                target_detected_intent: intent,
                target_context_sections: trailieContext.usedSections,
                target_validation_result: "pass",
                target_repair_count: result.repairCount,
              },
            );
            if (stageError)
              throw new TrailieProviderError("invalid_model_response", false);
            const { error: completeError } = await admin.rpc(
              "complete_ai_run",
              {
                target_invocation_id: invocationId,
                target_run_id: runId,
                response_body: envelope.message,
                provider_response_id: result.responseId,
                provider_request_id: result.requestId,
                used_input_tokens: result.usage.inputTokens,
                used_output_tokens: result.usage.outputTokens,
                used_reasoning_tokens: result.usage.reasoningTokens,
                used_cached_input_tokens: result.usage.cachedInputTokens,
                used_total_tokens: result.usage.totalTokens,
                measured_latency_ms: result.totalDurationMs,
              },
            );
            if (completeError)
              throw new TrailieProviderError("openai_unavailable", true);
            runtimeTrace.recordDuration(
              "persistence",
              Date.now() - persistenceStartedAt,
            );
          },
        });
        if (outcome.status !== "applied")
          throw new TrailieProviderError("openai_unavailable", true);
        runtimeTrace.recordDuration("finalRenderReady", 0);
        emit({ type: "response_completed", response: outcome.result.value });
        if (
          route.route === "tool_pipeline" &&
          !trailieContext.usedSections.includes("evidence")
        ) {
          runtimeState = "fallback";
          fallbackReason = "current_evidence_not_bound";
        } else {
          runtimeState = "success";
        }
        logAiEvent("completed", {
          invocationId,
          runId,
          model: selectedModel,
          promptVersion: environment.promptVersion,
          latencyMs: outcome.result.totalDurationMs,
          providerLatencyMs: outcome.result.providerDurationMs,
          totalWorkflowLatencyMs: outcome.result.totalDurationMs,
          attemptCount: outcome.result.retryCount + 1,
          retryCount: outcome.result.retryCount,
          providerStatus: "completed",
          recoveryCount: outcome.recovered ? 1 : 0,
          quotaStatus: "reconciled",
          detectedIntent: intent,
          selectedTools: toolClasses,
          contextSections: trailieContext.usedSections,
          responseContractVersion: "1",
          validationResult: "pass",
          repairCount: outcome.result.repairCount,
        });
      } catch (error) {
        if (quota && !providerResultStaged)
          await quota.release().catch(() => undefined);
        const failure =
          error instanceof AiQuotaError
            ? new TrailieProviderError(error.code as never, false)
            : error instanceof TrailieProviderError
              ? error
              : error instanceof ProviderFailure
                ? error.code === "workflow_cancelled"
                  ? new TrailieProviderError("invocation_cancelled", false)
                  : new TrailieProviderError(
                      error.code as never,
                      error.retryable,
                      {
                        statusCode: error.statusCode,
                        requestId: error.requestId,
                        retryAfterMs: error.retryAfterMs,
                      },
                    )
                : new TrailieProviderError("openai_unavailable", true);
        if (failure.code === "invocation_cancelled") {
          runtimeState = "cancelled";
          cancellationReason = "user_stop";
        } else if (failure.code === "openai_timeout") {
          runtimeState = "timeout";
          timeoutReason = "normal_model_response";
        } else {
          runtimeState = "failure";
        }
        await admin.rpc("fail_ai_run", {
          target_invocation_id: invocationId,
          target_run_id: runId,
          safe_error_code: failure.code,
        });
        emit({
          type: "response_failed",
          code: failure.code,
          message: failure.code,
          retryable: failure.retryable,
        });
        logAiEvent("failed", {
          invocationId,
          runId,
          model: selectedModel,
          promptVersion: environment.promptVersion,
          errorCode: failure.code,
          totalWorkflowLatencyMs: Date.now() - startedAt,
          providerStatus: failure.statusCode,
        });
      } finally {
        await createRuntimeTelemetryRepository()
          .record(
            runtimeTrace.complete({
              state: runtimeState,
              cancellationReason,
              timeoutReason,
              fallbackReason,
            }),
          )
          .catch(() =>
            logOperation("trailie_ai.runtime_telemetry_failed", {
              correlationId,
              workflow: "focused_answer",
              status: "failed",
              errorCode: "runtime_telemetry_unavailable",
            }),
          );
        if (clientConnected) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
