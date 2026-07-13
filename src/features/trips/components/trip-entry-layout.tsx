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
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 py-5 sm:px-8 sm:py-7">
        <header className="border-border flex items-center justify-between border-b pb-5">
          <Link
            href="/"
            className="focus-visible:ring-ring inline-flex min-h-10 items-center gap-3 rounded-md focus-visible:ring-2 focus-visible:outline-none"
          >
            <span aria-hidden="true" className="bg-foreground size-2.5" />
            <span className="text-sm font-semibold">Trailie Crew</span>
          </Link>
          <ThemeToggle />
        </header>
        <div className="grid flex-1 items-center py-12 lg:grid-cols-[minmax(0,1fr)_28rem] lg:gap-20 lg:py-20">
          <section className="hidden lg:block">
            <Route aria-hidden="true" className="size-6" strokeWidth={1.5} />
            <p className="text-muted-foreground mt-8 font-mono text-[0.6875rem] tracking-[0.17em] uppercase">
              Start with the crew
            </p>
            <p className="mt-4 max-w-lg text-4xl leading-[1.05] font-semibold tracking-[-0.055em]">
              The details can wait. First, bring everyone into the same place.
            </p>
          </section>
          <section
            aria-labelledby="entry-heading"
            className="border-border lg:border-l lg:pl-12"
          >
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring mb-10 inline-flex items-center gap-2 rounded-sm text-sm focus-visible:ring-2 focus-visible:outline-none lg:hidden"
            >
              <ArrowLeft aria-hidden="true" className="size-4" /> Back
            </Link>
            <p className="text-muted-foreground font-mono text-[0.6875rem] tracking-[0.17em] uppercase">
              {eyebrow}
            </p>
            <h1
              id="entry-heading"
              className="mt-4 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl"
            >
              {title}
            </h1>
            <p className="text-muted-foreground mt-4 max-w-md text-sm leading-6">
              {description}
            </p>
            <div className="mt-10">{children}</div>
          </section>
        </div>
      </div>
    </main>
  );
}
