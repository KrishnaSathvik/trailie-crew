"use client";
import { useCallback, useEffect, useState } from "react";
import type {
  PlanningRequestView,
  PlanningSummaryItem,
  TripPlanView,
  ParticipantRole,
} from "@trailie/schemas";
import {
  cancelItineraryAction,
  generateItineraryAction,
  getTripPlanAction,
  retryItineraryAction,
} from "@/features/itinerary/actions";
import { ItineraryExperience } from "@/features/itinerary/components/itinerary-experience";
import { RevisionExperience } from "@/features/revisions/components/revision-experience";
import {
  cancelPlanningSummaryAction,
  createPlanningRequestAction,
  getPlanningRequestAction,
  regeneratePlanningSummaryAction,
  reviewPlanningSummaryAction,
} from "../actions";

function SummarySection({
  title,
  items,
}: {
  title: string;
  items: PlanningSummaryItem[];
}) {
  if (!items.length) return null;
  return (
    <section
      aria-labelledby={`plan-${title.replaceAll(" ", "-").toLowerCase()}`}
      className="border-border border-t py-6"
    >
      <h2
        id={`plan-${title.replaceAll(" ", "-").toLowerCase()}`}
        className="text-sm font-semibold"
      >
        {title}
      </h2>
      <ul className="mt-4 divide-y">
        {items.map((item) => (
          <li
            key={item.id}
            className="grid gap-1 py-3 sm:grid-cols-[13rem_1fr] sm:gap-5"
          >
            <p className="text-xs font-semibold">{item.label}</p>
            <p className="text-muted-foreground text-sm leading-6">
              {item.detail}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PlanExperience({
  roomId,
  participantId,
  participantRole = "member",
  preferMap = false,
  onOpenPlan,
}: {
  roomId: string;
  participantId: string;
  participantRole?: ParticipantRole;
  preferMap?: boolean;
  onOpenPlan?: () => void;
}) {
  const [request, setRequest] = useState<PlanningRequestView | null>(null);
  const [plan, setPlan] = useState<TripPlanView | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [slowRequestId, setSlowRequestId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const [planningResult, planResult] = await Promise.all([
      getPlanningRequestAction(roomId),
      getTripPlanAction(roomId),
    ]);
    if (planningResult.ok) setRequest(planningResult.data);
    else setError("Planning state could not be loaded.");
    if (planResult.ok) setPlan(planResult.data);
    setLoading(false);
  }, [roomId]);
  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer =
      plan?.status === "published"
        ? null
        : window.setInterval(() => void refresh(), 1500);
    return () => {
      window.clearTimeout(initial);
      if (timer !== null) window.clearInterval(timer);
    };
  }, [plan?.status, refresh]);
  useEffect(() => {
    if (!request || !["draft", "generating_summary"].includes(request.status))
      return;
    const timer = window.setTimeout(() => setSlowRequestId(request.id), 10_000);
    return () => window.clearTimeout(timer);
  }, [request]);
  async function start(replace = false) {
    setStarting(true);
    setError(null);
    const result = await createPlanningRequestAction({ roomId, participantId });
    if (!result.ok) {
      setStarting(false);
      setError("The planning summary could not be started.");
      return;
    }
    setRequest((current) =>
      !replace && current
        ? current
        : {
            id: result.data.id,
            roomId,
            status: "generating_summary",
            approvalMode: "all_active",
            currentSummaryVersion: 0,
            approvedSummaryVersion: null,
            readinessStatus: null,
            summary: null,
            approvalState: null,
            generationErrorCode: null,
            isStale: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
    );
    setStarting(false);
    void refresh();
  }
  async function review(decision: "approved" | "changes_requested") {
    if (!request) return;
    if (decision === "changes_requested" && !note.trim()) {
      setError("Add a note before requesting changes.");
      return;
    }
    const result = await reviewPlanningSummaryAction({
      planningRequestId: request.id,
      summaryVersion: request.currentSummaryVersion,
      participantId,
      decision,
      note: note.trim() || null,
    });
    if (!result.ok) {
      setError(
        result.error === "summary_stale"
          ? "Trip details changed after this summary was created."
          : "Your review could not be saved.",
      );
      return;
    }
    setNote("");
    await refresh();
  }
  async function regenerate() {
    if (!request) return;
    const result = await regeneratePlanningSummaryAction({
      planningRequestId: request.id,
      summaryVersion: request.currentSummaryVersion,
      participantId,
    });
    if (!result.ok) {
      setError("The summary could not be regenerated.");
      return;
    }
    setRequest({ ...request, status: "generating_summary" });
  }
  async function stopPlanning() {
    if (!request) return;
    const result = await cancelPlanningSummaryAction({
      planningRequestId: request.id,
      participantId,
    });
    if (!result.ok) {
      setError("This request could not be stopped.");
      return;
    }
    setRequest({
      ...request,
      status: "cancelled",
      generationErrorCode: "workflow_cancelled",
    });
  }
  async function generateItinerary() {
    if (!request || generating) return;
    setGenerating(true);
    setError(null);
    const result = await generateItineraryAction({
      planningRequestId: request.id,
      participantId,
    });
    if (!result.ok) {
      setGenerating(false);
      setError(
        result.error === "approved_summary_stale"
          ? "Trip details changed after approval. Regenerate the summary first."
          : "The Plan could not be started safely.",
      );
      return;
    }
    await refresh();
    setGenerating(false);
  }
  async function retryItinerary() {
    if (!plan || generating) return;
    setGenerating(true);
    setError(null);
    const result = await retryItineraryAction({
      tripPlanId: plan.id,
      participantId,
    });
    if (!result.ok) {
      setGenerating(false);
      setError(
        result.error === "retry_exhausted"
          ? "Trailie couldn’t finish after several tries."
          : "We couldn’t try that again right now.",
      );
      return;
    }
    await refresh();
    setGenerating(false);
  }
  async function stopItinerary() {
    if (!plan) return;
    const result = await cancelItineraryAction({
      tripPlanId: plan.id,
      participantId,
    });
    if (!result.ok) {
      setError("This request could not be stopped.");
      return;
    }
    setPlan({ ...plan, status: "failed", errorCode: "workflow_cancelled" });
  }
  if (loading)
    return (
      <div
        className="flex flex-1 items-center justify-center"
        aria-live="polite"
      >
        Loading your Plan…
      </div>
    );
  if (preferMap && !plan)
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-12 sm:px-8">
        <p className="eyebrow">Map</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">
          Your map will follow the Plan.
        </h1>
        <p className="text-muted-foreground mt-4 max-w-xl leading-7">
          Once the crew has reviewed the trip brief and created a Plan, its
          verified places and routes will appear here.
        </p>
        {onOpenPlan ? (
          <button
            type="button"
            onClick={onOpenPlan}
            className="bg-foreground text-background focus-visible:ring-ring mt-8 min-h-12 self-start rounded-md px-5 text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none"
          >
            Open Plan
          </button>
        ) : null}
      </div>
    );
  if (plan?.status === "published")
    return (
      <RevisionExperience
        roomId={roomId}
        participantId={participantId}
        isHost={participantRole === "host"}
        plan={plan}
        onPlanPublished={refresh}
        preferMap={preferMap}
      />
    );
  if (plan)
    return (
      <>
        <ItineraryExperience
          key={preferMap ? "map" : "plan"}
          plan={plan}
          initialView={preferMap ? "Map" : "Overview"}
          onRetry={
            plan.status === "failed" &&
            [
              "model_timeout",
              "model_rate_limited",
              "model_unavailable",
              "validation_failed",
              "workflow_cancelled",
            ].includes(plan.errorCode ?? "")
              ? retryItinerary
              : undefined
          }
          onCancel={
            ["generating", "validating", "needs_revision"].includes(plan.status)
              ? stopItinerary
              : undefined
          }
        />
        {error ? (
          <p className="text-destructive px-5 pb-4 text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </>
    );
  if (!request && !starting)
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-12 sm:px-8">
        <p className="text-muted-foreground font-mono text-xs tracking-[0.15em] uppercase">
          Plan together
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">
          Before we build the trip
        </h1>
        <p className="text-muted-foreground mt-4 max-w-xl leading-7">
          Trailie will organize the decisions, preferences, open questions, and
          constraints from Chat. Everyone reviews that trip brief before the
          Plan is created.
        </p>
        <button
          type="button"
          onClick={() => void start()}
          className="bg-foreground text-background focus-visible:ring-ring mt-8 min-h-12 self-start rounded-md px-5 text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none"
        >
          Prepare trip brief
        </button>
        {error ? (
          <p role="alert" className="mt-4 text-sm">
            {error}
          </p>
        ) : null}
      </div>
    );
  if (
    starting ||
    request?.status === "draft" ||
    request?.status === "generating_summary"
  )
    return (
      <div
        className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-12 text-center"
        aria-live="polite"
      >
        <div
          aria-hidden="true"
          className="bg-foreground mx-auto size-3 animate-pulse rounded-full"
        />
        <h1 className="mt-6 text-2xl font-semibold">
          Trailie is checking the trip.
        </h1>
        <p className="text-muted-foreground mt-3">
          {request && slowRequestId === request.id
            ? "Trailie is taking longer than usual."
            : "Chat stays available while the crew’s decisions are organized."}
        </p>
        {request ? (
          <button
            type="button"
            onClick={() => void stopPlanning()}
            className="border-border mx-auto mt-6 min-h-11 rounded-md border px-4 text-sm font-semibold"
          >
            Stop
          </button>
        ) : null}
      </div>
    );
  if (request?.status === "cancelled")
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-12">
        <h1 className="text-2xl font-semibold">Stopped</h1>
        <p className="text-muted-foreground mt-3">
          This request was stopped. No trip brief was published.
        </p>
        <button
          type="button"
          onClick={() => void start(true)}
          className="border-border mt-6 min-h-11 self-start rounded-md border px-4 text-sm font-semibold"
        >
          Try again
        </button>
      </div>
    );
  if (request?.status === "failed")
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-12">
        <h1 className="text-2xl font-semibold">
          The summary could not be prepared.
        </h1>
        <p className="text-muted-foreground mt-3">
          {request.generationErrorCode === "recovery_required"
            ? "Trailie is still checking this request. Chat and earlier Plans remain available."
            : request.generationErrorCode === "workflow_deadline_exceeded"
              ? "Trailie could not finish this right now. Chat and earlier Plans remain available."
              : request.generationErrorCode === "retry_exhausted"
                ? "Trailie could not finish after several tries. Chat and earlier Plans remain available."
                : request.generationErrorCode === "ai_disabled"
                  ? "Trailie is temporarily paused. Chat and earlier Plans remain available."
                  : request.generationErrorCode?.includes("ai_limit_reached") ||
                      request.generationErrorCode ===
                        "provider_budget_unavailable"
                    ? "Trailie is temporarily unavailable. Chat and earlier Plans remain available."
                    : "Your conversation and earlier Plans are unchanged. You can try again safely."}
        </p>
        {![
          "recovery_required",
          "workflow_deadline_exceeded",
          "retry_exhausted",
        ].includes(request.generationErrorCode ?? "") &&
        !request.generationErrorCode?.includes("ai_limit_reached") &&
        request.generationErrorCode !== "ai_disabled" &&
        request.generationErrorCode !== "provider_budget_unavailable" ? (
          <button
            type="button"
            onClick={() => void regenerate()}
            className="border-border mt-6 min-h-11 self-start rounded-md border px-4 text-sm font-semibold"
          >
            Retry summary
          </button>
        ) : null}
      </div>
    );
  const summary = request?.summary;
  if (!request || !summary) return null;
  const approved = request.status === "approved_for_generation";
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-5 py-8 pb-36 sm:px-8 lg:pb-12">
        <p className="text-muted-foreground font-mono text-[0.625rem] tracking-[0.16em] uppercase">
          Before we build the trip · Version {request.currentSummaryVersion}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
          {summary.title}
        </h1>
        {request.isStale ? (
          <div
            role="alert"
            className="border-border bg-subtle mt-5 rounded-md border p-4"
          >
            <p className="font-semibold">
              Trip details changed after this summary was created
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              New approvals are paused until the summary is regenerated.
            </p>
            <button
              type="button"
              onClick={() => void regenerate()}
              className="mt-3 text-sm font-semibold underline"
            >
              Regenerate summary
            </button>
          </div>
        ) : null}
        {request.status === "changes_requested" && !request.isStale ? (
          <div
            role="status"
            className="border-border bg-subtle mt-5 rounded-md border p-4"
          >
            <p className="font-semibold">The crew requested changes</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Review the note and conversation, then prepare an updated trip
              brief.
            </p>
            <button
              type="button"
              onClick={() => void regenerate()}
              className="mt-3 text-sm font-semibold underline"
            >
              Regenerate summary
            </button>
          </div>
        ) : null}
        {approved ? (
          <div className="mt-5 rounded-md border border-emerald-600/40 bg-emerald-500/10 p-4">
            <p className="font-semibold">Summary approved</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Trailie can now build the Plan and check timing, routes, and crew
              constraints before it is published.
            </p>
            <button
              type="button"
              disabled={generating || request.isStale}
              onClick={() => void generateItinerary()}
              className="bg-foreground text-background mt-4 min-h-11 rounded-md px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            >
              {generating ? "Starting…" : "Create the Plan"}
            </button>
            {error ? (
              <p role="alert" className="mt-3 text-sm">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="mt-8">
          <SummarySection
            title="Confirmed decisions"
            items={summary.confirmedDecisions}
          />
          <SummarySection
            title="Crew preferences"
            items={summary.travelerPreferences}
          />
          <SummarySection title="Constraints" items={summary.constraints} />
          <SummarySection
            title="Proposals still under consideration"
            items={summary.proposals}
          />
          <SummarySection
            title="Rejected options"
            items={summary.rejectedOptions}
          />
          <SummarySection
            title="Conflicts or contradictions"
            items={summary.conflicts}
          />
          <SummarySection
            title="Open questions"
            items={summary.openQuestions}
          />
          <SummarySection
            title="Missing critical information"
            items={summary.missingCriticalInformation}
          />
          <SummarySection
            title="Assumptions Trailie will not make"
            items={summary.nonAssumptions}
          />
        </div>
        {request.approvalState ? (
          <section className="border-border border-t py-5">
            <h2 className="text-sm font-semibold">Crew approval</h2>
            <p className="text-muted-foreground mt-2 text-sm">
              {request.approvalMode === "all_active"
                ? "Every active crew member must approve this version."
                : "Only the active host must approve this version."}
            </p>
            <ul className="mt-3 space-y-2">
              {request.approvalState.requiredParticipants.map((person) => (
                <li key={person.id} className="flex justify-between text-sm">
                  <span>{person.displayName}</span>
                  <span className="text-muted-foreground">
                    {request.approvalState!.approvedParticipants.some(
                      (p) => p.id === person.id,
                    )
                      ? "Approved"
                      : "Pending"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {!approved ? (
          <div className="border-border bg-background fixed inset-x-0 bottom-16 z-10 border-t p-4 lg:static lg:mt-6 lg:rounded-md lg:border">
            <label
              htmlFor="planning-change-note"
              className="text-xs font-semibold"
            >
              What should change?
            </label>
            <textarea
              id="planning-change-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              className="border-border mt-2 min-h-20 w-full rounded-md border bg-transparent p-3 text-sm"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={
                  request.isStale ||
                  summary.readiness.status !== "ready_for_review"
                }
                onClick={() => void review("approved")}
                className="bg-foreground text-background min-h-11 rounded-md px-4 text-sm font-semibold disabled:opacity-40"
              >
                Approve trip brief
              </button>
              <button
                type="button"
                onClick={() => void review("changes_requested")}
                className="border-border min-h-11 rounded-md border px-4 text-sm font-semibold"
              >
                Request changes
              </button>
            </div>
            {error ? (
              <p role="alert" className="mt-2 text-sm">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
