import type { PublicSharedItinerary } from "@trailie/schemas";
import { PrintButton } from "./print-button";
import { TrustLinks } from "@/components/shared/trust-links";

function Status({ value }: { value: string }) {
  return (
    <span className="border-border inline-flex rounded-full border px-2.5 py-1 font-mono text-[0.625rem] tracking-wide capitalize">
      {value.replaceAll("_", " ")}
    </span>
  );
}

function formatPublished(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function ShareUnavailable() {
  return (
    <main className="bg-background text-foreground flex min-h-dvh items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <p className="text-muted-foreground font-mono text-[0.6875rem] tracking-[0.18em] uppercase">
          Trailie Crew · Shared plan
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
          Shared itinerary unavailable
        </h1>
        <p className="text-muted-foreground mx-auto mt-5 max-w-md leading-7">
          This shared itinerary cannot be opened. Ask the trip host for a new
          link.
        </p>
      </div>
    </main>
  );
}

export function PublicItinerary({
  itinerary,
  generatedAt = itinerary.publishedAt,
  contentHash,
}: {
  itinerary: PublicSharedItinerary;
  generatedAt?: string;
  contentHash?: string;
}) {
  const travel = itinerary.days.flatMap((day) =>
    day.travelSegments.map((segment) => ({ date: day.date, segment })),
  );
  return (
    <main
      className="public-itinerary bg-background text-foreground min-h-dvh"
      data-content-hash={contentHash}
    >
      <header className="border-border border-b px-5 py-5 sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-5">
          <p className="font-mono text-xs font-semibold tracking-[0.14em] uppercase">
            Shared from Trailie Crew
          </p>
          <PrintButton />
        </div>
      </header>

      <article className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-16">
        <section aria-labelledby="shared-title" className="relative">
          <div
            aria-label={`Pinned Version ${itinerary.version}`}
            className="public-version-stamp border-foreground inline-flex rotate-[-2deg] flex-col border-2 px-4 py-3 font-mono uppercase"
          >
            <span className="text-[0.5625rem] tracking-[0.18em]">Pinned</span>
            <span className="mt-0.5 text-sm font-bold tracking-[0.08em]">
              Version {itinerary.version}
            </span>
          </div>
          <p className="text-muted-foreground mt-8 font-mono text-[0.6875rem] tracking-[0.16em] uppercase">
            {itinerary.startDate} — {itinerary.endDate} · {itinerary.timezone}
          </p>
          <h1
            id="shared-title"
            className="mt-4 max-w-4xl text-4xl leading-[0.98] font-semibold tracking-[-0.06em] sm:text-6xl lg:text-7xl"
          >
            {itinerary.title}
          </h1>
          <p className="text-muted-foreground mt-5 max-w-2xl text-lg leading-8">
            {itinerary.destinationSummary}
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            <Status value="validation passed" />
            <Status
              value={`published ${formatPublished(itinerary.publishedAt)}`}
            />
            <Status value={`source version ${itinerary.version}`} />
          </div>
        </section>

        <section
          aria-labelledby="overview-heading"
          className="public-section border-border mt-16 border-t pt-8"
        >
          <h2
            id="overview-heading"
            className="text-2xl font-semibold tracking-[-0.035em]"
          >
            Overview
          </h2>
          <div className="bg-border mt-6 grid gap-px overflow-hidden rounded-md border sm:grid-cols-3">
            {[
              ["Dates", `${itinerary.startDate} — ${itinerary.endDate}`],
              ["Timezone", itinerary.timezone],
              ["Published", formatPublished(itinerary.publishedAt)],
            ].map(([label, value]) => (
              <div key={label} className="bg-background p-5">
                <p className="text-muted-foreground font-mono text-[0.625rem] tracking-[0.14em] uppercase">
                  {label}
                </p>
                <p className="mt-2 text-sm font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="days-heading"
          className="public-section border-border mt-16 border-t pt-8"
        >
          <h2
            id="days-heading"
            className="text-2xl font-semibold tracking-[-0.035em]"
          >
            Day-by-day
          </h2>
          <div className="mt-8 space-y-12">
            {itinerary.days.map((day, dayIndex) => (
              <section key={day.date} className="public-day break-inside-avoid">
                <div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
                  <div>
                    <p className="font-mono text-xs font-semibold">
                      DAY {dayIndex + 1}
                    </p>
                    <time className="text-muted-foreground mt-1 block font-mono text-xs">
                      {day.date}
                    </time>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold">{day.title}</h3>
                    {day.summary ? (
                      <p className="text-muted-foreground mt-2 leading-7">
                        {day.summary}
                      </p>
                    ) : null}
                    <ol className="border-border mt-6 border-l">
                      {day.items.map((item) => (
                        <li
                          key={item.key}
                          className="relative break-inside-avoid py-4 pl-6"
                        >
                          <span
                            aria-hidden="true"
                            className="bg-background border-foreground absolute top-6 -left-1.5 size-3 rounded-full border-2"
                          />
                          <p className="text-muted-foreground font-mono text-[0.6875rem]">
                            {item.startTime ?? "Open"} —{" "}
                            {item.endTime ?? "Unscheduled"}
                          </p>
                          <h4 className="mt-1.5 font-semibold">{item.title}</h4>
                          {item.description ? (
                            <p className="text-muted-foreground mt-1 text-sm leading-6">
                              {item.description}
                            </p>
                          ) : null}
                          {item.location ? (
                            <p className="mt-2 text-sm">{item.location.name}</p>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Status value={item.dataStatus} />
                            <Status
                              value={`reservation ${item.reservationStatus}`}
                            />
                          </div>
                        </li>
                      ))}
                    </ol>
                    {day.warnings.length ? (
                      <div className="border-foreground mt-5 border-l-2 pl-4">
                        {day.warnings.map((warning) => (
                          <p key={warning} className="text-sm font-semibold">
                            {warning}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="travel-heading"
          className="public-section border-border mt-16 border-t pt-8"
        >
          <h2
            id="travel-heading"
            className="text-2xl font-semibold tracking-[-0.035em]"
          >
            Travel
          </h2>
          {travel.length ? (
            <ul className="border-border mt-6 divide-y border-y">
              {travel.map(({ date, segment }, index) => (
                <li
                  key={`${date}-${index}`}
                  className="grid gap-2 py-5 sm:grid-cols-[7rem_1fr_auto]"
                >
                  <time className="text-muted-foreground font-mono text-xs">
                    {date}
                  </time>
                  <div>
                    <p className="font-semibold">
                      {segment.origin.name} → {segment.destination.name}
                    </p>
                    <p className="text-muted-foreground mt-1 text-sm capitalize">
                      {segment.mode} · {segment.dataStatus}
                    </p>
                  </div>
                  <p className="text-sm font-semibold">
                    {segment.durationMinutes == null
                      ? "Duration unknown"
                      : `${segment.durationMinutes} min + ${segment.bufferMinutes ?? 0} min buffer`}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground mt-4">
              No scheduled travel segments in this version.
            </p>
          )}
        </section>

        <section
          aria-labelledby="stay-heading"
          className="public-section border-border mt-16 border-t pt-8"
        >
          <h2
            id="stay-heading"
            className="text-2xl font-semibold tracking-[-0.035em]"
          >
            Stay
          </h2>
          {itinerary.lodging.length ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {itinerary.lodging.map((stay) => (
                <article
                  key={`${stay.name}-${stay.checkInDate}`}
                  className="border-border break-inside-avoid rounded-md border p-5"
                >
                  <h3 className="font-semibold">{stay.name}</h3>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {stay.area} · {stay.checkInDate} to {stay.checkOutDate}
                  </p>
                  <div className="mt-3">
                    <Status value={`reservation ${stay.reservationStatus}`} />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground mt-4">
              No public stay recommendation in this version.
            </p>
          )}
        </section>

        <section
          aria-labelledby="food-heading"
          className="public-section border-border mt-16 border-t pt-8"
        >
          <h2
            id="food-heading"
            className="text-2xl font-semibold tracking-[-0.035em]"
          >
            Food
          </h2>
          {itinerary.food.length ? (
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {itinerary.food.map((food) => (
                <li
                  key={`${food.name}-${food.mealWindow}`}
                  className="border-border break-inside-avoid rounded-md border p-5"
                >
                  <p className="font-semibold">{food.name}</p>
                  <p className="text-muted-foreground mt-1 text-sm capitalize">
                    {food.mealWindow}
                  </p>
                  {food.dietaryNote ? (
                    <p className="mt-3 text-sm">{food.dietaryNote}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground mt-4">
              No public food recommendations in this version.
            </p>
          )}
        </section>

        <section
          aria-labelledby="sources-heading"
          className="public-section border-border mt-16 border-t pt-8"
        >
          <h2
            id="sources-heading"
            className="text-2xl font-semibold tracking-[-0.035em]"
          >
            Sources and freshness
          </h2>
          <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-6">
            {itinerary.conditionsDisclaimer ??
              "Conditions may have changed since this version was published."}
          </p>
          {itinerary.travelEvidence?.length ? (
            <ul className="border-border mt-6 divide-y border-y">
              {itinerary.travelEvidence.map((evidence) => (
                <li
                  key={`${evidence.provider}:${evidence.evidenceType}:${evidence.retrievedAt}`}
                  className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div>
                    <p className="font-semibold">
                      {evidence.headline ?? evidence.sourceName}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {evidence.sourceName} ·{" "}
                      {evidence.verificationState === "verified" &&
                      (evidence.freshnessState === "fresh" ||
                        evidence.freshnessState === "cached_fresh")
                        ? "Verified"
                        : evidence.freshnessState === "stale" ||
                            evidence.freshnessState === "expired"
                          ? "Stale"
                          : "Not verified"}{" "}
                      · Last checked{" "}
                      {new Date(evidence.retrievedAt).toLocaleString()}
                    </p>
                  </div>
                  {evidence.sourceUrl ? (
                    <a
                      href={evidence.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="h-fit text-sm font-semibold underline underline-offset-4"
                    >
                      {evidence.headline ?? "Open official source"}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground mt-5 text-sm">
              No live source snapshot was available for this version.
            </p>
          )}
        </section>

        <section
          aria-labelledby="validation-heading"
          className="public-section border-border mt-16 border-t pt-8"
        >
          <h2
            id="validation-heading"
            className="text-2xl font-semibold tracking-[-0.035em]"
          >
            Validation and data status
          </h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div className="border-border rounded-md border p-5">
              <p className="font-semibold">Validation passed</p>
              <p className="text-muted-foreground mt-2 text-sm leading-6">
                This exact published version passed Trailie&apos;s itinerary
                validation. Verified, estimated, and unknown labels describe the
                data available when it was published.
              </p>
            </div>
            <div className="border-border rounded-md border p-5">
              <p className="font-semibold">{itinerary.disclaimer}</p>
              <p className="text-muted-foreground mt-2 text-sm leading-6">
                Recommendations and reservation requirements are planning
                information, not purchases or confirmations.
              </p>
            </div>
          </div>
        </section>

        <footer className="print-footer border-border text-muted-foreground mt-16 flex flex-wrap justify-between gap-3 border-t pt-6 font-mono text-[0.625rem]">
          <span>Trailie Crew · Version {itinerary.version}</span>
          <span>Generated {new Date(generatedAt).toISOString()}</span>
          {contentHash ? <span>Input {contentHash}</span> : null}
          <span className="print-page-number" aria-hidden="true">
            Page
          </span>
          <TrustLinks className="flex flex-wrap gap-3 print:hidden" />
        </footer>
      </article>
    </main>
  );
}
