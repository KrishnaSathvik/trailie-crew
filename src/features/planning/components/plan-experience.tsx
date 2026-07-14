"use client";
import { useCallback, useEffect, useState } from "react";
import type {
  PlanningRequestView,
  PlanningSummaryItem,
  TripPlanView,
  ParticipantRole,
} from "@trailie/schemas";
import {
  generateItineraryAction,
  getTripPlanAction,
} from "@/features/itinerary/actions";
import { ItineraryExperience } from "@/features/itinerary/components/itinerary-experience";
import { RevisionExperience } from "@/features/revisions/components/revision-experience";
import {
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
      className="border-border border-t py-5"
    >
      <h2
        id={`plan-${title.replaceAll(" ", "-").toLowerCase()}`}
        className="text-sm font-semibold"
      >
        {title}
      </h2>
      <ul className="mt-3 space-y-3">
        {items.map((item) => (
          <li key={item.id} className="bg-subtle rounded-md p-3">
            <p className="text-xs font-semibold">{item.label}</p>
            <p className="text-muted-foreground mt-1 text-sm leading-6">
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
}: {
  roomId: string;
  participantId: string;
  participantRole?: ParticipantRole;
}) {
  const [request, setRequest] = useState<PlanningRequestView | null>(null);
  const [plan, setPlan] = useState<TripPlanView | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [generating, setGenerating] = useState(false);
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
  async function start() {
    setStarting(true);
    setError(null);
    const result = await createPlanningRequestAction({ roomId, participantId });
    if (!result.ok) {
      setStarting(false);
      setError("The planning summary could not be started.");
      return;
    }
    setRequest(
      (current) =>
        current ?? {
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
          : "The itinerary could not be started safely.",
      );
      return;
    }
    await refresh();
    setGenerating(false);
  }
  if (loading)
    return (
      <div
        className="flex flex-1 items-center justify-center"
        aria-live="polite"
      >
        Loading Plan…
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
      />
    );
  if (plan) return <ItineraryExperience plan={plan} />;
  if (!request && !starting)
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-12 sm:px-8">
        <p className="text-muted-foreground font-mono text-xs tracking-[0.15em] uppercase">
          Plan together
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">
          Turn the conversation into a shared brief.
        </h1>
        <p className="text-muted-foreground mt-4 max-w-xl leading-7">
          Discuss the trip naturally in Chat. When the crew is ready, Trailie
          will organize what was decided and ask everyone to review it before
          any itinerary is built.
        </p>
        <button
          type="button"
          onClick={() => void start()}
          className="bg-foreground text-background focus-visible:ring-ring mt-8 min-h-12 self-start rounded-md px-5 text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none"
        >
          Build Our Itinerary
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
          Trailie is organizing what the crew has decided.
        </h1>
        <p className="text-muted-foreground mt-3">
          Chat stays available while the review summary is prepared.
        </p>
      </div>
    );
  if (request?.status === "failed")
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-12">
        <h1 className="text-2xl font-semibold">
          The summary could not be prepared.
        </h1>
        <p className="text-muted-foreground mt-3">
          Chat and private memory are unchanged. You can retry safely.
        </p>
        <button
          type="button"
          onClick={() => void regenerate()}
          className="border-border mt-6 min-h-11 self-start rounded-md border px-4 text-sm font-semibold"
        >
          Retry summary
        </button>
      </div>
    );
  const summary = request?.summary;
  if (!request || !summary) return null;
  const approved = request.status === "approved_for_generation";
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-5 py-8 pb-36 sm:px-8 lg:pb-12">
        <p className="text-muted-foreground font-mono text-[0.625rem] tracking-[0.16em] uppercase">
          Crew review · Version {request.currentSummaryVersion}
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
              Regenerate Summary
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
              Regenerate a new immutable version after reviewing the note and
              conversation.
            </p>
            <button
              type="button"
              onClick={() => void regenerate()}
              className="mt-3 text-sm font-semibold underline"
            >
              Regenerate Summary
            </button>
          </div>
        ) : null}
        {approved ? (
          <div className="mt-5 rounded-md border border-emerald-600/40 bg-emerald-500/10 p-4">
            <p className="font-semibold">Summary approved</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Trailie can now build the itinerary and validate it before the
              crew sees it as ready.
            </p>
            <button
              type="button"
              disabled={generating || request.isStale}
              onClick={() => void generateItinerary()}
              className="bg-foreground text-background mt-4 min-h-11 rounded-md px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            >
              {generating ? "Starting…" : "Generate Itinerary"}
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
            title="Traveler preferences"
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
              Revision note (required for changes)
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
                Approve summary
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
