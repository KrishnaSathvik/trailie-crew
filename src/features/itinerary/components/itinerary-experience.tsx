"use client";
import { useEffect, useState } from "react";
import type { CostEstimate, TripPlanView } from "@trailie/schemas";
import { ItineraryMapLoader } from "@/features/maps/components/itinerary-map-loader";
import { CommentThread } from "@/features/guest-comments/components/comment-thread";
import type { GuestComment } from "@/features/guest-comments/contracts";

const progressCopy = {
  generation_started: "Preparing the approved trip details",
  structure_created: "Building the day-by-day plan",
  route_validation_started: "Checking routes and timing",
  constraint_validation_started: "Checking crew needs",
  repair_started: "Adjusting a scheduling conflict",
  validation_completed: "Finalizing the Plan",
  published: "Plan published",
  failed: "Trailie couldn’t finish the Plan",
} as const;
export type ItineraryView =
  | "Overview"
  | "Map"
  | "Day-by-day"
  | "Travel"
  | "Stay"
  | "Food"
  | "Evidence"
  | "Trip checks";
const views: ItineraryView[] = [
  "Overview",
  "Map",
  "Day-by-day",
  "Travel",
  "Stay",
  "Food",
  "Evidence",
  "Trip checks",
];
const quotaCopy: Record<string, string> = {
  ai_disabled:
    "Trailie is temporarily paused. Chat and existing Plans remain available.",
  user_ai_limit_reached:
    "Your daily Trailie allowance has been reached. Your existing Trip remains available.",
  room_ai_limit_reached:
    "This Trip’s daily Trailie allowance has been reached.",
  global_ai_limit_reached: "Trailie’s daily capacity has been reached.",
  provider_budget_unavailable:
    "Trailie is temporarily unavailable. Your current Plan is unchanged.",
  model_timeout:
    "Trailie took too long to finish. No partial Plan was published, and you can try again.",
  model_rate_limited:
    "Trailie is receiving too many requests. No partial Plan was published; try again shortly.",
  model_unavailable:
    "Trailie is temporarily unavailable. No partial Plan was published, and you can try again.",
  recovery_required:
    "Trailie is still checking this request. Chat and published Plans remain available.",
  retry_exhausted:
    "Trailie could not finish after several tries. Chat and published Plans remain available.",
  workflow_deadline_exceeded:
    "Trailie could not complete that right now. No partial Plan was published.",
  workflow_cancelled:
    "This request was stopped. No partial Plan was published.",
};

function costLabel(cost: CostEstimate) {
  if (cost.status === "unknown") return "Cost unknown";
  if (cost.amount !== null)
    return `${cost.status === "verified" ? "Verified" : "Estimated"} ${cost.currency} ${cost.amount.toLocaleString()}`;
  if (cost.minAmount !== null && cost.maxAmount !== null)
    return `${cost.status === "verified" ? "Verified" : "Estimated"} ${cost.currency} ${cost.minAmount.toLocaleString()}–${cost.maxAmount.toLocaleString()}`;
  return "Cost estimate unavailable";
}

function locationLabel(value: string | null | undefined) {
  if (value === "verified") return "Verified location";
  if (value === "estimated") return "Location estimated";
  if (value === "unavailable") return "Location unavailable";
  return "Location not verified";
}

function reservationLabel(value: string) {
  if (value === "required") return "Reservation required";
  if (value === "recommended") return "Reservation recommended";
  if (value === "not_required") return "No reservation required";
  return "Reservation status unknown";
}

function ActivePlan({
  plan,
  onCancel,
}: {
  plan: TripPlanView;
  onCancel?: () => void;
}) {
  const [takingLonger, setTakingLonger] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setTakingLonger(true), 10_000);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-12 sm:px-8"
      aria-live="polite"
    >
      <p className="text-muted-foreground font-mono text-[0.625rem] tracking-[0.16em] uppercase">
        Plan · Version {plan.version}
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">
        Trailie is checking the Plan before you see it.
      </h1>
      <p className="text-muted-foreground mt-3 max-w-xl leading-7">
        {takingLonger
          ? "Trailie is taking longer than usual."
          : "Chat stays available. Refreshing this page will resume from the latest completed stage."}
      </p>
      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="border-border mt-6 min-h-11 w-fit rounded-md border px-4 text-sm font-semibold"
        >
          Stop
        </button>
      ) : null}
      <ol
        className="border-border relative mt-8 space-y-0 border-l"
        aria-label="Plan progress"
      >
        {plan.progressEvents.map((event) => (
          <li key={event.id} className="relative pb-6 pl-6 last:pb-0">
            <span
              aria-hidden="true"
              className="bg-foreground ring-background absolute top-1.5 -left-[0.3125rem] size-2.5 rounded-full ring-4"
            />
            <p className="text-sm font-semibold">{progressCopy[event.type]}</p>
            <time className="text-muted-foreground mt-1 block font-mono text-[0.625rem]">
              {new Date(event.createdAt).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </time>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Overview({ plan }: { plan: TripPlanView }) {
  const itinerary = plan.itinerary!;
  const unresolved = itinerary.unresolvedItems.length;
  const lodging = itinerary.lodging[0];
  const costs = itinerary.days.map((day) => day.estimatedDailyCost);
  const costStatus = costs.every((cost) => cost.status === "unknown")
    ? "Cost total unknown"
    : "Cost total is an estimate";
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_17rem]">
      <div>
        <div className="border-border bg-border grid grid-cols-2 gap-px overflow-hidden rounded-md border sm:grid-cols-4">
          {[
            ["Dates", `${itinerary.startDate} — ${itinerary.endDate}`],
            ["Crew", String(itinerary.travelers.length)],
            ["Trip brief", `Version ${plan.basisSummaryVersion}`],
            ["Cost", costStatus],
          ].map(([label, value]) => (
            <div key={label} className="bg-background p-4">
              <p className="text-muted-foreground font-mono text-[0.5625rem] tracking-wider uppercase">
                {label}
              </p>
              <p className="mt-2 text-sm font-semibold">{value}</p>
            </div>
          ))}
        </div>
        <section className="border-border mt-8 border-t pt-6">
          <h2 className="text-sm font-semibold">Trip shape</h2>
          <p className="text-muted-foreground mt-3 leading-7">
            {itinerary.destinationSummary}
          </p>
        </section>
        <section className="border-border mt-6 border-t pt-6">
          <h2 className="text-sm font-semibold">Stay</h2>
          <p className="mt-3">
            {lodging
              ? `${lodging.name} · ${lodging.area}`
              : "No lodging has been selected yet."}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            Recommendation only. No reservation has been made.
          </p>
        </section>
        <section className="border-border mt-6 border-t pt-6">
          <h2 className="text-sm font-semibold">Open details</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            {unresolved
              ? `${unresolved} detail${unresolved === 1 ? "" : "s"} still need a crew decision.`
              : "Every material detail is settled in this version."}
          </p>
        </section>
      </div>
      <aside className="border-border h-fit rounded-md border p-5">
        <p className="text-muted-foreground font-mono text-[0.5625rem] tracking-wider uppercase">
          Trip checks
        </p>
        <p className="mt-3 text-sm font-semibold">Checked before publishing</p>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          Critical timing, route, decision, and crew-constraint checks passed.
        </p>
      </aside>
    </div>
  );
}

function Days({
  plan,
  onChangeItem,
  readOnly,
  commenting,
}: {
  plan: TripPlanView;
  onChangeItem?: (itemId: string, title: string) => void;
  readOnly?: boolean;
  commenting?: {
    mode: "member";
    comments: GuestComment[];
    roomId: string;
    participantId: string;
  };
}) {
  return (
    <div className="space-y-10">
      {plan.itinerary!.days.map((day) => (
        <section key={day.id} aria-labelledby={`${day.id}-title`}>
          <div className="border-border bg-background sticky top-0 z-[1] flex items-baseline justify-between border-b py-3">
            <h2 id={`${day.id}-title`} className="text-xl font-semibold">
              {day.title}
            </h2>
            <time className="text-muted-foreground font-mono text-xs">
              {day.date}
            </time>
          </div>
          {commenting ? (
            <CommentThread
              mode={commenting.mode}
              comments={commenting.comments.filter(
                (comment) => comment.dayKey === day.date && !comment.itemKey,
              )}
              target={{
                label: day.title,
                dayKey: day.date,
                itemKey: null,
              }}
              roomId={commenting.roomId}
              planVersion={plan.version}
              participantId={commenting.participantId}
            />
          ) : null}
          <ol className="border-border ml-2 border-l">
            {day.items.map((item) => (
              <li key={item.id} className="relative py-5 pl-6">
                <span
                  aria-hidden="true"
                  className="bg-background border-foreground absolute top-7 -left-1.5 size-3 rounded-full border-2"
                />
                <p className="text-muted-foreground font-mono text-[0.625rem]">
                  {item.startTime ?? "Open"} — {item.endTime ?? "Unscheduled"}
                </p>
                <h3 className="mt-2 font-semibold">{item.title}</h3>
                <p className="text-muted-foreground mt-1 text-sm leading-6">
                  {item.description}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-[0.6875rem]">
                  <span className="border-border rounded-full border px-2 py-1">
                    {locationLabel(item.location?.verificationStatus)}
                  </span>
                  <span className="border-border rounded-full border px-2 py-1">
                    {reservationLabel(item.reservation.status)}
                  </span>
                  <span className="border-border rounded-full border px-2 py-1">
                    {costLabel(item.cost)}
                  </span>
                </div>
                {commenting ? (
                  <CommentThread
                    mode={commenting.mode}
                    comments={commenting.comments.filter(
                      (comment) =>
                        comment.dayKey === day.date &&
                        comment.itemKey === item.id,
                    )}
                    target={{
                      label: item.title,
                      dayKey: day.date,
                      itemKey: item.id,
                    }}
                    roomId={commenting.roomId}
                    planVersion={plan.version}
                    participantId={commenting.participantId}
                  />
                ) : null}
                {!readOnly && onChangeItem ? (
                  <button
                    type="button"
                    onClick={() => onChangeItem(item.id, item.title)}
                    className="border-border mt-4 min-h-10 rounded-md border px-3 text-xs font-semibold"
                  >
                    Change this
                  </button>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function Travel({ plan }: { plan: TripPlanView }) {
  const segments = plan.itinerary!.days.flatMap((day) =>
    day.travelSegments.map((segment) => ({ day: day.date, segment })),
  );
  return (
    <div>
      <h2 className="text-xl font-semibold">Routes and transfers</h2>
      {segments.length ? (
        <ul className="border-border mt-5 divide-y border-y">
          {segments.map(({ day, segment }) => (
            <li
              key={segment.id}
              className="grid gap-2 py-5 sm:grid-cols-[7rem_1fr_auto]"
            >
              <time className="text-muted-foreground font-mono text-xs">
                {day}
              </time>
              <div>
                <p className="font-semibold">
                  {segment.origin.name} → {segment.destination.name}
                </p>
                <p className="text-muted-foreground mt-1 text-sm capitalize">
                  {segment.mode} ·{" "}
                  {segment.durationMinutes === null
                    ? "Route unavailable"
                    : "Route checked"}
                </p>
              </div>
              <p className="text-sm font-semibold">
                {segment.durationMinutes === null
                  ? "Unverified route"
                  : `${Math.floor(segment.durationMinutes / 60)} hr${segment.durationMinutes % 60 ? ` ${segment.durationMinutes % 60} min` : ""}`}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground mt-4">
          No route segments are scheduled.
        </p>
      )}
    </div>
  );
}

function Stay({ plan }: { plan: TripPlanView }) {
  return (
    <div>
      <h2 className="text-xl font-semibold">Stay recommendations</h2>
      <p className="text-muted-foreground mt-2 text-sm">
        No reservation has been made
      </p>
      {plan.itinerary!.lodging.length ? (
        <div className="mt-6 space-y-4">
          {plan.itinerary!.lodging.map((stay) => (
            <article
              key={stay.id}
              className="border-border rounded-md border p-5"
            >
              <h3 className="font-semibold">{stay.name}</h3>
              <p className="text-muted-foreground mt-1 text-sm">
                {stay.area} · {stay.checkInDate} to {stay.checkOutDate}
              </p>
              <p className="mt-3 text-sm">{costLabel(stay.cost)}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground mt-6">
          No stay has been selected yet. Ask Trailie to compare areas or lodging
          options when the crew is ready.
        </p>
      )}
    </div>
  );
}

function Food({ plan }: { plan: TripPlanView }) {
  const restaurants = plan.itinerary!.restaurants;
  return (
    <div>
      <h2 className="text-xl font-semibold">Food</h2>
      {!restaurants.length ? (
        <p className="text-muted-foreground mt-4">
          No verified restaurant details yet.
        </p>
      ) : (
        <ul className="mt-5 space-y-4">
          {restaurants.map((place) => (
            <li key={place.id} className="border-border rounded-md border p-5">
              <p className="font-semibold">{place.name}</p>
              <p className="text-muted-foreground mt-1 text-sm capitalize">
                {place.mealWindow} · reservation{" "}
                {place.reservation.status.replaceAll("_", " ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TripChecks({ plan }: { plan: TripPlanView }) {
  const report = plan.validationSummary;
  return (
    <div>
      <h2 className="text-xl font-semibold">Trip checks</h2>
      <p className="mt-4 text-lg font-semibold">
        {report?.passedChecks.length ?? 0} checks passed
      </p>
      <p className="text-muted-foreground mt-2">
        {report?.warningCount ?? report?.warnings.length ?? 0} remaining
        warnings
      </p>
      {report?.evidenceLastCheckedAt ? (
        <p className="text-muted-foreground mt-6 text-sm">
          Evidence last checked{" "}
          {new Date(report.evidenceLastCheckedAt).toLocaleString()}
        </p>
      ) : (
        <p className="text-muted-foreground mt-6 text-sm">
          Some travel details could not be verified.
        </p>
      )}
    </div>
  );
}

function evidenceStatus(
  evidence: NonNullable<TripPlanView["travelEvidence"]>[number],
) {
  if (
    evidence.verificationState === "verified" &&
    (evidence.freshnessState === "fresh" ||
      evidence.freshnessState === "cached_fresh")
  )
    return "Verified";
  if (evidence.verificationState === "partially_verified")
    return "Partially verified";
  if (
    evidence.freshnessState === "stale" ||
    evidence.freshnessState === "expired"
  )
    return "Stale";
  return "Not verified";
}

function evidenceFallback(
  evidence: NonNullable<TripPlanView["travelEvidence"]>[number],
) {
  if (
    evidence.evidenceType === "weather_forecast" &&
    evidence.availabilityState !== "available"
  )
    return "Weather information is unavailable for this published version.";
  if (
    evidence.evidenceType === "route" &&
    evidence.availabilityState !== "available"
  )
    return "Live route information is unavailable, so Trailie has not verified this travel time.";
  if (
    evidence.evidenceType === "reservation" &&
    evidence.verificationState !== "verified"
  )
    return "This reservation requirement has not been verified.";
  if (
    evidence.evidenceType === "park_alert" &&
    evidence.availabilityState !== "available"
  )
    return "Official park alerts could not be checked.";
  return null;
}

function Evidence({ plan }: { plan: TripPlanView }) {
  const evidence = plan.travelEvidence ?? [];
  return (
    <div>
      <h2 className="text-xl font-semibold">Travel evidence</h2>
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
        Sources are saved with Version {plan.version}. Conditions may have
        changed since this Version was published.
      </p>
      {evidence.length ? (
        <ul className="border-border mt-6 divide-y border-y">
          {evidence.map((entry) => {
            const fallback = evidenceFallback(entry);
            return (
              <li
                key={entry.evidenceId}
                className="grid gap-3 py-5 sm:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="border-border rounded-full border px-2 py-1 text-[0.6875rem] font-semibold">
                      {evidenceStatus(entry)}
                    </span>
                    {entry.evidenceType === "park_closure" ? (
                      <span className="border-foreground rounded-full border px-2 py-1 text-[0.6875rem] font-semibold">
                        Official closure
                      </span>
                    ) : null}
                    <span className="text-muted-foreground font-mono text-[0.625rem] capitalize">
                      {entry.evidenceType.replaceAll("_", " ")}
                    </span>
                  </div>
                  <p className="mt-3 font-semibold">
                    {entry.headline ?? fallback ?? entry.sourceName}
                  </p>
                  {fallback && entry.headline ? (
                    <p className="text-muted-foreground mt-1 text-sm">
                      {fallback}
                    </p>
                  ) : null}
                  <p className="text-muted-foreground mt-2 text-xs">
                    {entry.sourceName} · Last checked{" "}
                    {new Date(entry.retrievedAt).toLocaleString()}
                  </p>
                </div>
                {entry.sourceUrl ? (
                  <a
                    href={entry.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="h-fit text-sm font-semibold underline underline-offset-4"
                  >
                    Open official source
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground mt-6">
          This information could not be verified for this Plan version.
        </p>
      )}
    </div>
  );
}

export function ItineraryExperience({
  plan,
  onRequestChange,
  onChangeItem,
  onHistory,
  onRetry,
  onCancel,
  readOnly = false,
  initialView = "Overview",
  commenting,
}: {
  plan: TripPlanView;
  onRequestChange?: () => void;
  onChangeItem?: (itemId: string, title: string) => void;
  onHistory?: () => void;
  onRetry?: () => void;
  onCancel?: () => void;
  readOnly?: boolean;
  initialView?: ItineraryView;
  commenting?: {
    mode: "member";
    comments: GuestComment[];
    roomId: string;
    participantId: string;
  };
}) {
  const [view, setView] = useState<ItineraryView>(initialView);
  if (plan.status === "blocked" || plan.status === "failed") {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-12">
        <p className="text-muted-foreground font-mono text-[0.625rem] tracking-[0.16em] uppercase">
          Plan · Version {plan.version}
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">
          {plan.errorCode === "workflow_cancelled"
            ? "Stopped"
            : plan.status === "blocked"
              ? "This Plan cannot be published yet."
              : "The Plan could not be created."}
        </h1>
        <p className="text-muted-foreground mt-3 leading-7">
          {quotaCopy[plan.errorCode ?? ""] ??
            "The approved trip brief and Crew conversation are unchanged. No incomplete Plan was published."}
        </p>
        {plan.status === "failed" && onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="bg-foreground text-background mt-6 w-fit rounded-full px-5 py-2.5 text-sm font-semibold"
          >
            Try again
          </button>
        ) : null}
      </div>
    );
  }
  if (plan.status !== "published" || !plan.itinerary)
    return <ActivePlan plan={plan} onCancel={onCancel} />;
  const repaired = plan.validationSummary?.repairedIssues.includes(
    "route_timing_impossible",
  );
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <header className="border-border px-5 pt-7 sm:px-8">
        <p className="text-muted-foreground font-mono text-[0.625rem] tracking-[0.16em] uppercase">
          {readOnly ? "Earlier version" : "Current plan"} · Version{" "}
          {plan.version}
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.045em]">
              {plan.itinerary.title}
            </h1>
            <p className="text-muted-foreground mt-2">
              {plan.itinerary.destinationSummary}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {readOnly ? (
              <span className="border-border rounded-full border px-3 py-1.5 text-xs font-semibold">
                Viewing an earlier version
              </span>
            ) : null}
            <span className="border-border rounded-full border px-3 py-1.5 text-xs font-semibold">
              Checked before publishing
            </span>
            {onHistory ? (
              <button
                type="button"
                onClick={onHistory}
                className="border-border min-h-10 rounded-md border px-3 text-xs font-semibold"
              >
                Version history
              </button>
            ) : null}
            {!readOnly && onRequestChange ? (
              <button
                type="button"
                onClick={onRequestChange}
                className="bg-foreground text-background min-h-10 rounded-md px-3 text-xs font-semibold"
              >
                Request a change
              </button>
            ) : null}
          </div>
        </div>
        {repaired ? (
          <p className="border-foreground mt-5 border-l-2 pl-3 text-sm font-semibold">
            Trailie adjusted the schedule after checking travel time.
          </p>
        ) : null}
        {commenting ? (
          <CommentThread
            mode={commenting.mode}
            comments={commenting.comments.filter(
              (comment) => !comment.dayKey && !comment.itemKey,
            )}
            target={{
              label: `Version ${plan.version}`,
              dayKey: null,
              itemKey: null,
            }}
            roomId={commenting.roomId}
            planVersion={plan.version}
            participantId={commenting.participantId}
          />
        ) : null}
        <label className="mt-7 block sm:hidden">
          <span className="text-muted-foreground mb-2 block text-xs font-semibold">
            Plan view
          </span>
          <select
            value={view}
            onChange={(event) => setView(event.target.value as ItineraryView)}
            className="border-border bg-background focus-visible:ring-ring min-h-11 w-full rounded-md border px-3 text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none"
          >
            {views.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <div
          className="mt-7 hidden overflow-x-auto sm:block"
          role="tablist"
          aria-label="Plan views"
        >
          <div className="border-border flex min-w-max gap-6 border-b">
            {views.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={view === item}
                onClick={() => setView(item)}
                className={`min-h-11 border-b-2 text-sm ${view === item ? "border-foreground font-semibold" : "text-muted-foreground border-transparent"}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </header>
      {view === "Map" ? (
        <ItineraryMapLoader
          plan={plan}
          onViewEvidence={() => setView("Evidence")}
        />
      ) : (
        <div className="mx-auto w-full max-w-5xl px-5 py-8 pb-28 sm:px-8 lg:pb-12">
          {view === "Overview" ? <Overview plan={plan} /> : null}
          {view === "Day-by-day" ? (
            <Days
              plan={plan}
              onChangeItem={onChangeItem}
              readOnly={readOnly}
              commenting={commenting}
            />
          ) : null}
          {view === "Travel" ? <Travel plan={plan} /> : null}
          {view === "Stay" ? <Stay plan={plan} /> : null}
          {view === "Food" ? <Food plan={plan} /> : null}
          {view === "Evidence" ? <Evidence plan={plan} /> : null}
          {view === "Trip checks" ? <TripChecks plan={plan} /> : null}
        </div>
      )}
    </div>
  );
}
