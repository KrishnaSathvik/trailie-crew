import type {
  TrailieResponseBlockV1,
  TrailieResponseV1,
} from "@trailie/schemas";
import { SafeMarkdownView } from "./safe-markdown-view";

function label(value: string) {
  return value.replaceAll("_", " ");
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="border-border bg-background inline-flex rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium capitalize">
      {children}
    </span>
  );
}

function Option({
  name,
  summary,
  strengths,
  tradeoffs,
}: {
  name: string;
  summary: string;
  strengths: string[];
  tradeoffs: string[];
}) {
  return (
    <article className="border-border rounded-md border p-3">
      <h4 className="text-sm font-semibold">{name}</h4>
      <p className="text-muted-foreground mt-1 text-sm leading-5">{summary}</p>
      {strengths.length > 0 ? (
        <p className="mt-2 text-xs leading-5">
          <span className="font-semibold">Good for:</span>{" "}
          {strengths.join(", ")}
        </p>
      ) : null}
      {tradeoffs.length > 0 ? (
        <p className="text-muted-foreground text-xs leading-5">
          <span className="text-foreground font-semibold">Keep in mind:</span>{" "}
          {tradeoffs.join(", ")}
        </p>
      ) : null}
    </article>
  );
}

function ResponseBlock({ block }: { block: TrailieResponseBlockV1 }) {
  switch (block.type) {
    case "markdown":
      return <SafeMarkdownView markdown={block.markdown} />;
    case "destination_options":
    case "destination_comparison":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {block.options.map((option) => (
            <Option key={option.id} {...option} />
          ))}
        </div>
      );
    case "understanding_summary":
      return (
        <section>
          <h4 className="text-sm font-semibold">{block.title}</h4>
          <dl className="mt-2 divide-y">
            {block.rows.map((row) => (
              <div
                className="border-border grid gap-1 py-2 sm:grid-cols-[8rem_1fr]"
                key={`${row.label}:${row.detail}`}
              >
                <dt className="text-muted-foreground text-xs font-medium">
                  {row.label}
                </dt>
                <dd className="text-sm">
                  {row.detail} <Pill>{label(row.status)}</Pill>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      );
    case "clarification":
      return (
        <section className="border-border rounded-md border p-3">
          <h4 className="text-sm font-semibold">{block.question}</h4>
          <p className="text-muted-foreground mt-1 text-xs leading-5">
            {block.reason}
          </p>
        </section>
      );
    case "itinerary_preview":
      return (
        <section>
          <h4 className="text-sm font-semibold">{block.title}</h4>
          <ol className="border-border mt-2 border-l pl-4">
            {block.days.map((day) => (
              <li className="py-2" key={day.date}>
                <p className="text-xs font-semibold">{day.date}</p>
                <p className="text-sm">{day.title}</p>
                {day.highlights.length > 0 ? (
                  <p className="text-muted-foreground text-xs">
                    {day.highlights.join(" · ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      );
    case "itinerary":
      return (
        <p className="text-sm">
          {block.status === "published" ? "Current plan" : "Plan preview"}{" "}
          <Pill>Version {block.version}</Pill>
        </p>
      );
    case "itinerary_change_summary":
      return (
        <section>
          <h4 className="text-sm font-semibold">Proposed change</h4>
          <p className="mt-1 text-sm">{block.request}</p>
          {block.impact.length > 0 ? (
            <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-xs">
              {block.impact.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </section>
      );
    case "approval_status":
      return (
        <section className="border-border rounded-md border p-3">
          <p className="text-sm font-semibold capitalize">
            Crew review: {label(block.status)}
          </p>
          {block.pending.length > 0 ? (
            <p className="text-muted-foreground mt-1 text-xs">
              Waiting for {block.pending.join(", ")}
            </p>
          ) : null}
        </section>
      );
    case "map_locations":
      return (
        <ul className="space-y-2">
          {block.locations.map((location) => (
            <li
              className="border-border flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              key={`${location.label}:${location.sourceId ?? "unresolved"}`}
            >
              <span>{location.label}</span>
              <Pill>{label(location.verification)}</Pill>
            </li>
          ))}
        </ul>
      );
    case "route_summary":
      return (
        <section className="border-border rounded-md border p-3 text-sm">
          <p className="font-semibold">
            {block.origin} to {block.destination}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {label(block.mode)}
            {block.durationMinutes !== null
              ? ` · about ${block.durationMinutes} minutes`
              : ""}
            {" · "}
            {block.verification === "verified"
              ? "Verified route"
              : "Route unavailable"}
          </p>
        </section>
      );
    case "hotel_options":
      return (
        <div className="grid gap-2">
          {block.options.map((option) => (
            <article
              className="border-border rounded-md border p-3"
              key={option.id}
            >
              <h4 className="text-sm font-semibold">{option.name}</h4>
              <p className="text-muted-foreground text-xs">{option.area}</p>
              <p className="mt-2 text-sm">{option.reason}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Pill>{label(option.availabilityState)}</Pill>
                <Pill>Price {label(option.priceState)}</Pill>
              </div>
            </article>
          ))}
        </div>
      );
    case "flight_guidance":
      return (
        <section>
          <div className="space-y-2">
            {block.airports.map((airport) => (
              <article
                className="border-border rounded-md border p-3"
                key={airport.code}
              >
                <h4 className="text-sm font-semibold">
                  {airport.code} · {airport.name}
                </h4>
                <p className="text-muted-foreground mt-1 text-xs leading-5">
                  {airport.tradeoff}
                </p>
              </article>
            ))}
          </div>
          {block.recommendedWindow ? (
            <p className="mt-2 text-sm">{block.recommendedWindow}</p>
          ) : null}
        </section>
      );
    case "booking_options":
      return (
        <section>
          <ul className="space-y-2">
            {block.options.map((option) => (
              <li
                className="border-border flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                key={`${option.label}:${option.url}`}
              >
                <span className="text-sm font-medium">{option.label}</span>
                <a
                  className="focus-visible:ring-ring text-xs font-semibold underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
                  href={option.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  Continue on provider site
                </a>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-2 text-xs">
            Trailie helps you find booking options but does not complete
            reservations.
          </p>
        </section>
      );
    case "reservation_requirements":
      return (
        <dl className="space-y-2">
          {block.requirements.map((requirement) => (
            <div
              className="border-border rounded-md border p-3"
              key={`${requirement.label}:${requirement.details}`}
            >
              <dt className="text-sm font-semibold">{requirement.label}</dt>
              <dd className="text-muted-foreground mt-1 text-xs leading-5">
                <Pill>{label(requirement.requirement)}</Pill>{" "}
                {requirement.details}
              </dd>
            </div>
          ))}
        </dl>
      );
    case "weather_summary":
      return (
        <section className="border-border rounded-md border p-3">
          <h4 className="text-sm font-semibold">
            {block.location} · {block.period}
          </h4>
          <p className="mt-1 text-sm">{block.summary}</p>
          <p className="text-muted-foreground mt-2 text-xs capitalize">
            {label(block.state)}
          </p>
        </section>
      );
    case "evidence_summary":
      return (
        <ul className="space-y-2">
          {block.items.map((item) => (
            <li
              className="border-border flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              key={`${item.label}:${item.sourceId ?? "none"}`}
            >
              <span>{item.label}</span>
              <Pill>{label(item.status)}</Pill>
            </li>
          ))}
        </ul>
      );
    case "warning":
      return (
        <aside className="border-border rounded-md border-l-2 p-3">
          <h4 className="text-sm font-semibold">{block.title}</h4>
          <p className="text-muted-foreground mt-1 text-xs leading-5">
            {block.detail}
          </p>
        </aside>
      );
    case "empty_state":
    case "error_state":
      return (
        <section className="border-border rounded-md border p-3">
          <h4 className="text-sm font-semibold">{block.title}</h4>
          <p className="text-muted-foreground mt-1 text-xs leading-5">
            {block.detail}
          </p>
        </section>
      );
  }
}

export function TrailieResponse({ response }: { response: TrailieResponseV1 }) {
  const duplicatesMessage =
    response.blocks.length === 1 &&
    response.blocks[0]?.type === "markdown" &&
    response.blocks[0].markdown === response.message;

  return (
    <section
      aria-label="Trailie travel response"
      className="mt-2 space-y-3 text-[0.9375rem] leading-6 break-words"
    >
      <SafeMarkdownView markdown={response.message} />
      {duplicatesMessage
        ? null
        : response.blocks.map((block, index) => (
            <ResponseBlock block={block} key={`${block.type}:${index}`} />
          ))}
      {response.warnings.length > 0 ? (
        <ul className="border-border text-muted-foreground list-disc space-y-1 border-l-2 pl-5 text-xs">
          {response.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {response.sources.length > 0 ? (
        <ul aria-label="Sources" className="space-y-1 text-xs">
          {response.sources.map((source) =>
            source.url ? (
              <li key={source.sourceId}>
                <a
                  className="focus-visible:ring-ring underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
                  href={source.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {source.label}
                </a>
                <span className="text-muted-foreground ml-2 capitalize">
                  {label(source.status)}
                  {source.checkedAt
                    ? ` · Last checked ${source.checkedAt.slice(0, 10)}`
                    : ""}
                </span>
              </li>
            ) : (
              <li className="text-muted-foreground" key={source.sourceId}>
                {source.label} · {label(source.status)}
                {source.checkedAt
                  ? ` · Last checked ${source.checkedAt.slice(0, 10)}`
                  : ""}
              </li>
            ),
          )}
        </ul>
      ) : null}
      {response.assumptions.length > 0 ? (
        <ul
          aria-label="Assumptions"
          className="border-border text-muted-foreground space-y-1 border-l-2 pl-3 text-xs"
        >
          {response.assumptions.map((assumption) => (
            <li key={assumption}>Assumption: {assumption}</li>
          ))}
        </ul>
      ) : null}
      {response.unresolvedQuestions.length > 0 ? (
        <section aria-label="Open questions">
          <h4 className="text-xs font-semibold">Still needed</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {response.unresolvedQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {response.suggestedActions.length > 0 ? (
        <p className="border-border border-t pt-2 text-sm font-medium">
          Next: {response.suggestedActions[0]?.label}
        </p>
      ) : null}
    </section>
  );
}
