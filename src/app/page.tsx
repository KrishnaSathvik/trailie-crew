import {
  ArrowRight,
  CalendarDays,
  Check,
  CircleUserRound,
  Compass,
  Map,
  MessageCircle,
  Route,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

import { ThemeToggle } from "@/components/shared/theme-toggle";
import { TrustLinks } from "@/components/shared/trust-links";
import { buttonClassName } from "@/components/ui/product-controls";

const steps = [
  {
    title: "Start a trip",
    description: "Name the trip and invite the people planning with you.",
    icon: Compass,
  },
  {
    title: "Plan together",
    description:
      "Keep ideas, questions, preferences, and decisions in one chat.",
    icon: MessageCircle,
  },
  {
    title: "Ask Trailie",
    description: "Bring Trailie in for focused help only when the crew asks.",
    icon: Route,
  },
  {
    title: "Approve and publish",
    description:
      "Review the important choices together before the plan is ready.",
    icon: Check,
  },
] as const;

const differences = [
  {
    title: "Group-first from the start",
    body: "Everyone plans in the same place, with a shared view of what has been decided.",
    icon: UsersRound,
  },
  {
    title: "Trailie waits to be asked",
    body: "Your crew leads the conversation. Trailie joins when a mention or reply calls for help.",
    icon: Route,
  },
  {
    title: "Every published plan has a history",
    body: "Compare changes, revisit an earlier version, and understand how the trip evolved.",
    icon: CalendarDays,
  },
  {
    title: "A clear plan, with sources",
    body: "Official links, checked times, and plain-language evidence stay close to the itinerary.",
    icon: ShieldCheck,
  },
  {
    title: "Guests can help without joining",
    body: "Share a focused view for comments or suggestions while keeping the crew’s chat private.",
    icon: CircleUserRound,
  },
] as const;

function Brand() {
  return (
    <Link
      href="/"
      className="focus-visible:ring-ring rounded-control inline-flex min-h-10 items-center gap-3 focus-visible:ring-2"
      aria-label="Trailie Crew home"
    >
      <span aria-hidden="true" className="bg-accent size-2.5 rounded-[2px]" />
      <span className="text-sm font-semibold tracking-[-0.02em]">
        Trailie Crew
      </span>
    </Link>
  );
}

function ProductPreview() {
  return (
    <section
      aria-label="Trailie Crew product preview"
      className="border-border bg-surface-raised rounded-card shadow-soft overflow-hidden border"
    >
      <header className="border-border flex items-center justify-between border-b px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Olympic Peninsula</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Current plan · 4 crew members
          </p>
        </div>
        <div className="flex -space-x-1.5" aria-label="Four crew members">
          {["M", "L", "J", "A"].map((initial) => (
            <span
              key={initial}
              className="border-background bg-subtle flex size-8 items-center justify-center rounded-full border-2 text-[0.6875rem] font-semibold"
            >
              {initial}
            </span>
          ))}
        </div>
      </header>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.62fr)]">
        <div className="border-border p-4 sm:p-6 lg:border-r">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Day 2 · Lake Crescent</p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.035em]">
                Forest, lake, and an easy evening
              </h2>
            </div>
            <span className="border-positive/30 bg-positive-soft text-positive hidden rounded-full border px-2.5 py-1 text-xs font-semibold sm:inline-flex">
              Crew approved
            </span>
          </div>
          <ol className="border-border mt-6 ml-2 border-l">
            {[
              [
                "9:00 AM",
                "Marymere Falls",
                "Official trail conditions checked",
              ],
              [
                "12:30 PM",
                "Lake Crescent Lodge",
                "Lunch · reservation recommended",
              ],
              [
                "3:00 PM",
                "Moments in Time Trail",
                "Easy loop · flexible timing",
              ],
            ].map(([time, title, detail]) => (
              <li key={title} className="relative py-3 pl-6">
                <span
                  aria-hidden="true"
                  className="border-accent bg-surface-raised absolute top-5 -left-1.5 size-3 rounded-full border-2"
                />
                <p className="text-muted-foreground font-mono text-[0.625rem]">
                  {time}
                </p>
                <p className="mt-1 text-sm font-semibold">{title}</p>
                <p className="text-muted-foreground mt-1 text-xs">{detail}</p>
              </li>
            ))}
          </ol>
          <div className="border-border bg-surface rounded-card mt-5 border p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Route aria-hidden="true" className="text-accent size-4" />
              Trailie
            </p>
            <p className="text-muted-foreground mt-2 text-sm leading-6">
              The lodge closes earlier on Sunday. Moving lunch to 12:30 keeps
              the afternoon walk relaxed.
            </p>
            <button
              type="button"
              className="text-accent mt-3 min-h-9 text-xs font-semibold"
            >
              View source
            </button>
          </div>
        </div>
        <div className="bg-accent-soft relative min-h-72 overflow-hidden p-5">
          <div className="border-accent/25 bg-surface-raised/90 rounded-card shadow-soft absolute inset-5 border">
            <div
              aria-hidden="true"
              className="border-accent/35 absolute top-[22%] right-[19%] h-[58%] w-[54%] rotate-[-18deg] rounded-[48%] border-2"
            />
            {[
              ["top-[19%] left-[28%]", "1"],
              ["top-[46%] right-[23%]", "2"],
              ["bottom-[18%] left-[37%]", "3"],
            ].map(([position, label]) => (
              <span
                key={label}
                aria-hidden="true"
                className={`bg-foreground text-background absolute ${position} shadow-soft flex size-7 items-center justify-center rounded-full text-[0.625rem] font-semibold`}
              >
                {label}
              </span>
            ))}
          </div>
          <span className="bg-surface-raised border-border rounded-control shadow-soft absolute right-7 bottom-7 inline-flex items-center gap-2 border px-3 py-2 text-xs font-semibold">
            <Map aria-hidden="true" className="size-3.5" />
            Plan + map
          </span>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <main className="bg-background text-foreground min-h-dvh">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <header className="border-border bg-background/95 sticky top-0 z-30 border-b backdrop-blur-sm">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-12">
          <Brand />
          <div className="flex items-center gap-2">
            <Link
              href="/join"
              className="text-muted-foreground hover:text-foreground hidden min-h-10 items-center px-3 text-sm font-semibold sm:inline-flex"
            >
              Join a Trip
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div id="main-content">
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,0.85fr)_minmax(34rem,1.15fr)] lg:gap-16 lg:px-12 lg:py-24">
          <div>
            <p className="eyebrow">Travel planning for groups</p>
            <h1 className="page-title mt-5 max-w-3xl">
              Plan the trip. Keep everyone together.
            </h1>
            <p className="text-muted-foreground mt-6 max-w-xl text-lg leading-8 text-pretty">
              Talk through the details as a crew, turn decisions into a clear
              itinerary, and bring Trailie in for focused help when you want it.
            </p>
            <p className="mt-5 text-sm font-semibold">
              Plan trips together. Ask Trailie when you need help.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/trips/create"
                className={buttonClassName({
                  variant: "primary",
                  className: "min-h-12 px-5",
                })}
              >
                Create a Trip
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <Link
                href="/join"
                className={buttonClassName({
                  variant: "secondary",
                  className: "min-h-12 px-5",
                })}
              >
                <UsersRound aria-hidden="true" className="size-4" />
                Join a Trip
              </Link>
            </div>
            <p className="text-muted-foreground mt-5 text-xs leading-5">
              Start with a name. Dates, destinations, and priorities can come
              from the conversation.
            </p>
          </div>
          <ProductPreview />
        </section>

        <section className="border-border border-y">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
            <p className="eyebrow">One shared path</p>
            <h2 className="section-title mt-4">How your crew gets there</h2>
            <div className="border-border mt-10 grid border-y sm:grid-cols-2 lg:grid-cols-4">
              {steps.map(({ title, description, icon: Icon }, index) => (
                <article
                  key={title}
                  className="border-border py-6 sm:px-6 sm:odd:border-r lg:border-r lg:first:pl-0 lg:last:border-r-0 lg:last:pr-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Icon
                      aria-hidden="true"
                      className="text-accent size-5"
                      strokeWidth={1.75}
                    />
                    <span className="text-muted-foreground font-mono text-xs">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="mt-6 font-semibold">{title}</h3>
                  <p className="text-muted-foreground mt-2 text-sm leading-6">
                    {description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[0.68fr_1.32fr] lg:gap-20 lg:px-12">
          <div>
            <p className="eyebrow">Why Trailie Crew</p>
            <h2 className="section-title mt-4">Built for the whole crew</h2>
            <p className="text-muted-foreground mt-5 max-w-md leading-7">
              Most trip tools start with a form or a single planner. Trailie
              Crew starts with the conversation and keeps the result easy to
              trust, share, and change.
            </p>
          </div>
          <div className="border-border divide-y border-y">
            {differences.map(({ title, body, icon: Icon }) => (
              <article
                key={title}
                className="grid gap-3 py-5 sm:grid-cols-[2rem_0.7fr_1.3fr] sm:items-start sm:gap-5"
              >
                <Icon
                  aria-hidden="true"
                  className="text-accent size-5"
                  strokeWidth={1.75}
                />
                <h3 className="font-semibold">{title}</h3>
                <p className="text-muted-foreground text-sm leading-6">
                  {body}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="bg-foreground text-background">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-5 py-14 sm:px-8 sm:py-16 lg:flex-row lg:items-end lg:px-12">
            <div>
              <p className="font-mono text-[0.6875rem] font-semibold tracking-[0.16em] text-current/65 uppercase">
                Your next trip
              </p>
              <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">
                Give the crew one place to plan.
              </h2>
            </div>
            <Link
              href="/trips/create"
              className="bg-background text-foreground focus-visible:ring-background rounded-control focus-visible:ring-offset-foreground inline-flex min-h-12 items-center justify-center gap-2 px-5 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              Create a Trip
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </section>
      </div>

      <footer className="border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-8 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-12">
          <div className="flex items-center gap-3">
            <Route aria-hidden="true" className="text-accent size-4" />
            <p className="text-sm font-semibold">Trailie Crew</p>
          </div>
          <TrustLinks className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-3 text-sm" />
          <p className="text-muted-foreground text-xs">Plan trips together.</p>
        </div>
      </footer>
    </main>
  );
}
