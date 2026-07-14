"use client";
import { useState } from "react";
import type { CostEstimate, TripPlanView } from "@trailie/schemas";

const progressCopy = {
  generation_started: "Preparing the approved trip details",
  structure_created: "Building the day-by-day plan",
  route_validation_started: "Checking routes and timing",
  constraint_validation_started: "Validating crew constraints",
  repair_started: "Adjusting a scheduling conflict",
  validation_completed: "Finalizing the itinerary",
  published: "Itinerary published",
  failed: "Itinerary generation stopped",
} as const;
type View =
  "Overview" | "Day-by-day" | "Travel" | "Stay" | "Food" | "Validation";
const views: View[] = [
  "Overview",
  "Day-by-day",
  "Travel",
  "Stay",
  "Food",
  "Validation",
];

function costLabel(cost: CostEstimate) {
  if (cost.status === "unknown") return "Cost unknown";
  if (cost.amount !== null)
    return `${cost.status === "verified" ? "Verified" : "Estimated"} ${cost.currency} ${cost.amount.toLocaleString()}`;
  if (cost.minAmount !== null && cost.maxAmount !== null)
    return `${cost.status === "verified" ? "Verified" : "Estimated"} ${cost.currency} ${cost.minAmount.toLocaleString()}–${cost.maxAmount.toLocaleString()}`;
  return "Cost estimate unavailable";
}

function ActivePlan({ plan }: { plan: TripPlanView }) {
  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-12 sm:px-8"
      aria-live="polite"
    >
      <p className="text-muted-foreground font-mono text-[0.625rem] tracking-[0.16em] uppercase">
        Itinerary · Version {plan.version}
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">
        Trailie is validating the plan before you see it.
      </h1>
      <p className="text-muted-foreground mt-3 max-w-xl leading-7">
        Chat stays available. Refreshing this page will resume from the latest
        completed stage.
      </p>
      <ol
        className="border-border relative mt-8 space-y-0 border-l"
        aria-label="Itinerary progress"
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
            ["Travelers", String(itinerary.travelers.length)],
            ["Summary basis", `Version ${plan.basisSummaryVersion}`],
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
              : "Lodging remains unresolved."}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            Recommendation only. No reservation has been made.
          </p>
        </section>
        <section className="border-border mt-6 border-t pt-6">
          <h2 className="text-sm font-semibold">Unresolved items</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            {unresolved
              ? `${unresolved} item${unresolved === 1 ? "" : "s"} remain explicit.`
              : "No unresolved items in this version."}
          </p>
        </section>
      </div>
      <aside className="border-border h-fit rounded-md border p-5">
        <p className="text-muted-foreground font-mono text-[0.5625rem] tracking-wider uppercase">
          Validation
        </p>
        <p className="mt-3 text-sm font-semibold">
          Validated before publishing
        </p>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          Critical timing, route, decision, and crew-constraint checks passed.
        </p>
      </aside>
    </div>
  );
}

function Days({ plan }: { plan: TripPlanView }) {
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
                    {item.location?.verificationStatus ?? "unknown"} location
                  </span>
                  <span className="border-border rounded-full border px-2 py-1">
                    Reservation {item.reservation.status.replaceAll("_", " ")}
                  </span>
                  <span className="border-border rounded-full border px-2 py-1">
                    {costLabel(item.cost)}
                  </span>
                </div>
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
                  {segment.mode} · {segment.verificationStatus}
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
          No verified restaurant details yet
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

function Validation({ plan }: { plan: TripPlanView }) {
  const report = plan.validationSummary;
  return (
    <div>
      <h2 className="text-xl font-semibold">Validation summary</h2>
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
          Some provider details remain unknown.
        </p>
      )}
    </div>
  );
}

export function ItineraryExperience({ plan }: { plan: TripPlanView }) {
  const [view, setView] = useState<View>("Overview");
  if (plan.status === "blocked" || plan.status === "failed") {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-12">
        <p className="text-muted-foreground font-mono text-[0.625rem] tracking-[0.16em] uppercase">
          Itinerary · Version {plan.version}
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">
          {plan.status === "blocked"
            ? "This itinerary cannot be published yet."
            : "The itinerary could not be generated."}
        </h1>
        <p className="text-muted-foreground mt-3 leading-7">
          The approved summary and crew conversation are unchanged. Trailie did
          not present an unvalidated plan as ready.
        </p>
      </div>
    );
  }
  if (plan.status !== "published" || !plan.itinerary)
    return <ActivePlan plan={plan} />;
  const repaired = plan.validationSummary?.repairedIssues.includes(
    "route_timing_impossible",
  );
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <header className="border-border px-5 pt-7 sm:px-8">
        <p className="text-muted-foreground font-mono text-[0.625rem] tracking-[0.16em] uppercase">
          Published itinerary · Version {plan.version}
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
          <span className="border-border rounded-full border px-3 py-1.5 text-xs font-semibold">
            Validated before publishing
          </span>
        </div>
        {repaired ? (
          <p className="border-foreground mt-5 border-l-2 pl-3 text-sm font-semibold">
            Trailie adjusted the schedule after checking travel time.
          </p>
        ) : null}
        <div
          className="mt-7 overflow-x-auto"
          role="tablist"
          aria-label="Itinerary views"
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
      <div className="mx-auto w-full max-w-5xl px-5 py-8 pb-28 sm:px-8 lg:pb-12">
        {view === "Overview" ? <Overview plan={plan} /> : null}
        {view === "Day-by-day" ? <Days plan={plan} /> : null}
        {view === "Travel" ? <Travel plan={plan} /> : null}
        {view === "Stay" ? <Stay plan={plan} /> : null}
        {view === "Food" ? <Food plan={plan} /> : null}
        {view === "Validation" ? <Validation plan={plan} /> : null}
      </div>
    </div>
  );
}
