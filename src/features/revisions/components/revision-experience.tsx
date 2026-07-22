"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PlanChangeRequest,
  PlanChangeType,
  PlanVersionDiff,
  PlanVersionSummary,
  TripPlanView,
} from "@trailie/schemas";
import { ItineraryExperience } from "@/features/itinerary/components/itinerary-experience";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { ShareControls } from "@/features/sharing/components/share-controls";
import { GuestInviteControls } from "@/features/guest-comments/components/guest-invite-controls";
import { GuestSuggestionsPanel } from "@/features/guest-comments/components/guest-suggestions-panel";
import { listMemberCommentsAction } from "@/features/guest-comments/actions";
import type { GuestComment } from "@/features/guest-comments/contracts";
import { SpatialCompare } from "@/features/maps/components/spatial-compare";
import {
  cancelPlanChangeAction,
  comparePlanVersionsAction,
  confirmPlanChangeAction,
  createPlanChangeRequestAction,
  getPlanChangeRequestAction,
  getPlanVersionAction,
  listPlanVersionsAction,
  reviewPlanChangeAction,
} from "../actions";

const types: Array<{ value: PlanChangeType; label: string }> = [
  { value: "move_item", label: "Move an item" },
  { value: "reschedule_item", label: "Reschedule an item" },
  { value: "replace_item", label: "Replace an item" },
  { value: "remove_item", label: "Remove an item" },
  { value: "update_note", label: "Update an item note" },
  { value: "add_item", label: "Add an item" },
  { value: "change_route", label: "Change a route" },
  { value: "change_lodging", label: "Change lodging" },
  { value: "change_food", label: "Change food" },
  { value: "rebalance_day", label: "Rebalance a day" },
  { value: "update_traveler_logistics", label: "Update crew travel details" },
  { value: "adjust_budget", label: "Adjust budget" },
  { value: "general_revision", label: "Other change" },
];
const progress: Partial<Record<PlanChangeRequest["status"], string>> = {
  draft: "Trailie is reviewing the request",
  analyzing: "Trailie is checking the impact",
  approved: "Preparing the updated Plan",
  applying: "Preparing the updated Plan",
  validating: "Checking the updated schedule",
  awaiting_confirmation: "Updated Plan ready for review",
  published: "Updated Plan published",
  blocked: "This change needs attention",
  failed: "We could not complete that change",
  cancelled: "Stopped",
};

const revisionFailureCopy: Record<string, string> = {
  recovery_required:
    "Trailie is still checking this request. The current Plan remains unchanged.",
  model_timeout:
    "Trailie took too long to finish. The current Plan remains unchanged.",
  model_unavailable:
    "Trailie is temporarily unavailable. The current Plan remains unchanged.",
  model_rate_limited:
    "Trailie is receiving too many requests. The current Plan remains unchanged.",
  retry_exhausted:
    "Trailie could not finish after several tries. The current Plan remains unchanged.",
  workflow_deadline_exceeded:
    "Trailie could not complete that right now. The current Plan remains unchanged.",
  change_scope_exceeded:
    "Trailie could not make this change without altering more of the trip than the crew approved. The current Plan was not changed.",
};

function useDialogFocus(active: boolean, close: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const controls = () =>
      dialog?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
    controls()?.[0]?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = controls();
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [active]);
  return dialogRef;
}

function ApprovalList({
  state,
}: {
  state: PlanChangeRequest["analysisApprovalState"];
}) {
  if (!state) return null;
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      {state.requiredParticipants.map((person) => {
        const approved = state.approvedParticipants.some(
          (item) => item.id === person.id,
        );
        const requested = state.changeRequestedParticipants.some(
          (item) => item.id === person.id,
        );
        return (
          <div
            key={person.id}
            className="border-border rounded-md border px-3 py-2 text-sm"
          >
            <span className="font-semibold">{person.displayName}</span>
            <span className="text-muted-foreground ml-2">
              {requested
                ? "requested changes"
                : approved
                  ? "approved"
                  : "pending"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Diff({ diff }: { diff: PlanVersionDiff }) {
  const operationLabel = (value: string) =>
    value === "unchanged_but_impacted"
      ? "Related update"
      : value.replaceAll("_", " ");
  return (
    <section aria-labelledby="candidate-diff" className="mt-6">
      <h3 id="candidate-diff" className="text-lg font-semibold">
        Changes from Version {diff.baseVersion}
      </h3>
      <p className="text-muted-foreground mt-2 text-sm">{diff.summary}</p>
      <ul className="border-border mt-4 divide-y border-y">
        {diff.items.map((item) => (
          <li key={`${item.operation}:${item.itemId}`} className="py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-subtle rounded-full px-2 py-1 font-mono text-[0.625rem] uppercase">
                {operationLabel(item.operation)}
              </span>
              <time className="text-muted-foreground text-xs">{item.date}</time>
            </div>
            <p className="mt-2 text-sm">
              {item.beforeSummary ?? "Nothing"} →{" "}
              {item.afterSummary ?? "Removed"}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">{item.reason}</p>
          </li>
        ))}
      </ul>
      {diff.routeChanges.length ? (
        <section className="border-border mt-5 border-t pt-5">
          <h4 className="font-semibold">Route changed</h4>
          <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm">
            {diff.routeChanges.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {diff.warningsAdded.length || diff.warningsResolved.length ? (
        <section className="border-border mt-5 border-t pt-5">
          <h4 className="font-semibold">Travel notes</h4>
          <p className="text-muted-foreground mt-2 text-sm">
            {diff.warningsAdded.length} added · {diff.warningsResolved.length}{" "}
            resolved
          </p>
        </section>
      ) : null}
    </section>
  );
}

function ReviewPanel({
  request,
  participantId,
  refresh,
  close,
}: {
  request: PlanChangeRequest;
  participantId: string;
  refresh: () => Promise<void>;
  close: () => void;
}) {
  const dialogRef = useDialogFocus(true, close);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const analysis = request.analysis;
  async function review(decision: "approved" | "changes_requested") {
    if (decision === "changes_requested" && !note.trim()) {
      setError("Add a note before requesting changes.");
      return;
    }
    const result = await reviewPlanChangeAction({
      changeRequestId: request.id,
      analysisVersion: request.currentAnalysisVersion,
      participantId,
      decision,
      note: note.trim() || null,
    });
    if (!result.ok)
      setError(
        result.error === "change_request_stale"
          ? "This request was made on an earlier version. Start a new request from the current Plan."
          : "Your review could not be saved.",
      );
    else {
      setNote("");
      await refresh();
    }
  }
  async function confirm(decision: "confirmed" | "changes_requested") {
    if (!request.candidateTripPlanId) return;
    if (decision === "changes_requested" && !note.trim()) {
      setError("Add a note before requesting changes.");
      return;
    }
    const result = await confirmPlanChangeAction({
      changeRequestId: request.id,
      candidateTripPlanId: request.candidateTripPlanId,
      participantId,
      decision,
      note: note.trim() || null,
    });
    if (!result.ok) setError("Your confirmation could not be saved.");
    else {
      setNote("");
      await refresh();
    }
  }
  async function cancel() {
    const result = await cancelPlanChangeAction({
      changeRequestId: request.id,
      participantId,
    });
    if (!result.ok) setError("This request could not be stopped.");
    else {
      await refresh();
      close();
    }
  }
  return (
    <div
      ref={dialogRef}
      className="border-border bg-background fixed inset-x-3 top-20 bottom-20 z-20 overflow-y-auto rounded-lg border p-5 shadow-xl sm:right-6 sm:left-auto sm:w-[36rem] lg:bottom-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-review-title"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground font-mono text-[0.625rem] tracking-wider uppercase">
            Current plan · Version {request.basePlanVersion}
          </p>
          <h2 id="change-review-title" className="mt-2 text-2xl font-semibold">
            {analysis?.title ?? "Change in progress"}
          </h2>
        </div>
        <button type="button" onClick={close} className="min-h-10 px-2 text-sm">
          Close
        </button>
      </div>
      {request.isStale ? (
        <p
          role="alert"
          className="border-foreground mt-5 border-l-2 pl-3 text-sm font-semibold"
        >
          This change started on an earlier version. Start a new request from
          the current Plan.
        </p>
      ) : null}
      <p className="mt-5 font-semibold">
        {progress[request.status] ?? request.status.replaceAll("_", " ")}
      </p>
      {["failed", "blocked"].includes(request.status) ? (
        <p className="text-muted-foreground mt-2 text-sm" role="status">
          {revisionFailureCopy[request.errorCode ?? ""] ??
            "We could not complete that change. The current Plan remains available and unchanged."}
        </p>
      ) : null}
      {request.scopeRepairCount === 1 &&
      ["awaiting_confirmation", "published"].includes(request.status) ? (
        <p className="text-muted-foreground mt-2 text-sm" role="status">
          Trailie removed unrelated changes and kept only what the Crew
          approved.
        </p>
      ) : null}
      {analysis ? (
        <>
          <p className="text-muted-foreground mt-2 leading-6">
            {analysis.requestSummary}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="bg-subtle rounded-md p-3">
              <p className="text-muted-foreground text-xs">Size of change</p>
              <p className="mt-1 font-semibold capitalize">
                {analysis.materiality}
              </p>
            </div>
            <div className="bg-subtle rounded-md p-3">
              <p className="text-muted-foreground text-xs">Feasibility</p>
              <p className="mt-1 font-semibold capitalize">
                {analysis.feasibility.replaceAll("_", " ")}
              </p>
            </div>
          </div>
          <section className="mt-6">
            <h3 className="font-semibold">Affected days and items</h3>
            <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm">
              {analysis.affectedItems.map((item) => (
                <li key={item.itemId}>{item.summary}</li>
              ))}
            </ul>
          </section>
          {Object.entries(analysis.impacts)
            .filter(([, values]) => values.length)
            .map(([kind, values]) => (
              <section key={kind} className="mt-5">
                <h3 className="text-sm font-semibold capitalize">
                  {kind.replaceAll(/([A-Z])/g, " $1")}
                </h3>
                <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm">
                  {values.map((value) => (
                    <li key={value}>{value}</li>
                  ))}
                </ul>
              </section>
            ))}
          {analysis.preservedItems.length ? (
            <section className="mt-5">
              <h3 className="text-sm font-semibold">Preserved decisions</h3>
              <ul className="text-muted-foreground mt-2 list-disc pl-5 text-sm">
                {analysis.preservedItems.map((value) => (
                  <li key={value}>{value}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {analysis.risks.length || analysis.missingInformation.length ? (
            <section className="mt-5">
              <h3 className="text-sm font-semibold">
                Risks and missing information
              </h3>
              <ul className="text-muted-foreground mt-2 list-disc pl-5 text-sm">
                {[...analysis.risks, ...analysis.missingInformation].map(
                  (value) => (
                    <li key={value}>{value}</li>
                  ),
                )}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
      <ApprovalList
        state={
          request.status === "awaiting_confirmation"
            ? request.candidateConfirmationState
            : request.analysisApprovalState
        }
      />
      {request.candidateDiff ? <Diff diff={request.candidateDiff} /> : null}
      {request.status === "awaiting_confirmation" ? (
        <div className="mt-6">
          <h3 className="text-lg font-semibold">
            Ready to publish Version {request.basePlanVersion + 1}
          </h3>
          <p className="text-muted-foreground mt-2 text-sm">
            Trailie checked the requested change, schedule, and affected parts
            of the trip.
          </p>
        </div>
      ) : null}
      {[
        "awaiting_review",
        "changes_requested",
        "awaiting_confirmation",
      ].includes(request.status) ? (
        <textarea
          aria-label="Review note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Note required when requesting changes"
          maxLength={500}
          className="border-border mt-5 min-h-24 w-full rounded-md border bg-transparent p-3 text-base"
        />
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm font-semibold">
          {error}
        </p>
      ) : null}
      {request.status === "awaiting_review" ||
      request.status === "changes_requested" ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void review("approved")}
            className="bg-foreground text-background min-h-11 rounded-md px-4 text-sm font-semibold"
          >
            Approve change
          </button>
          <button
            type="button"
            onClick={() => void review("changes_requested")}
            className="border-border min-h-11 rounded-md border px-4 text-sm font-semibold"
          >
            Request changes
          </button>
        </div>
      ) : null}
      {request.status === "awaiting_confirmation" ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void confirm("confirmed")}
            className="bg-foreground text-background min-h-11 rounded-md px-4 text-sm font-semibold"
          >
            Publish Version {request.basePlanVersion + 1}
          </button>
          <button
            type="button"
            onClick={() => void confirm("changes_requested")}
            className="border-border min-h-11 rounded-md border px-4 text-sm font-semibold"
          >
            Request changes
          </button>
        </div>
      ) : null}
      {!["published", "cancelled", "superseded"].includes(request.status) ? (
        <button
          type="button"
          onClick={() => void cancel()}
          className="text-muted-foreground mt-5 min-h-10 text-xs font-semibold"
        >
          Stop
        </button>
      ) : null}
    </div>
  );
}

export function RevisionExperience({
  roomId,
  participantId,
  plan,
  isHost,
  onPlanPublished,
  preferMap = false,
}: {
  roomId: string;
  participantId: string;
  plan: TripPlanView;
  isHost: boolean;
  onPlanPublished: () => Promise<void>;
  preferMap?: boolean;
}) {
  const [request, setRequest] = useState<PlanChangeRequest | null>(null);
  const [versions, setVersions] = useState<PlanVersionSummary[]>([]);
  const [form, setForm] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [history, setHistory] = useState(false);
  const [target, setTarget] = useState<{ id: string; title: string } | null>(
    null,
  );
  const [requestType, setRequestType] =
    useState<PlanChangeType>("general_revision");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [historical, setHistorical] = useState<TripPlanView | null>(null);
  const [comparison, setComparison] = useState<PlanVersionDiff | null>(null);
  const [comments, setComments] = useState<GuestComment[]>([]);
  const [historicalComments, setHistoricalComments] = useState<GuestComment[]>(
    [],
  );
  const changeDialogRef = useDialogFocus(form, () => setForm(false));
  const historyDialogRef = useDialogFocus(history, () => {
    setHistory(false);
    setComparison(null);
  });
  const refresh = useCallback(async () => {
    const [requestResult, versionsResult, commentsResult] = await Promise.all([
      getPlanChangeRequestAction(roomId),
      listPlanVersionsAction(roomId),
      listMemberCommentsAction(roomId, plan.version),
    ]);
    if (requestResult.ok) {
      setRequest(requestResult.data);
      if (
        requestResult.data &&
        !["published", "cancelled"].includes(requestResult.data.status)
      )
        setReviewOpen(true);
      else if (
        requestResult.data &&
        ["published", "cancelled"].includes(requestResult.data.status)
      )
        setReviewOpen(false);
      if (
        requestResult.data?.status === "published" &&
        requestResult.data.basePlanVersion >= plan.version
      ) {
        await onPlanPublished();
      }
    }
    if (versionsResult.ok) setVersions(versionsResult.data);
    if (commentsResult.ok) setComments(commentsResult.data);
  }, [roomId, plan.version, onPlanPublished]);
  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 1800);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    let active = true;
    let client: ReturnType<typeof createBrowserSupabaseClient>;
    try {
      client = createBrowserSupabaseClient();
    } catch {
      return;
    }
    const channel = client.channel(`room:${roomId}`, {
      config: { private: true, broadcast: { self: false, ack: true } },
    });
    channel.on(
      "broadcast",
      { event: "plan_change_changed" },
      () => void refresh(),
    );
    void (async () => {
      const { data } = await client.auth.getSession();
      if (!active) return;
      await client.realtime.setAuth(data.session?.access_token);
      if (active) channel.subscribe();
    })();
    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [refresh, roomId]);
  function start(item?: { id: string; title: string }) {
    setTarget(item ?? null);
    setRequestType(item ? "move_item" : "general_revision");
    setForm(true);
    setError(null);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const result = await createPlanChangeRequestAction({
      baseTripPlanId: plan.id,
      participantId,
      requestType,
      targetItemId: target?.id ?? null,
      requestText: details,
    });
    if (!result.ok) {
      setError(
        result.error === "target_item_not_found"
          ? "That item is no longer in the current plan."
          : "The change request could not be started.",
      );
      return;
    }
    setForm(false);
    setDetails("");
    setReviewOpen(true);
    await refresh();
  }
  async function viewVersion(version: number) {
    const [result, commentsResult] = await Promise.all([
      getPlanVersionAction(roomId, version),
      listMemberCommentsAction(roomId, version),
    ]);
    if (result.ok) {
      setHistorical(result.data);
      setHistoricalComments(commentsResult.ok ? commentsResult.data : []);
      setComparison(null);
    }
  }
  async function compare(version: number) {
    if (version <= 1) return;
    const result = await comparePlanVersionsAction(
      roomId,
      version - 1,
      version,
    );
    if (result.ok) {
      setComparison(result.data);
      setHistorical(null);
    }
  }
  if (historical)
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-border flex items-center justify-between border-b px-5 py-3">
          <p className="text-sm font-semibold">
            Viewing Version {historical.version}
          </p>
          <button
            type="button"
            onClick={() => setHistorical(null)}
            className="min-h-10 text-sm font-semibold"
          >
            Back to current
          </button>
        </div>
        <ShareControls
          roomId={roomId}
          participantId={participantId}
          tripPlanId={historical.id}
          version={historical.version}
          isHost={isHost}
        />
        <GuestInviteControls
          roomId={roomId}
          participantId={participantId}
          planVersionId={historical.id}
          planVersion={historical.version}
          isHost={isHost}
        />
        <GuestSuggestionsPanel
          roomId={roomId}
          participantId={participantId}
          currentPlanVersion={plan.version}
          onConverted={async () => {
            setHistorical(null);
            setReviewOpen(true);
            await refresh();
          }}
        />
        <ItineraryExperience
          key={preferMap ? "historical-map" : "historical-plan"}
          plan={historical}
          initialView={preferMap ? "Map" : "Overview"}
          readOnly
          commenting={{
            mode: "member",
            comments: historicalComments,
            roomId,
            participantId,
          }}
          onHistory={() => {
            setHistorical(null);
            setHistory(true);
          }}
        />
      </div>
    );
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <ShareControls
        roomId={roomId}
        participantId={participantId}
        tripPlanId={plan.id}
        version={plan.version}
        isHost={isHost}
      />
      <GuestInviteControls
        roomId={roomId}
        participantId={participantId}
        planVersionId={plan.id}
        planVersion={plan.version}
        isHost={isHost}
      />
      <GuestSuggestionsPanel
        roomId={roomId}
        participantId={participantId}
        currentPlanVersion={plan.version}
        onConverted={async () => {
          setReviewOpen(true);
          await refresh();
        }}
      />
      <ItineraryExperience
        key={preferMap ? "current-map" : "current-plan"}
        plan={plan}
        initialView={preferMap ? "Map" : "Overview"}
        onRequestChange={() => start()}
        onChangeItem={(id, title) => start({ id, title })}
        onHistory={() => setHistory(true)}
        commenting={{
          mode: "member",
          comments,
          roomId,
          participantId,
        }}
      />
      {form ? (
        <div
          ref={changeDialogRef}
          className="border-border bg-background fixed inset-x-3 top-20 z-30 rounded-lg border p-5 shadow-xl sm:right-6 sm:left-auto sm:w-[30rem]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="change-form-title"
        >
          <div className="flex justify-between">
            <div>
              <p className="text-muted-foreground font-mono text-[0.625rem] uppercase">
                Version {plan.version}
              </p>
              <h2 id="change-form-title" className="mt-2 text-xl font-semibold">
                Request a change
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setForm(false)}
              className="min-h-10 px-2"
            >
              Close
            </button>
          </div>
          {target ? (
            <p className="bg-subtle mt-4 rounded-md p-3 text-sm">
              Changing: <strong>{target.title}</strong>
            </p>
          ) : null}
          <form onSubmit={(event) => void submit(event)} className="mt-5">
            <label className="text-sm font-semibold" htmlFor="change-type">
              Change type
            </label>
            <select
              id="change-type"
              value={requestType}
              onChange={(event) =>
                setRequestType(event.target.value as PlanChangeType)
              }
              className="border-border mt-2 min-h-11 w-full rounded-md border bg-transparent px-3"
            >
              {types.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            <label
              className="mt-4 block text-sm font-semibold"
              htmlFor="change-details"
            >
              Request details
            </label>
            <textarea
              id="change-details"
              required
              maxLength={2000}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              className="border-border mt-2 min-h-32 w-full rounded-md border bg-transparent p-3"
              placeholder="Describe the exact change you want Trailie to check."
            />
            {error ? (
              <p role="alert" className="mt-3 text-sm font-semibold">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              className="bg-foreground text-background mt-4 min-h-11 rounded-md px-4 text-sm font-semibold"
            >
              Check this change
            </button>
          </form>
        </div>
      ) : null}
      {reviewOpen && request ? (
        <ReviewPanel
          request={request}
          participantId={participantId}
          refresh={refresh}
          close={() => setReviewOpen(false)}
        />
      ) : null}
      {history ? (
        <div
          ref={historyDialogRef}
          className={`border-border bg-background fixed inset-x-3 top-20 bottom-20 z-20 overflow-y-auto rounded-lg border p-5 shadow-xl sm:right-6 sm:left-auto ${comparison ? "sm:w-[min(70rem,calc(100vw-3rem))]" : "sm:w-[34rem]"}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="history-title"
        >
          <div className="flex justify-between">
            <h2 id="history-title" className="text-2xl font-semibold">
              Version history
            </h2>
            <button
              type="button"
              onClick={() => {
                setHistory(false);
                setComparison(null);
              }}
              className="min-h-10 px-2"
            >
              Close
            </button>
          </div>
          {comparison ? (
            <>
              <Diff diff={comparison} />
              <SpatialCompare
                key={`${comparison.baseVersion}:${comparison.candidateVersion}`}
                roomId={roomId}
                baseVersion={comparison.baseVersion}
                candidateVersion={comparison.candidateVersion}
              />
            </>
          ) : (
            <ul className="border-border mt-5 divide-y border-y">
              {versions.map((version) => (
                <li key={version.tripPlanId} className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        Version {version.version}{" "}
                        {version.isCurrent ? (
                          <span className="bg-accent-soft text-accent ml-1 rounded-full px-2 py-1 text-xs">
                            Current plan
                          </span>
                        ) : null}
                      </p>
                      <p className="text-muted-foreground mt-1 text-sm">
                        {version.changeSummary ??
                          "Original approved planning summary"}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        Published on{" "}
                        {new Date(version.publishedAt).toLocaleString()}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {version.requestedBy
                          ? `Suggested by ${version.requestedBy.displayName} · `
                          : ""}
                        Approved by the Crew
                      </p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => void viewVersion(version.version)}
                        className="min-h-9 text-xs font-semibold"
                      >
                        View Plan
                      </button>
                      {version.version > 1 ? (
                        <button
                          type="button"
                          onClick={() => void compare(version.version)}
                          className="min-h-9 text-xs font-semibold"
                        >
                          Compare changes
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
