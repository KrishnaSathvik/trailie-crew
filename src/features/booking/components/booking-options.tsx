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

function bookingLabel(value: string) {
  if (value === "required") return "Required";
  if (value === "recommended") return "Recommended";
  return "Optional";
}

function availabilityLabel(value: string) {
  if (value === "available") return "Availability shown";
  if (value === "unavailable") return "Unavailable";
  return "Availability unknown";
}

function priceLabel(value: string) {
  if (value === "observed") return "Price last checked";
  return "Price may change";
}

export function BookingOptions({ handoffs }: { handoffs: BookingHandoff[] }) {
  if (!handoffs.length) {
    return (
      <section
        aria-labelledby="booking-options-heading"
        className="border-border bg-surface-raised rounded-card mt-8 border px-5 py-6"
      >
        <h2 id="booking-options-heading" className="font-semibold">
          No booking options yet
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          This Plan does not currently include anything that needs a booking
          handoff.
        </p>
      </section>
    );
  }
  return <BookingOptionsDrawer handoffs={handoffs} />;
}

function BookingOptionsDrawer({ handoffs }: { handoffs: BookingHandoff[] }) {
  return (
    <details className="border-border bg-surface-raised rounded-card shadow-soft mt-8 border">
      <summary className="min-h-12 cursor-pointer list-none px-5 py-4 font-semibold">
        Booking options{" "}
        <span className="text-muted-foreground text-sm">
          ({handoffs.length})
        </span>
      </summary>
      <div className="border-border border-t px-5 py-4">
        <p className="text-muted-foreground mb-4 text-sm">
          Trailie helps you find booking options but does not complete
          reservations.
        </p>
        <ul className="divide-border divide-y">
          {handoffs.map((handoff) => (
            <li key={handoff.handoffId} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{handoff.title}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="bg-accent-soft text-accent rounded-full px-2 py-1 font-semibold">
                      {handoff.officialOrApproved
                        ? "Official"
                        : "Approved provider"}
                    </span>
                    <span className="border-border rounded-full border px-2 py-1 capitalize">
                      {label(handoff.category)}
                    </span>
                    <span className="border-border rounded-full border px-2 py-1">
                      {bookingLabel(handoff.bookingRequirement)}
                    </span>
                  </div>
                </div>
                <a
                  href={handoff.destinationUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-sm font-semibold underline underline-offset-4"
                >
                  Continue on provider site
                </a>
              </div>
              <p className="text-muted-foreground mt-3 text-xs">
                {availabilityLabel(handoff.availabilityState)} ·{" "}
                {priceLabel(handoff.priceState)}
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
