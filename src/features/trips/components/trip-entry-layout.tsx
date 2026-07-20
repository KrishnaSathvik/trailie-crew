import { ArrowLeft, Route } from "lucide-react";
import Link from "next/link";

import { ThemeToggle } from "@/components/shared/theme-toggle";

export function TripEntryLayout({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="bg-background text-foreground min-h-dvh">
      <a href="#entry-heading" className="skip-link">
        Skip to form
      </a>
      <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-5 py-5 sm:px-8 sm:py-6 lg:px-12">
        <header className="border-border flex items-center justify-between border-b pb-5">
          <Link
            href="/"
            className="focus-visible:ring-ring inline-flex min-h-10 items-center gap-3 rounded-md focus-visible:ring-2 focus-visible:outline-none"
          >
            <span
              aria-hidden="true"
              className="bg-accent size-2.5 rounded-[2px]"
            />
            <span className="text-sm font-semibold">Trailie Crew</span>
          </Link>
          <ThemeToggle />
        </header>
        <div className="grid flex-1 items-center py-10 lg:grid-cols-[minmax(0,1fr)_30rem] lg:gap-20 lg:py-16">
          <section className="hidden lg:block">
            <div className="border-border bg-surface-raised rounded-card shadow-soft max-w-xl border p-8">
              <Route
                aria-hidden="true"
                className="text-accent size-6"
                strokeWidth={1.5}
              />
              <p className="eyebrow mt-8">Start with the crew</p>
              <p className="mt-4 max-w-lg text-4xl leading-[1.05] font-semibold tracking-[-0.055em]">
                One shared place for all the ideas that shape the trip.
              </p>
              <ul className="border-border text-muted-foreground mt-8 space-y-3 border-t pt-6 text-sm">
                <li>Keep the conversation together</li>
                <li>Invite Trailie only when you need help</li>
                <li>Review decisions before publishing the Plan</li>
              </ul>
            </div>
          </section>
          <section className="lg:pl-4">
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring mb-10 inline-flex items-center gap-2 rounded-sm text-sm focus-visible:ring-2 focus-visible:outline-none lg:hidden"
            >
              <ArrowLeft aria-hidden="true" className="size-4" /> Back
            </Link>
            <p className="eyebrow">{eyebrow}</p>
            <h1
              id="entry-heading"
              className="mt-4 text-4xl font-semibold tracking-[-0.055em] text-balance sm:text-5xl"
            >
              {title}
            </h1>
            <p className="text-muted-foreground mt-4 max-w-md text-sm leading-6">
              {description}
            </p>
            <div className="mt-9">{children}</div>
          </section>
        </div>
      </div>
    </main>
  );
}
