import { ArrowRight, UsersRound } from "lucide-react";

import { ThemeToggle } from "@/components/shared/theme-toggle";

export default function Home() {
  return (
    <main className="bg-background text-foreground relative isolate min-h-dvh overflow-hidden">
      <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-5 py-5 sm:px-8 sm:py-7 lg:px-12">
        <header className="border-border flex items-center justify-between border-b pb-5">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="bg-foreground size-2.5" />
            <span className="text-sm font-semibold tracking-[-0.02em]">
              Trailie Crew
            </span>
          </div>
          <ThemeToggle />
        </header>

        <section className="grid flex-1 items-stretch lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="flex flex-col justify-center py-16 sm:py-24 lg:pr-16">
            <p className="text-muted-foreground mb-7 font-mono text-[0.6875rem] font-medium tracking-[0.18em] uppercase">
              A TrailVerse experiment
            </p>

            <h1 className="max-w-4xl text-[clamp(3.25rem,8vw,7.5rem)] leading-[0.9] font-semibold tracking-[-0.075em] text-balance">
              Plan trips together, naturally.
            </h1>

            <p className="text-muted-foreground mt-8 max-w-xl text-base leading-7 text-pretty sm:text-lg sm:leading-8">
              Bring the crew into one shared conversation. Talk through ideas,
              make decisions together, and ask Trailie for focused help when you
              need it.
            </p>

            <p className="mt-5 text-sm font-medium">
              Plan trips together. Ask Trailie when you need help.
            </p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                disabled
                className="bg-foreground text-background inline-flex min-h-12 items-center justify-center gap-3 rounded-md px-5 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-100"
                title="Trip creation is planned for a later Build Week phase"
              >
                Create a Trip
                <ArrowRight
                  aria-hidden="true"
                  className="size-4"
                  strokeWidth={1.75}
                />
              </button>
              <button
                type="button"
                disabled
                className="border-border bg-background inline-flex min-h-12 items-center justify-center gap-3 rounded-md border px-5 text-sm font-semibold transition-colors disabled:cursor-not-allowed"
                title="Trip joining is planned for a later Build Week phase"
              >
                <UsersRound
                  aria-hidden="true"
                  className="size-4"
                  strokeWidth={1.75}
                />
                Join a Trip
              </button>
            </div>
          </div>

          <aside
            aria-label="Trailie Crew principles"
            className="border-border relative flex min-h-64 flex-col justify-between border-t py-7 lg:border-t-0 lg:border-l lg:py-12 lg:pl-8"
          >
            <div className="route-line" aria-hidden="true">
              <span className="route-point route-point-start" />
              <span className="route-point route-point-end" />
            </div>

            <p className="text-muted-foreground max-w-48 font-mono text-[0.6875rem] leading-5 tracking-[0.14em] uppercase">
              One crew
              <br />
              One conversation
              <br />
              Trailie on request
            </p>
            <p className="text-muted-foreground mt-24 max-w-52 text-sm leading-6">
              The group stays in control. Trailie joins only when someone asks.
            </p>
          </aside>
        </section>

        <footer className="border-border text-muted-foreground flex items-center justify-between border-t pt-5 font-mono text-[0.625rem] tracking-[0.16em] uppercase">
          <span>Build Week 2026</span>
          <span>Apps for Your Life</span>
        </footer>
      </div>
    </main>
  );
}
