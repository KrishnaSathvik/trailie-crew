"use client";

export type BookingHandoff = {
  handoffId: string;
  category: string;
  provider: string;
  title: string;
  officialOrApproved: boolean;
  destinationUrl: string;
  availabilityState: string;
  priceState: string;
  observedPrice?: number | null;
  currency?: string | null;
  retrievedAt?: string | null;
  bookingRequirement: string;
  warning?: string | null;
};

function label(value: string) {
  return value.replaceAll("_", " ");
}

export function BookingOptions({ handoffs }: { handoffs: BookingHandoff[] }) {
  if (!handoffs.length) return null;
  return <BookingOptionsDrawer handoffs={handoffs} />;
}

function BookingOptionsDrawer({ handoffs }: { handoffs: BookingHandoff[] }) {
  return (
    <details className="border-border mt-8 rounded-md border">
      <summary className="cursor-pointer list-none px-5 py-4 font-semibold">
        Booking options{" "}
        <span className="text-muted-foreground text-sm">
          ({handoffs.length})
        </span>
      </summary>
      <div className="border-border border-t px-5 py-4">
        <p className="text-muted-foreground mb-4 text-sm">
          Trailie does not complete bookings. Continue on the official or
          approved provider site.
        </p>
        <ul className="divide-border divide-y">
          {handoffs.map((handoff) => (
            <li key={handoff.handoffId} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{handoff.title}</p>
                  <p className="text-muted-foreground mt-1 text-xs capitalize">
                    {handoff.provider} · {label(handoff.category)} ·{" "}
                    {label(handoff.bookingRequirement)}
                  </p>
                </div>
                <a
                  href={handoff.destinationUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-sm font-semibold underline underline-offset-4"
                >
                  {handoff.officialOrApproved
                    ? "Open official site"
                    : "Open provider"}
                </a>
              </div>
              <p className="text-muted-foreground mt-2 text-xs capitalize">
                Availability {label(handoff.availabilityState)} · Price{" "}
                {label(handoff.priceState)}
                {handoff.retrievedAt
                  ? ` · Checked ${new Date(handoff.retrievedAt).toLocaleString()}`
                  : ""}
              </p>
              {handoff.warning ? (
                <p className="mt-2 text-xs font-medium">{handoff.warning}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
